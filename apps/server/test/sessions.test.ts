import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type FauxProviderHandle,
} from '@earendil-works/pi-ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeHa, FAKE_TOKEN, waitFor } from './fake-ha.ts';
import { harness, type Harness } from './helpers.ts';

let h: Harness;
let ha: FakeHa;
let faux: FauxProviderHandle;

function installFaux(h: Harness, opts: { tokensPerSecond?: number } = {}) {
  const f = fauxProvider({
    provider: 'faux',
    models: [{ id: 'm1', name: 'Faux 1', contextWindow: 8000, maxTokens: 1000, input: ['text', 'image'] }],
    ...(opts.tokensPerSecond ? { tokensPerSecond: opts.tokensPerSecond } : {}),
  });
  h.s.providers.models.setProvider(f.provider);
  h.s.db
    .prepare(
      "INSERT INTO providers (id, kind, builtin_id, name, base_url, secret_id, config, enabled, created_at, updated_at) VALUES ('faux', 'builtin', 'faux', 'Faux', NULL, NULL, '{}', 1, 0, 0)",
    )
    .run();
  h.s.providers.defaults.set({ chat: 'faux/m1', utility: 'faux/m1', thinkingLevel: 'off' });
  return f;
}

async function newSession(): Promise<string> {
  const res = await h.call('POST', '/api/v1/sessions', {});
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function settle(id: string) {
  await new Promise((r) => setTimeout(r, 20));
  await waitFor(() => !h.s.sessions.isRunning(id), 10_000);
}

const texts = (detail: { entries: Array<{ role: string | null; data: Record<string, any> }> }) =>
  detail.entries
    .filter((e) => e.role === 'user' || e.role === 'assistant')
    .map((e) => {
      const m = e.data.message;
      const c =
        typeof m.content === 'string'
          ? m.content
          : m.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('');
      return `${e.role}:${c}`;
    });

beforeEach(async () => {
  ha = await new FakeHa().start();
  h = await harness();
  faux = installFaux(h);
  await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
  await waitFor(() => h.s.ha.getStatus().state === 'connected');
});

afterEach(async () => {
  h.s.sessions.abortAll();
  await h.s.ha.stop();
  await ha.stop();
});

describe('sessions', () => {
  it('answers a message, persists both sides and generates a title', async () => {
    faux.setResponses([
      (ctx) => {
        const system = ctx.messages.find((m) => m.role === 'system');
        const text = JSON.stringify(system);
        expect(text).toContain('Living room (area_id: living_room)');
        expect(text).toContain('Asia/Shanghai');
        return fauxAssistantMessage('Hello! The home looks quiet.');
      },
      fauxAssistantMessage('Quiet home check'),
    ]);
    const id = await newSession();
    const sent = await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'How is the home?' });
    expect(sent.json()).toMatchObject({ queued: false });
    await settle(id);
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(texts(detail)).toEqual(['user:How is the home?', 'assistant:Hello! The home looks quiet.']);
    expect(detail.usage.output).toBeGreaterThan(0);
    await waitFor(() => h.s.sessions.list().find((s) => s.id === id)?.title === 'Quiet home check');
  });

  it('runs HA tools: search, then call a service with an area target', async () => {
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('ha_search_entities', { query: 'living', domain: 'light' })], {
        stopReason: 'toolUse',
      }),
      (ctx) => {
        const last = ctx.messages.at(-1) as any;
        expect(last.role).toBe('toolResult');
        expect(last.content[0].text).toContain('light.living_lamp');
        return fauxAssistantMessage(
          [
            fauxToolCall('ha_call_service', {
              domain: 'light',
              service: 'turn_on',
              target: { area_id: ['living_room'] },
              data: { brightness_pct: 30 },
            }),
          ],
          { stopReason: 'toolUse' },
        );
      },
      fauxAssistantMessage('Done, both living room lights are on.'),
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'Turn on the living room lights' });
    await settle(id);
    expect(ha.calls.at(-1)).toMatchObject({
      target: { entity_id: ['light.living_ceiling', 'light.living_lamp'] },
    });
    const audit = h.s.audit.query({ sessionId: id, limit: 5 });
    expect(audit[0]).toMatchObject({
      principal: `session:${id}`,
      decision: 'allowed',
      action: 'call_service:light.turn_on',
    });
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(detail.entries.filter((e: any) => e.role === 'toolResult')).toHaveLength(2);
    expect(texts(detail).at(-1)).toBe('assistant:Done, both living room lights are on.');
  });

  it('waits for approval before unlocking and proceeds when approved', async () => {
    faux.setResponses([
      fauxAssistantMessage(
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
      ),
      fauxAssistantMessage('Unlocked.'),
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'Unlock the front door' });
    await waitFor(() => h.s.approvals.list({ status: 'pending' }).length === 1);
    expect(ha.calls.find((c) => c.service === 'unlock')).toBeUndefined();
    const pending = (await h.call('GET', `/api/v1/sessions/${id}`)).json().approvals;
    expect(pending[0]).toMatchObject({ toolName: 'ha_call_service', risk: 'high', sessionId: id });
    const decided = await h.call('POST', `/api/v1/approvals/${pending[0].id}/decide`, { approve: true });
    expect(decided.json().status).toBe('approved');
    await settle(id);
    expect(ha.calls.find((c) => c.service === 'unlock')).toBeTruthy();
    expect(ha.state('lock.front_door')?.state).toBe('unlocked');
  });

  it('reports a denied approval to the model and does not call HA', async () => {
    faux.setResponses([
      fauxAssistantMessage(
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
      ),
      (ctx) => {
        const last = ctx.messages.at(-1) as any;
        expect(last.isError).toBe(true);
        expect(last.content[0].text).toContain('approval_rejected');
        return fauxAssistantMessage('Okay, I left it locked.');
      },
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'Unlock the front door' });
    await waitFor(() => h.s.approvals.list({ status: 'pending' }).length === 1);
    const [approval] = h.s.approvals.list({ status: 'pending' });
    await h.call('POST', `/api/v1/approvals/${approval!.id}/decide`, { approve: false });
    await settle(id);
    expect(ha.calls.find((c) => c.service === 'unlock')).toBeUndefined();
    expect(h.s.audit.query({ sessionId: id, limit: 1 })[0]).toMatchObject({ decision: 'rejected' });
  });

  it('edits a user message into a branch, switches back, and regenerates', async () => {
    faux.setResponses([
      fauxAssistantMessage('A1'),
      fauxAssistantMessage('title'),
      fauxAssistantMessage('A2'),
      fauxAssistantMessage('A3'),
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'first' });
    await settle(id);
    let detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    const firstUser = detail.entries.find((e: any) => e.role === 'user');

    await h.call('POST', `/api/v1/sessions/${id}/edit`, { entryId: firstUser.id, text: 'second' });
    await settle(id);
    detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(texts(detail)).toEqual(['user:second', 'assistant:A2']);
    const editedUser = detail.entries.find((e: any) => e.role === 'user');
    expect(editedUser.branch).toMatchObject({ index: 1, count: 2 });

    detail = (await h.call('POST', `/api/v1/sessions/${id}/branch`, { entryId: firstUser.id })).json();
    expect(texts(detail)).toEqual(['user:first', 'assistant:A1']);

    const assistant = detail.entries.find((e: any) => e.role === 'assistant');
    await h.call('POST', `/api/v1/sessions/${id}/regenerate`, { entryId: assistant.id });
    await settle(id);
    detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(texts(detail)).toEqual(['user:first', 'assistant:A3']);
  });

  it('steers a running reply and can abort', async () => {
    faux = installFauxSlow();
    faux.setResponses([
      fauxAssistantMessage(
        'This is a fairly long answer that streams slowly so that the test can steer it while it runs.',
      ),
      fauxAssistantMessage('Second answer'),
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'hello' });
    await waitFor(() => h.s.sessions.isRunning(id));
    const steer = await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'also this' });
    expect(steer.json()).toMatchObject({ queued: true });
    await settle(id);
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(texts(detail).filter((t: string) => t.startsWith('user:'))).toEqual([
      'user:hello',
      'user:also this',
    ]);

    faux.setResponses([fauxAssistantMessage('x '.repeat(400))]);
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'long one' });
    await waitFor(() => h.s.sessions.isRunning(id));
    await h.call('POST', `/api/v1/sessions/${id}/abort`);
    await settle(id);
    expect(h.s.stream.seq(`session:${id}`)).toBeGreaterThan(0);
  });

  it('serializes concurrent messages while an idle session is preparing a run', async () => {
    faux.setResponses([
      fauxAssistantMessage('first answer'),
      fauxAssistantMessage('title'),
      fauxAssistantMessage('second answer'),
    ]);
    const id = await newSession();
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'first' });
    await settle(id);
    // Reproduce the asynchronous preparation window (normally automatic compaction/model setup).
    const service = h.s.sessions as unknown as {
      compactConversation: (...args: unknown[]) => Promise<boolean>;
    };
    const compact = service.compactConversation.bind(service);
    service.compactConversation = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return compact(...args);
    };
    const [a, b] = await Promise.all([
      h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'second' }),
      h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'third' }),
    ]);
    const results = [a.json(), b.json()];
    expect(results.filter((r) => r.queued === false)).toHaveLength(1);
    expect(results.filter((r) => r.queued === true)).toHaveLength(1);
    expect(new Set(results.map((r) => r.runId)).size).toBe(1);
    await settle(id);
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(texts(detail).filter((t: string) => t === 'user:second' || t === 'user:third')).toHaveLength(2);
  });

  it('compacts older history into a summary', async () => {
    faux.setResponses([
      fauxAssistantMessage('r1'),
      fauxAssistantMessage('title'),
      fauxAssistantMessage('r2'),
      fauxAssistantMessage('r3'),
      fauxAssistantMessage('SUMMARY OF EARLIER TALK'),
      (ctx) => {
        const first = ctx.messages.find((m) => m.role === 'user') as any;
        expect(String(first.content)).toContain('SUMMARY OF EARLIER TALK');
        return fauxAssistantMessage('after compaction');
      },
    ]);
    const id = await newSession();
    for (const t of ['one', 'two', 'three']) {
      await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: t });
      await settle(id);
    }
    const res = await h.call('POST', `/api/v1/sessions/${id}/compact`);
    expect(res.json()).toEqual({ compacted: true });
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    expect(detail.entries.some((e: any) => e.kind === 'compaction')).toBe(true);
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'four' });
    await settle(id);
    expect(texts((await h.call('GET', `/api/v1/sessions/${id}`)).json()).at(-1)).toBe(
      'assistant:after compaction',
    );
  });

  it('fails clearly when no model is configured', async () => {
    h.s.providers.defaults.set({ chat: null, utility: null, thinkingLevel: 'off' });
    const id = await newSession();
    const res = await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'hi' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_model');
  });
});

function installFauxSlow() {
  const f = fauxProvider({
    provider: 'faux',
    models: [{ id: 'm1', name: 'Faux 1', contextWindow: 8000, maxTokens: 1000 }],
    tokensPerSecond: 40,
  });
  h.s.providers.models.setProvider(f.provider);
  return f;
}

describe('providers', () => {
  it('manages custom providers without exposing keys', async () => {
    const created = await h.call('POST', '/api/v1/providers', {
      kind: 'custom',
      name: 'Local Ollama',
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:11434/v1/',
      apiKey: 'sk-local-secret-123456',
      models: [{ id: 'qwen3:8b', contextWindow: 32768, maxTokens: 4096, reasoning: true }],
    });
    expect(created.statusCode).toBe(201);
    const p = created.json();
    expect(p).toMatchObject({
      id: 'custom-local-ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      hasKey: true,
    });
    expect(JSON.stringify(p)).not.toContain('sk-local-secret-123456');
    const models = (await h.call('GET', '/api/v1/models')).json();
    expect(models.map((m: any) => m.ref)).toContain('custom-local-ollama/qwen3:8b');
    const defaults = await h.call('PUT', '/api/v1/models/defaults', {
      chat: 'custom-local-ollama/qwen3:8b',
      utility: null,
      thinkingLevel: 'low',
    });
    expect(defaults.statusCode).toBe(200);
    const bad = await h.call('PUT', '/api/v1/models/defaults', {
      chat: 'custom-local-ollama/nope',
      utility: null,
      thinkingLevel: 'low',
    });
    expect(bad.statusCode).toBe(409);
    await h.call('DELETE', `/api/v1/providers/${p.id}`);
    expect((await h.call('GET', '/api/v1/models/defaults')).json().chat).toBeNull();
  });

  it('lists the built-in catalog and refuses duplicates', async () => {
    const catalog = (await h.call('GET', '/api/v1/providers/catalog')).json();
    expect(catalog.find((c: any) => c.id === 'openai')).toBeTruthy();
    expect(
      (await h.call('POST', '/api/v1/providers', { kind: 'builtin', builtinId: 'openai', apiKey: 'sk-test' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await h.call('POST', '/api/v1/providers', { kind: 'builtin', builtinId: 'openai', apiKey: 'sk-test' }))
        .statusCode,
    ).toBe(409);
    const models = (await h.call('GET', '/api/v1/models')).json();
    expect(models.some((m: any) => m.providerId === 'openai')).toBe(true);
  });

  it('exposes the tool catalog', async () => {
    const tools = (await h.call('GET', '/api/v1/tools')).json();
    expect(tools.map((t: any) => t.name)).toEqual(
      expect.arrayContaining(['ha_search_entities', 'ha_call_service', 'ha_save_config']),
    );
    expect(fauxText('x').type).toBe('text');
  });
});

describe('session list filters', () => {
  it('treats archived=false as false', async () => {
    const id = await newSession();
    await h.call('PATCH', `/api/v1/sessions/${id}`, { archived: true });
    const other = await newSession();
    const active = (await h.call('GET', '/api/v1/sessions?archived=false')).json().map((s: any) => s.id);
    const archived = (await h.call('GET', '/api/v1/sessions?archived=true')).json().map((s: any) => s.id);
    expect(active).toEqual([other]);
    expect(archived).toEqual([id]);
  });
});
