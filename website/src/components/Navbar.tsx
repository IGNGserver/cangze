import { Compass, Github, Globe, Menu, Moon, Sparkles, Sun, Sunset, X } from 'lucide-react';
import { useState } from 'react';
import { COPY, TIME_LABELS, tr } from '../i18n/copy.ts';
import type { Lang, SectionId, TimeOfDay } from '../types/home.ts';

interface NavbarProps {
  lang: Lang;
  onToggleLang: () => void;
  timeOfDay: TimeOfDay;
  onChangeTime: (t: TimeOfDay) => void;
  activeSection: SectionId;
  onJumpSection: (id: SectionId) => void;
  roamMode: boolean;
  onToggleRoam: () => void;
  pendingApprovalCount: number;
}

const TIME_ICONS: Record<TimeOfDay, typeof Sunset> = {
  day: Sun,
  dusk: Sunset,
  night: Moon,
};

const TIME_ORDER: TimeOfDay[] = ['day', 'dusk', 'night'];

export function Navbar({
  lang,
  onToggleLang,
  timeOfDay,
  onChangeTime,
  activeSection,
  onJumpSection,
  roamMode,
  onToggleRoam,
  pendingApprovalCount,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: SectionId; label: string; badge?: number }> = [
    { id: 'explore', label: tr(COPY.nav.explore, lang) },
    { id: 'bedtime', label: tr(COPY.nav.bedtime, lang), badge: pendingApprovalCount },
    { id: 'agents', label: tr(COPY.nav.agents, lang) },
    { id: 'product', label: tr(COPY.nav.product, lang) },
    { id: 'deploy', label: tr(COPY.nav.deploy, lang) },
  ];

  const handleNav = (id: SectionId) => {
    if (roamMode) onToggleRoam();
    onJumpSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <header className="cz-nav" role="banner">
      <div className="cz-nav-inner">
        <button
          type="button"
          className="cz-brand-btn"
          onClick={() => handleNav('hero')}
          aria-label="Cangze Home"
        >
          <img src="./brand/cangze-ridge.svg" alt="" width={34} height={34} className="cz-brand-mark" />
          <span className="cz-brand-text">
            <span className="cz-brand-cn">藏泽</span>
            <span className="cz-brand-en">CANGZE</span>
          </span>
        </button>

        <nav className="cz-nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`cz-nav-link ${activeSection === item.id && !roamMode ? 'is-active' : ''}`}
              onClick={() => handleNav(item.id)}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="cz-nav-badge" aria-label="Pending confirmation">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="cz-nav-actions">
          <div className="cz-tod-group" role="group" aria-label="Lighting Atmosphere">
            {TIME_ORDER.map((tod) => {
              const Icon = TIME_ICONS[tod];
              return (
                <button
                  key={tod}
                  type="button"
                  data-testid={`tod-${tod}`}
                  className={`cz-tod-btn ${timeOfDay === tod ? 'is-active' : ''}`}
                  onClick={() => onChangeTime(tod)}
                  title={tr(TIME_LABELS[tod], lang)}
                  aria-label={tr(TIME_LABELS[tod], lang)}
                >
                  <Icon size={14} />
                  <span className="cz-tod-label">{tr(TIME_LABELS[tod], lang)}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="toggle-roam-btn"
            className={`cz-roam-btn ${roamMode ? 'is-active' : ''}`}
            onClick={onToggleRoam}
          >
            {roamMode ? <Sparkles size={14} /> : <Compass size={14} />}
            <span>{roamMode ? tr(COPY.nav.exitRoam, lang) : tr(COPY.nav.roam3d, lang)}</span>
          </button>

          <button
            type="button"
            data-testid="toggle-lang-btn"
            className="cz-icon-pill"
            onClick={onToggleLang}
            aria-label="Switch Language"
          >
            <Globe size={14} />
            <span>{lang === 'zh' ? 'EN' : '中文'}</span>
          </button>

          <a
            href="https://github.com/IGNGserver/cangze"
            target="_blank"
            rel="noreferrer"
            className="cz-icon-pill cz-gh-link"
            aria-label="GitHub Repository"
          >
            <Github size={15} />
          </a>

          <button
            type="button"
            className="cz-mobile-menu-btn"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="cz-mobile-drawer">
          <div className="cz-mobile-nav-list">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cz-mobile-nav-item ${activeSection === item.id ? 'is-active' : ''}`}
                onClick={() => handleNav(item.id)}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="cz-nav-badge">{item.badge}</span>
                )}
              </button>
            ))}
          </div>
          <div className="cz-mobile-tod-row">
            {TIME_ORDER.map((tod) => {
              const Icon = TIME_ICONS[tod];
              return (
                <button
                  key={tod}
                  type="button"
                  className={`cz-tod-btn ${timeOfDay === tod ? 'is-active' : ''}`}
                  onClick={() => {
                    onChangeTime(tod);
                    setMobileMenuOpen(false);
                  }}
                >
                  <Icon size={14} />
                  <span>{tr(TIME_LABELS[tod], lang)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
