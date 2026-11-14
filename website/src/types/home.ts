export type Lang = 'zh' | 'en';

export type TimeOfDay = 'dusk' | 'day' | 'night';

export type RoomId = 'overview' | 'living_room' | 'hall' | 'kitchen' | 'bedroom' | 'courtyard';

export type SectionId = 'hero' | 'explore' | 'bedtime' | 'agents' | 'product' | 'deploy';

export type EntityDomain =
  'light' | 'cover' | 'climate' | 'lock' | 'switch' | 'sensor' | 'binary_sensor' | 'alarm_control_panel';

export type HaPlacement = 'room' | 'config' | 'integration' | 'household';

export interface HomeEntity {
  id: string;
  domain: EntityDomain;
  room: Exclude<RoomId, 'overview'>;
  floor: 'ground' | 'first';
  placement: HaPlacement;
  deviceClass?: 'garage' | 'curtain' | 'motion' | 'temperature' | 'power';
  highRisk?: boolean;
  highRiskReason?: { zh: string; en: string };
  state: string;
  brightnessPct?: number;
  colorTempK?: number;
  temperature?: number;
  currentTemperature?: number;
  positionPct?: number;
  numericValue?: number;
  unit?: string;
  anchor3d: [number, number, number];
  pinRooms: RoomId[];
  name: { zh: string; en: string };
  lastChangedBy: string;
  manualHoldMinutes?: number;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface ProjectedPin {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  distance: number;
}

export interface SignalArcEvent {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  kind: 'allow' | 'approval' | 'conflict' | 'read';
  createdAt: number;
}

export type ScenarioStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'denied_completed';

export interface SubAgentSpec {
  id: string;
  slug: string;
  scheduleText: { zh: string; en: string };
  name: { zh: string; en: string };
  role: { zh: string; en: string };
  summary: { zh: string; en: string };
  canDo: { zh: string; en: string };
  cannotDo: { zh: string; en: string };
  memoryNote: { title: { zh: string; en: string }; body: { zh: string; en: string } };
  targetEntities: string[];
}

export interface ArbitrationCase {
  id: 'manual_hold' | 'policy_cap' | 'loop_guard' | 'session_delegate';
  title: { zh: string; en: string };
  badge: { zh: string; en: string };
  verdictTag: { zh: string; en: string };
  scenarioLabel: { zh: string; en: string };
  description: { zh: string; en: string };
  gatewayVerdict: { zh: string; en: string };
}
