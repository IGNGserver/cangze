import { ArrowDownRight, Home, Lock, Play, Sparkles, SunMedium, Thermometer } from 'lucide-react';
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
  const isLocked = frontLock?.state === 'locked';

  return (
    <section id="hero" data-section="hero" className="cz-story-section cz-hero-section">
      <div className="cz-warm-card cz-hero-card">
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
            <span>{tr(COPY.hero.ctaPrimary, lang)}</span>
          </button>

          <button type="button" className="cz-btn cz-btn-soft" onClick={() => onJumpSection('explore')}>
            <span>{tr(COPY.hero.ctaSecondary, lang)}</span>
            <ArrowDownRight size={16} />
          </button>

          <button type="button" className="cz-btn cz-btn-ghost" onClick={() => onJumpSection('deploy')}>
            <Sparkles size={15} />
            <span>{tr(COPY.hero.ctaDeploy, lang)}</span>
          </button>
        </div>

        {/* Gentle Live Home Snapshot */}
        <div className="cz-home-snapshot" aria-label="Right now at home">
          <div className="cz-snapshot-head">
            <Home size={14} className="cz-hearth-icon" />
            <span>{lang === 'zh' ? '此刻家里状态' : 'Right Now at Home'}</span>
          </div>
          <div className="cz-snapshot-row">
            <div className="cz-snap-pill">
              <SunMedium size={14} className="cz-hearth-icon" />
              <span>{lang === 'zh' ? `${lightsOnCount} 盏灯亮着` : `${lightsOnCount} lights on`}</span>
            </div>
            <div className="cz-snap-pill">
              <Thermometer size={14} className="cz-sage-icon" />
              <span>
                {lang === 'zh'
                  ? `客厅 ${livingTemp?.state ?? '23.2'}°C`
                  : `Living ${livingTemp?.state ?? '23.2'}°C`}
              </span>
            </div>
            <div className={`cz-snap-pill ${isLocked ? 'is-sage' : 'is-amber'}`}>
              <Lock size={14} />
              <span>
                {isLocked
                  ? lang === 'zh'
                    ? '玄关大门已上锁'
                    : 'Front door locked'
                  : lang === 'zh'
                    ? '玄关大门未上锁'
                    : 'Front door unlocked'}
              </span>
            </div>
          </div>
        </div>

        <div className="cz-hero-metrics">
          {COPY.hero.metrics.map((m, idx) => (
            <div key={idx} className="cz-metric-item">
              <span className="cz-metric-k">{tr(m.k, lang)}</span>
              <span className="cz-metric-v">{tr(m.v, lang)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
