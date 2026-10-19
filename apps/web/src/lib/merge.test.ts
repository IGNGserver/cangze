import { describe, expect, it } from 'vitest';
import { mergeJson, sameJson } from './merge.ts';

describe('three-way draft merge', () => {
  it('keeps independent and nested remote edits, regardless of object key order', () => {
    const base: Record<string, unknown> = { name: 'a', limits: { cost: 1, calls: 2 }, model: null };
    const local: Record<string, unknown> = { ...base, name: 'mine', limits: { calls: 3, cost: 1 } };
    const remote: Record<string, unknown> = { ...base, limits: { cost: 4, calls: 2 }, model: 'new' };
    expect(mergeJson(base, local, remote)).toEqual({
      value: { name: 'mine', limits: { cost: 4, calls: 3 }, model: 'new' },
      conflicts: [],
    });
    expect(sameJson({ x: 1, y: 2 }, { y: 2, x: 1 })).toBe(true);
  });

  it('requires a choice for divergent arrays without unioning permissions', () => {
    const base = { permissions: ['read'] };
    const local = { permissions: ['control'] };
    const remote = { permissions: [] as string[] };
    const result = mergeJson(base, local, remote);
    expect(result.conflicts).toEqual([
      { path: ['permissions'], base: ['read'], local: ['control'], remote: [] },
    ]);
    expect(mergeJson(base, local, remote, { '["permissions"]': 'remote' }).value).toEqual(remote);
  });

  it('handles identical changes, deletions and null without manufacturing conflicts', () => {
    expect(mergeJson({ x: 1 }, {}, { x: 1 }).value).toEqual({});
    expect(mergeJson({ x: null }, { x: 2 }, { x: 2 }).conflicts).toEqual([]);
    expect(mergeJson({ x: 1 }, {}, { x: 3 }).conflicts).toHaveLength(1);
  });
});
