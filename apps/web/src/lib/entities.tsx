import {
  Battery024Regular,
  Window24Regular,
  Camera24Regular,
  WeatherSqualls24Regular,
  Flash24Regular,
  Home24Regular,
  LightbulbFilament24Regular,
  LockClosed24Regular,
  LockOpen24Regular,
  MusicNote224Regular,
  Person24Regular,
  Play24Regular,
  PlugConnected24Regular,
  Power24Regular,
  Temperature24Regular,
  ToggleRight24Regular,
  Video24Regular,
  WeatherPartlyCloudyDay24Regular,
  Water24Regular,
  Wifi124Regular,
  Alert24Regular,
  CalendarLtr24Regular,
  TaskListLtr24Regular,
  Timer24Regular,
  Cube24Regular,
} from '@fluentui/react-icons';
import type { HaEntity } from '@cangze/contracts';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';

export function domainIcon(e: Pick<HaEntity, 'domain' | 'state' | 'attributes'>): ReactElement {
  const dc = e.attributes.device_class as string | undefined;
  switch (e.domain) {
    case 'light':
      return <LightbulbFilament24Regular />;
    case 'switch':
    case 'input_boolean':
      return dc === 'outlet' ? <PlugConnected24Regular /> : <ToggleRight24Regular />;
    case 'lock':
      return e.state === 'unlocked' ? <LockOpen24Regular /> : <LockClosed24Regular />;
    case 'climate':
    case 'water_heater':
      return <Temperature24Regular />;
    case 'fan':
      return <WeatherSqualls24Regular />;
    case 'cover':
      return <Window24Regular />;
    case 'camera':
      return <Camera24Regular />;
    case 'media_player':
      return <MusicNote224Regular />;
    case 'person':
    case 'device_tracker':
      return <Person24Regular />;
    case 'script':
    case 'scene':
    case 'automation':
    case 'button':
    case 'input_button':
      return <Play24Regular />;
    case 'weather':
      return <WeatherPartlyCloudyDay24Regular />;
    case 'vacuum':
      return <Home24Regular />;
    case 'calendar':
      return <CalendarLtr24Regular />;
    case 'todo':
      return <TaskListLtr24Regular />;
    case 'timer':
      return <Timer24Regular />;
    case 'alarm_control_panel':
      return <Alert24Regular />;
    case 'binary_sensor':
      if (dc === 'connectivity') return <Wifi124Regular />;
      if (dc === 'moisture') return <Water24Regular />;
      return <Power24Regular />;
    case 'sensor':
      if (dc === 'temperature') return <Temperature24Regular />;
      if (dc === 'power' || dc === 'energy') return <Flash24Regular />;
      if (dc === 'battery') return <Battery024Regular />;
      if (dc === 'humidity') return <Water24Regular />;
      return <Cube24Regular />;
    default:
      return e.domain.includes('video') ? <Video24Regular /> : <Cube24Regular />;
  }
}

const ON_STATES = new Set([
  'on',
  'open',
  'unlocked',
  'playing',
  'home',
  'heat',
  'cool',
  'heat_cool',
  'auto',
  'cleaning',
  'active',
]);
export const isActive = (e: Pick<HaEntity, 'state'>) => ON_STATES.has(e.state);
export const isUnavailable = (e: Pick<HaEntity, 'state'>) =>
  e.state === 'unavailable' || e.state === 'unknown';

export function formatState(t: TFunction, e: Pick<HaEntity, 'state' | 'attributes' | 'domain'>): string {
  if (e.state === 'unavailable') return t('entity.unavailable');
  if (e.state === 'unknown') return t('entity.unknown');
  const unit = e.attributes.unit_of_measurement as string | undefined;
  if (unit) return `${e.state} ${unit}`;
  if (e.domain === 'climate') {
    const target = e.attributes.temperature as number | undefined;
    const current = e.attributes.current_temperature as number | undefined;
    const mode = t(`entity.state.${e.state}`, { defaultValue: e.state });
    return [
      mode,
      target !== undefined ? `→ ${target}°` : null,
      current !== undefined ? `(${current}°)` : null,
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (e.domain === 'light' && e.state === 'on' && typeof e.attributes.brightness === 'number') {
    return `${t('entity.state.on')} · ${Math.round(((e.attributes.brightness as number) / 255) * 100)}%`;
  }
  return t(`entity.state.${e.state}`, { defaultValue: e.state });
}

export type QuickControl =
  | { kind: 'toggle' }
  | { kind: 'lock' }
  | { kind: 'run'; service: string }
  | { kind: 'cover' }
  | { kind: 'climate' }
  | { kind: 'none' };

export function quickControl(e: Pick<HaEntity, 'domain'>): QuickControl {
  switch (e.domain) {
    case 'light':
    case 'switch':
    case 'input_boolean':
    case 'fan':
    case 'automation':
    case 'siren':
    case 'humidifier':
      return { kind: 'toggle' };
    case 'lock':
      return { kind: 'lock' };
    case 'script':
      return { kind: 'run', service: 'turn_on' };
    case 'scene':
      return { kind: 'run', service: 'turn_on' };
    case 'button':
    case 'input_button':
      return { kind: 'run', service: 'press' };
    case 'cover':
      return { kind: 'cover' };
    case 'climate':
      return { kind: 'climate' };
    default:
      return { kind: 'none' };
  }
}

/** Numeric sensors get a line chart; everything else a state timeline. */
export const isNumeric = (e: Pick<HaEntity, 'state' | 'attributes'>) =>
  e.attributes.unit_of_measurement !== undefined && !Number.isNaN(Number(e.state));
