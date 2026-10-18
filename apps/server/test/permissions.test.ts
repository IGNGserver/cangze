import { PermissionRule } from '@cangze/contracts';
import { describe, expect, it } from 'vitest';
import {
  canRead,
  effectivePermissions,
  evaluateWrite,
  inTimeWindow,
  ruleMatchesEntity,
} from '../src/modules/agents/permissions.ts';
import { HaRegistry } from '../src/modules/ha/registry.ts';
import { defaultHome } from './fake-ha.ts';

function registry() {
  const h = defaultHome();
  const r = new HaRegistry();
  r.setStates(h.states as never);
  r.setAreas(h.areas);
  r.setFloors(h.floors);
  r.setDevices(h.devices);
  r.setEntities(h.entities as never);
  r.setLabels(h.labels);
  return r;
}

const rule = (r: Partial<PermissionRule> & Pick<PermissionRule, 'access'>): PermissionRule =>
  PermissionRule.parse({ id: Math.random().toString(36).slice(2), targets: {}, ...r });

const write = (domain: string, service: string, entityIds: string[], data: Record<string, unknown> = {}) => ({
  kind: 'service' as const,
  domain,
  service,
  entityIds,
  data,
});

describe('rule matching', () => {
  const reg = registry();
  it('matches globs, domains, areas (via device), floors, devices and labels', () => {
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { entities: ['light.living_*'] } as never }),
        'light.living_lamp',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { domains: ['switch'] } as never }),
        'switch.coffee',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { areas: ['living_room'] } as never }),
        'light.living_lamp',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { floors: ['first'] } as never }),
        'light.bedroom',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { devices: ['dev_lock'] } as never }),
        'lock.front_door',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { labels: ['security'] } as never }),
        'lock.front_door',
        reg,
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntity(
        rule({ access: 'read', targets: { areas: ['bedroom'] } as never }),
        'light.living_lamp',
        reg,
      ),
    ).toBe(false);
  });
});

describe('write evaluation', () => {
  const reg = registry();
  const rules = [
    rule({
      id: 'lights',
      access: 'control',
      targets: { domains: ['light'] } as never,
      services: ['turn_on', 'turn_off'],
      constraints: { numeric: [{ field: 'brightness_pct', min: 0, max: 60 }] } as never,
    }),
    rule({ id: 'no-bedroom', effect: 'deny', access: 'control', targets: { areas: ['bedroom'] } as never }),
    rule({ id: 'notify', access: 'control', targets: { domains: ['notify'] } as never }),
  ];

  it('allows a matching call and reports the rule used', () => {
    expect(
      evaluateWrite(rules, write('light', 'turn_on', ['light.living_lamp'], { brightness_pct: 40 }), reg),
    ).toMatchObject({ allowed: true, ruleIds: ['lights'] });
  });

  it('denies when any entity is not covered (area expansion must not leak)', () => {
    const d = evaluateWrite(rules, write('light', 'turn_on', ['light.living_lamp', 'switch.coffee']), reg);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('switch.coffee');
  });

  it('deny rules win over allow rules', () => {
    const d = evaluateWrite(rules, write('light', 'turn_on', ['light.bedroom']), reg);
    expect(d).toMatchObject({ allowed: false });
    expect(d.reason).toContain('explicitly denied');
  });

  it('restricts services and numeric bounds', () => {
    expect(evaluateWrite(rules, write('light', 'toggle', ['light.living_lamp']), reg).allowed).toBe(false);
    const tooBright = evaluateWrite(
      rules,
      write('light', 'turn_on', ['light.living_lamp'], { brightness_pct: 90 }),
      reg,
    );
    expect(tooBright.allowed).toBe(false);
    expect(tooBright.reason).toContain('brightness_pct=90');
  });

  it('handles target-less services by domain', () => {
    expect(evaluateWrite(rules, write('notify', 'mobile_app_phone', []), reg).allowed).toBe(true);
    expect(evaluateWrite(rules, write('script', 'good_night', []), reg).allowed).toBe(false);
  });

  it('requires configure access for configuration writes', () => {
    const cfg = {
      kind: 'config' as const,
      domain: 'automation',
      service: 'save_config',
      entityIds: [],
      data: {},
    };
    expect(evaluateWrite(rules, cfg, reg).allowed).toBe(false);
    expect(
      evaluateWrite([rule({ access: 'configure', targets: { domains: ['automation'] } as never })], cfg, reg)
        .allowed,
    ).toBe(true);
  });

  it('applies time windows and hourly limits', () => {
    const night = [
      rule({
        id: 'n',
        access: 'control',
        targets: { domains: ['light'] } as never,
        constraints: { timeWindow: { start: '22:00', end: '06:00', days: [] } } as never,
      }),
    ];
    const at = (h: number) => new Date(Date.UTC(2026, 0, 5, h, 30));
    expect(
      evaluateWrite(night, write('light', 'turn_on', ['light.bedroom']), reg, {
        now: at(23),
        timeZone: 'UTC',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateWrite(night, write('light', 'turn_on', ['light.bedroom']), reg, { now: at(3), timeZone: 'UTC' })
        .allowed,
    ).toBe(true);
    expect(
      evaluateWrite(night, write('light', 'turn_on', ['light.bedroom']), reg, {
        now: at(12),
        timeZone: 'UTC',
      }).allowed,
    ).toBe(false);
    const limited = [
      rule({
        id: 'l',
        access: 'control',
        targets: { domains: ['light'] } as never,
        constraints: { maxCallsPerHour: 2 } as never,
      }),
    ];
    expect(
      evaluateWrite(limited, write('light', 'turn_on', ['light.bedroom']), reg, { callsInLastHour: () => 2 })
        .allowed,
    ).toBe(false);
  });

  it('time windows across midnight attribute early hours to the previous day', () => {
    // Monday 03:00 belongs to Sunday's 22:00–06:00 window
    const monday3am = new Date(Date.UTC(2026, 0, 5, 3, 0));
    expect(inTimeWindow({ start: '22:00', end: '06:00', days: [0] }, monday3am, 'UTC')).toBe(true);
    expect(inTimeWindow({ start: '22:00', end: '06:00', days: [1] }, monday3am, 'UTC')).toBe(false);
  });
});

describe('read access and preview', () => {
  const reg = registry();
  it('derives readable and controllable entities', () => {
    const rules = [
      rule({ access: 'read', targets: { domains: ['sensor', 'binary_sensor'] } as never }),
      rule({ access: 'control', targets: { areas: ['living_room'] } as never }),
      rule({ effect: 'deny', access: 'read', targets: { entities: ['climate.living'] } as never }),
    ];
    expect(canRead(rules, 'binary_sensor.hall_motion', reg)).toBe(true);
    expect(canRead(rules, 'lock.front_door', reg)).toBe(false);
    const eff = effectivePermissions(rules, reg);
    expect(eff.control).toEqual([
      'light.living_ceiling',
      'light.living_lamp',
      'sensor.living_lamp_power',
      'sensor.living_temperature',
    ]);
    expect(eff.denied).toEqual(['climate.living']);
    expect(eff.read).toContain('binary_sensor.hall_motion');
  });
});
