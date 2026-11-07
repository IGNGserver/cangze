import { describe, expect, it } from 'vitest';
import { HaRegistry } from '../src/modules/ha/registry.ts';
import { extendedHome } from './fake-ha.ts';

function registry() {
  const h = extendedHome();
  const r = new HaRegistry();
  r.setStates(h.states as never);
  r.setAreas(h.areas);
  r.setFloors(h.floors);
  r.setDevices(h.devices);
  r.setEntities(h.entities as never);
  r.setLabels(h.labels);
  return r;
}

describe('target expansion', () => {
  const r = registry();

  it('keeps explicit entity ids', () => {
    expect(r.resolveTarget({ entity_id: 'light.bedroom' }, 'light')).toEqual(['light.bedroom']);
  });

  it('expands an area to entities of the service domain, including via devices', () => {
    expect(r.resolveTarget({ area_id: 'living_room' }, 'light')).toEqual([
      'light.living_ceiling',
      'light.living_lamp',
    ]);
  });

  it('skips diagnostic entities for indirect targets', () => {
    expect(r.resolveTarget({ device_id: 'dev_lamp' }, 'sensor')).toEqual([]);
    expect(r.resolveTarget({ device_id: 'dev_lamp' }, 'light')).toEqual(['light.living_lamp']);
  });

  it('expands floors and labels', () => {
    expect(r.resolveTarget({ floor_id: 'first' }, 'light')).toEqual(['light.bedroom']);
    expect(r.resolveTarget({ label_id: 'favorite' }, 'switch')).toEqual(['switch.coffee']);
    // device label reaches the device's entities
    expect(r.resolveTarget({ label_id: 'security' }, 'lock')).toEqual(['lock.front_door']);
    // area label reaches the area's entities
    expect(r.resolveTarget({ label_id: 'quiet' }, 'light')).toEqual(['light.bedroom']);
  });

  it('treats homeassistant.* as cross-domain', () => {
    expect(r.resolveTarget({ area_id: 'living_room' }, 'homeassistant')).toEqual([
      'climate.living',
      'light.living_ceiling',
      'light.living_lamp',
      'sensor.living_temperature',
    ]);
  });

  it('expands entity_id "all" within the domain', () => {
    expect(r.resolveTarget({ entity_id: 'all' }, 'light')).toEqual([
      'light.bedroom',
      'light.living_ceiling',
      'light.living_lamp',
    ]);
  });

  it('recursively expands core and domain groups to deduplicated leaves', () => {
    const local = registry();
    local.states.set('light.upstairs', {
      entity_id: 'light.upstairs',
      state: 'on',
      attributes: { entity_id: ['light.bedroom', 'light.living_lamp'] },
      last_changed: '',
      last_updated: '',
    });
    local.states.set('group.audit_lights', {
      entity_id: 'group.audit_lights',
      state: 'on',
      attributes: { entity_id: ['light.upstairs', 'light.bedroom'] },
      last_changed: '',
      last_updated: '',
    });
    expect(local.resolveTarget({ entity_id: 'group.audit_lights' }, 'homeassistant')).toEqual([
      'light.bedroom',
      'light.living_lamp',
    ]);
    // Scenes keep their indirect-action semantics even when they carry member ids.
    local.states.set('scene.movie', {
      entity_id: 'scene.movie',
      state: 'unknown',
      attributes: { entity_id: ['light.bedroom'] },
      last_changed: '',
      last_updated: '',
    });
    expect(local.resolveTarget({ entity_id: 'scene.movie' }, 'scene')).toEqual(['scene.movie']);
  });

  it('rejects cyclic groups instead of issuing an indirect group write', () => {
    const local = registry();
    for (const [id, member] of [
      ['group.a', 'group.b'],
      ['group.b', 'group.a'],
    ] as const) {
      local.states.set(id, {
        entity_id: id,
        state: 'on',
        attributes: { entity_id: [member] },
        last_changed: '',
        last_updated: '',
      });
    }
    expect(() => local.resolveTarget({ entity_id: 'group.a' }, 'homeassistant')).toThrow(/cycle/);
  });
});

describe('entity placement', () => {
  const r = registry();

  it('separates room devices from config, service and household entities', () => {
    expect(r.placementOf('light.living_ceiling')).toBe('room');
    expect(r.placementOf('light.living_lamp')).toBe('room');
    expect(r.placementOf('camera.door')).toBe('unassigned');
    expect(r.placementOf('script.good_night')).toBe('config');
    expect(r.placementOf('automation.sunset_lights')).toBe('config');
    expect(r.placementOf('scene.movie')).toBe('config');
    expect(r.placementOf('tts.google_translate_en_com')).toBe('integration');
    expect(r.placementOf('person.cangze')).toBe('household');
  });

  it('keeps service devices out of rooms', () => {
    expect(r.toEntity('tts.google_translate_en_com')?.placement).toBe('integration');
  });
});

describe('search and overview', () => {
  const r = registry();

  it('finds entities by area alias and name terms', () => {
    expect(r.search({ q: 'lounge lamp' }).map((e) => e.entity_id)).toEqual(['light.living_lamp']);
    expect(r.search({ domain: 'light', floor: 'ground' }).map((e) => e.entity_id)).toEqual([
      'light.living_ceiling',
      'light.living_lamp',
    ]);
  });

  it('hides diagnostic entities unless asked', () => {
    expect(r.search({ q: 'power' })).toHaveLength(0);
    expect(r.search({ q: 'power', includeHidden: true })).toHaveLength(1);
  });

  it('does not silently truncate large homes when no limit was requested', () => {
    const local = new HaRegistry();
    local.setStates(
      Array.from({ length: 2001 }, (_, i) => ({
        entity_id: `sensor.item_${String(i).padStart(4, '0')}`,
        state: 'on',
        attributes: {},
        last_changed: '',
        last_updated: '',
      })),
    );
    expect(local.search({})).toHaveLength(2001);
    expect(local.search({ limit: 2000 })).toHaveLength(2000);
  });

  it('summarizes rooms and keeps config entities out of the unassigned bucket', () => {
    const text = r.overview();
    expect(text).toContain('Floor Ground floor (floor_id: ground)');
    expect(text).toContain('Living room (area_id: living_room): climate×1, light×2, sensor×1');
    expect(text).toContain('Not assigned to an area: camera×1');
    expect(text).toContain('Whole-home automations/scenes/scripts: automation×1, scene×1, script×1');
    expect(text).toContain('Other household entities: person×1');
    expect(text).not.toMatch(/Not assigned to an area:.*script/);
    expect(text).not.toContain('tts×');
  });
});
