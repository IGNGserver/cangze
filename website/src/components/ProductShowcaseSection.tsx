import {
  Bot,
  CalendarClock,
  FileSearch,
  Home,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import { COPY, tr } from '../i18n/copy.ts';
import type { Lang } from '../types/home.ts';

interface ProductShowcaseSectionProps {
  lang: Lang;
}

type WorkbenchTab = 'sessions' | 'devices' | 'agents' | 'automations' | 'audit' | 'security';

export function ProductShowcaseSection({ lang }: ProductShowcaseSectionProps) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('sessions');
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>('dark');

  const tabs: Array<{
    id: WorkbenchTab;
    icon: typeof MessageSquareText;
    label: { zh: string; en: string };
    headline: { zh: string; en: string };
    points: Array<{ zh: string; en: string }>;
    screenshot?: { dark: string; light: string; alt: { zh: string; en: string } };
  }> = [
    {
      id: 'sessions',
      icon: MessageSquareText,
      label: { zh: '平等主会话', en: 'Sessions' },
      headline: {
        zh: '任意多个平等会话：独立模型、思考强度、消息分支与工具流',
        en: 'Multiple Equal Primary Sessions with Branching & Live Tool Chains',
      },
      points: [
        {
          zh: '每个会话独立绑定模型与推理强度（off ～ max），编辑历史提问自动生成 ‹ 2/3 › 对话树分支，原回复完整保留。',
          en: 'Per-session modelRef & thinkingLevel; editing any user prompt forks a sibling ‹ 2/3 › tree branch non-destructively.',
        },
        {
          zh: '上下文接近模型窗口 80% 时自动生成追加式摘要条目（compaction）；支持多端草稿乐观同步与导出脱敏 Markdown/JSONL。',
          en: 'Automatic context compaction at 80% window, multi-device draft sync, and redacted Markdown/JSONL export.',
        },
      ],
      screenshot: {
        dark: './screenshots/session-dark.png',
        light: './screenshots/session-light.png',
        alt: {
          zh: '藏泽真实会话界面：查询灯光并在门锁操作前展示审批卡片',
          en: 'Real Cangze Sessions UI showing entity lookup and high-risk lock approval',
        },
      },
    },
    {
      id: 'devices',
      icon: Home,
      label: { zh: '房间与设备', en: 'Devices' },
      headline: {
        zh: '按楼层与区域精准聚合，彻底告别诊断实体噪音',
        en: 'Floor & Area Grouping Free of Diagnostic Service Noise',
      },
      points: [
        {
          zh: 'HaRegistry 自动将实体归类为 room、unassigned、config、integration 与 household，服务设备绝不混入房间磁贴。',
          en: 'HaRegistry classifies placement into room, config, integration, and household so diagnostic sensors stay out of rooms.',
        },
        {
          zh: '支持按楼层/域快速筛选、直接开关/调温/控帘、6h/24h/7d 历史曲线抽屉，以及带 JSON Schema 提示的原语服务调用。',
          en: 'Instant floor/domain filters, inline tile controls, 6h/24h/7d history drawers, and schema-guided service calls.',
        },
      ],
      screenshot: {
        dark: './screenshots/devices-dark.png',
        light: './screenshots/devices-light.png',
        alt: {
          zh: '藏泽真实设备页：楼层切换、房间磁贴与实时状态控制',
          en: 'Real Cangze Devices page with floor tabs and live room entity tiles',
        },
      },
    },
    {
      id: 'agents',
      icon: Bot,
      label: { zh: '持久化子代理', en: 'Sub-Agents' },
      headline: {
        zh: '七合一子代理工作台：概览、设定、权限、触发器、记忆、运行与修订',
        en: 'Seven-Tab Sub-Agent Studio: Definition, Permissions, Triggers, Memory & Revisions',
      },
      points: [
        {
          zh: '内置「夜间安全巡检」「每日能耗日报」「离家检查」模板，实时预览当前权限规则可控制/仅可读/被禁止的实体数量。',
          en: 'Built-in Night Watch, Energy Report, and Away Check templates with live readable/controllable entity count previews.',
        },
        {
          zh: '支持三方冲突审阅合并（避免静默拼接权限数组）、一键紧急停止（关闭触发器 + 取消队列 + 中止当前运行）与每日预算软上限。',
          en: 'Includes 3-way conflict merge review, one-click Emergency Stop, and daily USD token cost soft caps.',
        },
      ],
      screenshot: {
        dark: './screenshots/agent-dark.png',
        light: './screenshots/agent-light.png',
        alt: {
          zh: '藏泽真实子代理工作台：统计面板、高风险策略与运行记录',
          en: 'Real Cangze Sub-Agents workbench showing run stats, risk policy, and revisions',
        },
      },
    },
    {
      id: 'automations',
      icon: CalendarClock,
      label: { zh: '自动化与待审批', en: 'Automations' },
      headline: {
        zh: '尊重 Home Assistant 确定性引擎，不发明第二套规则脚本语言',
        en: 'Respecting Home Assistant as the Single Deterministic Automation Engine',
      },
      points: [
        {
          zh: '统一汇集子代理定时计划（按 HA 时区计算）、持久运行队列、全局待审批队列，以及原生 HA 自动化 / 脚本 / 场景开关与只读配置抽屉。',
          en: 'Unifies sub-agent schedules (in HA time zone), durable run queues, pending approvals, and native HA automation/script/scene inspection.',
        },
        {
          zh: '确定性联动继续由 Home Assistant 原生自动化承担；需要上下文判断、跨日记忆对比与自然语言汇报的任务交给子代理。',
          en: 'Deterministic rules stay native in Home Assistant; nuanced reasoning, memory comparison, and summaries belong to subagents.',
        },
      ],
    },
    {
      id: 'audit',
      icon: FileSearch,
      label: { zh: '审计与用量账本', en: 'Audit & Usage' },
      headline: {
        zh: '每一次读写决策、每一次冲突拦截与每一笔 Token 成本皆可追溯',
        en: 'Full Traceability Across Principals, Gateway Decisions & Model Costs',
      },
      points: [
        {
          zh: '精确记录 admin、session:<id>、agent:<id>@<rev>/run:<id> 的每次动作与原因（allowed / approved / rejected / denied / conflict）。',
          en: 'Logs every action by principal with exact outcome (allowed, approved, rejected, denied, conflict) and recursive secret redaction.',
        },
        {
          zh: '按模型统计输入、输出、缓存读写 Token 与每日费用，显式区分免费本地模型（$0）与单价未知模型。',
          en: 'Tracks input/output/cache tokens per model and separates explicit $0 local endpoints from unknown-price providers.',
        },
      ],
    },
    {
      id: 'security',
      icon: ShieldCheck,
      label: { zh: '安全与加密备份', en: 'Security & Backup' },
      headline: {
        zh: '默认局域网准入、主密钥加密存储与一键口令化在线备份恢复',
        en: 'LAN-By-Default Admission, Master-Key Secret Box & Encrypted Online Backups',
      },
      points: [
        {
          zh: '公网明文 HTTP 默认拒绝（支持内置 Caddy 自动 HTTPS 证书），严格校验 Host 与 Origin 防范 DNS 重绑定攻击。',
          en: 'Refuses public plain HTTP by default (optional bundled Caddy HTTPS), with Host allowlist and Origin checks against DNS rebinding.',
        },
        {
          zh: '在线备份单个 SQLite 数据库（可选口令加密并安全打包主密钥以支持跨机迁移），恢复前自动留存 pre-restore 保护副本。',
          en: 'Online SQLite backups with optional passphrase encryption and automatic pre-restore safety snapshots.',
        },
      ],
    },
  ];

  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section id="product" data-section="product" className="cz-section cz-wide-section">
      <div className="cz-wide-container">
        <div className="cz-wide-header">
          <div>
            <div className="cz-section-tag">{tr(COPY.product.tag, lang)}</div>
            <h2 className="cz-section-title">{tr(COPY.product.title, lang)}</h2>
            <p className="cz-section-desc">{tr(COPY.product.desc, lang)}</p>
          </div>

          {/* Authentic Light / Dark Mode Preview Switcher */}
          <div className="cz-theme-switch-pill" role="group" aria-label="Screenshot Theme">
            <button
              type="button"
              data-testid="ui-theme-dark"
              className={`cz-theme-opt ${uiTheme === 'dark' ? 'is-active' : ''}`}
              onClick={() => setUiTheme('dark')}
            >
              <Moon size={14} />
              <span>{lang === 'zh' ? '深色界面' : 'Dark UI'}</span>
            </button>
            <button
              type="button"
              data-testid="ui-theme-light"
              className={`cz-theme-opt ${uiTheme === 'light' ? 'is-active' : ''}`}
              onClick={() => setUiTheme('light')}
            >
              <Sun size={14} />
              <span>{lang === 'zh' ? '浅色界面' : 'Light UI'}</span>
            </button>
          </div>
        </div>

        {/* 6-Module Navigation Tabs mirroring Cangze AppShell Rail */}
        <div className="cz-workbench-tabs" role="tablist" aria-label="Cangze Console Modules">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`product-tab-${tab.id}`}
                className={`cz-wb-tab ${selected ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tr(tab.label, lang)}</span>
              </button>
            );
          })}
        </div>

        {/* Showcase Frame */}
        <div className="cz-showcase-grid">
          <div className="cz-showcase-copy cz-glass-panel">
            <h3>{tr(current.headline, lang)}</h3>
            <ul className="cz-feature-bullets">
              {current.points.map((pt, i) => (
                <li key={i}>{tr(pt, lang)}</li>
              ))}
            </ul>
            <div className="cz-contract-badge cz-mono">
              REST /api/v1 + WS /api/v1/stream (epoch snapshot + seq replay)
            </div>
          </div>

          <div className={`cz-browser-frame is-${uiTheme}`} data-testid="product-preview-frame">
            <div className="cz-browser-bar">
              <div className="cz-window-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="cz-browser-url cz-mono">http://127.0.0.1:38417/{activeTab}</div>
              <span className="cz-browser-tag cz-mono">Fluent 2 · {uiTheme}</span>
            </div>

            {current.screenshot ? (
              <div className="cz-screenshot-wrap">
                <img
                  src={uiTheme === 'dark' ? current.screenshot.dark : current.screenshot.light}
                  alt={tr(current.screenshot.alt, lang)}
                  className="cz-real-screenshot"
                  loading="lazy"
                />
              </div>
            ) : (
              /* Faithful Fluent 2 Interactive Preview Surface for Automations / Audit / Security */
              <div className={`cz-synthetic-console is-${uiTheme}`}>
                {activeTab === 'automations' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">
                        {lang === 'zh' ? 'HA 自动化、脚本与场景' : 'HA Automations & Scenes'}
                      </span>
                      <span>{lang === 'zh' ? '子代理计划 (2)' : 'Subagent Schedule (2)'}</span>
                      <span>{lang === 'zh' ? '待审批 (0)' : 'Pending Approvals (0)'}</span>
                    </div>
                    <div className="cz-syn-table">
                      <div className="cz-syn-row is-head">
                        <span>{lang === 'zh' ? '类型' : 'Kind'}</span>
                        <span>{lang === 'zh' ? '名称 / 实体 ID' : 'Name / Entity'}</span>
                        <span>{lang === 'zh' ? '启用' : 'Enabled'}</span>
                        <span>{lang === 'zh' ? '只读配置检查' : 'Config Drawer'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">automation</span>
                        <span>日落自动开启泽畔汀步灯 · automation.sunset_courtyard</span>
                        <span className="text-emerald">ON</span>
                        <span className="cz-mono">JSON Verified</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">scene</span>
                        <span>会客茶叙暖光场景 · scene.tea_gathering</span>
                        <span>—</span>
                        <span className="cz-mono">Activate</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">script</span>
                        <span>全屋新风换气循环 · script.fresh_air_purge</span>
                        <span>—</span>
                        <span className="cz-mono">Run</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">{lang === 'zh' ? '审计记录 (audit_log)' : 'Audit Log'}</span>
                      <span>{lang === 'zh' ? '模型用量 (usage_ledger)' : 'Model Usage'}</span>
                      <span>{lang === 'zh' ? '系统环形日志' : 'System Ring Buffer'}</span>
                    </div>
                    <div className="cz-syn-table cz-mono">
                      <div className="cz-syn-row is-head">
                        <span>Principal</span>
                        <span>Action → Target</span>
                        <span>Decision</span>
                        <span>Redaction</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>session:01k9bed</span>
                        <span>lock.lock → lock.front_door</span>
                        <span className="text-emerald">approved</span>
                        <span>apr_01k9lock</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>agent:away-check@r7</span>
                        <span>light.turn_off → light.living_lamp</span>
                        <span className="text-amber">conflict</span>
                        <span>manual_hold (30m)</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>agent:night-watch@r4</span>
                        <span>ha_get_states → 3 entities</span>
                        <span className="text-emerald">allowed</span>
                        <span>read-security</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">{lang === 'zh' ? '安全与网络准入' : 'Network & Auth'}</span>
                      <span>{lang === 'zh' ? '数据与在线加密备份' : 'Encrypted Backups'}</span>
                      <span>{lang === 'zh' ? '扫码设备配对' : 'QR Client Pairing'}</span>
                    </div>
                    <div className="cz-syn-cards">
                      <div className="cz-syn-card">
                        <strong>AES-256-GCM Secret Box</strong>
                        <p>
                          {lang === 'zh'
                            ? 'HA 长期令牌与各模型 API Key 均经 /data/master.key 加密落盘；日志、审批、导出与异常堆栈统一执行递归敏感脱敏。'
                            : 'HA tokens and LLM API keys encrypted at rest via /data/master.key with recursive redaction across logs & exports.'}
                        </p>
                      </div>
                      <div className="cz-syn-card">
                        <strong>Online Encrypted Backup · Cron 0 3 * * *</strong>
                        <p>
                          {lang === 'zh'
                            ? '单文件热备份全部会话、子代理修订、记忆与审计账本；校验备份清单与 32 字节密钥指纹，文件权限严格保持 0600。'
                            : 'Hot SQLite backup of sessions, revisions, memory, and audits with manifest validation and 0600 file mode.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
