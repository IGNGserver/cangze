import { BookmarkCheck, Check, HeartHandshake, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { ARBITRATION_CASES, SUB_AGENTS } from '../data/homeState.ts';
import { COPY, tr } from '../i18n/copy.ts';
import type { ArbitrationCase, Lang, SubAgentSpec } from '../types/home.ts';

interface SubAgentNetworkSectionProps {
  lang: Lang;
  onSelectHelper?: (agent: SubAgentSpec) => void;
  onSelectPromise?: (arb: ArbitrationCase) => void;
}

export function SubAgentNetworkSection({
  lang,
  onSelectHelper,
  onSelectPromise,
}: SubAgentNetworkSectionProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(SUB_AGENTS[0].id);
  const [activeArbId, setActiveArbId] = useState<ArbitrationCase['id']>('manual_hold');

  const activeAgent = SUB_AGENTS.find((a) => a.id === selectedAgentId) ?? SUB_AGENTS[0];
  const activeArb = ARBITRATION_CASES.find((c) => c.id === activeArbId) ?? ARBITRATION_CASES[0];

  const handleSelectAgent = (agent: SubAgentSpec) => {
    setSelectedAgentId(agent.id);
    onSelectHelper?.(agent);
  };

  const handleTriggerArb = (arb: ArbitrationCase) => {
    setActiveArbId(arb.id);
    onSelectPromise?.(arb);
  };

  return (
    <section id="agents" data-section="agents" className="cz-editorial-section cz-editorial-oat">
      <div className="cz-wide-container">
        <div className="cz-wide-header">
          <div>
            <div className="cz-section-tag">{tr(COPY.agents.tag, lang)}</div>
            <h2 className="cz-section-title">{tr(COPY.agents.title, lang)}</h2>
            <p className="cz-section-desc">{tr(COPY.agents.desc, lang)}</p>
          </div>
        </div>

        <div className="cz-helpers-layout">
          {/* Left: Helper Selector + Active Helper Card */}
          <div className="cz-helpers-main cz-warm-card">
            <div className="cz-agent-roster" role="tablist" aria-label="Home Helpers">
              {SUB_AGENTS.map((agent) => {
                const active = agent.id === activeAgent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`agent-tab-${agent.slug}`}
                    className={`cz-agent-tab ${active ? 'is-active' : ''}`}
                    onClick={() => handleSelectAgent(agent)}
                  >
                    <div className="cz-agent-tab-top">
                      <Sparkles size={14} className="cz-hearth-icon" />
                      <strong>{tr(agent.name, lang)}</strong>
                    </div>
                    <span className="cz-agent-tab-sub">{tr(agent.scheduleText, lang)}</span>
                  </button>
                );
              })}
            </div>

            <div className="cz-agent-card" data-testid="active-agent-card">
              <div className="cz-agent-card-header">
                <div>
                  <div className="cz-agent-title-line">
                    <h3>{tr(activeAgent.name, lang)}</h3>
                    <span className="cz-schedule-pill">{tr(activeAgent.scheduleText, lang)}</span>
                  </div>
                  <p className="cz-agent-role">{tr(activeAgent.role, lang)}</p>
                </div>

                <span className="cz-pause-pill">
                  <ShieldCheck size={13} />
                  <span>{lang === 'zh' ? '随时可一键暂停' : 'Pause Anytime'}</span>
                </span>
              </div>

              <p className="cz-agent-summary">{tr(activeAgent.summary, lang)}</p>

              <div className="cz-agent-split-boxes">
                <div className="cz-memory-box">
                  <div className="cz-subbox-head">
                    <BookmarkCheck size={14} className="cz-hearth-icon" />
                    <span>{lang === 'zh' ? '它记得的家里习惯' : 'Family Habits It Remembers'}</span>
                  </div>
                  <strong>{tr(activeAgent.memoryNote.title, lang)}</strong>
                  <p>{tr(activeAgent.memoryNote.body, lang)}</p>
                </div>

                <div className="cz-rule-box">
                  <div className="cz-subbox-head">
                    <ShieldAlert size={14} className="cz-sage-icon" />
                    <span>{lang === 'zh' ? '它能做什么、不能做什么' : 'Clear House Rules'}</span>
                  </div>
                  <ul className="cz-boundary-list">
                    <li className="is-allow">
                      <Check size={14} />
                      <span>
                        <strong>{lang === 'zh' ? '允许：' : 'Can: '}</strong>
                        {tr(activeAgent.canDo, lang)}
                      </span>
                    </li>
                    <li className="is-deny">
                      <X size={14} />
                      <span>
                        <strong>{lang === 'zh' ? '禁止：' : 'Never: '}</strong>
                        {tr(activeAgent.cannotDo, lang)}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right: 4 Family Comfort Promises */}
          <div className="cz-promises-panel cz-warm-card">
            <div className="cz-lab-header">
              <HeartHandshake size={17} className="cz-hearth-icon" />
              <strong>
                {lang === 'zh' ? '懂分寸，绝不给家人添乱' : 'Polite rules so helpers never get in your way'}
              </strong>
            </div>

            <div className="cz-arb-grid">
              {ARBITRATION_CASES.map((arb) => (
                <button
                  key={arb.id}
                  type="button"
                  data-testid={`arb-${arb.id}`}
                  className={`cz-arb-btn ${arb.id === activeArb.id ? 'is-active' : ''}`}
                  onClick={() => handleTriggerArb(arb)}
                >
                  <span className="cz-arb-badge">{tr(arb.badge, lang)}</span>
                  <strong>{tr(arb.title, lang)}</strong>
                </button>
              ))}
            </div>

            <div className="cz-arb-verdict" data-testid="arb-verdict-box">
              <div className="cz-arb-verdict-top">
                <span className="cz-arb-scene">{tr(activeArb.scenarioLabel, lang)}</span>
                <span className="cz-verdict-pill">{tr(activeArb.verdictTag, lang)}</span>
              </div>
              <p className="cz-arb-desc">{tr(activeArb.description, lang)}</p>
              <div className="cz-arb-outcome">
                <ShieldCheck size={15} className="cz-sage-icon" />
                <span>{tr(activeArb.gatewayVerdict, lang)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
