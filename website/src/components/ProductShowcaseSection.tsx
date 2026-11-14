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
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>('light');

  const tabs: Array<{
    id: WorkbenchTab;
    icon: typeof MessageSquareText;
    label: { zh: string; en: string };
    panelTitle: { zh: string; en: string };
    headline: { zh: string; en: string };
    points: Array<{ zh: string; en: string }>;
    screenshot?: { dark: string; light: string; alt: { zh: string; en: string } };
  }> = [
    {
      id: 'sessions',
      icon: MessageSquareText,
      label: { zh: '自然对话', en: 'Everyday Chat' },
      panelTitle: { zh: '藏泽 · 对话', en: 'Cangze · Chat' },
      headline: {
        zh: '像跟家人发微信一样说话，开了哪盏灯、停在哪一步清清楚楚',
        en: 'Chat naturally about your home—every action stays transparent',
      },
      points: [
        {
          zh: '想单独聊“客厅怎么调灯光”、或者顺口查“今天冷不冷”，都可以各自开一段对话，互不干扰。',
          en: 'Keep separate chats for routines, quick checks, or room tuning—each with its own clear history.',
        },
        {
          zh: '改一下刚才的说法还能直接对照前后结果；电脑上打到一半的话，切到手机打开也能接着写。',
          en: 'Try an alternative phrasing without losing previous replies, and pick up drafts smoothly across devices.',
        },
      ],
      screenshot: {
        dark: './screenshots/session-dark.png',
        light: './screenshots/session-light.png',
        alt: {
          zh: '藏泽产品界面：自然对话查询灯光，在开锁前展示确认卡片',
          en: 'Cangze chat UI checking lights and asking confirmation before unlocking',
        },
      },
    },
    {
      id: 'devices',
      icon: Home,
      label: { zh: '房间与设备', en: 'Rooms & Devices' },
      panelTitle: { zh: '藏泽 · 全屋设备', en: 'Cangze · Rooms' },
      headline: {
        zh: '按房间摆好全屋设备，不把杂乱的后台参数塞到你眼前',
        en: 'Clean room-by-room controls without noisy background clutter',
      },
      points: [
        {
          zh: '把信号强度、固件诊断这些平时用不到的条目默默收在后台，房间里只留灯、空调、窗帘和门锁。',
          en: 'Diagnostic and technical sensors stay tucked away so every room shows only the controls you actually use.',
        },
        {
          zh: '点开一盏灯或一台空调，就能随手调亮度温度，也能翻看最近几小时或几天的变化趋势。',
          en: 'Adjust brightness or temperature right from the card, or open a gentle history chart for recent hours or days.',
        },
      ],
      screenshot: {
        dark: './screenshots/devices-dark.png',
        light: './screenshots/devices-light.png',
        alt: {
          zh: '藏泽设备页面：按楼层和房间排列的开关与温控卡片',
          en: 'Cangze devices view organized cleanly by floor and room',
        },
      },
    },
    {
      id: 'agents',
      icon: Bot,
      label: { zh: '家庭小帮手', en: 'Home Helpers' },
      panelTitle: { zh: '藏泽 · 家庭帮手', en: 'Cangze · Helpers' },
      headline: {
        zh: '点一点模板就能请来一位小帮手，能碰哪些设备写得明明白白',
        en: 'Create helpers from simple templates with crystal-clear boundaries',
      },
      points: [
        {
          zh: '自带「睡前巡查」「离家关灯」「每天用电小结」模板，设置时直接告诉你它能看哪些房间、能动哪些灯。',
          en: 'Start with Night Check, Away Saver, or Energy Note templates and preview exactly which devices they may touch.',
        },
        {
          zh: '出门旅游或临时不需要时，点一下“一键暂停”就能让所有后台帮手立刻歇着，绝不打扰家里人。',
          en: 'Going away or hosting guests? Pause every background helper in a single tap whenever you want.',
        },
      ],
      screenshot: {
        dark: './screenshots/agent-dark.png',
        light: './screenshots/agent-light.png',
        alt: {
          zh: '藏泽帮手设置界面：权限边界、定时任务与运行历史',
          en: 'Cangze helper settings showing permissions, triggers, and run history',
        },
      },
    },
    {
      id: 'automations',
      icon: CalendarClock,
      label: { zh: '配合原有自动化', en: 'Automations' },
      panelTitle: { zh: '藏泽 · 联动与日程', en: 'Cangze · Routines' },
      headline: {
        zh: '尊重你在 Home Assistant 里配好的老规则，不让你重头折腾一遍',
        en: 'Works hand in hand with your existing Home Assistant routines',
      },
      points: [
        {
          zh: '门窗传感器一响秒开走廊灯这类准时精准的联动，继续由你原来的 Home Assistant 负责，稳稳当当。',
          en: 'Fast, exact triggers like hallway motion lights stay right where they belong inside Home Assistant.',
        },
        {
          zh: '把需要结合上下文、拿捏分寸、还得写几句人话提醒的事交给藏泽，两者各管各的、互不拆台。',
          en: 'Let Cangze handle nuanced requests, daily check-ins, and plain-language summaries alongside them.',
        },
      ],
    },
    {
      id: 'audit',
      icon: FileSearch,
      label: { zh: '家务记录与花费', en: 'History & Cost' },
      panelTitle: { zh: '藏泽 · 操作与花费记录', en: 'Cangze · Activity' },
      headline: {
        zh: '谁在几点动过哪盏灯、今天大模型花了多少钱，翻开账本一目了然',
        en: 'See every action taken at home and keep daily AI spending clear',
      },
      points: [
        {
          zh: '每一笔操作都写明是家人手动点的、对话里吩咐的，还是后台帮手做的，门锁和重要提醒全部留痕。',
          en: 'Every change records whether it came from you, a chat, or a helper—especially helpful for doors and locks.',
        },
        {
          zh: '每天用云端模型花了几分钱都算得清清楚楚；接上家里的免费本地模型后，花销直接显示为零。',
          en: 'Track everyday cloud model costs clearly, or connect a local model at home for $0 running cost.',
        },
      ],
    },
    {
      id: 'security',
      icon: ShieldCheck,
      label: { zh: '隐私与加密备份', en: 'Privacy & Backup' },
      panelTitle: { zh: '藏泽 · 隐私与备份', en: 'Cangze · Safety' },
      headline: {
        zh: '密码和令牌全在家里加密保存，手机扫码就能连，随时一键打包备份',
        en: 'Private inside your home network with one-click encrypted backups',
      },
      points: [
        {
          zh: '默认只允许家里局域网打开访问；连接密码和钥匙都会上锁保存，日志和导出内容也会自动打码。',
          en: 'Restricted to your home network by default, with keys locked safely and sensitive tokens masked everywhere.',
        },
        {
          zh: '每天定时替你做一份加密备份。以后就算换了新 NAS 或电脑，把备份文件导进去就能原样恢复。',
          en: 'Scheduled encrypted backups keep your chats, helpers, and memories safe if you ever move to new hardware.',
        },
      ],
    },
  ];

  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section id="product" data-section="product" className="cz-editorial-section cz-editorial-linen">
      <div className="cz-wide-container">
        <div className="cz-wide-header">
          <div>
            <div className="cz-section-tag">{tr(COPY.product.tag, lang)}</div>
            <h2 className="cz-section-title">{tr(COPY.product.title, lang)}</h2>
            <p className="cz-section-desc">{tr(COPY.product.desc, lang)}</p>
          </div>

          <div className="cz-theme-switch-pill" role="group" aria-label="Screenshot Theme">
            <button
              type="button"
              data-testid="ui-theme-light"
              className={`cz-theme-opt ${uiTheme === 'light' ? 'is-active' : ''}`}
              onClick={() => setUiTheme('light')}
            >
              <Sun size={14} />
              <span>{lang === 'zh' ? '浅色日常' : 'Light Mode'}</span>
            </button>
            <button
              type="button"
              data-testid="ui-theme-dark"
              className={`cz-theme-opt ${uiTheme === 'dark' ? 'is-active' : ''}`}
              onClick={() => setUiTheme('dark')}
            >
              <Moon size={14} />
              <span>{lang === 'zh' ? '深色护眼' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>

        <div className="cz-workbench-tabs" role="tablist" aria-label="Cangze Interface Pages">
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

        <div className="cz-showcase-grid">
          <div className="cz-showcase-copy cz-warm-card">
            <div>
              <h3>{tr(current.headline, lang)}</h3>
              <ul className="cz-feature-bullets">
                {current.points.map((pt, i) => (
                  <li key={i}>{tr(pt, lang)}</li>
                ))}
              </ul>
            </div>
            <div className="cz-gentle-badge">
              {lang === 'zh'
                ? '电脑、平板与手机浏览器打开就能用'
                : 'Works smoothly across desktop, tablet, and phone'}
            </div>
          </div>

          <div className={`cz-browser-frame is-${uiTheme}`} data-testid="product-preview-frame">
            <div className={`cz-browser-bar is-${uiTheme}`}>
              <div className="cz-window-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="cz-browser-url">{tr(current.panelTitle, lang)}</div>
              <span className="cz-browser-tag">
                {uiTheme === 'light'
                  ? lang === 'zh'
                    ? '清爽浅色'
                    : 'Daylight'
                  : lang === 'zh'
                    ? '夜间深色'
                    : 'Evening'}
              </span>
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
              <div className={`cz-synthetic-console is-${uiTheme}`}>
                {activeTab === 'automations' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">
                        {lang === 'zh' ? '家里原有的自动化与场景' : 'Home Assistant Routines & Scenes'}
                      </span>
                      <span>{lang === 'zh' ? '帮手日程 (2)' : 'Helper Schedule (2)'}</span>
                      <span>{lang === 'zh' ? '待确认事项 (0)' : 'Waiting for You (0)'}</span>
                    </div>
                    <div className="cz-syn-table">
                      <div className="cz-syn-row is-head">
                        <span>{lang === 'zh' ? '类型' : 'Type'}</span>
                        <span>{lang === 'zh' ? '名称' : 'Routine Name'}</span>
                        <span>{lang === 'zh' ? '状态' : 'Status'}</span>
                        <span>{lang === 'zh' ? '操作' : 'Action'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">{lang === 'zh' ? '定时联动' : 'Automation'}</span>
                        <span>
                          {lang === 'zh' ? '日落自动点亮庭院步道灯' : 'Turn on garden path lights at sunset'}
                        </span>
                        <span className="text-sage">{lang === 'zh' ? '开启中' : 'On'}</span>
                        <span>{lang === 'zh' ? '查看详情' : 'View'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">{lang === 'zh' ? '生活场景' : 'Scene'}</span>
                        <span>
                          {lang === 'zh' ? '亲友来访 · 客厅暖光茶叙' : 'Tea & Guests · Warm Living Room'}
                        </span>
                        <span>—</span>
                        <span>{lang === 'zh' ? '一键开启' : 'Activate'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span className="cz-syn-tag">{lang === 'zh' ? '快捷脚本' : 'Script'}</span>
                        <span>{lang === 'zh' ? '全屋换气新风十五分钟' : '15-Min Fresh Air Refresh'}</span>
                        <span>—</span>
                        <span>{lang === 'zh' ? '立即运行' : 'Run'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'audit' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">{lang === 'zh' ? '家里发生了什么' : 'Activity Log'}</span>
                      <span>{lang === 'zh' ? '每日模型花费' : 'Model Spending'}</span>
                      <span>{lang === 'zh' ? '运行日记' : 'Daily Notes'}</span>
                    </div>
                    <div className="cz-syn-table">
                      <div className="cz-syn-row is-head">
                        <span>{lang === 'zh' ? '谁操作的' : 'Who'}</span>
                        <span>{lang === 'zh' ? '做了什么事' : 'Action'}</span>
                        <span>{lang === 'zh' ? '结果' : 'Result'}</span>
                        <span>{lang === 'zh' ? '说明' : 'Note'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>{lang === 'zh' ? '晚安对话' : 'Goodnight Chat'}</span>
                        <span>{lang === 'zh' ? '锁好玄关大门' : 'Lock front door'}</span>
                        <span className="text-sage">{lang === 'zh' ? '已确认执行' : 'Confirmed'}</span>
                        <span>{lang === 'zh' ? '经你亲手点头' : 'Approved by you'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>{lang === 'zh' ? '离家电器收尾' : 'Away Saver'}</span>
                        <span>{lang === 'zh' ? '尝试关掉客厅落地灯' : 'Close living floor lamp'}</span>
                        <span className="text-hearth">{lang === 'zh' ? '已主动退让' : 'Stepped back'}</span>
                        <span>{lang === 'zh' ? '家人刚按过开关' : 'Person used switch'}</span>
                      </div>
                      <div className="cz-syn-row">
                        <span>{lang === 'zh' ? '睡前门窗巡查' : 'Night Check'}</span>
                        <span>{lang === 'zh' ? '核对大门与车库门状态' : 'Check door & garage'}</span>
                        <span className="text-sage">{lang === 'zh' ? '已放行查看' : 'Allowed read'}</span>
                        <span>{lang === 'zh' ? '仅查看不改动' : 'Read-only check'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div className="cz-syn-pane">
                    <div className="cz-syn-tabs">
                      <span className="is-on">{lang === 'zh' ? '家庭网络保护' : 'Home Network'}</span>
                      <span>{lang === 'zh' ? '加密备份与搬家' : 'Encrypted Backup'}</span>
                      <span>{lang === 'zh' ? '手机扫码配对' : 'Phone Pairing'}</span>
                    </div>
                    <div className="cz-syn-cards">
                      <div className="cz-syn-card">
                        <strong>{lang === 'zh' ? '钥匙和密钥全都上锁保管' : 'Locked Keys & Secrets'}</strong>
                        <p>
                          {lang === 'zh'
                            ? '连 Home Assistant 的令牌和你的大模型密钥都加密存在家里主机上，平时查看记录也会自动打码隐藏。'
                            : 'Your Home Assistant token and model API keys stay encrypted on your own drive and hidden in logs.'}
                        </p>
                      </div>
                      <div className="cz-syn-card">
                        <strong>
                          {lang === 'zh' ? '每天半夜自动存好加密备份' : 'Nightly Encrypted Backup'}
                        </strong>
                        <p>
                          {lang === 'zh'
                            ? '聊天记录、家庭习惯和帮手配置每天凌晨自动打成一个加密包。以后换新设备，点一下恢复就能原样继续用。'
                            : 'All chats, helpers, and preferences back up automatically with optional passphrase encryption for easy migration.'}
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
