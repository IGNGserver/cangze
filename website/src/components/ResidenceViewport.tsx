import {
  Blinds,
  Coffee,
  Lightbulb,
  Lock,
  LockOpen,
  Radio,
  ShieldAlert,
  Thermometer,
  Warehouse,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ROOM_LABELS, tr } from '../i18n/copy.ts';
import { ResidenceSceneController } from '../three/residenceScene.ts';
import type {
  CameraPose,
  HomeEntity,
  Lang,
  ProjectedPin,
  RoomId,
  SignalArcEvent,
  StreamEventItem,
  TimeOfDay,
} from '../types/home.ts';

interface ResidenceViewportProps {
  lang: Lang;
  timeOfDay: TimeOfDay;
  entities: HomeEntity[];
  activeRoom: RoomId;
  cameraPose: CameraPose;
  offsetRatioX: number;
  roamMode: boolean;
  veilOpacity: number;
  waitingLockApproval: boolean;
  latestSignal: SignalArcEvent | null;
  latestStreamEvent: StreamEventItem;
  onSelectRoom: (room: RoomId) => void;
  onPinAction: (entityId: string) => void;
}

const ROOM_ORDER: RoomId[] = ['overview', 'living_room', 'hall', 'kitchen', 'bedroom', 'courtyard'];

function pinIcon(entity: HomeEntity) {
  switch (entity.domain) {
    case 'light':
      return <Lightbulb size={13} />;
    case 'cover':
      return entity.deviceClass === 'garage' ? <Warehouse size={13} /> : <Blinds size={13} />;
    case 'climate':
      return <Thermometer size={13} />;
    case 'lock':
      return entity.state === 'locked' ? <Lock size={13} /> : <LockOpen size={13} />;
    case 'switch':
      return <Coffee size={13} />;
    default:
      return <ShieldAlert size={13} />;
  }
}

function formatPinState(entity: HomeEntity, lang: Lang, waitingLock: boolean): string {
  if (entity.id === 'lock.front_door' && waitingLock) {
    return lang === 'zh' ? '待批准…' : 'Pending…';
  }
  if (entity.domain === 'light') {
    if (entity.state === 'off') return lang === 'zh' ? '已关' : 'Off';
    return `${entity.brightnessPct ?? 100}%`;
  }
  if (entity.domain === 'cover') {
    if (entity.state === 'closed') return lang === 'zh' ? '已关闭' : 'Closed';
    return lang === 'zh' ? '已开启' : 'Open';
  }
  if (entity.domain === 'climate') {
    return `${entity.temperature ?? 23}°C`;
  }
  if (entity.domain === 'lock') {
    return entity.state === 'locked'
      ? lang === 'zh'
        ? '已上锁'
        : 'Locked'
      : lang === 'zh'
        ? '未上锁'
        : 'Unlocked';
  }
  return entity.state === 'on' ? (lang === 'zh' ? '运行中' : 'On') : lang === 'zh' ? '待机' : 'Off';
}

export function ResidenceViewport({
  lang,
  timeOfDay,
  entities,
  activeRoom,
  cameraPose,
  offsetRatioX,
  roamMode,
  veilOpacity,
  waitingLockApproval,
  latestSignal,
  latestStreamEvent,
  onSelectRoom,
  onPinAction,
}: ResidenceViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<ResidenceSceneController | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);
  const [pins, setPins] = useState<ProjectedPin[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let ctrl: ResidenceSceneController | null = null;
    try {
      ctrl = new ResidenceSceneController(canvas, {
        onModelLoaded: () => setModelReady(true),
        onPinsProjected: (nextPins) => setPins(nextPins),
      });
      controllerRef.current = ctrl;
    } catch (err) {
      console.warn('WebGL unavailable, using architectural vector stage fallback', err);
      setWebglFallback(true);
      return;
    }

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && ctrl) {
        ctrl.resize(rect.width, rect.height);
      }
    });
    ro.observe(container);

    const onVis = () => {
      ctrl?.setVisibility(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      ctrl?.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.applyTimeOfDay(timeOfDay);
  }, [timeOfDay]);

  useEffect(() => {
    controllerRef.current?.syncEntities(entities, waitingLockApproval);
  }, [entities, waitingLockApproval]);

  useEffect(() => {
    controllerRef.current?.setCameraPose(cameraPose, activeRoom, roamMode ? 0 : offsetRatioX);
  }, [cameraPose, activeRoom, offsetRatioX, roamMode]);

  useEffect(() => {
    controllerRef.current?.setRoamMode(roamMode);
  }, [roamMode]);

  useEffect(() => {
    if (latestSignal) {
      controllerRef.current?.emitSignalArc(latestSignal);
    }
  }, [latestSignal]);

  const entityMap = new Map(entities.map((e) => [e.id, e]));
  const showInteractivePins = veilOpacity < 0.55;

  return (
    <div
      ref={containerRef}
      className={`cz-stage ${roamMode ? 'is-roam' : ''}`}
      data-testid="residence-stage"
      data-model-loaded={modelReady ? 'true' : 'false'}
    >
      {!webglFallback ? (
        <canvas ref={canvasRef} className="cz-stage-canvas" data-testid="residence-canvas" />
      ) : (
        <div className="cz-stage-fallback" data-testid="residence-fallback">
          <img src="./brand/cangze-ridge.svg" alt="" width={72} height={72} />
          <p>
            {lang === 'zh' ? '藏泽现代主义智能住宅 · 空间视图' : 'Cangze Smart Residence · Spatial Stage'}
          </p>
        </div>
      )}

      {/* Projected 3D Spatial Device Hotspot Pins */}
      {showInteractivePins && !webglFallback && (
        <div className="cz-pin-layer" aria-label="3D Smart Device Anchors">
          {pins
            .filter((p) => p.visible)
            .map((pin) => {
              const ent = entityMap.get(pin.id);
              if (!ent) return null;
              const isWaiting = ent.id === 'lock.front_door' && waitingLockApproval;
              const isActive =
                ent.state === 'on' ||
                ent.state === 'open' ||
                ent.state === 'locked' ||
                ent.domain === 'climate';
              return (
                <button
                  key={pin.id}
                  type="button"
                  data-testid={`pin-${pin.id}`}
                  className={`cz-spatial-pin ${isActive ? 'is-on' : ''} ${ent.highRisk ? 'is-risk' : ''} ${isWaiting ? 'is-waiting' : ''}`}
                  style={{
                    transform: `translate3d(${pin.x.toFixed(1)}px, ${pin.y.toFixed(1)}px, 0) translate(-50%, -50%)`,
                  }}
                  onClick={() => onPinAction(ent.id)}
                  title={`${tr(ent.name, lang)} (${ent.id})`}
                >
                  <span className="cz-pin-icon">{pinIcon(ent)}</span>
                  <span className="cz-pin-name">{tr(ent.name, lang)}</span>
                  <span className="cz-pin-state">{formatPinState(ent, lang, waitingLockApproval)}</span>
                </button>
              );
            })}
        </div>
      )}

      {/* Atmospheric narrative readability veil for deep scroll chapters */}
      <div
        className="cz-stage-veil"
        style={{
          opacity: roamMode ? 0 : veilOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* Bottom Spatial HUD Bar: Room Switcher + Live /api/v1/stream Sequence Feed */}
      <div className={`cz-stage-hud ${veilOpacity > 0.65 && !roamMode ? 'is-muted' : ''}`}>
        <div className="cz-room-pills" role="tablist" aria-label="Residence Rooms">
          {ROOM_ORDER.map((roomId) => (
            <button
              key={roomId}
              type="button"
              role="tab"
              aria-selected={activeRoom === roomId}
              data-testid={`hud-room-${roomId}`}
              className={`cz-room-pill ${activeRoom === roomId ? 'is-active' : ''}`}
              onClick={() => onSelectRoom(roomId)}
            >
              {tr(ROOM_LABELS[roomId], lang)}
            </button>
          ))}
        </div>

        <div className="cz-stream-pill" aria-live="polite">
          <Radio size={13} className="cz-stream-dot" />
          <span className="cz-mono">seq #{latestStreamEvent.seq}</span>
          <span className="cz-stream-sep">·</span>
          <span className="cz-stream-topic cz-mono">{latestStreamEvent.topic}</span>
          <span className="cz-stream-summary">{latestStreamEvent.summary}</span>
        </div>
      </div>

      {roamMode && (
        <div className="cz-roam-hint">
          {lang === 'zh'
            ? '自由漫游已开启：拖拽旋转视角 · 滚轮缩放 · 点击房间或设备锚点直接控制'
            : '3D Roam Active: Drag to orbit · Scroll to zoom · Click room pills or 3D device pins'}
        </div>
      )}
    </div>
  );
}
