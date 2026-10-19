import { describe, expect, it } from 'vitest';
import {
  buildContext,
  chooseCompactionCut,
  contextBeforeCut,
  repairToolPairs,
  trimOldToolResults,
} from '../src/modules/conversations/context.ts';
import type { StoredEntry } from '../src/modules/conversations/store.ts';
import { HaRegistry } from '../src/modules/ha/registry.ts';
import { classifyWrite, DEFAULT_RISK_POLICY } from '../src/modules/policy/risk.ts';

let seq = 0;
const entry = (
  kind: StoredEntry['kind'],
  data: Record<string, unknown>,
  role: string | null = null,
): StoredEntry => ({
  id: `e${++seq}`,
  conversationId: 'c',
  parentId: null,
  seq,
  kind,
  role,
  data,
  runId: null,
  createdAt: seq,
});
const user = (text: string) =>
  entry('message', { message: { role: 'user', content: text, timestamp: 0 } }, 'user');
const assistant = (content: unknown[]) =>
  entry(
    'message',
    { message: { role: 'assistant', content, stopReason: 'stop', usage: {}, timestamp: 0 } },
    'assistant',
  );

describe('buildContext', () => {
  it('starts from the newest compaction summary and keeps entries after the cut', () => {
    const a = user('old question');
    const b = assistant([{ type: 'text', text: 'old answer' }]);
    const c = user('recent question');
    const comp = entry('compaction', { summary: 'S', firstKeptEntryId: c.id, tokensBefore: 10 });
    const d = assistant([{ type: 'text', text: 'recent answer' }]);
    const ctx = buildContext([a, b, c, comp, d]) as any[];
    expect(ctx).toHaveLength(3);
    expect(ctx[0].content).toContain('S');
    expect(ctx[1].content).toBe('recent question');
    expect(ctx[2].content[0].text).toBe('recent answer');
  });

  it('includes notices meant for the model and skips the others', () => {
    const ctx = buildContext([
      user('hi'),
      entry('notice', { level: 'report', title: 'Task report', body: 'all good', forModel: true }),
      entry('notice', { level: 'info', title: 'ui only', body: 'x', forModel: false }),
    ]) as any[];
    expect(ctx).toHaveLength(2);
    expect(ctx[1].content).toContain('all good');
  });
});

describe('continuous compaction history', () => {
  it('carries the prior summary forward and never includes pre-compaction history twice', () => {
    const old = user('old secret discussion');
    const summary = entry('compaction', {
      summary: 'old secret summarized',
      firstKeptEntryId: null,
      tokensBefore: 100,
    });
    const recent = user('recent instruction');
    const answer = assistant([{ type: 'text', text: 'recent answer' }]);
    const path = [old, summary, recent, answer];
    const before = contextBeforeCut(path, 3) as any[];
    expect(JSON.stringify(before)).toContain('old secret summarized');
    expect(JSON.stringify(before)).not.toContain('old secret discussion');
    expect(JSON.stringify(before)).toContain('recent instruction');
    expect(chooseCompactionCut(path, 1)).toBeGreaterThanOrEqual(2);
  });
});

describe('repairToolPairs', () => {
  it('adds error results for dangling tool calls', () => {
    const out = repairToolPairs([
      { role: 'user', content: 'x', timestamp: 0 },
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 't1', name: 'a', arguments: {} },
          { type: 'toolCall', id: 't2', name: 'b', arguments: {} },
        ],
      } as any,
      {
        role: 'toolResult',
        toolCallId: 't1',
        toolName: 'a',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 0,
      } as any,
      { role: 'user', content: 'next', timestamp: 0 },
    ]) as any[];
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'toolResult', 'toolResult', 'user']);
    expect(out[3]).toMatchObject({ toolCallId: 't2', isError: true });
  });
});

describe('trimOldToolResults', () => {
  it('truncates bulky results outside the recent window', () => {
    const big = {
      role: 'toolResult',
      toolCallId: 't',
      toolName: 'x',
      content: [{ type: 'text', text: 'y'.repeat(5000) }],
      isError: false,
      timestamp: 0,
    };
    const msgs = [
      big,
      ...Array.from({ length: 6 }, () => ({ role: 'user', content: 'u', timestamp: 0 })),
    ] as any[];
    const out = trimOldToolResults(msgs) as any[];
    expect(out[0].content[0].text.length).toBeLessThan(2000);
    expect(trimOldToolResults([big] as any[])[0]).toBe(big);
  });
});

describe('risk classification', () => {
  const reg = new HaRegistry();
  reg.setStates([
    {
      entity_id: 'cover.garage',
      state: 'closed',
      attributes: { device_class: 'garage' },
      last_changed: '',
      last_updated: '',
    },
    {
      entity_id: 'cover.blinds',
      state: 'closed',
      attributes: { device_class: 'blind' },
      last_changed: '',
      last_updated: '',
    },
  ]);
  const req = (
    domain: string,
    service: string,
    entityIds: string[],
    kind: 'service' | 'config' = 'service',
  ) => ({
    principal: { kind: 'admin' as const, via: 'web' as const },
    kind,
    domain,
    service,
    entityIds,
    data: {},
    summary: '',
  });

  it.each([
    [req('lock', 'unlock', ['lock.door']), 'high'],
    [req('lock', 'lock', ['lock.door']), 'normal'],
    [req('cover', 'open_cover', ['cover.garage']), 'high'],
    [req('cover', 'close_cover', ['cover.garage']), 'normal'],
    [req('cover', 'open_cover', ['cover.blinds']), 'normal'],
    [req('homeassistant', 'turn_off', ['lock.door']), 'high'],
    [req('homeassistant', 'restart', []), 'high'],
    [req('light', 'turn_on', ['light.a']), 'normal'],
    [req('automation', 'save_config', [], 'config'), 'high'],
  ])('%o is %s', (r, level) => {
    expect(classifyWrite(r, DEFAULT_RISK_POLICY, reg).level).toBe(level);
  });
});
