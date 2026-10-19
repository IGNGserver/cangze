import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxProviderHandle,
  type Usage,
} from '@earendil-works/pi-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHa, FAKE_TOKEN, waitFor } from './fake-ha.ts';
import { harness, type Harness } from './helpers.ts';

let h: Harness;
let ha: FakeHa;
let faux: FauxProviderHandle;

beforeEach(async () => {
  ha = await new FakeHa().start();
  h = await harness();
  faux = fauxProvider({ provider: 'faux', models: [{ id: 'm1', contextWindow: 8000, maxTokens: 1000 }] });
  h.s.providers.models.setProvider(faux.provider);
  h.s.db
    .prepare(
      "INSERT INTO providers (id, kind, builtin_id, name, base_url, secret_id, config, enabled, created_at, updated_at) VALUES ('faux', 'builtin', 'faux', 'Faux', NULL, NULL, '{}', 1, 0, 0)",
    )
    .run();
  h.s.providers.defaults.set({ chat: 'faux/m1', utility: 'faux/m1', thinkingLevel: 'off' });
  await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
  await waitFor(() => h.s.ha.getStatus().state === 'connected');
});

afterEach(async () => {
  vi.restoreAllMocks();
  h.s.scheduler.stop();
  h.s.runs.stop();
  h.s.sessions.abortAll();
  await h.s.ha.stop();
  await ha.stop();
});

const LIVING_LIGHTS = {
  name: 'Evening lights',
  description: 'Keeps the living room cosy in the evening',
  instructions: 'Turn on the living room lights when asked.',
  tools: ['ha_search_entities', 'ha_get_states', 'ha_call_service', 'memory_write'],
  permissions: [
    { id: 'read-sensors', access: 'read', targets: { domains: ['binary_sensor'] } },
    {
      id: 'living-lights',
      access: 'control',
      targets: { areas: ['living_room'], domains: [] },
      services: ['turn_on', 'turn_off'],
    },
  ],
  triggers: [],
};

async function createAgent(def: Record<string, unknown> = LIVING_LIGHTS) {
  const res = await h.call('POST', '/api/v1/agents', { definition: def });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

async function runToEnd(runId: string) {
  await waitFor(
    () => ['succeeded', 'failed', 'aborted', 'skipped'].includes(h.s.runs.get(runId).status),
    10_000,
  );
  return h.s.runs.get(runId);
}

describe('subagents', () => {
  it('refuses daily budgets on unknown-price models without issuing a request', async () => {
    h.s.db
      .prepare("UPDATE providers SET kind = 'custom', config = ? WHERE id = 'faux'")
      .run(JSON.stringify({ api: 'openai-completions', models: [{ id: 'm1' }] }));
    const agent = await createAgent({ ...LIVING_LIGHTS, limits: { dailyCostLimit: 1 } });
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    expect(await runToEnd(run.id)).toMatchObject({
      status: 'skipped',
      error: expect.stringContaining('unknown is not free'),
    });
  });

  it('checks settled daily cost before executing a model-requested device write', async () => {
    const agent = await createAgent({ ...LIVING_LIGHTS, limits: { dailyCostLimit: 0.01 } });
    faux.setResponses([
      (ctx) => {
        h.s.db
          .prepare(
            "INSERT INTO usage_ledger (day, principal_kind, principal_id, provider, model, requests, input, output, cache_read, cache_write, cost) VALUES (?, 'agent', ?, 'faux', 'm1', 1, 1, 1, 0, 0, 0.02)",
          )
          .run(new Date().toISOString().slice(0, 10), agent.id);
        expect(ctx.messages.length).toBeGreaterThan(0);
        return fauxAssistantMessage(
          [
            fauxToolCall('ha_call_service', {
              domain: 'light',
              service: 'turn_on',
              target: { entity_id: ['light.living_lamp'] },
            }),
          ],
          { stopReason: 'toolUse' },
        );
      },
    ]);
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    expect(await runToEnd(run.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('daily cost limit'),
    });
    expect(ha.calls).toHaveLength(0);
  });

  it('refuses a budget after earlier unknown-price usage even with a known-price model', async () => {
    const agent = await createAgent({ ...LIVING_LIGHTS, limits: { dailyCostLimit: 1 } });
    h.s.usage.record(
      'agent',
      agent.id,
      'faux',
      'm1',
      { input: 10, cost: { total: 0 } } as Usage,
      new Date(),
      false,
    );
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    expect(await runToEnd(run.id)).toMatchObject({
      status: 'skipped',
      error: expect.stringContaining('earlier unknown-price usage'),
    });
    const rows = (await h.call('GET', '/api/v1/usage')).json();
    expect(rows.find((r: any) => r.principalId === agent.id)).toMatchObject({
      requests: 1,
      unknownRequests: 1,
      cost: 0,
    });
  });

  it('checks settled summary costs before the next summary request', async () => {
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      contextMode: 'continuous',
      limits: { dailyCostLimit: 0.01 },
    });
    const conv = h.s.agents.row(agent.id).conversation_id;
    let parent: string | null = null;
    for (let i = 0; i < 7; i++)
      parent = h.s.conversations.append(
        conv,
        parent,
        'message',
        { message: { role: 'user', content: 'x'.repeat(3000), timestamp: i } },
        { role: 'user' },
      ).id;
    let requests = 0;
    const complete = h.s.providers.models.completeSimple.bind(h.s.providers.models);
    vi.spyOn(h.s.providers.models, 'completeSimple').mockImplementationOnce(async (...args) => {
      const response = await complete(...args);
      return {
        ...response,
        usage: {
          ...response.usage,
          cost: { input: 0.02, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.02 },
        },
      };
    });
    faux.setResponses([
      () => {
        requests++;
        return fauxAssistantMessage('Summary');
      },
    ]);
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    expect(await runToEnd(run.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('daily cost limit'),
      usage: { cost: 0.02 },
    });
    expect(requests).toBe(1);
    expect(h.s.usage.query(1).find((r) => r.principal_id === agent.id)?.cost).toBe(0.02);
    expect(h.s.providers.models.completeSimple).toHaveBeenCalledTimes(1);
    expect(h.s.conversations.activePath(conv).some((e) => e.kind === 'compaction')).toBe(false);
    expect(ha.calls).toHaveLength(0);
  });

  it('compacts continuous context and keeps it compacted through subsequent tool turns', async () => {
    const agent = await createAgent({ ...LIVING_LIGHTS, contextMode: 'continuous' });
    const conv = h.s.agents.row(agent.id).conversation_id;
    let parent: string | null = null;
    for (let i = 0; i < 7; i++) {
      parent = h.s.conversations.append(
        conv,
        parent,
        'message',
        {
          message: { role: 'user', content: `historical-${i} ${'x'.repeat(3000)}`, timestamp: i },
        },
        { role: 'user' },
      ).id;
    }
    let summaries = 0;
    const respond = (ctx: any) => {
      if (JSON.stringify(ctx).includes('You compress conversations')) {
        summaries++;
        return fauxAssistantMessage('Historical summary, no device actions pending.');
      }
      expect(JSON.stringify(ctx.messages)).toContain('Historical summary');
      expect(JSON.stringify(ctx.messages)).not.toContain('historical-0');
      if (ctx.messages.some((m: any) => m.role === 'toolResult')) return fauxAssistantMessage('Finished.');
      return fauxAssistantMessage([fauxToolCall('ha_search_entities', {})], { stopReason: 'toolUse' });
    };
    faux.setResponses(Array.from({ length: 10 }, () => respond));
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    const outcome = await runToEnd(run.id);
    expect(outcome, outcome.error ?? '').toMatchObject({ status: 'succeeded', summary: 'Finished.' });
    expect(h.s.conversations.activePath(conv).filter((e) => e.kind === 'compaction')).toHaveLength(1);
    expect(summaries).toBeGreaterThan(1);
    expect(h.s.usage.query(1).find((u) => u.principal_id === agent.id)?.requests).toBe(summaries + 2);
  });

  it('runs a task with permitted controls and records everything', async () => {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall('ha_call_service', {
            domain: 'light',
            service: 'turn_on',
            target: { area_id: ['living_room'] },
          }),
        ],
        { stopReason: 'toolUse' },
      ),
      fauxAssistantMessage('Living room lights are on.'),
    ]);
    const agent = await createAgent();
    const run = (await h.call('POST', `/api/v1/agents/${agent.id}/run`, { task: 'lights on please' })).json();
    const done = await runToEnd(run.id);
    expect(done).toMatchObject({ status: 'succeeded', summary: 'Living room lights are on.' });
    expect(ha.calls.at(-1)).toMatchObject({
      target: { entity_id: ['light.living_ceiling', 'light.living_lamp'] },
    });
    const audit = h.s.audit.query({ agentId: agent.id, limit: 1 })[0]!;
    expect(audit).toMatchObject({ principal: `agent:${agent.id}@1`, decision: 'allowed', runId: run.id });
    const detail = (await h.call('GET', `/api/v1/runs/${run.id}`)).json();
    expect(detail.entries.map((e: any) => e.role)).toEqual(['user', 'assistant', 'toolResult', 'assistant']);
  });

  it('denies writes outside the rules and hides unreadable entities', async () => {
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ha_search_entities', {})], { stopReason: 'toolUse' }),
      (ctx) => {
        const result = (ctx.messages.at(-1) as any).content[0].text as string;
        expect(result).toContain('binary_sensor.hall_motion');
        expect(result).not.toContain('lock.front_door');
        return fauxAssistantMessage(
          [
            fauxToolCall('ha_call_service', {
              domain: 'lock',
              service: 'unlock',
              target: { entity_id: ['lock.front_door'] },
            }),
          ],
          {
            stopReason: 'toolUse',
          },
        );
      },
      (ctx) => {
        const last = ctx.messages.at(-1) as any;
        expect(last.isError).toBe(true);
        expect(last.content[0].text).toContain('policy_denied');
        return fauxAssistantMessage('I am not allowed to unlock the door.');
      },
    ]);
    const agent = await createAgent();
    const run = (await h.call('POST', `/api/v1/agents/${agent.id}/run`, { task: 'unlock' })).json();
    expect((await runToEnd(run.id)).status).toBe('succeeded');
    expect(ha.calls.find((c) => c.service === 'unlock')).toBeUndefined();
    expect(h.s.audit.query({ agentId: agent.id, limit: 1 })[0]).toMatchObject({ decision: 'denied' });
  });

  it('refuses to grant management tools and rejects stale revisions', async () => {
    const bad = await h.call('POST', '/api/v1/agents', {
      definition: { ...LIVING_LIGHTS, tools: ['agent_create'] },
    });
    expect(bad.statusCode).toBe(400);
    const agent = await createAgent();
    const ok = await h.call('PUT', `/api/v1/agents/${agent.id}`, {
      baseRevision: 1,
      definition: { ...LIVING_LIGHTS, description: 'v2' },
    });
    expect(ok.json().revision).toBe(2);
    const stale = await h.call('PUT', `/api/v1/agents/${agent.id}`, {
      baseRevision: 1,
      definition: { ...LIVING_LIGHTS, description: 'v2b' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: 'revision_conflict', details: { currentRevision: 2 } });
    expect((await h.call('GET', `/api/v1/agents/${agent.id}/revisions`)).json()).toHaveLength(2);
  });

  it('lets a main session create a subagent, dispatch a task and receive the report', async () => {
    // Session replies, title generation and the agent run happen concurrently: route by context.
    const route = (ctx: any) => {
      const system = JSON.stringify(ctx.messages[0]);
      if (system.includes('short title')) return fauxAssistantMessage('Agent setup');
      if (system.includes('You are a background agent')) return fauxAssistantMessage('Hall motion is off.');
      const last = ctx.messages.at(-1);
      if (last.role === 'user' && JSON.stringify(last).includes('task report'))
        return fauxAssistantMessage('The task is complete.');
      if (last.role === 'user')
        return fauxAssistantMessage([fauxToolCall('agent_create', { definition: LIVING_LIGHTS as never })], {
          stopReason: 'toolUse',
        });
      if (last.role === 'toolResult' && last.toolName === 'agent_create') {
        const id = /id (agt_[a-z0-9]+)/.exec(last.content[0].text)![1]!;
        return fauxAssistantMessage(
          [fauxToolCall('agent_run', { agent: id, task: 'Report the hall motion state' })],
          { stopReason: 'toolUse' },
        );
      }
      return fauxAssistantMessage('I asked the agent.');
    };
    faux.setResponses(Array.from({ length: 8 }, () => route));
    const sid = (await h.call('POST', '/api/v1/sessions', {})).json().id;
    await h.call('POST', `/api/v1/sessions/${sid}/messages`, {
      text: 'create an agent and ask it about motion',
    });
    await waitFor(() => {
      const d = h.s.sessions.get(sid);
      return d.entries.some((e) => e.kind === 'notice');
    }, 10_000);
    const notice = h.s.sessions.get(sid).entries.find((e) => e.kind === 'notice')!;
    expect(notice.data).toMatchObject({ level: 'report', body: 'Hall motion is off.', forModel: true });
    expect(h.s.agents.rows()).toHaveLength(1);
    expect(h.s.agents.revisions(h.s.agents.rows()[0]!.id)[0]!.createdBy).toBe(`session:${sid}`);
  });

  it('fires on state changes but never on its own changes', async () => {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall('ha_call_service', {
            domain: 'light',
            service: 'turn_on',
            target: { entity_id: ['light.living_lamp'] },
          }),
        ],
        {
          stopReason: 'toolUse',
        },
      ),
      fauxAssistantMessage('Motion detected, lamp on.'),
    ]);
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      triggers: [
        { id: 'motion', kind: 'ha_state', entityIds: ['binary_sensor.hall_motion'], to: 'on' },
        { id: 'lamp', kind: 'ha_state', entityIds: ['light.living_lamp'] },
      ],
    });
    ha.setState('light.living_lamp', 'off', undefined, { id: 'ctx-x', user_id: null, parent_id: null });
    await new Promise((r) => setTimeout(r, 50));
    const before = h.s.runs.list({ agentId: agent.id }).length;
    ha.setState('binary_sensor.hall_motion', 'on', undefined, {
      id: 'ctx-motion',
      user_id: null,
      parent_id: null,
    });
    await waitFor(() => h.s.runs.list({ agentId: agent.id }).length === before + 1);
    const run = h.s.runs.list({ agentId: agent.id })[0]!;
    expect(run.triggerId).toBe('motion');
    await runToEnd(run.id);
    await new Promise((r) => setTimeout(r, 300));
    // the lamp changed because of the agent itself: the "lamp" trigger must not fire
    expect(
      h.s.runs.list({ agentId: agent.id }).filter((r) => r.triggerId === 'lamp' && r.queuedAt > run.queuedAt),
    ).toHaveLength(0);
  });

  it('leaves entities alone that a person just changed', async () => {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall('ha_call_service', {
            domain: 'light',
            service: 'turn_off',
            target: { entity_id: ['light.living_lamp'] },
          }),
        ],
        {
          stopReason: 'toolUse',
        },
      ),
      (ctx) => {
        expect((ctx.messages.at(-1) as any).content[0].text).toContain('conflict_manual');
        return fauxAssistantMessage('A person changed it, leaving it.');
      },
    ]);
    const agent = await createAgent();
    ha.humanSet('light.living_lamp', 'on');
    await waitFor(() => h.s.coordination.lastManualChange('light.living_lamp') !== null);
    const run = (await h.call('POST', `/api/v1/agents/${agent.id}/run`, {})).json();
    await runToEnd(run.id);
    expect(ha.calls.find((c) => c.service === 'turn_off')).toBeUndefined();
    expect(h.s.audit.query({ agentId: agent.id, limit: 1 })[0]).toMatchObject({ decision: 'conflict' });
  });

  it('remembers across runs and manages memory through the API', async () => {
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('memory_write', { title: 'Preference', content: 'Lamp at 40%' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('Noted.'),
      (ctx) => {
        expect(JSON.stringify(ctx.messages[0])).toContain('Lamp at 40%');
        return fauxAssistantMessage('I remember.');
      },
    ]);
    const agent = await createAgent();
    await runToEnd((await h.call('POST', `/api/v1/agents/${agent.id}/run`, {})).json().id);
    const memory = (await h.call('GET', `/api/v1/agents/${agent.id}/memory`)).json();
    expect(memory[0]).toMatchObject({ title: 'Preference', content: 'Lamp at 40%' });
    await runToEnd((await h.call('POST', `/api/v1/agents/${agent.id}/run`, {})).json().id);
    await h.call('DELETE', `/api/v1/agents/${agent.id}/memory/${memory[0].id}`);
    expect((await h.call('GET', `/api/v1/agents/${agent.id}/memory`)).json()).toEqual([]);
  });

  it('schedules cron triggers and skips overlapping runs', async () => {
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      triggers: [{ id: 'morning', kind: 'cron', expression: '0 7 * * *' }],
    });
    const upcoming = (await h.call('GET', '/api/v1/scheduler/upcoming')).json();
    expect(upcoming[0]).toMatchObject({ agentId: agent.id, triggerId: 'morning', kind: 'cron' });
    const detail = (await h.call('GET', `/api/v1/agents/${agent.id}`)).json();
    expect(detail.triggers[0].nextFireAt).toBeTruthy();
    const badCron = await h.call('PUT', `/api/v1/agents/${agent.id}`, {
      baseRevision: 1,
      definition: { ...LIVING_LIGHTS, triggers: [{ id: 'x', kind: 'cron', expression: 'not a cron' }] },
    });
    expect(badCron.statusCode).toBe(400);
  });

  it('arms a native Home Assistant trigger after the connection becomes ready', async () => {
    await h.s.ha.stop();
    await h.call('DELETE', '/api/v1/settings/ha');
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      permissions: [{ id: 'all', access: 'read', targets: { all: true } }],
      triggers: [{ id: 'sunset', kind: 'ha_trigger', trigger: { platform: 'sun', event: 'sunset' } }],
    });
    expect(h.s.scheduler.triggerStates(agent.id)[0]).toMatchObject({ error: 'waiting for Home Assistant' });
    await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
    await waitFor(() => h.s.ha.connected);
    await waitFor(() => h.s.scheduler.triggerStates(agent.id)[0]?.error === null);
  });

  it('always returns complete numeric usage for newly queued runs', async () => {
    const agent = await createAgent();
    h.s.runs.stop();
    const run = (await h.call('POST', `/api/v1/agents/${agent.id}/run`, {})).json();
    expect(run.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
  });

  it('normalizes legacy partial usage instead of exposing nulls', async () => {
    const agent = await createAgent();
    h.s.runs.stop();
    const run = (await h.call('POST', `/api/v1/agents/${agent.id}/run`, {})).json();
    h.s.db.prepare('UPDATE runs SET usage = ? WHERE id = ?').run('{"cost":null}', run.id);
    expect(h.s.runs.get(run.id).usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
  });

  it('previews effective permissions', async () => {
    const agent = await createAgent();
    const eff = (await h.call('GET', `/api/v1/agents/${agent.id}/permissions`)).json();
    expect(eff.control).toEqual(
      expect.arrayContaining(['light.living_ceiling', 'light.living_lamp', 'climate.living']),
    );
    expect(eff.control).not.toContain('lock.front_door');
    expect(eff.read).toContain('binary_sensor.hall_motion');
  });

  it('consumes an overdue schedule once and preserves interval deadlines on resync', async () => {
    h.s.runs.stop();
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      triggers: [{ id: 'timer', kind: 'interval', minutes: 10 }],
      limits: { misfire: 'run_once' },
    });
    h.s.scheduler.stop();
    h.s.db
      .prepare('UPDATE trigger_state SET next_fire_at = ? WHERE agent_id = ?')
      .run(Date.now() - 3600000, agent.id);
    h.s.scheduler.start();
    expect(h.s.runs.list({ agentId: agent.id })).toHaveLength(1);
    const next = h.s.scheduler.nextFire(agent.id);
    h.s.scheduler.syncAll();
    expect(h.s.scheduler.nextFire(agent.id)).toBe(next);
    h.s.scheduler.stop();
    h.s.scheduler.start();
    expect(h.s.runs.list({ agentId: agent.id })).toHaveLength(1);
  });

  it('cancels queued automatic tasks when disabled and all tasks on emergency stop', async () => {
    const agent = await createAgent();
    h.s.runs.stop();
    const automatic = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'cron' });
    const manual = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' });
    h.s.agents.setEnabled(agent.id, false);
    expect(h.s.runs.get(automatic.id).status).toBe('aborted');
    expect(h.s.runs.get(manual.id).status).toBe('queued');
    h.s.runs.emergencyStop(agent.id);
    expect(h.s.runs.get(manual.id).status).toBe('aborted');
    expect(() => h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' })).toThrow(/emergency stopped/);
    h.s.agents.setEnabled(agent.id, true);
    expect(h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual' }).status).toBe('queued');
  });

  it('does not send unreadable state-trigger data to a run', async () => {
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      permissions: [],
      triggers: [{ id: 'secret', kind: 'ha_state', entityIds: ['lock.front_door'] }],
    });
    ha.humanSet('lock.front_door', 'unlocked');
    await new Promise((r) => setTimeout(r, 100));
    expect(h.s.runs.list({ agentId: agent.id })).toHaveLength(0);
  });

  it('cancels duration waits even if leaving the state does not match from', async () => {
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      triggers: [
        {
          id: 'hold',
          kind: 'ha_state',
          entityIds: ['light.living_lamp'],
          from: 'off',
          to: 'on',
          forSeconds: 1,
        },
      ],
    });
    const ctx = { id: 'hold', user_id: null, parent_id: null };
    ha.setState('light.living_lamp', 'off', undefined, ctx);
    ha.setState('light.living_lamp', 'on', undefined, ctx);
    await new Promise((r) => setTimeout(r, 200));
    ha.setState('light.living_lamp', 'unavailable', undefined, ctx);
    ha.setState('light.living_lamp', 'on', undefined, ctx);
    await new Promise((r) => setTimeout(r, 1000));
    expect(h.s.runs.list({ agentId: agent.id })).toHaveLength(0);
  });

  it('restores a persisted state duration wait without restarting its deadline', async () => {
    h.s.runs.stop();
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      triggers: [
        { id: 'hold', kind: 'ha_state', entityIds: ['light.living_lamp'], to: 'off', forSeconds: 1 },
      ],
    });
    ha.setState('light.living_lamp', 'off', undefined, { id: 'persistent', user_id: null, parent_id: null });
    await waitFor(() =>
      Boolean(h.s.db.prepare('SELECT 1 FROM trigger_waits WHERE agent_id = ?').get(agent.id)),
    );
    h.s.scheduler.stop();
    h.s.db.prepare('UPDATE trigger_waits SET deadline = ? WHERE agent_id = ?').run(Date.now() - 1, agent.id);
    h.s.scheduler.start();
    await waitFor(() => h.s.runs.list({ agentId: agent.id }).length === 1);
    expect(h.s.db.prepare('SELECT 1 FROM trigger_waits WHERE agent_id = ?').get(agent.id)).toBeUndefined();
  });

  it('denies indirect HA actions even when a script entity is otherwise granted', async () => {
    const agent = await createAgent({
      ...LIVING_LIGHTS,
      permissions: [{ id: 'script', access: 'control', targets: { domains: ['script'] } }],
    });
    await expect(
      h.s.ha.callService(
        { kind: 'agent', agentId: agent.id, revision: 1, runId: 'test' },
        { domain: 'script', service: 'turn_on', target: { entity_id: ['script.good_night'] } },
      ),
    ).rejects.toMatchObject({ code: 'policy_denied' });
    expect(ha.calls).toHaveLength(0);
  });

  it('reports admission failures and automatically continues the requesting session once', async () => {
    const sid = h.s.sessions.create({ title: 'Report receiver' }).id;
    const agent = await createAgent();
    h.s.providers.defaults.set({ chat: null, utility: null, thinkingLevel: 'off' });
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual', reportSessionId: sid });
    expect(run.status).toBe('failed');
    await waitFor(() => h.s.sessions.get(sid).entries.some((e) => e.kind === 'notice'));
    expect(h.s.notifications.list({}).filter((n) => n.data.runId === run.id)).toHaveLength(1);
    h.s.runs.start();
    expect(h.s.notifications.list({}).filter((n) => n.data.runId === run.id)).toHaveLength(1);
  });

  it('continues an idle main session when the subagent report arrives', async () => {
    faux.setResponses([
      fauxAssistantMessage('Task result'),
      (ctx) => {
        expect(JSON.stringify(ctx.messages)).toContain('Task result');
        return fauxAssistantMessage('I used the report to complete your request.');
      },
    ]);
    const sid = h.s.sessions.create({ title: 'Report receiver' }).id;
    const agent = await createAgent();
    h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual', reportSessionId: sid });
    await waitFor(() =>
      h.s.sessions.get(sid).entries.some((e) => JSON.stringify(e.data).includes('I used the report')),
    );
    expect(h.s.sessions.get(sid).entries.filter((e) => e.kind === 'notice')).toHaveLength(1);
  });

  it('delivers but does not wake a session after the user stops it', async () => {
    const sid = h.s.sessions.create({ title: 'Stopped receiver' }).id;
    h.s.sessions.abort(sid);
    h.s.sessions.receiveReport(sid, 'run_stopped', {
      level: 'report',
      title: 'Report',
      body: 'Done',
      forModel: true,
    });
    await waitFor(() => h.s.sessions.get(sid).entries.some((e) => e.kind === 'notice'));
    expect(h.s.sessions.isRunning(sid)).toBe(false);
    expect(h.s.sessions.get(sid).entries).toHaveLength(1);
  });

  it('queues reports behind an active reply and delivers duplicates only once', async () => {
    const slow = fauxProvider({
      provider: 'faux',
      models: [{ id: 'm1', contextWindow: 16000, maxTokens: 1000 }],
      tokensPerSecond: 30,
    });
    h.s.providers.models.setProvider(slow.provider);
    slow.setResponses([
      fauxAssistantMessage('Working on the original request.'),
      fauxAssistantMessage('Continued with the report.'),
    ]);
    const sid = h.s.sessions.create({ title: 'Busy receiver' }).id;
    await h.s.sessions.send(sid, { text: 'Begin', images: [], whenBusy: 'steer' });
    const report = { level: 'report' as const, title: 'Result', body: 'Task result', forModel: true };
    h.s.sessions.receiveReport(sid, 'run_duplicate', report);
    h.s.sessions.receiveReport(sid, 'run_duplicate', report);
    expect(h.s.sessions.get(sid).entries.some((e) => e.kind === 'notice')).toBe(false);
    await waitFor(() =>
      h.s.sessions.get(sid).entries.some((e) => JSON.stringify(e.data).includes('Continued with the report')),
    );
    expect(h.s.sessions.get(sid).entries.filter((e) => e.kind === 'notice')).toHaveLength(1);
  });

  it('delivers reports to archived sessions without starting a reply', async () => {
    const sid = h.s.sessions.create({ title: 'Archived receiver' }).id;
    h.s.sessions.update(sid, { archived: true });
    h.s.sessions.receiveReport(sid, 'run_archived', {
      level: 'report',
      title: 'Result',
      body: 'Done',
      forModel: true,
    });
    await waitFor(() => h.s.sessions.get(sid).entries.length === 1);
    expect(h.s.sessions.isRunning(sid)).toBe(false);
    expect(h.s.usage.query(1)).toHaveLength(0);
  });

  it('keeps a delivered report after restart without replaying its continuation', async () => {
    const sid = h.s.sessions.create({ title: 'Crash window' }).id;
    h.s.sessions.addNotice(sid, {
      level: 'report',
      title: 'Result',
      body: 'Already delivered',
      forModel: true,
    });
    h.s.db
      .prepare('INSERT INTO session_reports (run_id, session_id, notice, delivered_at) VALUES (?, ?, ?, ?)')
      .run('run_delivered', sid, '{}', Date.now());
    h.s.db.prepare('INSERT INTO session_continuations (session_id, count) VALUES (?, 1)').run(sid);
    h.s.sessions.abortAll();
    h.s.sessions.resumeReports();
    await new Promise((r) => setTimeout(r, 30));
    expect(h.s.sessions.get(sid).entries).toHaveLength(1);
    expect(h.s.sessions.isRunning(sid)).toBe(false);
    expect(h.s.usage.query(1)).toHaveLength(0);
  });

  it('bounds automatic report continuations and resumes pending reports after restart', async () => {
    const sid = h.s.sessions.create({ title: 'Bounded receiver' }).id;
    h.s.db.prepare('INSERT INTO session_continuations (session_id, count) VALUES (?, 8)').run(sid);
    h.s.sessions.abortAll();
    h.s.sessions.receiveReport(sid, 'run_pending', {
      level: 'report',
      title: 'Result',
      body: 'Pending report',
      forModel: true,
    });
    h.s.sessions.resumeReports();
    await waitFor(() => h.s.sessions.get(sid).entries.length === 2);
    expect(h.s.sessions.isRunning(sid)).toBe(false);
    expect(h.s.sessions.get(sid).entries.at(-1)?.data.title).toBe('Automatic continuation paused');
    h.s.sessions.resumeReports();
    expect(h.s.sessions.get(sid).entries).toHaveLength(2);
  });

  it('reports restart-interrupted tasks without replaying their device actions', async () => {
    h.s.runs.stop();
    const sid = h.s.sessions.create({ title: 'Restart receiver' }).id;
    h.s.sessions.abort(sid);
    const agent = await createAgent();
    const run = h.s.runs.enqueue({ agentId: agent.id, triggerKind: 'manual', reportSessionId: sid });
    h.s.db.prepare("UPDATE runs SET status = 'running' WHERE id = ?").run(run.id);
    h.s.runs.start();
    await waitFor(() => h.s.sessions.get(sid).entries.some((e) => e.kind === 'notice'));
    expect(h.s.runs.get(run.id)).toMatchObject({ status: 'failed', error: 'interrupted by restart' });
    expect(h.s.notifications.list({}).filter((n) => n.data.runId === run.id)).toHaveLength(1);
    expect(ha.calls).toHaveLength(0);
  });
});
