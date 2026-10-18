import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { ToolEnv } from '../src/modules/tools/types.ts';
import { waitFor } from './fake-ha.ts';
import { harness, type Harness } from './helpers.ts';

// Runs against a real Home Assistant (the CI `ha-integration` job starts the official container and runs
// scripts/ha-onboard.mjs). Skipped everywhere else.
const url = process.env.CANGZE_REAL_HA_URL;
const token = process.env.CANGZE_REAL_HA_TOKEN;
const HELPER = 'input_boolean.cangze_ci';

// The CI job sets CANGZE_REAL_HA_REQUIRED so that a broken onboarding step cannot pass as "skipped".
it.runIf(process.env.CANGZE_REAL_HA_REQUIRED)('has a real Home Assistant to test against', () => {
  expect(url && token).toBeTruthy();
});

describe.skipIf(!url || !token)('real Home Assistant', () => {
  let h: Harness;

  const tool = async (name: string, params: Record<string, unknown>) => {
    const def = h.s.tools.get(name)!;
    const env = {
      principal: { kind: 'admin', via: 'web' },
      runId: 'run_real_ha',
      model: { input: ['text'] } as unknown as Model<Api>,
    } as ToolEnv;
    return def.execute(env, params as never);
  };

  beforeAll(async () => {
    h = await harness();
    const res = await h.call('PUT', '/api/v1/settings/ha', { url, token, verifyTls: true });
    expect(res.statusCode).toBe(200);
    await waitFor(() => h.s.ha.getStatus().state === 'connected', 30_000);
  }, 60_000);

  afterAll(async () => {
    await h?.s.ha.stop();
  });

  it('connects as an administrator and mirrors the registries', async () => {
    const status = (await h.call('GET', '/api/v1/ha/status')).json();
    expect(status).toMatchObject({ state: 'connected', user: { isAdmin: true } });
    expect(status.haVersion).toMatch(/^\d{4}\.\d+/);
    expect(status.timeZone).toBeTruthy();
    await waitFor(() => h.s.ha.registry.states.has(HELPER), 15_000);
    const helpers = (await h.call('GET', '/api/v1/ha/entities?domain=input_boolean')).json();
    expect(helpers.map((e: { entity_id: string }) => e.entity_id)).toContain(HELPER);
  });

  it('calls services through the gateway, validates them and audits', async () => {
    const before = (await h.call('GET', `/api/v1/ha/entities/${HELPER}`)).json();
    const service = before.state === 'on' ? 'turn_off' : 'turn_on';
    const res = await h.call('POST', `/api/v1/ha/services/input_boolean/${service}`, {
      target: { entity_id: [HELPER] },
    });
    expect(res.statusCode).toBe(200);
    const expected = service === 'turn_on' ? 'on' : 'off';
    // the state change arrives over the event subscription
    await waitFor(() => h.s.ha.registry.states.get(HELPER)?.state === expected, 10_000);

    const invalid = await h.call('POST', '/api/v1/ha/services/input_boolean/turn_on', {
      target: { entity_id: [HELPER] },
      data: { brightness: 10 },
    });
    expect(invalid.statusCode).toBe(400);

    const audit = (await h.call('GET', '/api/v1/audit?limit=10')).json();
    expect(JSON.stringify(audit)).toContain(`input_boolean.${service}`);
  });

  it('reads history and runs the read-only tools', async () => {
    // the recorder commits every second or so
    let points: unknown[] = [];
    for (let i = 0; i < 30 && !points.length; i++) {
      points = (await h.call('GET', `/api/v1/ha/history?entityId=${HELPER}&hours=1`)).json();
      if (!points.length) await new Promise((r) => setTimeout(r, 500));
    }
    expect(points.length).toBeGreaterThan(0);
    expect((await tool('ha_overview', {})).text).toContain('input_boolean');
    expect((await tool('ha_search_entities', { domain: 'input_boolean' })).text).toContain(HELPER);
    expect((await tool('ha_list_services', { domain: 'input_boolean' })).text).toContain('toggle');
    expect((await tool('ha_render_template', { template: '{{ 6 * 7 }}' })).text).toContain('42');
    expect((await tool('ha_list_configs', { kind: 'automation' })).isError).toBeFalsy();
  });
});
