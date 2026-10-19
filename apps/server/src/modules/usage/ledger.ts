import type { Usage } from '@earendil-works/pi-ai';
import type { Db } from '../../db/index.ts';

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  costUnknown?: boolean;
}

export const ZERO_USAGE: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** Normalize legacy or partially written usage JSON before doing arithmetic or serving it. */
export function normalizeUsage(value: Partial<UsageTotals> | null | undefined): UsageTotals {
  const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    input: number(value?.input),
    output: number(value?.output),
    cacheRead: number(value?.cacheRead),
    cacheWrite: number(value?.cacheWrite),
    cost: number(value?.cost),
    ...(value?.costUnknown ? { costUnknown: true } : {}),
  };
}

export function addUsage(a: UsageTotals, u: Usage, pricesKnown = true): UsageTotals {
  const current = normalizeUsage(a);
  const measured = normalizeUsage({ ...u, cost: u.cost?.total });
  return {
    input: current.input + measured.input,
    output: current.output + measured.output,
    cacheRead: current.cacheRead + measured.cacheRead,
    cacheWrite: current.cacheWrite + measured.cacheWrite,
    cost: current.cost + measured.cost,
    ...(current.costUnknown || !pricesKnown ? { costUnknown: true } : {}),
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
    pricesKnown = true,
  ): void {
    const day = at.toISOString().slice(0, 10);
    const measured = normalizeUsage({ ...u, cost: u.cost?.total });
    this.db
      .prepare(
        `INSERT INTO usage_ledger (day, principal_kind, principal_id, provider, model, requests, input, output, cache_read, cache_write, cost, unknown_requests)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, principal_kind, principal_id, provider, model) DO UPDATE SET
           requests = requests + 1, input = input + excluded.input, output = output + excluded.output,
           cache_read = cache_read + excluded.cache_read, cache_write = cache_write + excluded.cache_write, cost = cost + excluded.cost,
            unknown_requests = unknown_requests + excluded.unknown_requests`,
      )
      .run(
        day,
        principalKind,
        principalId,
        provider,
        model,
        measured.input,
        measured.output,
        measured.cacheRead,
        measured.cacheWrite,
        measured.cost,
        pricesKnown ? 0 : 1,
      );
  }

  /** Cost spent today (UTC day) by one principal. */
  hasUnknownCostToday(principalKind: string, principalId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM usage_ledger WHERE day = ? AND principal_kind = ? AND principal_id = ? AND unknown_requests > 0',
        )
        .get(new Date().toISOString().slice(0, 10), principalKind, principalId),
    );
  }

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
      unknown_requests: number;
    }>;
  }
}
