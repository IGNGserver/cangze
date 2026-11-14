import { ArrowDownRight, Play, ShieldCheck, Terminal } from 'lucide-react';
import { COPY, tr } from '../i18n/copy.ts';
import type { HomeEntity, Lang, SectionId } from '../types/home.ts';

interface HeroSectionProps {
  lang: Lang;
  entities: HomeEntity[];
  onJumpSection: (id: SectionId) => void;
  onStartBedtimeDemo: () => void;
}

export function HeroSection({ lang, entities, onJumpSection, onStartBedtimeDemo }: HeroSectionProps) {
  const lightsOnCount = entities.filter((e) => e.domain === 'light' && e.state === 'on').length;
  const frontLock = entities.find((e) => e.id === 'lock.front_door');
  const livingTemp = entities.find((e) => e.id === 'sensor.living_temperature');

  return (
    <section id="hero" data-section="hero" className="cz-section cz-hero-section">
      <div className="cz-hero-grid">
        <div className="cz-hero-card cz-glass-panel">
          <div className="cz-eyebrow-row">
            <span className="cz-live-dot" />
            <span className="cz-eyebrow-text">{tr(COPY.hero.eyebrow, lang)}</span>
          </div>

          <p className="cz-epigraph">{tr(COPY.hero.epigraph, lang)}</p>

          <h1 className="cz-hero-title">
            <span>{tr(COPY.hero.titleLine1, lang)}</span>
            <span className="cz-hero-title-accent">{tr(COPY.hero.titleLine2, lang)}</span>
          </h1>

          <p className="cz-hero-lead">{tr(COPY.hero.lead, lang)}</p>

          <div className="cz-hero-cta-row">
            <button type="button" className="cz-btn cz-btn-primary" onClick={() => onJumpSection('explore')}>
              <span>{tr(COPY.hero.ctaPrimary, lang)}</span>
              <ArrowDownRight size={16} />
            </button>

            <button
              type="button"
              data-testid="hero-bedtime-cta"
              className="cz-btn cz-btn-warm"
              onClick={() => {
                onJumpSection('bedtime');
                onStartBedtimeDemo();
              }}
            >
              <Play size={15} />
              <span>{tr(COPY.hero.ctaSecondary, lang)}</span>
            </button>

            <button type="button" className="cz-btn cz-btn-ghost" onClick={() => onJumpSection('deploy')}>
              <Terminal size={15} />
              <span>{tr(COPY.hero.ctaDeploy, lang)}</span>
            </button>
          </div>

          <div className="cz-hero-metrics">
            {COPY.hero.metrics.map((m) => (
              <div key={m.k} className="cz-metric-item">
                <span className="cz-metric-k cz-mono">{m.k}</span>
                <span className="cz-metric-v">{tr(m.v, lang)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Telemetry Floating Card anchored over the 3D Residence */}
        <div className="cz-hero-telemetry cz-glass-subtle" aria-label="Live Home Assistant Snapshot">
          <div className="cz-telemetry-header">
            <ShieldCheck size={15} className="cz-accent-icon" />
            <span>
              {lang === 'zh' ? '泽居 · Home Assistant 实时状态快照' : 'Sanctuary · Live HA Registry Snapshot'}
            </span>
          </div>
          <div className="cz-telemetry-chips">
            <div className="cz-tel-chip">
              <span className="cz-tel-label">{lang === 'zh' ? '点亮灯具' : 'Active Lights'}</span>
              <strong className="cz-mono">{lightsOnCount} / 5</strong>
            </div>
            <div className="cz-tel-chip">
              <span className="cz-tel-label">{lang === 'zh' ? '客厅温度' : 'Living Temp'}</span>
              <strong className="cz-mono">{livingTemp?.state ?? '23.2'}°C</strong>
            </div>
            <div className="cz-tel-chip">
              <span className="cz-tel-label">{lang === 'zh' ? '玄关门锁' : 'Front Lock'}</span>
              <strong className={`cz-mono ${frontLock?.state === 'locked' ? 'text-emerald' : 'text-amber'}`}>
                {frontLock?.state === 'locked'
                  ? lang === 'zh'
                    ? 'locked · 已上锁'
                    : 'locked'
                  : lang === 'zh'
                    ? 'unlocked · 未锁'
                    : 'unlocked'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
