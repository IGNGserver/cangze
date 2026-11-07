import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/core/errors.ts';
import type { Principal } from '../src/core/principal.ts';
import { FakeHa, FAKE_TOKEN, waitFor } from './fake-ha.ts';
import { harness, type Harness } from './helpers.ts';

let ha: FakeHa;
let h: Harness;

beforeEach(async () => {
  ha = await new FakeHa().start();
  h = await harness();
});

afterEach(async () => {
  await h.s.ha.stop();
  await ha.stop();
});

async function connect() {
  const res = await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
  expect(res.statusCode).toBe(200);
  await waitFor(() => h.s.ha.getStatus().state === 'connected');
}

describe('Home Assistant gateway', () => {
  it('tests connection parameters without saving them', async () => {
    const ok = await h.call('POST', '/api/v1/settings/ha/test', { url: ha.url, token: FAKE_TOKEN });
    expect(ok.json()).toMatchObject({
      ok: true,
      haVersion: '2026.10.0',
      locationName: 'Test Home',
      user: { isAdmin: true },
    });
    const bad = await h.call('POST', '/api/v1/settings/ha/test', { url: ha.url, token: 'x'.repeat(30) });
    expect(bad.json()).toMatchObject({ ok: false });
    expect((await h.call('GET', '/api/v1/settings/ha')).json()).toMatchObject({ url: null, hasToken: false });
  });

  it('connects, mirrors registries and never returns the token', async () => {
    await connect();
    const status = (await h.call('GET', '/api/v1/ha/status')).json();
    expect(status).toMatchObject({ state: 'connected', timeZone: 'Asia/Shanghai', user: { isAdmin: true } });
    expect(status.entityCount).toBe(11);
    const view = (await h.call('GET', '/api/v1/settings/ha')).json();
    expect(view).toMatchObject({ url: ha.url, hasToken: true });
    expect(JSON.stringify(view)).not.toContain(FAKE_TOKEN);
    const areas = (await h.call('GET', '/api/v1/ha/areas')).json();
    expect(areas.map((a: { area_id: string }) => a.area_id)).toContain('living_room');
    const lights = (await h.call('GET', '/api/v1/ha/entities?domain=light&area=living_room')).json().items;
    expect(lights.map((e: { entity_id: string }) => e.entity_id)).toEqual([
      'light.living_ceiling',
      'light.living_lamp',
    ]);
  });

  it('expands area targets to explicit entity ids and audits the call', async () => {
    await connect();
    const res = await h.call('POST', '/api/v1/ha/services/light/turn_on', {
      target: { area_id: 'living_room' },
      data: { brightness: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().entityIds).toEqual(['light.living_ceiling', 'light.living_lamp']);
    expect(ha.calls.at(-1)).toMatchObject({
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: ['light.living_ceiling', 'light.living_lamp'] },
      service_data: { brightness: 100 },
    });
    await waitFor(() => h.s.ha.registry.states.get('light.living_ceiling')?.state === 'on');
    const audit = h.s.audit.query({ limit: 5 });
    expect(audit[0]).toMatchObject({
      principal: 'admin',
      action: 'call_service:light.turn_on',
      decision: 'allowed',
    });
    expect(audit[0]!.haContextId).toBeTruthy();
  });

  it('moves legacy target keys out of service data', async () => {
    await connect();
    await h.call('POST', '/api/v1/ha/services/switch/turn_on', { data: { entity_id: 'switch.coffee' } });
    expect(ha.calls.at(-1)).toMatchObject({ target: { entity_id: ['switch.coffee'] }, service_data: {} });
  });

  it('rejects targets that match nothing', async () => {
    await connect();
    const res = await h.call('POST', '/api/v1/ha/services/light/turn_on', { target: { area_id: 'garage' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('empty_target');
  });

  it('runs write guards before sending and audits denials', async () => {
    await connect();
    h.s.ha.addWriteGuard((req) => {
      if (req.entityIds.includes('lock.front_door'))
        throw new AppError(403, 'policy_denied', 'locks are off limits');
    });
    const res = await h.call('POST', '/api/v1/ha/services/lock/unlock', {
      target: { entity_id: 'lock.front_door' },
    });
    expect(res.statusCode).toBe(403);
    expect(ha.calls.find((c) => c.service === 'unlock')).toBeUndefined();
    expect(h.s.audit.query({ limit: 1 })[0]).toMatchObject({
      decision: 'denied',
      reason: 'locks are off limits',
    });
  });

  it('reports HA service errors', async () => {
    await connect();
    const res = await h.call('POST', '/api/v1/ha/services/light/explode', {
      target: { entity_id: 'light.bedroom' },
    });
    // HA's own rejection is the caller's mistake, not a gateway failure
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ha_not_found');
  });

  it('streams coalesced state changes and emits bus events with context', async () => {
    await connect();
    const seen: string[] = [];
    h.s.bus.on('ha.state_changed', (e) =>
      seen.push(`${e.entityId}:${e.newState?.state}:${e.context.user_id}`),
    );
    ha.humanSet('switch.coffee', 'on');
    await waitFor(() => seen.length > 0);
    expect(seen[0]).toBe('switch.coffee:on:user-human');
    await waitFor(() => h.s.stream.seq('ha:states') > 0);
  });

  it('reconnects after HA drops the connection', async () => {
    await connect();
    const states: string[] = [];
    h.s.bus.on('ha.status', (e) => states.push(e.state));
    ha.dropConnections();
    await waitFor(() => states.includes('disconnected') && states.at(-1) === 'connected', 8000);
    ha.humanSet('light.bedroom', 'on');
    await waitFor(() => h.s.ha.registry.states.get('light.bedroom')?.state === 'on');
  });

  it('restores custom event subscriptions after reconfiguration', async () => {
    await connect();
    let events = 0;
    const off = h.s.ha.onEvent('cangze_test', () => events++);
    await waitFor(() => ha.eventSubscriptionCount('cangze_test') === 1);
    await connect();
    await waitFor(() => ha.eventSubscriptionCount('cangze_test') === 1);
    ha.fireEvent('cangze_test', { value: 1 });
    await waitFor(() => events === 1);
    off();
  });

  it('keeps last-known-good registries when one refresh command fails', async () => {
    await connect();
    const areas = (await h.call('GET', '/api/v1/ha/areas')).json();
    ha.failCommands.add('config/area_registry/list');
    ha.home.areas = [];
    ha.home.floors = ha.home.floors.map((f, i) => (i === 0 ? { ...f, name: 'Updated floor' } : f));
    const before = ha.requests.filter((r) => r === 'config/area_registry/list').length;
    ha.fireEvent('area_registry_updated', {});
    await waitFor(() => ha.requests.filter((r) => r === 'config/area_registry/list').length > before);
    await waitFor(() => [...h.s.ha.registry.floors.values()].some((f) => f.name === 'Updated floor'));
    expect((await h.call('GET', '/api/v1/ha/areas')).json()).toEqual(areas);
  });

  it('marks an invalid token and does not retry', async () => {
    ha.rejectAuth = true;
    await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
    await waitFor(() => h.s.ha.getStatus().state === 'auth_invalid');
  });

  it('renders templates and proxies camera snapshots', async () => {
    await connect();
    expect(await h.s.ha.renderTemplate("{{ states('lock.front_door') }}")).toBe('locked');
    await expect(h.s.ha.renderTemplate('{{ error }}')).rejects.toThrow(/TemplateError/);
    const img = await h.call('GET', '/api/v1/ha/camera/camera.door');
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
  });

  it('refuses raw write commands through query()', async () => {
    await connect();
    await expect(h.s.ha.query({ type: 'call_service', domain: 'light', service: 'turn_on' })).rejects.toThrow(
      /must not be used/,
    );
  });

  it('bounds camera responses and explicit history ranges', async () => {
    await connect();
    ha.cameraContentLength = 26 * 1024 * 1024;
    const camera = await h.call('GET', '/api/v1/ha/camera/camera.door');
    expect(camera.statusCode).toBe(413);
    expect(camera.json().error.code).toBe('camera_too_large');
    ha.cameraContentLength = null;
    ha.cameraBody = Buffer.alloc(26 * 1024 * 1024);
    const streamed = await h.call('GET', '/api/v1/ha/camera/camera.door');
    expect(streamed.statusCode).toBe(413);
    expect(streamed.json().error.code).toBe('camera_too_large');
    ha.cameraBody = null;
    const history = await h.call(
      'GET',
      '/api/v1/ha/history?entityId=light.bedroom&start=2026-01-01T00:00:00.000Z&end=2026-02-02T00:00:00.000Z',
    );
    expect(history.statusCode).toBe(400);
  });

  it('serializes another run entity lease and releases it after the HA response', async () => {
    await connect();
    const one: Principal = { kind: 'session', sessionId: 's1', runId: 'r1' };
    const two: Principal = { kind: 'session', sessionId: 's2', runId: 'r2' };
    ha.serviceDelayMs = 150;
    const first = h.s.ha.callService(one, {
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: 'light.bedroom' },
    });
    await waitFor(() => ha.calls.some((c) => c.target?.entity_id?.includes('light.bedroom')));
    const second = h.s.ha.callService(two, {
      domain: 'light',
      service: 'turn_off',
      target: { entity_id: 'light.bedroom' },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(ha.state('light.bedroom')?.state).toBe('on');
    await Promise.all([first, second]);
    await waitFor(() => ha.state('light.bedroom')?.state === 'off');
  });

  it('returns a bounded conflict while another run owns the entity lease', async () => {
    await connect();
    const one: Principal = { kind: 'session', sessionId: 's1', runId: 'r1' };
    const two: Principal = { kind: 'session', sessionId: 's2', runId: 'r2' };
    ha.serviceDelayMs = 3000;
    const first = h.s.ha.callService(one, {
      domain: 'light',
      service: 'turn_on',
      target: { entity_id: 'light.bedroom' },
    });
    await waitFor(() => ha.calls.length > 0);
    await expect(
      h.s.ha.callService(two, {
        domain: 'light',
        service: 'turn_off',
        target: { entity_id: 'light.bedroom' },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'conflict_entity_busy' });
    ha.serviceDelayMs = 0;
    await first;
    await expect(
      h.s.ha.callService(two, {
        domain: 'light',
        service: 'turn_off',
        target: { entity_id: 'light.bedroom' },
      }),
    ).resolves.toBeDefined();
  });

  it('returns history points', async () => {
    await connect();
    const res = await h.call('GET', '/api/v1/ha/history?entityId=light.bedroom&hours=2');
    expect(res.json()[0]).toMatchObject({ s: 'off' });
  });
});
