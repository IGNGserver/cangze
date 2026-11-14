import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchitectureDeploySection } from './components/ArchitectureDeploySection.tsx';
import { BedtimeScenarioSection, type BedtimeStepLog } from './components/BedtimeScenarioSection.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { Navbar } from './components/Navbar.tsx';
import { ProductShowcaseSection } from './components/ProductShowcaseSection.tsx';
import { ResidenceViewport } from './components/ResidenceViewport.tsx';
import { SpatialExplorerSection } from './components/SpatialExplorerSection.tsx';
import { SubAgentNetworkSection } from './components/SubAgentNetworkSection.tsx';
import { AGENTS_XRAY_CAMERA, HUB_CORE_ANCHOR, INITIAL_ENTITIES, ROOM_CAMERAS } from './data/homeState.ts';
import type {
  ArbitrationCase,
  AuditEntry,
  CameraPose,
  HomeEntity,
  Lang,
  RoomId,
  ScenarioStatus,
  SectionId,
  SignalArcEvent,
  StreamEventItem,
  SubAgentSpec,
  TimeOfDay,
} from './types/home.ts';

function nowTimeStr(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

const INITIAL_STEPS: BedtimeStepLog[] = [
  {
    id: 'step-overview',
    tool: 'ha_overview · ha_get_states',
    summary: 'floors: 2 · areas: 5 · 14 entities',
    detail: {
      zh: '读取全屋实时快照：一层客厅/岛台照明开启、咖啡机待机通电、主卧窗帘开启、玄关门锁处于 unlocked。',
      en: 'Read live home snapshot: downstairs lights & espresso switch on, master drapery open, lock.front_door unlocked.',
    },
    state: 'running',
  },
  {
    id: 'step-downstairs',
    tool: 'ha_call_service',
    summary: 'light.turn_off → area_id: living_room, kitchen · switch.turn_off → switch.coffee_machine',
    detail: {
      zh: 'HaGateway 将区域目标展开为显式实体并熄灭客厅线性灯槽、弧形落地灯、岛台吊灯，关闭意式咖啡机电源。',
      en: 'Expanded area targets to leaf entity_ids; dimmed off living cove, floor lamp, kitchen pendant, and espresso machine.',
    },
    state: 'running',
  },
  {
    id: 'step-bedroom',
    tool: 'ha_call_service',
    summary:
      'cover.close_cover → cover.bedroom_curtain · climate.set_temperature → 22.5°C · light.turn_on → light.bedroom_nightlight (22%)',
    detail: {
      zh: '摄像机升入二层悬挑主卧：全景遮光帘平滑闭合，床头主灯熄灭，悬浮床底 2400K 暖光夜灯点亮至 22%，静音空调设为 22.5°C。',
      en: 'Glided to cantilevered Master Suite: closed blackout drapery, warmed 2400K under-bed cove to 22%, set AC to 22.5°C.',
    },
    state: 'running',
  },
  {
    id: 'step-lock',
    tool: 'ha_call_service',
    summary: 'lock.lock → lock.front_door [HIGH RISK]',
    detail: {
      zh: 'PolicyEngine.classifyWrite 命中高风险域 lock（上锁与解锁均需人工确认），运行进入 waiting_approval 并挂起等待你的决定。',
      en: 'PolicyEngine classified lock.lock on lock.front_door as high-risk; run entered waiting_approval awaiting human decision.',
    },
    state: 'waiting_approval',
  },
];

export function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('dusk');
  const [entities, setEntities] = useState<HomeEntity[]>(() => INITIAL_ENTITIES.map((e) => ({ ...e })));
  const [activeRoom, setActiveRoom] = useState<RoomId>('overview');
  const [activeSection, setActiveSection] = useState<SectionId>('hero');
  const [roamMode, setRoamMode] = useState(false);

  // Stream & Audit state
  const seqRef = useRef(1042);
  const [latestStream, setLatestStream] = useState<StreamEventItem>({
    seq: 1042,
    topic: 'ha.registry',
    summary: 'connected · 17 entities synced',
    time: nowTimeStr(),
  });
  const [audits, setAudits] = useState<AuditEntry[]>([
    {
      id: 'aud-init',
      time: nowTimeStr(),
      principal: 'system',
      action: 'ha.connect',
      target: 'ws://homeassistant.lan:8123',
      decision: 'allowed',
      reason: { zh: 'WebSocket 实时总线已同步', en: 'WebSocket state stream synchronized' },
    },
  ]);
  const [latestSignal, setLatestSignal] = useState<SignalArcEvent | null>(null);

  // Bedtime Scenario State
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<BedtimeStepLog[]>(INITIAL_STEPS);
  const [countdownSec, setCountdownSec] = useState(299);
  const [selectedModel, setSelectedModel] = useState('anthropic / claude-sonnet-4 · thinking: medium');
  const timersRef = useRef<number[]>([]);

  const pushStream = useCallback((topic: string, summary: string) => {
    seqRef.current += 1;
    setLatestStream({
      seq: seqRef.current,
      topic,
      summary,
      time: nowTimeStr(),
    });
  }, []);

  const fireArc = useCallback((to: [number, number, number], kind: SignalArcEvent['kind']) => {
    setLatestSignal({
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: HUB_CORE_ANCHOR,
      to,
      kind,
      createdAt: Date.now(),
    });
  }, []);

  const clearScenarioTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => clearScenarioTimers, [clearScenarioTimers]);

  // Countdown tick while waiting_approval
  useEffect(() => {
    if (scenarioStatus !== 'waiting_approval') return;
    const iv = window.setInterval(() => {
      setCountdownSec((s) => (s > 1 ? s - 1 : 299));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [scenarioStatus]);

  // Scroll section tracking for cinematic choreography
  useEffect(() => {
    const sectionIds: SectionId[] = ['hero', 'explore', 'bedtime', 'agents', 'product', 'deploy'];
    const handleScroll = () => {
      const viewportMid = window.innerHeight * 0.44;
      let current: SectionId = 'hero';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= viewportMid) {
          current = id;
        }
      }
      setActiveSection((prev) => (prev === current ? prev : current));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sync camera room automatically when scrolling between narrative acts (unless scenario is actively steering)
  useEffect(() => {
    if (roamMode || scenarioStatus === 'running' || scenarioStatus === 'waiting_approval') return;
    if (activeSection === 'hero') {
      setActiveRoom('overview');
    } else if (activeSection === 'explore') {
      setActiveRoom((prev) => (prev === 'overview' ? 'living_room' : prev));
    } else if (activeSection === 'bedtime') {
      if (scenarioStatus === 'completed' || scenarioStatus === 'denied_completed') {
        setActiveRoom('hall');
      } else {
        setActiveRoom('bedroom');
      }
    } else if (activeSection === 'agents') {
      setActiveRoom('overview');
    }
  }, [activeSection, roamMode, scenarioStatus]);

  // Compute active CameraPose, Framing Offset & Backdrop Veil Opacity
  const cameraPose: CameraPose = useMemo(() => {
    if (activeSection === 'agents' && activeRoom === 'overview' && !roamMode) {
      return AGENTS_XRAY_CAMERA;
    }
    return ROOM_CAMERAS[activeRoom] ?? ROOM_CAMERAS.overview;
  }, [activeRoom, activeSection, roamMode]);

  const offsetRatioX = useMemo(() => {
    if (roamMode) return 0;
    if (activeSection === 'explore' || activeSection === 'agents') {
      // Narrative column sits on the RIGHT -> shift 3D house center onto the LEFT unobstructed stage
      return 0.19;
    }
    if (activeSection === 'bedtime') {
      // Narrative column sits on the LEFT -> shift 3D house center onto the RIGHT unobstructed stage
      return -0.19;
    }
    return 0;
  }, [activeSection, roamMode]);

  const veilOpacity = useMemo(() => {
    if (roamMode) return 0;
    if (activeSection === 'product') return 0.78;
    if (activeSection === 'deploy') return 0.84;
    if (activeSection === 'hero') return 0.16;
    return 0.1;
  }, [activeSection, roamMode]);

  const jumpToSection = useCallback((id: SectionId) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveSection(id);
  }, []);

  const handleSelectRoom = useCallback(
    (room: RoomId) => {
      setActiveRoom(room);
      pushStream('ui.camera', `focus → ${room}`);
    },
    [pushStream],
  );

  // Interactive Direct Device Controls (Spatial Explorer & 3D Pins)
  const handleToggleEntity = useCallback(
    (entityId: string) => {
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id !== entityId) return e;
          fireArc(e.anchor3d, e.highRisk ? 'approval' : 'allow');
          if (e.domain === 'lock') {
            const next = e.state === 'locked' ? 'unlocked' : 'locked';
            pushStream('ha.state_changed', `${e.id} → ${next} (admin)`);
            setAudits((a) => [
              {
                id: `aud-${Date.now()}`,
                time: nowTimeStr(),
                principal: 'admin',
                action: `lock.${next === 'locked' ? 'lock' : 'unlock'}`,
                target: e.id,
                decision: 'allowed',
                reason: { zh: '管理员直接控制确认', en: 'Direct administrator control' },
              },
              ...a,
            ]);
            return { ...e, state: next, lastChangedBy: 'admin' };
          }
          if (e.domain === 'cover') {
            const nextOpen = e.state === 'closed';
            const nextState = nextOpen ? 'open' : 'closed';
            pushStream('ha.state_changed', `${e.id} → ${nextState}`);
            return { ...e, state: nextState, positionPct: nextOpen ? 100 : 0, lastChangedBy: 'admin' };
          }
          if (e.domain === 'climate') {
            const nextTemp = (e.temperature ?? 23) >= 25 ? 22.0 : (e.temperature ?? 23) + 0.5;
            pushStream('ha.state_changed', `${e.id} → ${nextTemp.toFixed(1)}°C`);
            return { ...e, temperature: nextTemp, lastChangedBy: 'admin' };
          }
          const nextOn = e.state !== 'on';
          pushStream('ha.state_changed', `${e.id} → ${nextOn ? 'on' : 'off'}`);
          return {
            ...e,
            state: nextOn ? 'on' : 'off',
            brightnessPct: nextOn ? Math.max(e.brightnessPct || 0, 68) : e.brightnessPct,
            lastChangedBy: 'admin',
          };
        }),
      );
    },
    [fireArc, pushStream],
  );

  const handleSetLightBrightness = useCallback(
    (entityId: string, pct: number) => {
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id !== entityId) return e;
          fireArc(e.anchor3d, 'allow');
          pushStream('ha.state_changed', `${e.id} brightness_pct=${pct}%`);
          return { ...e, state: 'on', brightnessPct: pct, lastChangedBy: 'admin' };
        }),
      );
    },
    [fireArc, pushStream],
  );

  const handleStepClimate = useCallback(
    (entityId: string, delta: number) => {
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id !== entityId) return e;
          const next = Math.min(28, Math.max(17, (e.temperature ?? 23) + delta));
          fireArc(e.anchor3d, 'allow');
          pushStream('ha.state_changed', `${e.id} → ${next.toFixed(1)}°C`);
          return {
            ...e,
            state: next <= 23 ? 'cool' : 'heat_cool',
            temperature: next,
            lastChangedBy: 'admin',
          };
        }),
      );
    },
    [fireArc, pushStream],
  );

  const handleCoverCommand = useCallback(
    (entityId: string, cmd: 'open' | 'stop' | 'close') => {
      if (cmd === 'stop') {
        pushStream('ha.call_service', `cover.stop_cover → ${entityId}`);
        return;
      }
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id !== entityId) return e;
          const open = cmd === 'open';
          fireArc(e.anchor3d, e.highRisk ? 'approval' : 'allow');
          pushStream('ha.state_changed', `${e.id} → ${open ? 'open' : 'closed'}`);
          return {
            ...e,
            state: open ? 'open' : 'closed',
            positionPct: open ? 100 : 0,
            lastChangedBy: 'admin',
          };
        }),
      );
    },
    [fireArc, pushStream],
  );

  // ============================================================================
  // ACT III: "帮我准备睡觉" Multi-Step AI Routine + Lock Approval Gate
  // ============================================================================
  const startBedtimeScenario = useCallback(() => {
    clearScenarioTimers();
    setRoamMode(false);
    setTimeOfDay('dusk');

    // Ensure starting state has downstairs lights on and front door unlocked so every transition is vivid
    setEntities(INITIAL_ENTITIES.map((e) => ({ ...e })));
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setCountdownSec(299);
    setScenarioStatus('running');
    setStepIndex(0);
    setActiveRoom('overview');
    fireArc([-4.85, 2.95, -0.45], 'read');
    pushStream('session:01k9bed', 'run started · ha_overview');

    // Step 2 @ 950ms: Turn off downstairs lights & coffee machine
    const t1 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 0 ? { ...s, state: 'done' } : s)));
      setStepIndex(1);
      setActiveRoom('living_room');
      fireArc([-6.48, 2.05, -1.9], 'allow');
      setEntities((prev) =>
        prev.map((e) => {
          if (
            e.id === 'light.living_ceiling' ||
            e.id === 'light.living_lamp' ||
            e.id === 'light.kitchen_pendant' ||
            e.id === 'switch.coffee_machine'
          ) {
            return { ...e, state: 'off', lastChangedBy: 'session:01k9bed' };
          }
          if (e.id === 'cover.living_curtain') {
            return { ...e, state: 'closed', positionPct: 0, lastChangedBy: 'session:01k9bed' };
          }
          return e;
        }),
      );
      pushStream('session:01k9bed', 'light.turn_off → living_room, kitchen');
      setAudits((a) => [
        {
          id: `aud-down-${Date.now()}`,
          time: nowTimeStr(),
          principal: 'session:01k9bed',
          action: 'light.turn_off',
          target: 'light.living_*, light.kitchen_pendant',
          decision: 'allowed',
          reason: { zh: '区域递归展开通过', en: 'Area targets expanded & allowed' },
        },
        ...a,
      ]);
    }, 950);

    // Step 3 @ 2150ms: Glide upstairs to Master Suite, close blackout curtain, turn on 22% 2400K nightlight, set AC 22.5°C
    const t2 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 1 ? { ...s, state: 'done' } : s)));
      setStepIndex(2);
      setActiveRoom('bedroom');
      setTimeOfDay('night');
      fireArc([-3.4, 3.55, -0.95], 'allow');
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id === 'light.bedroom_light') {
            return { ...e, state: 'off', lastChangedBy: 'session:01k9bed' };
          }
          if (e.id === 'light.bedroom_nightlight') {
            return { ...e, state: 'on', brightnessPct: 22, lastChangedBy: 'session:01k9bed' };
          }
          if (e.id === 'cover.bedroom_curtain') {
            return { ...e, state: 'closed', positionPct: 0, lastChangedBy: 'session:01k9bed' };
          }
          if (e.id === 'climate.bedroom_ac') {
            return { ...e, state: 'cool', temperature: 22.5, lastChangedBy: 'session:01k9bed' };
          }
          return e;
        }),
      );
      pushStream('session:01k9bed', 'bedroom drapery closed · nightlight 22% · 22.5°C');
    }, 2150);

    // Step 4 @ 3450ms: Swoop to Entrance Hall -> PAUSE at lock.front_door (waiting_approval!)
    const t3 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 2 ? { ...s, state: 'done' } : s)));
      setStepIndex(3);
      setActiveRoom('hall');
      setScenarioStatus('waiting_approval');
      fireArc([1.18, 1.24, 3.28], 'approval');
      pushStream('approvals', 'pending apr_01k9lock · lock.lock → lock.front_door');
    }, 3450);

    timersRef.current.push(t1, t2, t3);
  }, [clearScenarioTimers, fireArc, pushStream]);

  const decideBedtimeApproval = useCallback(
    (approve: boolean) => {
      if (scenarioStatus !== 'waiting_approval') return;
      if (approve) {
        fireArc([1.18, 1.24, 3.28], 'allow');
        setEntities((prev) =>
          prev.map((e) => {
            if (e.id === 'lock.front_door') {
              return { ...e, state: 'locked', lastChangedBy: 'session:01k9bed (approved)' };
            }
            if (e.id === 'light.courtyard_path') {
              return { ...e, state: 'on', brightnessPct: 22 };
            }
            return e;
          }),
        );
        setSteps((prev) => prev.map((s, idx) => (idx === 3 ? { ...s, state: 'approved' } : s)));
        setScenarioStatus('completed');
        pushStream('approvals', 'apr_01k9lock approved → lock.front_door locked');
        setAudits((a) => [
          {
            id: `aud-apr-${Date.now()}`,
            time: nowTimeStr(),
            principal: 'session:01k9bed',
            action: 'lock.lock (apr_01k9lock)',
            target: 'lock.front_door',
            decision: 'approved',
            reason: { zh: '高风险门锁操作获人工批准', en: 'High-risk lock approved by admin' },
          },
          ...a,
        ]);
      } else {
        fireArc([1.18, 1.24, 3.28], 'conflict');
        setSteps((prev) => prev.map((s, idx) => (idx === 3 ? { ...s, state: 'denied' } : s)));
        setScenarioStatus('denied_completed');
        pushStream('approvals', 'apr_01k9lock denied → 403 approval_rejected');
        setAudits((a) => [
          {
            id: `aud-den-${Date.now()}`,
            time: nowTimeStr(),
            principal: 'session:01k9bed',
            action: 'lock.lock (apr_01k9lock)',
            target: 'lock.front_door',
            decision: 'rejected',
            reason: { zh: '用户拒绝高风险门锁操作', en: 'User denied high-risk lock write' },
          },
          ...a,
        ]);
      }
    },
    [fireArc, pushStream, scenarioStatus],
  );

  const resetBedtimeScenario = useCallback(() => {
    clearScenarioTimers();
    setEntities(INITIAL_ENTITIES.map((e) => ({ ...e })));
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setScenarioStatus('idle');
    setStepIndex(0);
    setTimeOfDay('dusk');
    setActiveRoom('overview');
    pushStream('ha.registry', 'home reset to evening baseline');
  }, [clearScenarioTimers, pushStream]);

  // ============================================================================
  // ACT IV: Sub-Agent Spatial Signal Arcs & Conflict Arbitration Pulses
  // ============================================================================
  const handleDispatchAgentPulse = useCallback(
    (agent: SubAgentSpec) => {
      setActiveRoom('overview');
      const map = new Map(entities.map((e) => [e.id, e]));
      agent.targetEntities.forEach((eid, idx) => {
        const ent = map.get(eid);
        if (!ent) return;
        const tid = window.setTimeout(() => {
          fireArc(ent.anchor3d, agent.slug === 'away-check' ? 'allow' : 'read');
        }, idx * 240);
        timersRef.current.push(tid);
      });
      pushStream(
        `run:${agent.slug}`,
        `dispatched rev r${agent.revision} → ${agent.targetEntities.length} entities`,
      );
    },
    [entities, fireArc, pushStream],
  );

  const handleTriggerArbitration = useCallback(
    (arb: ArbitrationCase) => {
      const target = entities.find((e) => e.id === arb.targetEntity);
      if (target) {
        setActiveRoom('overview');
        fireArc(target.anchor3d, arb.signalKind);
      }
      pushStream('coordination', `${arb.badge} · ${arb.targetEntity}`);
      setAudits((a) => [
        {
          id: `aud-arb-${Date.now()}`,
          time: nowTimeStr(),
          principal: arb.principal,
          action: arb.badge,
          target: arb.targetEntity,
          decision: arb.auditDecision,
          reason: arb.title,
        },
        ...a,
      ]);
    },
    [entities, fireArc, pushStream],
  );

  return (
    <div className="cz-app-root" data-lang={lang}>
      <Navbar
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'zh' ? 'en' : 'zh'))}
        timeOfDay={timeOfDay}
        onChangeTime={setTimeOfDay}
        activeSection={activeSection}
        onJumpSection={jumpToSection}
        roamMode={roamMode}
        onToggleRoam={() => setRoamMode((r) => !r)}
        pendingApprovalCount={scenarioStatus === 'waiting_approval' ? 1 : 0}
      />

      {/* Persistent Full-Viewport Real-Time 3D Smart Residence Stage */}
      <ResidenceViewport
        lang={lang}
        timeOfDay={timeOfDay}
        entities={entities}
        activeRoom={activeRoom}
        cameraPose={cameraPose}
        offsetRatioX={offsetRatioX}
        roamMode={roamMode}
        veilOpacity={veilOpacity}
        waitingLockApproval={scenarioStatus === 'waiting_approval'}
        latestSignal={latestSignal}
        latestStreamEvent={latestStream}
        onSelectRoom={handleSelectRoom}
        onPinAction={(entityId) => {
          if (entityId === 'lock.front_door' && scenarioStatus === 'waiting_approval') {
            jumpToSection('bedtime');
            return;
          }
          handleToggleEntity(entityId);
        }}
      />

      {/* Choreographed Scroll Narrative Overlay */}
      <main className={`cz-scroll-main ${roamMode ? 'is-hidden' : ''}`}>
        <HeroSection
          lang={lang}
          entities={entities}
          onJumpSection={jumpToSection}
          onStartBedtimeDemo={startBedtimeScenario}
        />

        <SpatialExplorerSection
          lang={lang}
          activeRoom={activeRoom}
          entities={entities}
          onSelectRoom={handleSelectRoom}
          onToggleEntity={handleToggleEntity}
          onSetLightBrightness={handleSetLightBrightness}
          onStepClimate={handleStepClimate}
          onCoverCommand={handleCoverCommand}
        />

        <BedtimeScenarioSection
          lang={lang}
          status={scenarioStatus}
          stepIndex={stepIndex}
          steps={steps}
          countdownSec={countdownSec}
          selectedModel={selectedModel}
          onChangeModel={setSelectedModel}
          onStartScenario={startBedtimeScenario}
          onResetScenario={resetBedtimeScenario}
          onDecideApproval={decideBedtimeApproval}
          recentAudits={audits}
        />

        <SubAgentNetworkSection
          lang={lang}
          onDispatchAgentPulse={handleDispatchAgentPulse}
          onTriggerArbitration={handleTriggerArbitration}
        />

        <ProductShowcaseSection lang={lang} />

        <ArchitectureDeploySection lang={lang} onJumpSection={jumpToSection} />
      </main>
    </div>
  );
}
