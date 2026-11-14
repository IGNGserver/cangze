import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { COPY, tr } from '../i18n/copy.ts';
import type { AuditEntry, Lang, ScenarioStatus } from '../types/home.ts';

export interface BedtimeStepLog {
  id: string;
  tool: string;
  summary: string;
  detail: { zh: string; en: string };
  state: 'done' | 'running' | 'waiting_approval' | 'approved' | 'denied';
}

interface BedtimeScenarioSectionProps {
  lang: Lang;
  status: ScenarioStatus;
  stepIndex: number;
  steps: BedtimeStepLog[];
  countdownSec: number;
  selectedModel: string;
  onChangeModel: (model: string) => void;
  onStartScenario: () => void;
  onResetScenario: () => void;
  onDecideApproval: (approve: boolean) => void;
  recentAudits: AuditEntry[];
}

const MODELS = [
  'anthropic / claude-sonnet-4 · thinking: medium',
  'deepseek / deepseek-v3 · thinking: off',
  'qwen / qwen-max · thinking: low',
  'ollama / qwen3:32b (Local LAN) · $0.00',
];

export function BedtimeScenarioSection({
  lang,
  status,
  stepIndex,
  steps,
  countdownSec,
  selectedModel,
  onChangeModel,
  onStartScenario,
  onResetScenario,
  onDecideApproval,
  recentAudits,
}: BedtimeScenarioSectionProps) {
  const mins = String(Math.floor(countdownSec / 60)).padStart(2, '0');
  const secs = String(countdownSec % 60).padStart(2, '0');
  const approvalCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === 'waiting_approval') {
      approvalCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [status]);

  const approvalArgs = {
    domain: 'lock',
    service: 'lock',
    entityIds: ['lock.front_door'],
    data: {},
  };

  return (
    <section id="bedtime" data-section="bedtime" className="cz-section cz-split-section is-left">
      <div className="cz-narrative-column cz-glass-panel">
        <div className="cz-section-tag">{tr(COPY.bedtime.tag, lang)}</div>
        <h2 className="cz-section-title">{tr(COPY.bedtime.title, lang)}</h2>
        <p className="cz-section-desc">{tr(COPY.bedtime.desc, lang)}</p>

        {/* Scenario Control Bar */}
        <div className="cz-demo-action-bar">
          {status === 'idle' ? (
            <button
              type="button"
              data-testid="run-bedtime-btn"
              className="cz-btn cz-btn-warm cz-btn-full"
              onClick={onStartScenario}
            >
              <Play size={15} />
              <span>{tr(COPY.bedtime.runBtn, lang)}</span>
            </button>
          ) : (
            <div className="cz-demo-running-row">
              <div
                className={`cz-status-pill ${status === 'waiting_approval' ? 'is-warning' : status === 'running' ? 'is-running' : 'is-done'}`}
                data-testid="bedtime-status-pill"
              >
                {status === 'waiting_approval' && <ShieldAlert size={14} />}
                {status === 'running' && <Sparkles size={14} />}
                {(status === 'completed' || status === 'denied_completed') && <CheckCircle2 size={14} />}
                <span>
                  {status === 'waiting_approval'
                    ? tr(COPY.bedtime.waitingBadge, lang)
                    : status === 'running'
                      ? tr(COPY.bedtime.runningBadge, lang)
                      : status === 'completed'
                        ? lang === 'zh'
                          ? '晚安场景已完成（门锁已批准上锁）'
                          : 'Bedtime Routine Complete (Lock Approved)'
                        : lang === 'zh'
                          ? '晚安场景已完成（门锁按你指示保持未锁）'
                          : 'Routine Complete (Lock Left Unlocked per Denial)'}
                </span>
              </div>

              <button
                type="button"
                data-testid="reset-bedtime-btn"
                className="cz-btn cz-btn-ghost cz-btn-sm"
                onClick={onResetScenario}
              >
                <RotateCcw size={14} />
                <span>{tr(COPY.bedtime.replayBtn, lang)}</span>
              </button>
            </div>
          )}
        </div>

        {/* Authentic Fluent 2 Cangze Session Window */}
        <div className="cz-session-window" data-testid="session-window">
          {/* Session Top Chrome */}
          <div className="cz-session-topbar">
            <div className="cz-session-title-group">
              <img src="./brand/cangze-ridge.svg" alt="" width={20} height={20} />
              <strong>{lang === 'zh' ? '晚安准备 · 主会话' : 'Evening Wind-Down · Session'}</strong>
              <span className="cz-branch-pill cz-mono" title="Conversation tree branch">
                <ChevronLeft size={11} /> 2/2 <ChevronRight size={11} />
              </span>
            </div>

            <div className="cz-session-topbar-right">
              <select
                className="cz-model-select"
                value={selectedModel}
                onChange={(e) => onChangeModel(e.target.value)}
                aria-label="Session Model"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <div className="cz-bell-wrap" title={lang === 'zh' ? '通知中心' : 'Notification Center'}>
                <Bell size={15} />
                {status === 'waiting_approval' && (
                  <span className="cz-bell-badge" data-testid="approval-bell-badge">
                    1
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Chat Message Stream */}
          <div className="cz-session-body">
            {/* User Bubble */}
            <div className="cz-user-bubble-row">
              <div className="cz-user-bubble">
                {lang === 'zh'
                  ? '帮我准备睡觉，关掉楼下灯和咖啡机，拉上主卧窗帘留一盏夜灯，顺便把前门锁好。'
                  : 'Help me get ready for bed: turn off downstairs lights & coffee machine, close bedroom curtains with a soft nightlight, and lock the front door.'}
              </div>
            </div>

            {status === 'idle' ? (
              <div className="cz-session-idle-prompt">
                <p>
                  {lang === 'zh'
                    ? '点击上方「发送指令」按钮，实时观看 3D 住宅摄像机穿梭各房间调光拉帘，并在触达玄关智能门锁时触发藏泽审批拦截。'
                    : 'Click “Send” above to watch the 3D camera glide room-to-room adjusting lights and drapery, then pause at the front door lock for human approval.'}
                </p>
              </div>
            ) : (
              <div className="cz-assistant-stream">
                {/* Tool Execution Chain */}
                <div className="cz-tool-chain">
                  {steps.map((step, idx) => {
                    if (idx > stepIndex) return null;
                    return (
                      <div key={step.id} className={`cz-tool-row is-${step.state}`}>
                        <span className="cz-tool-dot">
                          {step.state === 'done' || step.state === 'approved' ? (
                            <CheckCircle2 size={14} />
                          ) : step.state === 'denied' ? (
                            <XCircle size={14} />
                          ) : step.state === 'waiting_approval' ? (
                            <ShieldAlert size={14} />
                          ) : (
                            <Clock size={14} />
                          )}
                        </span>
                        <div className="cz-tool-content">
                          <div className="cz-tool-head">
                            <span className="cz-tool-name">{step.tool}</span>
                            <span className="cz-tool-summary cz-mono">{step.summary}</span>
                          </div>
                          <p className="cz-tool-detail">{tr(step.detail, lang)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Exact Fluent 2 ApprovalCard when paused on lock.front_door */}
                {status === 'waiting_approval' && (
                  <div
                    ref={approvalCardRef}
                    className="cz-approval-card"
                    data-testid="approval-card"
                    role="alertdialog"
                    aria-labelledby="approval-card-title"
                  >
                    <div className="cz-approval-icon">
                      <ShieldAlert size={19} />
                    </div>
                    <div className="cz-approval-main">
                      <div className="cz-approval-head">
                        <strong id="approval-card-title">
                          {lang === 'zh' ? '需要你的批准' : 'Your approval is needed'}
                        </strong>
                        <span className="cz-mono cz-approval-id">
                          apr_01k9lock · Principal: session:evening
                        </span>
                      </div>
                      <p className="cz-approval-summary">
                        <code>lock.lock → lock.front_door</code> —{' '}
                        {lang === 'zh'
                          ? 'lock 域设备属于高风险操作（含上锁与解锁），主会话已挂起等待确认'
                          : 'lock devices are high risk; session execution is suspended awaiting your decision'}
                      </p>

                      <details className="cz-approval-details">
                        <summary>
                          {lang === 'zh' ? '查看实际操作参数（经脱敏校验）' : 'Inspect exact tool arguments'}
                        </summary>
                        <pre className="cz-code-pre cz-mono">{JSON.stringify(approvalArgs, null, 2)}</pre>
                      </details>

                      <div className="cz-approval-footer">
                        <span className="cz-approval-timer cz-mono">
                          {lang === 'zh'
                            ? `${mins}:${secs} 内未批准将自动过期取消`
                            : `Auto-cancels in ${mins}:${secs}`}
                        </span>
                        <div className="cz-approval-btns">
                          <button
                            type="button"
                            data-testid="approve-lock-btn"
                            className="cz-fluent-btn-primary"
                            onClick={() => onDecideApproval(true)}
                          >
                            {lang === 'zh' ? '批准执行' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            data-testid="deny-lock-btn"
                            className="cz-fluent-btn-default"
                            onClick={() => onDecideApproval(false)}
                          >
                            {lang === 'zh' ? '拒绝' : 'Deny'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Final Assistant Completion Reply */}
                {(status === 'completed' || status === 'denied_completed') && (
                  <div className="cz-assistant-final" data-testid="bedtime-final-reply">
                    {status === 'completed' ? (
                      <p>
                        {lang === 'zh'
                          ? '已为你安顿好全屋睡眠环境：一层客厅、岛台吊灯与咖啡机均已关闭；二层主卧遮光帘已闭合，微风空调调至 22.5°C，悬浮床底夜灯保留 22% 暖光；玄关门锁经你批准已可靠上锁。晚安。'
                          : 'Everything is set for sleep: downstairs lights and espresso machine are off; master blackout drapery is closed, climate is set to 22.5°C with 22% warm under-bed cove lighting, and lock.front_door is securely locked following your approval. Goodnight.'}
                      </p>
                    ) : (
                      <p>
                        {lang === 'zh'
                          ? '公区照明与咖啡机已关闭，二层主卧遮光帘、22.5°C 静音空调与 22% 床底夜灯已就绪。由于你拒绝了门锁操作（403 approval_rejected），lock.front_door 保持未上锁状态并已记入审计日志。'
                          : 'Downstairs lights & coffee machine are off, and the master suite curtains, 22.5°C climate, and 22% nightlight are ready. Per your denial (403 approval_rejected), lock.front_door was left unlocked and recorded in audit_log.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Composer Footer */}
          <div className="cz-session-composer">
            <span className="cz-composer-hint">
              {status === 'running'
                ? lang === 'zh'
                  ? '回复进行中，新消息可选择「立即插话 steer」或「排在之后 follow-up」'
                  : 'Run active — new prompts queue as steer or follow-up'
                : lang === 'zh'
                  ? '跨设备草稿实时同步（drafts 乐观修订校验）'
                  : 'Multi-device composer draft synced via optimistic revision'}
            </span>
            <button
              type="button"
              className="cz-composer-send"
              onClick={status === 'idle' ? onStartScenario : onResetScenario}
              aria-label="Send or Replay"
            >
              <Send size={13} />
            </button>
          </div>
        </div>

        {/* Live Audit Log Mini-Ledger */}
        {recentAudits.length > 0 && (
          <div className="cz-mini-audit">
            <div className="cz-mini-audit-head cz-mono">
              <span>audit_log · SQLite WAL</span>
              <span>{lang === 'zh' ? '最新决策流水' : 'Latest Persisted Decisions'}</span>
            </div>
            {recentAudits.slice(0, 3).map((a) => (
              <div key={a.id} className="cz-mini-audit-row cz-mono">
                <span className={`cz-decision-tag is-${a.decision}`}>{a.decision}</span>
                <span>{a.principal}</span>
                <span>{a.target}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
