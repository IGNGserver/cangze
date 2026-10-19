import type { Usage } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { addUsage, normalizeUsage, ZERO_USAGE } from '../src/modules/usage/ledger.ts';

describe('usage normalization', () => {
  it('replaces absent, null and nonfinite legacy counters with zero', () => {
    expect(normalizeUsage({ input: Number.NaN, output: Infinity })).toEqual(ZERO_USAGE);
    expect(normalizeUsage(null)).toEqual(ZERO_USAGE);
  });

  it('keeps the first measured usage when adding to legacy empty JSON', () => {
    const usage = { input: 12, output: 3, cost: { total: 0.02 } } as Usage;
    expect(addUsage({} as typeof ZERO_USAGE, usage)).toEqual({
      input: 12,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.02,
    });
  });

  it('marks unknown prices separately from explicit free usage', () => {
    const usage = { input: 12, output: 3, cost: { total: 0 } } as Usage;
    expect(addUsage(ZERO_USAGE, usage, false)).toMatchObject({ cost: 0, costUnknown: true });
    expect(addUsage(ZERO_USAGE, usage, true)).toMatchObject({ cost: 0 });
    expect(addUsage(ZERO_USAGE, usage, true)).not.toHaveProperty('costUnknown');
    expect(normalizeUsage({ cost: -1 }).cost).toBe(0);
  });
});
