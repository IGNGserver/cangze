import type { Lang, RoomId, TimeOfDay } from '../types/home.ts';

export const ROOM_LABELS: Record<RoomId, { zh: string; en: string; sub: { zh: string; en: string } }> = {
  overview: {
    zh: '全景庭院',
    en: 'Sanctuary Overview',
    sub: { zh: '泽居全貌 · 双层现代主义住宅', en: 'Two-Story Modernist Pavilion' },
  },
  living_room: {
    zh: '客厅茶亭',
    en: 'Living Pavilion',
    sub: { zh: '一层西翼 · 照明 / 电动纱帘 / 温控', en: 'Ground West · Lighting / Drapery / HVAC' },
  },
  hall: {
    zh: '玄关门廊',
    en: 'Entrance Hall',
    sub: { zh: '主入口与中枢核 · 智能门锁 / 安防', en: 'Pivot Entry & Hub Core · Lock / Alarm' },
  },
  kitchen: {
    zh: '餐厨岛台',
    en: 'Kitchen & Island',
    sub: { zh: '一层东翼 · 线性吊灯 / 咖啡机 / 能耗', en: 'Ground East · Pendant / Coffee / Load' },
  },
  bedroom: {
    zh: '二层主卧',
    en: 'Master Suite',
    sub: { zh: '悬挑上层 · 床底夜灯 / 遮光帘 / 微风空调', en: 'Cantilevered Upper · Nightlight / Drapery' },
  },
  courtyard: {
    zh: '庭院车库',
    en: 'Courtyard & Garage',
    sub: { zh: '东侧车库 · 高风险门类 / 泽畔步道灯', en: 'East Court · High-Risk Garage Gate' },
  },
};

export const TIME_LABELS: Record<TimeOfDay, { zh: string; en: string }> = {
  dusk: { zh: '暮色归家', en: 'Twilight Dusk' },
  day: { zh: '晴昼自然光', en: 'Clear Daylight' },
  night: { zh: '深宵静谧', en: 'Deep Midnight' },
};

export const COPY = {
  nav: {
    explore: { zh: '空间探索', en: 'Spatial Rooms' },
    bedtime: { zh: '晚安演练', en: 'AI Routine' },
    agents: { zh: '子代理网络', en: 'Sub-Agents' },
    product: { zh: '真实界面', en: 'Product UI' },
    deploy: { zh: '架构与部署', en: 'Deploy' },
    roam3d: { zh: '沉浸漫游', en: '3D Roam' },
    exitRoam: { zh: '返回叙事', en: 'Exit Roam' },
  },
  hero: {
    epigraph: {
      zh: '「夫藏舟于壑，藏山于泽，谓之固矣。」——《庄子·大宗师》',
      en: '“Hide a boat in a ravine, hide a mountain in a marsh — and call it secure.” — Zhuangzi',
    },
    eyebrow: {
      zh: '开源私有部署 · 零插件接入已有 Home Assistant · v0.4.2',
      en: 'Open-Source Self-Hosted · Zero-Plugin Home Assistant AI Hub · v0.4.2',
    },
    titleLine1: {
      zh: '让智能隐入建筑肌理，',
      en: 'Intelligence Woven Quietly',
    },
    titleLine2: {
      zh: '把决定权留在你的屋檐下。',
      en: 'Beneath Your Own Roof.',
    },
    lead: {
      zh: '藏泽（Cangze）以单容器私有中枢直连你正在运行的 Home Assistant。多个平等主会话实时协同，全局持久化子代理按事件与时间静默值守，而每一道写指令都经由中枢级权限引擎、人工优先仲裁与高风险审批闭环守护。',
      en: 'Cangze connects to your existing Home Assistant over WebSocket & REST from a single self-hosted container. Equal primary sessions converse naturally, persistent sub-agents stand watch on events and schedules, and every device write passes through hub-enforced permissions, human-priority arbitration, and high-risk approvals.',
    },
    ctaPrimary: { zh: '进入 3D 空间探索', en: 'Enter 3D Residence' },
    ctaSecondary: { zh: '体验「帮我准备睡觉」', en: 'Run Bedtime Demo' },
    ctaDeploy: { zh: '两分钟私有部署', en: '2-Min Self-Host' },
    metrics: [
      {
        k: '0 HA Plugins',
        v: { zh: '原生 WS / REST 长期令牌直连', en: 'Pure WS / REST Token Connection' },
      },
      {
        k: 'Double Guard',
        v: { zh: 'beforeToolCall + HaGateway 双重鉴权', en: 'Tool + HaGateway Double Check' },
      },
      {
        k: '1 SQLite Volume',
        v: { zh: 'AES-256-GCM 凭据加密 · 零遥测', en: 'AES-256-GCM Secrets · Zero Telemetry' },
      },
    ],
  },
  explore: {
    tag: {
      zh: '01 · 空间感知与 Home Assistant 深度集成',
      en: '01 · Spatial Awareness & Home Assistant Sync',
    },
    title: {
      zh: '走入每一间房，与真实实体实时同频',
      en: 'Step Inside Every Room, Synced Live with HA Registries',
    },
    desc: {
      zh: '藏泽自动同步楼层（Floor）、区域（Area）、设备（Device）、标签（Label）与服务目录，并通过 HaRegistry 计算 placement——将物理房间实体与自动化配置、诊断服务干净分离。点击下方房间或直接点击 3D 建筑中的交互锚点，摄像机将平滑推入室内并实时联动灯光、窗帘与温控。',
      en: 'Cangze syncs Floors, Areas, Devices, Labels, and Service schemas while computing HaEntity.placement so service diagnostics never clutter room views. Select a room or click 3D anchors directly to fly inside and control lighting, drapery, climate, and locks in real time.',
    },
    expansionNote: {
      zh: '目标递归展开不变量：当 AI 对 area_id / floor_id / label_id 发起调用时，HaGateway 在鉴权前将其递归展开为显式叶子 entity_id 集合，并拒绝循环组。',
      en: 'Target Expansion Invariant: Area, floor, device, and label targets are recursively expanded into explicit leaf entity_ids BEFORE PolicyEngine evaluation.',
    },
  },
  bedtime: {
    tag: {
      zh: '02 · 平等主会话 · 连续场景编排与高风险审批闭环',
      en: '02 · Equal Sessions · Continuous Orchestration & Approval Gate',
    },
    title: {
      zh: '说一句「帮我准备睡觉」，看温暖过渡与安全边界同时发生',
      en: 'Say “Help Me Get Ready for Bed” — Warmth Meets Safety',
    },
    desc: {
      zh: '基于 Pi Agent 引擎，主会话逐步读取全屋状态、熄灭公区灯火、拉合二层遮光帘并点亮 2400K 悬浮夜灯。当执行抵达玄关门锁（lock.lock）时——藏泽将门锁全系动作列为高风险，时间轴与 3D 场景立即挂起（waiting_approval），直到你亲自按下批准。',
      en: 'Powered by Pi Agent, a session inspects live states, dims downstairs lights, draws bedroom blackout drapery, and warms the 2400K under-bed cove. Upon reaching lock.lock on lock.front_door, execution suspends in waiting_approval until you explicitly approve or deny.',
    },
    runBtn: { zh: '发送指令：「帮我准备睡觉」', en: 'Send: “Help me get ready for bed”' },
    replayBtn: { zh: '重置住宅状态并重演', en: 'Reset Home & Replay' },
    runningBadge: { zh: '工具链实时流式执行中…', en: 'Streaming Tool Chain…' },
    waitingBadge: { zh: '已暂停 · 等待人工审批门锁操作', en: 'Paused · Waiting for Lock Approval' },
  },
  agents: {
    tag: { zh: '03 · 全局持久化子代理与多主体写仲裁', en: '03 · Persistent Sub-Agents & Write Arbitration' },
    title: {
      zh: '各司其职的后台守夜人，由中枢而非提示词强制约束',
      en: 'Autonomous Watchers Bound by the Hub, Never by Prompt Hope',
    },
    desc: {
      zh: '子代理拥有只追加的不可变修订（agent_revisions + baseRevision 乐观并发控制）、独立记忆笔记与每日费用预算。它们按 Cron、间隔或 HA 状态/事件静默运行，而人工操作优先、优先级保持窗与防抖防环机制确保 AI 永远不会与家人抢开关。',
      en: 'Sub-agents feature immutable append-only revisions (baseRevision optimistic concurrency), persistent memory notes, and daily cost budgets. Triggered by cron or HA events, they obey strict default-deny rules while CoordinationService guarantees humans always win.',
    },
  },
  product: {
    tag: { zh: '04 · Fluent 2 真实产品工作台全览', en: '04 · Authentic Fluent 2 Product Workbench' },
    title: {
      zh: '克制、清晰、中英双语的原生控制台体验',
      en: 'Restrained, Crisp, Bilingual Fluent 2 Control Surface',
    },
    desc: {
      zh: '所有功能均通过统一的 /api/v1 REST 与 /api/v1/stream 可恢复序号流对外提供（未来 Android 客户端完全复用同一契约）。支持消息树分支编辑、跨设备草稿同步、三方冲突合并与只读查看 HA 原生自动化配置。',
      en: 'Every capability runs over unified /api/v1 REST and resumable /api/v1/stream WebSocket envelopes. Includes conversation branching, multi-device draft sync, 3-way revision merge, and read-only native HA automation inspection.',
    },
  },
  deploy: {
    tag: {
      zh: '05 · 不可破坏的架构不变量与两分钟私有部署',
      en: '05 · Architectural Invariants & 2-Minute Self-Hosting',
    },
    title: {
      zh: '单容器、单 SQLite 数据卷、零外部遥测',
      en: 'One Container, One SQLite Volume, Zero Telemetry',
    },
    desc: {
      zh: '容器默认以非特权用户、只读根文件系统（read-only rootfs）、丢弃全部内核能力（cap_drop: ALL）运行，默认仅绑定本机回环并内置防 DNS 重绑定与严格 CSP。支持内置主流大模型及 Ollama / vLLM 等本地推理服务。',
      en: 'Runs unprivileged with a read-only root filesystem, cap_drop: ALL, loopback-by-default binding, DNS-rebinding guards, and strict CSP. Works seamlessly with frontier cloud models or 100% local Ollama / vLLM endpoints.',
    },
  },
} as const;

export function tr<T extends { zh: string; en: string }>(obj: T, lang: Lang): string {
  return obj[lang];
}
