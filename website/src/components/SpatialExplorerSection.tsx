import {
  ArrowDown,
  ArrowUp,
  Blinds,
  Coffee,
  Lightbulb,
  Lock,
  LockOpen,
  MessageCircleHeart,
  Minus,
  Pause,
  Plus,
  ShieldCheck,
  Thermometer,
  Warehouse,
} from 'lucide-react';
import { COPY, ROOM_LABELS, tr } from '../i18n/copy.ts';
import type { HomeEntity, Lang, RoomId } from '../types/home.ts';

interface SpatialExplorerSectionProps {
  lang: Lang;
  activeRoom: RoomId;
  entities: HomeEntity[];
  onSelectRoom: (room: RoomId) => void;
  onToggleEntity: (id: string) => void;
  onSetLightBrightness: (id: string, pct: number) => void;
  onStepClimate: (id: string, delta: number) => void;
  onCoverCommand: (id: string, cmd: 'open' | 'stop' | 'close') => void;
}

const EXPLORE_ROOMS: Array<Exclude<RoomId, 'overview'>> = [
  'living_room',
  'hall',
  'kitchen',
  'bedroom',
  'courtyard',
];

function entityLeadIcon(e: HomeEntity) {
  switch (e.domain) {
    case 'light':
      return <Lightbulb size={16} />;
    case 'cover':
      return e.deviceClass === 'garage' ? <Warehouse size={16} /> : <Blinds size={16} />;
    case 'climate':
      return <Thermometer size={16} />;
    case 'lock':
      return e.state === 'locked' ? <Lock size={16} /> : <LockOpen size={16} />;
    case 'switch':
      return <Coffee size={16} />;
    default:
      return <ShieldCheck size={16} />;
  }
}

function formatFriendlyStatus(e: HomeEntity, lang: Lang): string {
  if (e.domain === 'light') {
    if (e.state === 'on') {
      return lang === 'zh' ? `亮着 · 亮度 ${e.brightnessPct ?? 100}%` : `On · ${e.brightnessPct ?? 100}%`;
    }
    return lang === 'zh' ? '已关灯' : 'Off';
  }
  if (e.domain === 'cover') {
    if (e.deviceClass === 'garage') {
      return e.state === 'open'
        ? lang === 'zh'
          ? '车库门开着'
          : 'Gate open'
        : lang === 'zh'
          ? '车库门已关严'
          : 'Gate closed';
    }
    return e.state === 'open' ? (lang === 'zh' ? '已拉开' : 'Open') : lang === 'zh' ? '已拉合' : 'Closed';
  }
  if (e.domain === 'climate') {
    const modeText =
      lang === 'zh' ? (e.state === 'cool' ? '制冷' : '舒适恒温') : e.state === 'cool' ? 'Cooling' : 'Comfort';
    return `${modeText} · ${e.temperature?.toFixed(1) ?? '23.0'}°C (${lang === 'zh' ? '室内' : 'now'} ${e.currentTemperature?.toFixed(1) ?? '23.0'}°C)`;
  }
  if (e.domain === 'lock') {
    return e.state === 'locked'
      ? lang === 'zh'
        ? '已锁好 · 放心'
        : 'Locked safely'
      : lang === 'zh'
        ? '未上锁'
        : 'Unlocked';
  }
  if (e.domain === 'switch') {
    return e.state === 'on'
      ? lang === 'zh'
        ? '通电待机中'
        : 'Powered on'
      : lang === 'zh'
        ? '已关闭电源'
        : 'Powered off';
  }
  if (e.domain === 'binary_sensor') {
    return e.state === 'on'
      ? lang === 'zh'
        ? '门口有人经过'
        : 'Motion sensed'
      : lang === 'zh'
        ? '门口很安静'
        : 'All quiet';
  }
  if (e.domain === 'alarm_control_panel') {
    return e.state === 'armed_away'
      ? lang === 'zh'
        ? '离家守护中'
        : 'Armed'
      : lang === 'zh'
        ? '在家模式（未设防）'
        : 'Home mode (disarmed)';
  }
  if (e.domain === 'sensor') {
    return `${e.state} ${e.unit ?? ''}`.trim();
  }
  return e.state;
}

export function SpatialExplorerSection({
  lang,
  activeRoom,
  entities,
  onSelectRoom,
  onToggleEntity,
  onSetLightBrightness,
  onStepClimate,
  onCoverCommand,
}: SpatialExplorerSectionProps) {
  const effectiveRoom: Exclude<RoomId, 'overview'> = activeRoom === 'overview' ? 'living_room' : activeRoom;
  const roomEntities = entities.filter((e) => e.room === effectiveRoom && e.placement === 'room');

  return (
    <section id="explore" data-section="explore" className="cz-story-section">
      <div className="cz-warm-card cz-section-card">
        <div className="cz-section-tag">{tr(COPY.explore.tag, lang)}</div>
        <h2 className="cz-section-title">{tr(COPY.explore.title, lang)}</h2>
        <p className="cz-section-desc">{tr(COPY.explore.desc, lang)}</p>

        {/* Room Selector Grid */}
        <div className="cz-room-grid" role="tablist" aria-label="Explore Rooms">
          {EXPLORE_ROOMS.map((roomId) => {
            const selected = effectiveRoom === roomId && activeRoom !== 'overview';
            return (
              <button
                key={roomId}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`explore-room-${roomId}`}
                className={`cz-room-card-btn ${effectiveRoom === roomId ? 'is-selected' : ''}`}
                onClick={() => onSelectRoom(roomId)}
              >
                <span className="cz-room-card-title">{tr(ROOM_LABELS[roomId], lang)}</span>
                <span className="cz-room-card-sub">{tr(ROOM_LABELS[roomId].sub, lang)}</span>
              </button>
            );
          })}
        </div>

        {/* Clean Warm Home Device Surface */}
        <div className="cz-home-room-panel">
          <div className="cz-home-room-header">
            <div>
              <span className="cz-home-room-title">
                {tr(ROOM_LABELS[effectiveRoom], lang)}
                {lang === 'zh' ? '里的常用设备' : ' Devices'}
              </span>
              <span className="cz-home-room-meta">
                {lang === 'zh'
                  ? `已自动归整 ${roomEntities.length} 项常用控制`
                  : `${roomEntities.length} everyday controls`}
              </span>
            </div>
            <button type="button" className="cz-mini-link" onClick={() => onSelectRoom('overview')}>
              {lang === 'zh' ? '看看全屋' : 'Whole Home'}
            </button>
          </div>

          <div className="cz-entity-tile-list">
            {roomEntities.map((ent) => {
              const isOn =
                ent.state === 'on' ||
                ent.state === 'open' ||
                ent.state === 'locked' ||
                (ent.domain === 'climate' && ent.state !== 'off');

              return (
                <div
                  key={ent.id}
                  data-testid={`tile-${ent.id}`}
                  className={`cz-device-tile ${isOn ? 'is-active' : ''}`}
                >
                  <div className="cz-device-tile-main">
                    <span className={`cz-tile-icon ${isOn ? 'is-active' : ''}`}>{entityLeadIcon(ent)}</span>
                    <div className="cz-tile-info">
                      <div className="cz-tile-name-row">
                        <strong>{tr(ent.name, lang)}</strong>
                        {ent.highRisk && (
                          <span className="cz-risk-tag">{lang === 'zh' ? '需确认' : 'Asks First'}</span>
                        )}
                      </div>
                      <span className="cz-tile-sub">{formatFriendlyStatus(ent, lang)}</span>
                    </div>
                  </div>

                  {/* Quick Controls */}
                  <div className="cz-tile-controls">
                    {(ent.domain === 'light' || ent.domain === 'switch') && (
                      <div className="cz-light-controls">
                        {ent.domain === 'light' && ent.state === 'on' && (
                          <div className="cz-dimmer-pills">
                            {[25, 65, 100].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                className={`cz-dim-pill ${Math.abs((ent.brightnessPct ?? 100) - pct) <= 12 ? 'is-on' : ''}`}
                                onClick={() => onSetLightBrightness(ent.id, pct)}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ent.state === 'on'}
                          data-testid={`toggle-${ent.id}`}
                          className={`cz-warm-switch ${ent.state === 'on' ? 'is-checked' : ''}`}
                          onClick={() => onToggleEntity(ent.id)}
                          aria-label={`Toggle ${tr(ent.name, lang)}`}
                        >
                          <span className="cz-warm-switch-thumb" />
                        </button>
                      </div>
                    )}

                    {ent.domain === 'cover' && (
                      <div className="cz-compact-btns">
                        <button
                          type="button"
                          data-testid={`cover-open-${ent.id}`}
                          onClick={() => onCoverCommand(ent.id, 'open')}
                          title={lang === 'zh' ? '打开' : 'Open'}
                          aria-label="Open cover"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onCoverCommand(ent.id, 'stop')}
                          title={lang === 'zh' ? '暂停' : 'Stop'}
                          aria-label="Stop cover"
                        >
                          <Pause size={13} />
                        </button>
                        <button
                          type="button"
                          data-testid={`cover-close-${ent.id}`}
                          onClick={() => onCoverCommand(ent.id, 'close')}
                          title={lang === 'zh' ? '拉合' : 'Close'}
                          aria-label="Close cover"
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                    )}

                    {ent.domain === 'climate' && (
                      <div className="cz-compact-btns">
                        <button
                          type="button"
                          data-testid={`climate-dec-${ent.id}`}
                          onClick={() => onStepClimate(ent.id, -0.5)}
                          aria-label="Decrease temperature"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="cz-climate-readout">{ent.temperature?.toFixed(1)}°</span>
                        <button
                          type="button"
                          data-testid={`climate-inc-${ent.id}`}
                          onClick={() => onStepClimate(ent.id, 0.5)}
                          aria-label="Increase temperature"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}

                    {ent.domain === 'lock' && (
                      <button
                        type="button"
                        data-testid={`lock-btn-${ent.id}`}
                        className="cz-tile-action-btn"
                        onClick={() => onToggleEntity(ent.id)}
                      >
                        {ent.state === 'locked'
                          ? lang === 'zh'
                            ? '去解锁'
                            : 'Unlock'
                          : lang === 'zh'
                            ? '去上锁'
                            : 'Lock'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Everyday Spoken Interaction Tip */}
          <div className="cz-spoken-tip-box">
            <div className="cz-spoken-tip-head">
              <MessageCircleHeart size={15} className="cz-hearth-icon" />
              <strong>{tr(COPY.explore.conversationTipTitle, lang)}</strong>
            </div>
            <p className="cz-spoken-tip-note">{tr(COPY.explore.conversationTipBody, lang)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
