import {
  Bell,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { COPY, tr } from '../i18n/copy.ts';
import type { Lang, ScenarioStatus } from '../types/home.ts';

export interface BedtimeStepLog {
  id: string;
  label: { zh: string; en: string };
  summary: { zh: string; en: string };
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
}

const MODEL_CHOICES = [
  { id: 'claude', zh: 'Claude · 细腻稳重', en: 'Claude · Thoughtful' },
  { id: 'deepseek', zh: 'DeepSeek · 响应轻快', en: 'DeepSeek · Quick & Crisp' },
  { id: 'qwen', zh: '通义千问 · 中文顺畅', en: 'Qwen · Fluent Everyday' },
  { id: 'local', zh: '家里本地模型 · 断网可用', en: 'Local Model · Offline Ready' },
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
}: BedtimeScenarioSectionProps) {
  const mins = String(Math.floor(countdownSec / 60)).padStart(2, '0');
  const secs = String(countdownSec % 60).padStart(2, '0');
  const approvalCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === 'waiting_approval') {
      approvalCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [status]);

  return (
    <section id="bedtime" data-section="bedtime" className="cz-story-section">
      <div className="cz-bedtime-panel">
        <div className="cz-section-tag is-warm-night">{tr(COPY.bedtime.tag, lang)}</div>
        <h2 className="cz-section-title is-warm-night">{tr(COPY.bedtime.title, lang)}</h2>
        <p className="cz-section-desc is-warm-night">{tr(COPY.bedtime.desc, lang)}</p>

        {/* Scenario Action Bar */}
        <div className="cz-demo-action-bar">
          {status === 'idle' ? (
            <button
              type="button"
              data-testid="run-bedtime-btn"
              className="cz-btn cz-btn-amber-glow cz-btn-full"
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
                          ? '晚安准备好了（大门已锁好）'
                          : 'All set for sleep (front door locked)'
                        : lang === 'zh'
                          ? '晚安准备好了（按你的意思大门未上锁）'
                          : 'All set for sleep (door left unlocked)'}
                </span>
              </div>

              <button
                type="button"
                data-testid="reset-bedtime-btn"
                className="cz-btn cz-btn-night-ghost cz-btn-sm"
                onClick={onResetScenario}
              >
                <RotateCcw size={14} />
                <span>{tr(COPY.bedtime.replayBtn, lang)}</span>
              </button>
            </div>
          )}
        </div>

        {/* Warm Home Conversation Card */}
        <div className="cz-session-window" data-testid="session-window">
          <div className="cz-session-topbar">
            <div className="cz-session-title-group">
              <img src="./brand/cangze-ridge.svg" alt="" width={20} height={20} className="cz-session-logo" />
              <strong>{lang === 'zh' ? '晚安对话' : 'Goodnight Chat'}</strong>
            </div>

            <div className="cz-session-topbar-right">
              <select
                className="cz-model-select"
                value={selectedModel}
                onChange={(e) => onChangeModel(e.target.value)}
                aria-label="Conversation Style"
              >
                {MODEL_CHOICES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {lang === 'zh' ? m.zh : m.en}
                  </option>
                ))}
              </select>

              <div className="cz-bell-wrap" title={lang === 'zh' ? '提醒中心' : 'Reminders'}>
                <Bell size={15} />
                {status === 'waiting_approval' && (
                  <span className="cz-bell-badge" data-testid="approval-bell-badge">
                    1
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="cz-session-body">
            <div className="cz-user-bubble-row">
              <div className="cz-user-bubble">
                {lang === 'zh'
                  ? '帮我准备睡觉，关掉楼下灯和咖啡机，拉上主卧窗帘留一盏夜灯，顺便把前门锁好。'
                  : 'Help me get ready for bed: turn off downstairs lights and the coffee maker, close bedroom curtains with a soft nightlight, and lock the front door.'}
              </div>
            </div>

            {status === 'idle' ? (
              <div className="cz-session-idle-prompt">
                <p>
                  {lang === 'zh'
                    ? '点一下上面的「发送」按钮，看看房子里的灯光、窗帘和空调如何一步步安顿下来，以及门锁前它如何礼貌地停下来问你。'
                    : 'Tap “Send” above to watch the lights, curtains, and climate wind down room by room—and see how it pauses politely to ask before locking your front door.'}
                </p>
              </div>
            ) : (
              <div className="cz-assistant-stream">
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
                            <Lock size={14} />
                          ) : (
                            <Clock size={14} />
                          )}
                        </span>
                        <div className="cz-tool-content">
                          <div className="cz-tool-head">
                            <span className="cz-tool-name">{tr(step.label, lang)}</span>
                            <span className="cz-tool-summary">{tr(step.summary, lang)}</span>
                          </div>
                          <p className="cz-tool-detail">{tr(step.detail, lang)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Human-Friendly Confirmation Card */}
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
                          {lang === 'zh' ? '要帮你把玄关大门锁上吗？' : 'Lock the front door now?'}
                        </strong>
                        <span className="cz-approval-tag">
                          {lang === 'zh' ? '涉及门锁安全' : 'Door Security'}
                        </span>
                      </div>
                      <p className="cz-approval-summary">
                        {lang === 'zh'
                          ? '锁门和开门都关系到家里安全，藏泽已经停下来等你确认，不会擅自替你操作。'
                          : 'Locking and unlocking doors always wait for your direct okay—nothing changes until you say so.'}
                      </p>

                      <div className="cz-approval-footer">
                        <span className="cz-approval-timer">
                          {lang === 'zh'
                            ? `${mins}:${secs} 内不操作会自动取消`
                            : `Auto-cancels in ${mins}:${secs}`}
                        </span>
                        <div className="cz-approval-btns">
                          <button
                            type="button"
                            data-testid="approve-lock-btn"
                            className="cz-warm-confirm-btn"
                            onClick={() => onDecideApproval(true)}
                          >
                            {lang === 'zh' ? '锁好大门' : 'Lock Door'}
                          </button>
                          <button
                            type="button"
                            data-testid="deny-lock-btn"
                            className="cz-warm-cancel-btn"
                            onClick={() => onDecideApproval(false)}
                          >
                            {lang === 'zh' ? '先不用锁' : 'Leave Unlocked'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warm Final Reply */}
                {(status === 'completed' || status === 'denied_completed') && (
                  <div className="cz-assistant-final" data-testid="bedtime-final-reply">
                    {status === 'completed' ? (
                      <p>
                        {lang === 'zh'
                          ? '家里已经帮你安顿好了：楼下客厅、餐桌吊灯和咖啡机都已关闭；主卧遮光帘已拉合，空调调至舒服的 22.5°C，床底夜灯留了一点柔柔的暖光；玄关大门也按你的确认锁好了。晚安，好梦。'
                          : 'Everything is settled for sleep: downstairs lights and the coffee maker are off; bedroom curtains are closed with a soft 22% under-bed nightlight and 22.5°C climate; and the front door is locked as you confirmed. Goodnight.'}
                      </p>
                    ) : (
                      <p>
                        {lang === 'zh'
                          ? '楼下灯光和咖啡机已关闭，主卧遮光帘、22.5°C 轻风空调和床底小夜灯都已为你备好。按你的意思，玄关大门保持未上锁状态。晚安。'
                          : 'Downstairs lights and the coffee maker are off, and your bedroom curtains, 22.5°C climate, and soft nightlight are ready. As requested, the front door was left unlocked. Goodnight.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="cz-session-composer">
            <span className="cz-composer-hint">
              {status === 'running'
                ? lang === 'zh'
                  ? '正在帮你处理，随时可以插话补充一句'
                  : 'Handling this now—feel free to chime in anytime'
                : lang === 'zh'
                  ? '手机和电脑上的草稿会自动同步，随时接着聊'
                  : 'Your unfinished notes stay synced across phone and desktop'}
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
      </div>
    </section>
  );
}
