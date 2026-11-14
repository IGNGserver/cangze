import {
  ArrowDown,
  ArrowUp,
  Blinds,
  Coffee,
  GitBranch,
  Lightbulb,
  Lock,
  LockOpen,
  Minus,
  Pause,
  Plus,
  ShieldAlert,
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
      return <ShieldAlert size={16} />;
  }
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
  const expandedIds = roomEntities.map((e) => e.id);

  return (
    <section id="explore" data-section="explore" className="cz-section cz-split-section is-right">
      <div className="cz-narrative-column cz-glass-panel">
        <div className="cz-section-tag">{tr(COPY.explore.tag, lang)}</div>
        <h2 className="cz-section-title">{tr(COPY.explore.title, lang)}</h2>
        <p className="cz-section-desc">{tr(COPY.explore.desc, lang)}</p>

        {/* Architectural Room Selector Tabs */}
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

        {/* Authentic Fluent 2 Cangze Devices Surface */}
        <div className="cz-fluent-surface">
          <div className="cz-fluent-header">
            <div>
              <span className="cz-fluent-title">
                {lang === 'zh' ? '设备 · ' : 'Devices · '}
                {tr(ROOM_LABELS[effectiveRoom], lang)}
              </span>
              <span className="cz-fluent-meta cz-mono">
                placement=&quot;room&quot; · {roomEntities.length} {lang === 'zh' ? '个实体' : 'entities'}
              </span>
            </div>
            <button type="button" className="cz-mini-link" onClick={() => onSelectRoom('overview')}>
              {lang === 'zh' ? '拉回全景鸟瞰' : 'Reset Bird’s-Eye'}
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
                  className={`cz-fluent-tile ${isOn ? 'is-active' : ''}`}
                >
                  <div className="cz-fluent-tile-main">
                    <span className={`cz-tile-icon ${isOn ? 'is-active' : ''}`}>{entityLeadIcon(ent)}</span>
                    <div className="cz-tile-info">
                      <div className="cz-tile-name-row">
                        <strong>{tr(ent.name, lang)}</strong>
                        {ent.highRisk && (
                          <span className="cz-risk-tag">{lang === 'zh' ? '高风险' : 'High Risk'}</span>
                        )}
                      </div>
                      <span className="cz-tile-sub cz-mono">
                        {ent.id} ·{' '}
                        {ent.domain === 'light' && ent.state === 'on'
                          ? `${lang === 'zh' ? '开' : 'On'} · ${ent.brightnessPct ?? 100}%`
                          : ent.domain === 'climate'
                            ? `${ent.state} → ${ent.temperature}°C (${ent.currentTemperature}°C)`
                            : ent.domain === 'sensor'
                              ? `${ent.state} ${ent.unit ?? ''}`
                              : ent.state}
                      </span>
                    </div>
                  </div>

                  {/* Authentic Domain-Specific Fluent Quick Controls */}
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
                          className={`cz-fluent-switch ${ent.state === 'on' ? 'is-checked' : ''}`}
                          onClick={() => onToggleEntity(ent.id)}
                          aria-label={`Toggle ${tr(ent.name, lang)}`}
                        >
                          <span className="cz-fluent-switch-thumb" />
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
                          title={lang === 'zh' ? '停止' : 'Stop'}
                          aria-label="Stop cover"
                        >
                          <Pause size={13} />
                        </button>
                        <button
                          type="button"
                          data-testid={`cover-close-${ent.id}`}
                          onClick={() => onCoverCommand(ent.id, 'close')}
                          title={lang === 'zh' ? '关闭' : 'Close'}
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
                        <span className="cz-climate-readout cz-mono">{ent.temperature?.toFixed(1)}°</span>
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
                        className="cz-fluent-action-btn"
                        onClick={() => onToggleEntity(ent.id)}
                      >
                        {ent.state === 'locked'
                          ? lang === 'zh'
                            ? '解锁'
                            : 'Unlock'
                          : lang === 'zh'
                            ? '上锁'
                            : 'Lock'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Target Expansion Architectural Invariant Callout */}
          <div className="cz-invariant-box">
            <div className="cz-invariant-head">
              <GitBranch size={14} className="cz-accent-icon" />
              <span className="cz-mono">
                target: &#123; area_id: &quot;{effectiveRoom}&quot; &#125; → HaGateway.expandTargets()
              </span>
            </div>
            <p className="cz-invariant-note">{tr(COPY.explore.expansionNote, lang)}</p>
            <div className="cz-expanded-chips">
              {expandedIds.map((id) => (
                <span key={id} className="cz-code-chip cz-mono">
                  {id}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
