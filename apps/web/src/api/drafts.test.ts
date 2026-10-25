import type { Draft, DraftSnapshot } from '@cangze/contracts';
import { describe, expect, it } from 'vitest';
import { applyDraftEvent, setDraftInSnapshot } from './drafts.tsx';

const draft = (revision: number, text: string): Draft => ({
  scope: 'new',
  text,
  images: [],
  revision,
  updatedAt: new Date(revision * 1000).toISOString(),
});

const snapshot = (items: Draft[]): DraftSnapshot => ({ items, streamSeq: 10 });

describe('draft feed merge', () => {
  it('keeps the newest revision per scope and accepts a new draft after a delete', () => {
    const current = snapshot([draft(2, 'two')]);
    expect(applyDraftEvent(current, { kind: 'upsert', draft: draft(1, 'old') })).toBe(current);
    expect(applyDraftEvent(current, { kind: 'upsert', draft: draft(3, 'three') }).items[0]).toMatchObject({
      revision: 3,
      text: 'three',
    });
    expect(
      applyDraftEvent(current, { kind: 'delete', scope: 'new', revision: 1, reason: 'cleared' }).items,
    ).toHaveLength(1);
    const deleted = applyDraftEvent(current, {
      kind: 'delete',
      scope: 'new',
      revision: 2,
      reason: 'sent',
    });
    expect(deleted.items).toEqual([]);
    expect(applyDraftEvent(deleted, { kind: 'upsert', draft: draft(1, 'fresh') }).items[0]).toMatchObject({
      revision: 1,
      text: 'fresh',
    });
  });

  it('replaces or removes a local mutation result', () => {
    const current = snapshot([draft(1, 'one')]);
    expect(setDraftInSnapshot(current, 'new', draft(2, 'two'))?.items[0]).toMatchObject({
      revision: 2,
      text: 'two',
    });
    expect(setDraftInSnapshot(current, 'new', null)?.items).toEqual([]);
    expect(setDraftInSnapshot(null, 'new', draft(1, 'one'))).toBeNull();
  });
});
