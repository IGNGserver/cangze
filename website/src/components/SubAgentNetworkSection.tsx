import { Activity, BookOpen, Bot, GitMerge, OctagonAlert, Play, Shield, Zap } from 'lucide-react';
import { useState } from 'react';
import { ARBITRATION_CASES, SUB_AGENTS } from '../data/homeState.ts';
import { COPY, tr } from '../i18n/copy.ts';
import type { ArbitrationCase, Lang, SubAgentSpec } from '../types/home.ts';

interface SubAgentNetworkSectionProps {
  lang: Lang;
  onDispatchAgentPulse: (agent: SubAgentSpec) => void;
  onTriggerArbitration: (arb: ArbitrationCase) => void;
}

export function SubAgentNetworkSection({
  lang,
  onDispatchAgentPulse,
  onTriggerArbitration,
}: SubAgentNetworkSectionProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(SUB_AGENTS[0].id);
  const [activeArbId, setActiveArbId] = useState<ArbitrationCase['id']>('manual_hold');

  const activeAgent = SUB_AGENTS.find((a) => a.id === selectedAgentId) ?? SUB_AGENTS[0];
  const activeArb = ARBITRATION_CASES.find((c) => c.id === activeArbId) ?? ARBITRATION_CASES[0];

  const handleSelectAgent = (agent: SubAgentSpec) => {
    setSelectedAgentId(agent.id);
    onDispatchAgentPulse(agent);
  };

  const handleTriggerArb = (arb: ArbitrationCase) => {
    setActiveArbId(arb.id);
    onTriggerArbitration(arb);
  };

  return (
    <section id="agents" data-section="agents" className="cz-section cz-split-section is-right">
      <div className="cz-narrative-column cz-glass-panel">
        <div className="cz-section-tag">{tr(COPY.agents.tag, lang)}</div>
        <h2 className="cz-section-title">{tr(COPY.agents.title, lang)}</h2>
        <p className="cz-section-desc">{tr(COPY.agents.desc, lang)}</p>

        {/* Sub-Agent Roster Pills */}
        <div className="cz-agent-roster" role="tablist" aria-label="Persistent Sub-Agents">
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
                  <Bot size={15} />
                  <strong>{tr(agent.name, lang)}</strong>
                  <span className="cz-rev-badge cz-mono">r{agent.revision}</span>
                </div>
                <span className="cz-agent-tab-sub cz-mono">{agent.triggerExpr}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Sub-Agent Workbench Detail */}
        <div className="cz-agent-card" data-testid="active-agent-card">
          <div className="cz-agent-card-header">
            <div>
              <div className="cz-agent-title-line">
                <h3>{tr(activeAgent.name, lang)}</h3>
                <span className="cz-mono cz-principal-tag">
                  agent:{activeAgent.slug}@r{activeAgent.revision}
                </span>
              </div>
              <p className="cz-agent-role">{tr(activeAgent.role, lang)}</p>
            </div>

            <div className="cz-agent-header-btns">
              <button
                type="button"
                data-testid="dispatch-agent-pulse-btn"
                className="cz-fluent-btn-primary"
                onClick={() => onDispatchAgentPulse(activeAgent)}
              >
                <Play size={13} />
                <span>{lang === 'zh' ? '模拟触发脉冲' : 'Simulate Run'}</span>
              </button>
              <span className="cz-estop-pill" title="Emergency stop cancels queued & active runs">
                <OctagonAlert size={13} />
                <span>{lang === 'zh' ? '紧急停止就绪' : 'E-Stop Armed'}</span>
              </span>
            </div>
          </div>

          <p className="cz-agent-summary">{tr(activeAgent.summary, lang)}</p>

          {/* Telemetry Metadata Strip */}
          <div className="cz-agent-meta-grid">
            <div className="cz-meta-cell">
              <span>{lang === 'zh' ? '上下文模式' : 'Context Mode'}</span>
              <strong className="cz-mono">{activeAgent.contextMode}</strong>
            </div>
            <div className="cz-meta-cell">
              <span>{lang === 'zh' ? '高风险策略' : 'High-Risk'}</span>
              <strong className="cz-mono text-amber">{activeAgent.highRisk}</strong>
            </div>
            <div className="cz-meta-cell">
              <span>{lang === 'zh' ? '人工退让 / 优先级' : 'Manual Hold / Prio'}</span>
              <strong className="cz-mono">
                {activeAgent.respectManualMinutes}m · P{activeAgent.priority}
              </strong>
            </div>
            <div className="cz-meta-cell">
              <span>{lang === 'zh' ? '今日费用 / 预算' : 'Cost / Budget'}</span>
              <strong className="cz-mono">
                ${activeAgent.costTodayUsd} / ${activeAgent.dailyBudgetUsd}
              </strong>
            </div>
          </div>

          {/* Memory Note + Policy Rule Split */}
          <div className="cz-agent-split-boxes">
            <div className="cz-memory-box">
              <div className="cz-subbox-head">
                <BookOpen size={13} />
                <span>{lang === 'zh' ? '持久化记忆（agent_memory）' : 'Persistent Memory Note'}</span>
              </div>
              <strong>{tr(activeAgent.memoryNote.title, lang)}</strong>
              <p>{tr(activeAgent.memoryNote.body, lang)}</p>
            </div>

            <div className="cz-rule-box">
              <div className="cz-subbox-head">
                <Shield size={13} />
                <span>{lang === 'zh' ? '中枢强制权限规则（默认拒绝）' : 'Hub-Enforced Permission Rule'}</span>
              </div>
              <pre className="cz-code-pre cz-mono">{activeAgent.ruleSnippet}</pre>
            </div>
          </div>

          <div className="cz-optimistic-note">
            <GitMerge size={13} />
            <span>
              {lang === 'zh'
                ? '不可变修订：更新必须携带 baseRevision 进行乐观并发校验，权限与触发器数组执行原子三方合并，且子代理永不可获得 agent_* 工具自我提权。'
                : 'Immutable revisions: edits require baseRevision optimistic concurrency & 3-way conflict review; subagents can never hold agent_* tools.'}
            </span>
          </div>
        </div>

        {/* Interactive Coordination & Conflict Arbitration Simulator */}
        <div className="cz-arbitration-lab">
          <div className="cz-lab-header">
            <Activity size={15} className="cz-accent-icon" />
            <strong>
              {lang === 'zh'
                ? '多主体冲突仲裁实验室（点击触发 3D 空间拦截信号）'
                : 'Live Write-Arbitration & Guard Simulator'}
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
                <span className="cz-arb-badge cz-mono">{arb.badge}</span>
                <strong>{tr(arb.title, lang)}</strong>
              </button>
            ))}
          </div>

          <div className="cz-arb-verdict" data-testid="arb-verdict-box">
            <div className="cz-arb-verdict-top cz-mono">
              <span>{activeArb.principal}</span>
              <span>→ {activeArb.targetEntity}</span>
              <span className="cz-http-pill">{activeArb.httpCode}</span>
            </div>
            <p className="cz-arb-desc">{tr(activeArb.description, lang)}</p>
            <div className="cz-arb-outcome">
              <Zap size={14} />
              <span>{tr(activeArb.gatewayVerdict, lang)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
