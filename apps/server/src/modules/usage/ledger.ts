import type { Usage } from '@earendil-works/pi-ai';
import type { Db } from '../../db/index.ts';

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export const ZERO_USAGE: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** Normalize legacy or partially written usage JSON before doing arithmetic or serving it. */
export function normalizeUsage(value: Partial<UsageTotals> | null | undefined): UsageTotals {
  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    input: number(value?.input),
    output: number(value?.output),
    cacheRead: number(value?.cacheRead),
    cacheWrite: number(value?.cacheWrite),
    cost: number(value?.cost),
  };
}

export function addUsage(a: UsageTotals, u: Usage): UsageTotals {
  const current = normalizeUsage(a);
  return {
    input: current.input + (u.input ?? 0),
    output: current.output + (u.output ?? 0),
    cacheRead: current.cacheRead + (u.cacheRead ?? 0),
    cacheWrite: current.cacheWrite + (u.cacheWrite ?? 0),
    cost: Math.round((current.cost + (u.cost?.total ?? 0)) * 1e6) / 1e6,
  };
}

/** Per-day token and cost accounting by principal and model. */
export class UsageLedger {
  constructor(private readonly db: Db) {}

  record(
    principalKind: string,
    principalId: string,
    provider: string,
    model: string,
    u: Usage,
    at = new Date(),
  ): void {
    const day = at.toISOString().slice(0, 10);
    this.db
      .prepare(
        `INSERT INTO usage_ledger (day, principal_kind, principal_id, provider, model, requests, input, output, cache_read, cache_write, cost)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(day, principal_kind, principal_id, provider, model) DO UPDATE SET
           requests = requests + 1, input = input + excluded.input, output = output + excluded.output,
           cache_read = cache_read + excluded.cache_read, cache_write = cache_write + excluded.cache_write, cost = cost + excluded.cost`,
      )
      .run(
        day,
        principalKind,
        principalId,
        provider,
        model,
        u.input ?? 0,
        u.output ?? 0,
        u.cacheRead ?? 0,
        u.cacheWrite ?? 0,
        u.cost?.total ?? 0,
      );
  }

  /** Cost spent today (UTC day) by one principal. */
  costToday(principalKind: string, principalId: string): number {
    const day = new Date().toISOString().slice(0, 10);
    const r = this.db
      .prepare(
        'SELECT COALESCE(SUM(cost), 0) AS c FROM usage_ledger WHERE day = ? AND principal_kind = ? AND principal_id = ?',
      )
      .get(day, principalKind, principalId) as { c: number };
    return r.c;
  }

  query(days: number) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return this.db.prepare('SELECT * FROM usage_ledger WHERE day >= ? ORDER BY day').all(since) as Array<{
      day: string;
      principal_kind: string;
      principal_id: string;
      provider: string;
      model: string;
      requests: number;
      input: number;
      output: number;
      cache_read: number;
      cache_write: number;
      cost: number;
    }>;
  }
}
