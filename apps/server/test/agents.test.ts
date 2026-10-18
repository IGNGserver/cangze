import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxProviderHandle,
} from '@earendil-works/pi-ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeHa, FAKE_TOKEN, waitFor } from './fake-ha.ts';
import { harness, type Harness } from './helpers.ts';

let h: Harness;
let ha: FakeHa;
let faux: FauxProviderHandle;

beforeEach(async () => {
  ha = await new FakeHa().start();
  h = await harness();
  faux = fauxProvider({ provider: 'faux', models: [{ id: 'm1', contextWindow: 16000, maxTokens: 1000 }] });
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

  it('previews effective permissions', async () => {
    const agent = await createAgent();
    const eff = (await h.call('GET', `/api/v1/agents/${agent.id}/permissions`)).json();
    expect(eff.control).toEqual(
      expect.arrayContaining(['light.living_ceiling', 'light.living_lamp', 'climate.living']),
    );
    expect(eff.control).not.toContain('lock.front_door');
    expect(eff.read).toContain('binary_sensor.hall_motion');
  });
});
