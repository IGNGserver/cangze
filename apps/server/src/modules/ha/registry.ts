import {
  isHaConfigDomain,
  type HaArea,
  type HaDevice,
  type HaEntity,
  type HaEntityPlacement,
  type HaEntityState,
  type HaFloor,
  type HaLabel,
  type HaTarget,
} from '@cangze/contracts';

/** Entity registry entry as returned by `config/entity_registry/list`. */
export interface EntityRegistryEntry {
  entity_id: string;
  name: string | null;
  original_name?: string | null;
  device_id: string | null;
  area_id: string | null;
  platform: string | null;
  labels: string[];
  disabled_by: string | null;
  hidden_by: string | null;
  entity_category: string | null;
}

/** Service domains whose services act on entities of any domain. */
const CROSS_DOMAIN = new Set(['homeassistant']);

/** Domains that represent things placed in a room even when they have no device entry. */
const ROOM_DOMAINS = new Set([
  'alarm_control_panel',
  'binary_sensor',
  'button',
  'camera',
  'climate',
  'cover',
  'event',
  'fan',
  'humidifier',
  'image',
  'input_boolean',
  'lawn_mower',
  'light',
  'lock',
  'media_player',
  'number',
  'remote',
  'select',
  'sensor',
  'siren',
  'switch',
  'text',
  'vacuum',
  'valve',
  'water_heater',
]);

/** Service entities that belong to integrations rather than rooms. */
const SERVICE_DOMAINS = new Set(['tts', 'stt', 'conversation', 'notify']);

export const domainOf = (entityId: string) => entityId.slice(0, entityId.indexOf('.'));

const asList = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x.length > 0);

const countsText = (counts: Map<string, number>): string =>
  [...counts.entries()]
    .sort()
    .map(([domain, n]) => `${domain}×${n}`)
    .join(', ');

/**
 * In-memory mirror of HA's registries and states. Pure data structure: the gateway feeds it,
 * policy/tools/routes query it. Target expansion follows HA's own semantics closely enough that
 * authorization sees every entity a call could affect.
 */
export class HaRegistry {
  states = new Map<string, HaEntityState>();
  entities = new Map<string, EntityRegistryEntry>();
  devices = new Map<string, HaDevice>();
  areas = new Map<string, HaArea>();
  floors = new Map<string, HaFloor>();
  labels = new Map<string, HaLabel>();

  setStates(list: HaEntityState[]): void {
    this.states = new Map(list.map((s) => [s.entity_id, s]));
  }

  setEntities(list: EntityRegistryEntry[]): void {
    this.entities = new Map(list.map((e) => [e.entity_id, e]));
  }

  setDevices(list: HaDevice[]): void {
    this.devices = new Map(list.map((d) => [d.id, d]));
  }

  setAreas(list: HaArea[]): void {
    this.areas = new Map(list.map((a) => [a.area_id, a]));
  }

  setFloors(list: HaFloor[]): void {
    this.floors = new Map(list.map((f) => [f.floor_id, f]));
  }

  setLabels(list: HaLabel[]): void {
    this.labels = new Map(list.map((l) => [l.label_id, l]));
  }

  /** Area of an entity: its own area, else its device's area. */
  areaOf(entityId: string): string | null {
    const e = this.entities.get(entityId);
    if (e?.area_id) return e.area_id;
    if (e?.device_id) return this.devices.get(e.device_id)?.area_id ?? null;
    return null;
  }

  floorOf(entityId: string): string | null {
    const area = this.areaOf(entityId);
    return area ? (this.areas.get(area)?.floor_id ?? null) : null;
  }

  /** Labels of an entity including labels of its device and area. */
  labelsOf(entityId: string): string[] {
    const e = this.entities.get(entityId);
    const out = new Set(e?.labels ?? []);
    if (e?.device_id) for (const l of this.devices.get(e.device_id)?.labels ?? []) out.add(l);
    const area = this.areaOf(entityId);
    if (area) for (const l of this.areas.get(area)?.labels ?? []) out.add(l);
    return [...out];
  }

  /** Where an entity belongs in the UI; see `HaEntityPlacement` in contracts. */
  placementOf(entityId: string): HaEntityPlacement {
    const e = this.entities.get(entityId);
    if (e?.area_id) return 'room';
    const device = e?.device_id ? this.devices.get(e.device_id) : undefined;
    if (device?.entry_type === 'service') return 'integration';
    if (device?.area_id) return 'room';
    if (device) return 'unassigned';
    const domain = domainOf(entityId);
    if (isHaConfigDomain(domain)) return 'config';
    if (SERVICE_DOMAINS.has(domain)) return 'integration';
    return ROOM_DOMAINS.has(domain) ? 'unassigned' : 'household';
  }

  displayName(entityId: string): string {
    const s = this.states.get(entityId);
    const fn = s?.attributes.friendly_name;
    if (typeof fn === 'string' && fn) return fn;
    const e = this.entities.get(entityId);
    return e?.name ?? e?.original_name ?? entityId;
  }

  /** Entities that indirect targets (area/device/label) may reach: enabled, visible, not config/diagnostic. */
  private implicitCandidates(): string[] {
    const out: string[] = [];
    const ids = new Set([...this.states.keys(), ...this.entities.keys()]);
    for (const id of ids) {
      const e = this.entities.get(id);
      if (e && (e.disabled_by || e.hidden_by || e.entity_category)) continue;
      out.push(id);
    }
    return out;
  }

  /**
   * Expand a service call target to the concrete entity ids it can affect.
   * `serviceDomain` restricts indirect matches to entities of that domain unless the domain is
   * cross-domain (e.g. `homeassistant.turn_off`). `entity_id: "all"` expands to every entity of the domain.
   */
  resolveTarget(target: HaTarget | undefined, serviceDomain: string): string[] {
    if (!target) return [];
    const result = new Set<string>();
    const domainOk = (id: string) => CROSS_DOMAIN.has(serviceDomain) || domainOf(id) === serviceDomain;

    for (const id of asList(target.entity_id)) {
      if (id === 'all') {
        for (const s of this.states.keys()) if (domainOk(s)) result.add(s);
      } else {
        result.add(id.toLowerCase());
      }
    }

    const areaIds = new Set(asList(target.area_id));
    for (const floor of asList(target.floor_id)) {
      for (const a of this.areas.values()) if (a.floor_id === floor) areaIds.add(a.area_id);
    }
    const deviceIds = new Set(asList(target.device_id));
    const labelIds = new Set(asList(target.label_id));
    if (labelIds.size) {
      for (const a of this.areas.values()) if (a.labels.some((l) => labelIds.has(l))) areaIds.add(a.area_id);
      for (const d of this.devices.values()) if (d.labels.some((l) => labelIds.has(l))) deviceIds.add(d.id);
    }

    if (areaIds.size || deviceIds.size || labelIds.size) {
      for (const id of this.implicitCandidates()) {
        if (!domainOk(id)) continue;
        const e = this.entities.get(id);
        if (
          (e?.device_id && deviceIds.has(e.device_id)) ||
          (areaIds.size && areaIds.has(this.areaOf(id) ?? '')) ||
          (labelIds.size && (e?.labels ?? []).some((l) => labelIds.has(l)))
        ) {
          result.add(id);
        }
      }
    }
    return [...result].sort();
  }

  toEntity(entityId: string): HaEntity | null {
    const s = this.states.get(entityId);
    const e = this.entities.get(entityId);
    if (!s && !e) return null;
    return {
      entity_id: entityId,
      domain: domainOf(entityId),
      name: this.displayName(entityId),
      state: s?.state ?? 'unavailable',
      attributes: s?.attributes ?? {},
      last_changed: s?.last_changed ?? new Date(0).toISOString(),
      last_updated: s?.last_updated ?? new Date(0).toISOString(),
      area_id: this.areaOf(entityId),
      device_id: e?.device_id ?? null,
      placement: this.placementOf(entityId),
      labels: this.labelsOf(entityId),
      entity_category: e?.entity_category ?? null,
      hidden: Boolean(e?.hidden_by),
      platform: e?.platform ?? null,
    };
  }

  /** Search entities by free text (id, name, area name, device name), domain, area, floor, label, device. */
  search(q: {
    q?: string;
    domain?: string;
    area?: string;
    floor?: string;
    label?: string;
    device?: string;
    includeHidden?: boolean;
    limit?: number;
  }): HaEntity[] {
    const text = q.q?.trim().toLowerCase();
    const terms = text ? text.split(/\s+/) : [];
    const out: HaEntity[] = [];
    const ids = [...new Set([...this.states.keys(), ...this.entities.keys()])].sort();
    for (const id of ids) {
      const ent = this.entities.get(id);
      if (ent?.disabled_by) continue;
      if (!q.includeHidden && (ent?.hidden_by || ent?.entity_category)) continue;
      if (q.domain && domainOf(id) !== q.domain) continue;
      const area = this.areaOf(id);
      if (q.area && area !== q.area) continue;
      if (q.floor && this.floorOf(id) !== q.floor) continue;
      if (q.label && !this.labelsOf(id).includes(q.label)) continue;
      if (q.device && ent?.device_id !== q.device) continue;
      if (terms.length) {
        const dev = ent?.device_id ? this.devices.get(ent.device_id) : undefined;
        const hay = [
          id,
          this.displayName(id),
          area ? this.areas.get(area)?.name : '',
          ...(area ? (this.areas.get(area)?.aliases ?? []) : []),
          dev?.name_by_user ?? dev?.name ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!terms.every((t) => hay.includes(t))) continue;
      }
      const entity = this.toEntity(id);
      if (entity) out.push(entity);
      if (out.length >= (q.limit ?? 2000)) break;
    }
    return out;
  }

  /** Compact household overview for system prompts: rooms, then whole-home categories. */
  overview(): string {
    const byArea = new Map<string, Map<string, number>>();
    const config = new Map<string, number>();
    const household = new Map<string, number>();
    for (const id of this.implicitCandidates()) {
      const domain = domainOf(id);
      const placement = this.placementOf(id);
      if (placement === 'room' || placement === 'unassigned') {
        const area = placement === 'room' ? (this.areaOf(id) ?? '_none') : '_none';
        const m = byArea.get(area) ?? new Map<string, number>();
        m.set(domain, (m.get(domain) ?? 0) + 1);
        byArea.set(area, m);
      } else if (placement === 'config') {
        config.set(domain, (config.get(domain) ?? 0) + 1);
      } else if (placement === 'household') {
        household.set(domain, (household.get(domain) ?? 0) + 1);
      }
    }
    const lines: string[] = [];
    const floors = [...this.floors.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    const areaLine = (a: HaArea) => {
      const counts = byArea.get(a.area_id);
      return `  - ${a.name} (area_id: ${a.area_id}): ${counts ? countsText(counts) : 'no entities'}`;
    };
    for (const f of floors) {
      lines.push(`- Floor ${f.name} (floor_id: ${f.floor_id})`);
      for (const a of this.areas.values()) if (a.floor_id === f.floor_id) lines.push(areaLine(a));
    }
    const loose = [...this.areas.values()].filter((a) => !a.floor_id || !this.floors.has(a.floor_id));
    if (loose.length) {
      lines.push('- Areas without floor');
      for (const a of loose) lines.push(areaLine(a));
    }
    const none = byArea.get('_none');
    if (none) lines.push(`- Not assigned to an area: ${countsText(none)}`);
    if (config.size) lines.push(`- Whole-home automations/scenes/scripts: ${countsText(config)}`);
    if (household.size) lines.push(`- Other household entities: ${countsText(household)}`);
    return lines.join('\n');
  }
}
