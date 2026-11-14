import type { Lang, RoomId, TimeOfDay } from '../types/home.ts';

export const ROOM_LABELS: Record<RoomId, { zh: string; en: string; sub: { zh: string; en: string } }> = {
  overview: {
    zh: '全屋全貌',
    en: 'Whole Home',
    sub: { zh: '上下两层 · 一眼看清家里状态', en: 'Two-Story Residence Overview' },
  },
  living_room: {
    zh: '客厅',
    en: 'Living Room',
    sub: { zh: '落地灯、纱帘与舒服的温度', en: 'Lighting, Sheers & Comfort' },
  },
  hall: {
    zh: '玄关门口',
    en: 'Entryway',
    sub: { zh: '入户大门锁与居家安防', en: 'Front Door & Home Security' },
  },
  kitchen: {
    zh: '餐厨区',
    en: 'Kitchen & Dining',
    sub: { zh: '餐桌吊灯、咖啡机与用电情况', en: 'Dining Pendant & Espresso' },
  },
  bedroom: {
    zh: '二楼卧室',
    en: 'Master Bedroom',
    sub: { zh: '床头灯、遮光帘与床底夜灯', en: 'Bedside Lamps & Nightlight' },
  },
  courtyard: {
    zh: '庭院车库',
    en: 'Garden & Garage',
    sub: { zh: '车库大门与庭院步道暖灯', en: 'Garage Gate & Path Lights' },
  },
};

export const TIME_LABELS: Record<TimeOfDay, { zh: string; en: string }> = {
  day: { zh: '午后暖阳', en: 'Afternoon Sun' },
  dusk: { zh: '傍晚归家', en: 'Evening Home' },
  night: { zh: '静谧深夜', en: 'Quiet Night' },
};

export const COPY = {
  nav: {
    explore: { zh: '逛逛房间', en: 'Rooms' },
    bedtime: { zh: '说声晚安', en: 'Goodnight' },
    agents: { zh: '贴心帮手', en: 'Helpers' },
    product: { zh: '日常界面', en: 'Interface' },
    deploy: { zh: '装进家里', en: 'Install' },
    roam3d: { zh: '自由逛逛', en: 'Explore 3D' },
    exitRoam: { zh: '回到页面', en: 'Back to Page' },
  },
  hero: {
    epigraph: {
      zh: '「藏繁琐于山泽，留温暖在屋檐。」',
      en: '“Keep the complexity hidden, and leave only warmth under your roof.”',
    },
    eyebrow: {
      zh: '连上你家的 Home Assistant · 开源免费 · 隐私留在家里',
      en: 'For Your Existing Home Assistant · Open Source · Private at Home',
    },
    titleLine1: {
      zh: '听得懂家常话的智能管家，',
      en: 'A thoughtful home helper',
    },
    titleLine2: {
      zh: '把温暖与安心留在自己屋檐下。',
      en: 'that speaks your everyday language.',
    },
    lead: {
      zh: '直接连上你家正在用的 Home Assistant，不用换开关，也不用装任何插件。平时跟它聊一句就能调好灯光、窗帘与室温；入夜和出门时替你留心门窗与电器——凡涉及开门锁或关安防，一定先问过你才动手。',
      en: 'Connects directly to your existing Home Assistant—no rewiring, no add-ons to install. Chat naturally to adjust lights, curtains, and temperature, while quiet background helpers look after doors and appliances and always ask before touching locks.',
    },
    ctaPrimary: { zh: '体验「帮我准备睡觉」', en: 'Try “Get Ready for Bed”' },
    ctaSecondary: { zh: '逛逛各房间', en: 'Explore Rooms' },
    ctaDeploy: { zh: '三步装进家', en: '3-Step Setup' },
    metrics: [
      {
        k: { zh: '不用折腾原有设备', en: 'Works With What You Have' },
        v: { zh: '直连已有 Home Assistant，零插件侵入', en: 'Connects straight to your existing HA' },
      },
      {
        k: { zh: '重要决定必先问你', en: 'Asks Before Big Actions' },
        v: { zh: '门锁、车库门与安防需亲自点头', en: 'Locks, gates & alarms wait for you' },
      },
      {
        k: { zh: '隐私只留在自己家', en: 'Stays Inside Your Home' },
        v: { zh: '跑在家里主机上，无云端监听', en: 'Runs locally with zero telemetry' },
      },
    ],
  },
  explore: {
    tag: {
      zh: '01 · 一眼看清的家',
      en: '01 · Rooms Made Clear',
    },
    title: {
      zh: '客厅是客厅，卧室是卧室，一家人谁看都顺眼',
      en: 'Every room looks clear and familiar to the whole family',
    },
    desc: {
      zh: '连上家里的设备后，藏泽会自动按楼层和房间理好日常常用的灯、窗帘、空调和门锁，把平时用不着的后台调试参数悄悄收起来。点一点下面的房间或画面里的设备标签，看看它和家里的联动有多自然。',
      en: 'Cangze organizes your lights, shades, climate, and locks cleanly by floor and room while tucking noisy diagnostic clutter out of sight. Pick a room below or tap any badge in the house.',
    },
    conversationTipTitle: {
      zh: '不用记设备名字，随口说就行',
      en: 'No device names to memorize',
    },
    conversationTipBody: {
      zh: '跟它说「把客厅调暗一点」「楼下太亮了全关了吧」，它会自动认出客厅和餐厨里的灯，一盏不落地帮你调好。',
      en: 'Just say “dim the living room” or “turn off everything downstairs”—it understands which rooms and lights belong together.',
    },
  },
  bedtime: {
    tag: {
      zh: '02 · 晚安互动体验',
      en: '02 · Goodnight Routine',
    },
    title: {
      zh: '说一句「帮我准备睡觉」，安顿好全屋，关键一步先问你',
      en: 'Say “Help me get ready for bed”—warm transitions with safe boundaries',
    },
    desc: {
      zh: '在对话里发一句平常的睡前嘱咐，管家会先看看家里哪些灯和电器还开着，依次关好楼下、拉上卧室窗帘并留一盏柔和床底夜灯；轮到锁玄关大门时，它会停下来等你亲自确认。',
      en: 'Send a natural bedtime request. Cangze checks what is still on, turns off downstairs lights and the coffee maker, closes bedroom curtains with a soft 22% nightlight, and pauses at the front door to ask you.',
    },
    runBtn: { zh: '发送：「帮我准备睡觉」', en: 'Send: “Help me get ready for bed”' },
    replayBtn: { zh: '恢复傍晚状态再试一次', en: 'Reset Home & Try Again' },
    runningBadge: { zh: '正在帮你打理全屋…', en: 'Preparing your home for sleep…' },
    waitingBadge: { zh: '已暂停 · 等你确认是否锁门', en: 'Paused · Waiting for your okay on the lock' },
  },
  agents: {
    tag: { zh: '03 · 懂分寸的家庭小帮手', en: '03 · Thoughtful Home Helpers' },
    title: {
      zh: '像请了几位守规矩的帮手，默默替你操心日常小事',
      en: 'Quiet background helpers that know their limits',
    },
    desc: {
      zh: '你可以请几位固定帮手按时间或出门状态打理家务：夜里帮忙看看门窗、全家出门后关掉忘关的灯、每晚汇报一下用电情况。它们记性好、讲分寸，而且允许做什么、不能碰什么，全由你提前定死。',
      en: 'Set up quiet helpers for nightly door checks, forgetting-the-lights cleanup, or evening energy notes. They remember helpful family habits while obeying strict boundaries you set.',
    },
  },
  product: {
    tag: { zh: '04 · 真实日常界面', en: '04 · Everyday Interface' },
    title: {
      zh: '平时打开就是清爽明亮的家用面板，一家老小都顺手',
      en: 'A clean, calm home panel that feels natural day and night',
    },
    desc: {
      zh: '没有花哨炫酷的仪表盘，藏泽日常默认是温和清爽的浅色界面（也支持夜间深色模式）。在电脑、平板或手机浏览器打开就能直接聊、直接点，也可以安心交给家里长辈用。',
      en: 'No sci-fi control room clutter. Cangze opens in a clean, comfortable light mode by default (with a restful dark mode for night) across desktop, tablet, and phone.',
    },
  },
  deploy: {
    tag: { zh: '05 · 三步装进家里', en: '05 · Bring It Home in 3 Steps' },
    title: {
      zh: '装在自家的 NAS 或小主机上，几分钟就能开聊',
      en: 'Run privately on your home NAS or mini PC in minutes',
    },
    desc: {
      zh: '只需要一个很轻的小容器，所有对话、家庭记忆和密钥都只存在你自己的硬盘里。不收月费，没有广告，也不会把你家的开灯习惯传给任何云端服务器。',
      en: 'One lightweight container keeps every conversation, home habit note, and secret safely on your own drive—no subscriptions, no cloud eavesdropping, no telemetry.',
    },
  },
} as const;

export function tr<T extends { zh: string; en: string }>(obj: T, lang: Lang): string {
  return obj[lang];
}
