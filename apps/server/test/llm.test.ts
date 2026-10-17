import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeHa, FAKE_TOKEN, waitFor } from './fake-ha.ts';
import { FakeLlm } from './fake-llm.ts';
import { harness, type Harness } from './helpers.ts';

let h: Harness;
let ha: FakeHa;
let llm: FakeLlm;

beforeAll(async () => {
  ha = await new FakeHa().start();
  llm = await new FakeLlm().start();
  h = await harness();
  await h.call('PUT', '/api/v1/settings/ha', { url: ha.url, token: FAKE_TOKEN, verifyTls: true });
  await waitFor(() => h.s.ha.getStatus().state === 'connected');
});

afterAll(async () => {
  await h.s.ha.stop();
  await ha.stop();
  await llm.stop();
});

describe('OpenAI-compatible custom provider (end to end through pi)', () => {
  it('discovers models, streams, calls a tool and summarizes', async () => {
    const discovered = await h.call('POST', '/api/v1/providers/discover', { baseUrl: llm.url });
    expect(discovered.json().models).toEqual(['fake-1', 'fake-vision']);
    const p = await h.call('POST', '/api/v1/providers', {
      kind: 'custom',
      name: 'Fake',
      api: 'openai-completions',
      baseUrl: llm.url,
      models: [{ id: 'fake-1' }],
    });
    expect(p.statusCode).toBe(201);
    const test = await h.call('POST', `/api/v1/providers/${p.json().id}/test`, {});
    expect(test.json()).toMatchObject({ ok: true, model: 'fake-1' });
    await h.call('PUT', '/api/v1/models/defaults', {
      chat: `${p.json().id}/fake-1`,
      utility: null,
      thinkingLevel: 'off',
    });

    const id = (await h.call('POST', '/api/v1/sessions', {})).json().id;
    await h.call('POST', `/api/v1/sessions/${id}/messages`, { text: 'which lights are on?' });
    await new Promise((r) => setTimeout(r, 20));
    await waitFor(() => !h.s.sessions.isRunning(id), 10_000);
    const detail = (await h.call('GET', `/api/v1/sessions/${id}`)).json();
    const roles = detail.entries.map((e: any) => e.role);
    expect(roles).toEqual(['user', 'assistant', 'toolResult', 'assistant']);
    const final = detail.entries.at(-1).data.message.content.find((c: any) => c.type === 'text').text;
    expect(final).toContain('light.bedroom');
    expect(detail.usage.input).toBeGreaterThan(0);
  });
});
