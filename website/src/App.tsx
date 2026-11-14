import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchitectureDeploySection } from './components/ArchitectureDeploySection.tsx';
import { BedtimeScenarioSection, type BedtimeStepLog } from './components/BedtimeScenarioSection.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { Navbar } from './components/Navbar.tsx';
import { ProductShowcaseSection } from './components/ProductShowcaseSection.tsx';
import { ResidenceViewport } from './components/ResidenceViewport.tsx';
import { SpatialExplorerSection } from './components/SpatialExplorerSection.tsx';
import { SubAgentNetworkSection } from './components/SubAgentNetworkSection.tsx';
import { INITIAL_ENTITIES, ROOM_CAMERAS } from './data/homeState.ts';
import type {
  CameraPose,
  HomeEntity,
  Lang,
  RoomId,
  ScenarioStatus,
  SectionId,
  TimeOfDay,
} from './types/home.ts';

const INITIAL_STEPS: BedtimeStepLog[] = [
  {
    id: 'step-overview',
    label: { zh: '看一眼家里状态', en: 'Checking what is still on' },
    summary: { zh: '上下两层 · 看看灯和门窗', en: 'Both floors · lights & doors' },
    detail: {
      zh: '看到楼下客厅和餐厅的灯还亮着，咖啡机还没关，主卧窗帘拉开了，玄关大门暂时没锁。',
      en: 'Living and dining lights are still on, the coffee maker is on, bedroom curtains are open, and the front door is unlocked.',
    },
    state: 'running',
  },
  {
    id: 'step-downstairs',
    label: { zh: '收拾楼下灯光与电器', en: 'Turning off downstairs' },
    summary: { zh: '客厅灯、吊灯与咖啡机已关', en: 'Living lights & coffee maker off' },
    detail: {
      zh: '把客厅顶灯、落地灯、餐桌吊灯和咖啡机一起关掉，让一楼慢慢暗下来。',
      en: 'Switched off the living ceiling light, floor lamp, dining pendant, and coffee maker downstairs.',
    },
    state: 'running',
  },
  {
    id: 'step-bedroom',
    label: { zh: '安顿楼上主卧', en: 'Preparing the bedroom' },
    summary: { zh: '拉好遮光帘 · 夜灯微亮 · 空调 22.5°C', en: 'Curtains closed · 22% nightlight · 22.5°C' },
    detail: {
      zh: '拉合主卧遮光帘、熄灭床头亮灯，把床底柔光夜灯调到柔和的 22%，静音空调设在舒服的 22.5°C。',
      en: 'Closed the bedroom blackout curtains, dimmed off the bright bedside lamp, warmed the under-bed nightlight to 22%, and set AC to 22.5°C.',
    },
    state: 'running',
  },
  {
    id: 'step-lock',
    label: { zh: '玄关大门锁门确认', en: 'Front door lock check' },
    summary: { zh: '停下来等你点头', en: 'Waiting for your okay' },
    detail: {
      zh: '锁大门涉及家里安全，系统按规矩先暂停下来，等你亲手确认再动作。',
      en: 'Door locks always wait for your direct confirmation before taking action.',
    },
    state: 'waiting_approval',
  },
];

export function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [userPickedTod, setUserPickedTod] = useState(false);
  const [entities, setEntities] = useState<HomeEntity[]>(() => INITIAL_ENTITIES.map((e) => ({ ...e })));
  const [activeRoom, setActiveRoom] = useState<RoomId>('overview');
  const [activeSection, setActiveSection] = useState<SectionId>('hero');
  const [roamMode, setRoamMode] = useState(false);

  // Bedtime Scenario State
  const [scenarioStatus, setScenarioStatus] = useState<ScenarioStatus>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<BedtimeStepLog[]>(INITIAL_STEPS);
  const [countdownSec, setCountdownSec] = useState(299);
  const [selectedModel, setSelectedModel] = useState('claude');
  const timersRef = useRef<number[]>([]);

  const clearScenarioTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => clearScenarioTimers, [clearScenarioTimers]);

  // Countdown tick while waiting for user confirmation
  useEffect(() => {
    if (scenarioStatus !== 'waiting_approval') return;
    const iv = window.setInterval(() => {
      setCountdownSec((s) => (s > 1 ? s - 1 : 299));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [scenarioStatus]);

  // Scroll section tracking
  useEffect(() => {
    const sectionIds: SectionId[] = ['hero', 'explore', 'bedtime', 'agents', 'product', 'deploy'];
    const handleScroll = () => {
      const viewportMid = window.innerHeight * 0.42;
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

  // Sync camera room & gentle day/dusk mood automatically when scrolling between upper chapters
  useEffect(() => {
    if (roamMode || scenarioStatus === 'running' || scenarioStatus === 'waiting_approval') return;
    if (activeSection === 'hero') {
      setActiveRoom('overview');
      if (!userPickedTod && scenarioStatus === 'idle') setTimeOfDay('day');
    } else if (activeSection === 'explore') {
      setActiveRoom((prev) => (prev === 'overview' ? 'living_room' : prev));
      if (!userPickedTod && scenarioStatus === 'idle') setTimeOfDay('day');
    } else if (activeSection === 'bedtime') {
      if (scenarioStatus === 'completed' || scenarioStatus === 'denied_completed') {
        setActiveRoom('hall');
      } else {
        setActiveRoom('bedroom');
      }
      if (!userPickedTod && scenarioStatus === 'idle') setTimeOfDay('dusk');
    }
  }, [activeSection, roamMode, scenarioStatus, userPickedTod]);

  const cameraPose: CameraPose = useMemo(() => {
    return ROOM_CAMERAS[activeRoom] ?? ROOM_CAMERAS.overview;
  }, [activeRoom]);

  const jumpToSection = useCallback((id: SectionId) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveSection(id);
  }, []);

  const handleChangeTime = useCallback((tod: TimeOfDay) => {
    setUserPickedTod(true);
    setTimeOfDay(tod);
  }, []);

  const handleSelectRoom = useCallback((room: RoomId) => {
    setActiveRoom(room);
  }, []);

  // Interactive Direct Device Controls
  const handleToggleEntity = useCallback((entityId: string) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id !== entityId) return e;
        if (e.domain === 'lock') {
          const next = e.state === 'locked' ? 'unlocked' : 'locked';
          return { ...e, state: next, lastChangedBy: 'admin' };
        }
        if (e.domain === 'cover') {
          const nextOpen = e.state === 'closed';
          const nextState = nextOpen ? 'open' : 'closed';
          return { ...e, state: nextState, positionPct: nextOpen ? 100 : 0, lastChangedBy: 'admin' };
        }
        if (e.domain === 'climate') {
          const nextTemp = (e.temperature ?? 23) >= 25 ? 22.0 : (e.temperature ?? 23) + 0.5;
          return { ...e, temperature: nextTemp, lastChangedBy: 'admin' };
        }
        const nextOn = e.state !== 'on';
        return {
          ...e,
          state: nextOn ? 'on' : 'off',
          brightnessPct: nextOn ? Math.max(e.brightnessPct || 0, 68) : e.brightnessPct,
          lastChangedBy: 'admin',
        };
      }),
    );
  }, []);

  const handleSetLightBrightness = useCallback((entityId: string, pct: number) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id !== entityId) return e;
        return { ...e, state: 'on', brightnessPct: pct, lastChangedBy: 'admin' };
      }),
    );
  }, []);

  const handleStepClimate = useCallback((entityId: string, delta: number) => {
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id !== entityId) return e;
        const next = Math.min(28, Math.max(17, (e.temperature ?? 23) + delta));
        return {
          ...e,
          state: next <= 23 ? 'cool' : 'heat_cool',
          temperature: next,
          lastChangedBy: 'admin',
        };
      }),
    );
  }, []);

  const handleCoverCommand = useCallback((entityId: string, cmd: 'open' | 'stop' | 'close') => {
    if (cmd === 'stop') return;
    setEntities((prev) =>
      prev.map((e) => {
        if (e.id !== entityId) return e;
        const open = cmd === 'open';
        return {
          ...e,
          state: open ? 'open' : 'closed',
          positionPct: open ? 100 : 0,
          lastChangedBy: 'admin',
        };
      }),
    );
  }, []);

  // Multi-Step Goodnight Routine + Gentle Door Lock Confirmation
  const startBedtimeScenario = useCallback(() => {
    clearScenarioTimers();
    setRoamMode(false);
    setTimeOfDay('dusk');

    setEntities(INITIAL_ENTITIES.map((e) => ({ ...e })));
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setCountdownSec(299);
    setScenarioStatus('running');
    setStepIndex(0);
    setActiveRoom('overview');

    const t1 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 0 ? { ...s, state: 'done' } : s)));
      setStepIndex(1);
      setActiveRoom('living_room');
      setEntities((prev) =>
        prev.map((e) => {
          if (
            e.id === 'light.living_ceiling' ||
            e.id === 'light.living_lamp' ||
            e.id === 'light.kitchen_pendant' ||
            e.id === 'switch.coffee_machine'
          ) {
            return { ...e, state: 'off', lastChangedBy: 'session:evening' };
          }
          if (e.id === 'cover.living_curtain') {
            return { ...e, state: 'closed', positionPct: 0, lastChangedBy: 'session:evening' };
          }
          return e;
        }),
      );
    }, 950);

    const t2 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 1 ? { ...s, state: 'done' } : s)));
      setStepIndex(2);
      setActiveRoom('bedroom');
      setTimeOfDay('night');
      setEntities((prev) =>
        prev.map((e) => {
          if (e.id === 'light.bedroom_light') {
            return { ...e, state: 'off', lastChangedBy: 'session:evening' };
          }
          if (e.id === 'light.bedroom_nightlight') {
            return { ...e, state: 'on', brightnessPct: 22, lastChangedBy: 'session:evening' };
          }
          if (e.id === 'cover.bedroom_curtain') {
            return { ...e, state: 'closed', positionPct: 0, lastChangedBy: 'session:evening' };
          }
          if (e.id === 'climate.bedroom_ac') {
            return { ...e, state: 'cool', temperature: 22.5, lastChangedBy: 'session:evening' };
          }
          return e;
        }),
      );
    }, 2150);

    const t3 = window.setTimeout(() => {
      setSteps((prev) => prev.map((s, idx) => (idx === 2 ? { ...s, state: 'done' } : s)));
      setStepIndex(3);
      setActiveRoom('hall');
      setScenarioStatus('waiting_approval');
    }, 3450);

    timersRef.current.push(t1, t2, t3);
  }, [clearScenarioTimers]);

  const decideBedtimeApproval = useCallback(
    (approve: boolean) => {
      if (scenarioStatus !== 'waiting_approval') return;
      if (approve) {
        setEntities((prev) =>
          prev.map((e) => {
            if (e.id === 'lock.front_door') {
              return { ...e, state: 'locked', lastChangedBy: 'admin' };
            }
            if (e.id === 'light.courtyard_path') {
              return { ...e, state: 'on', brightnessPct: 22 };
            }
            return e;
          }),
        );
        setSteps((prev) => prev.map((s, idx) => (idx === 3 ? { ...s, state: 'approved' } : s)));
        setScenarioStatus('completed');
      } else {
        setSteps((prev) => prev.map((s, idx) => (idx === 3 ? { ...s, state: 'denied' } : s)));
        setScenarioStatus('denied_completed');
      }
    },
    [scenarioStatus],
  );

  const resetBedtimeScenario = useCallback(() => {
    clearScenarioTimers();
    setEntities(INITIAL_ENTITIES.map((e) => ({ ...e })));
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setScenarioStatus('idle');
    setStepIndex(0);
    setTimeOfDay('dusk');
    setActiveRoom('overview');
  }, [clearScenarioTimers]);

  return (
    <div className="cz-app-root" data-lang={lang} data-roam={roamMode ? 'true' : 'false'}>
      <Navbar
        lang={lang}
        onToggleLang={() => setLang((l) => (l === 'zh' ? 'en' : 'zh'))}
        timeOfDay={timeOfDay}
        onChangeTime={handleChangeTime}
        activeSection={activeSection}
        onJumpSection={jumpToSection}
        roamMode={roamMode}
        onToggleRoam={() => setRoamMode((r) => !r)}
        pendingApprovalCount={scenarioStatus === 'waiting_approval' ? 1 : 0}
      />

      <main className="cz-main">
        {/* Upper Half: Two-Column Warm Home Story + Framed Interactive 3D Stage */}
        <div className="cz-home-showcase-shell">
          <div className="cz-home-showcase-inner">
            <div className={`cz-narrative-flow ${roamMode ? 'is-roam-hidden' : ''}`}>
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
              />
            </div>

            <aside className={`cz-stage-column ${roamMode ? 'is-roam-expanded' : ''}`}>
              <div className="cz-stage-frame">
                <ResidenceViewport
                  lang={lang}
                  timeOfDay={timeOfDay}
                  entities={entities}
                  activeRoom={activeRoom}
                  cameraPose={cameraPose}
                  offsetRatioX={0}
                  roamMode={roamMode}
                  veilOpacity={0}
                  waitingLockApproval={scenarioStatus === 'waiting_approval'}
                  latestSignal={null}
                  onSelectRoom={handleSelectRoom}
                  onPinAction={(entityId) => {
                    if (entityId === 'lock.front_door' && scenarioStatus === 'waiting_approval') {
                      jumpToSection('bedtime');
                      return;
                    }
                    handleToggleEntity(entityId);
                  }}
                />
              </div>
              {!roamMode && (
                <div className="cz-stage-caption">
                  <span>
                    {lang === 'zh'
                      ? '这是一个能点能逛的小家：点下方房间或屋里的设备标签就能直接试看；点右上角「自由逛逛」可 360° 转动房子。'
                      : 'Interactive home preview: pick a room below or tap any badge inside the house, or click “Explore 3D” above to orbit freely.'}
                  </span>
                </div>
              )}
            </aside>
          </div>
        </div>

        {/* Lower Half: Full-Width Warm Linen & Oat Editorial Chapters */}
        <div className={`cz-editorial-lower ${roamMode ? 'is-roam-hidden' : ''}`}>
          <SubAgentNetworkSection lang={lang} />
          <ProductShowcaseSection lang={lang} />
          <ArchitectureDeploySection lang={lang} onJumpSection={jumpToSection} />
        </div>
      </main>
    </div>
  );
}
