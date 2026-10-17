import type { AuditDecision, AuditEntry } from '@cangze/contracts';
import { principalId, type Principal } from '../../core/principal.ts';
import { json, type Db } from '../../db/index.ts';
import type { StreamHub } from '../stream/hub.ts';

export interface AuditInput {
  principal: Principal;
  action: string;
  target?: string | null;
  args?: unknown;
  decision: AuditDecision;
  reason?: string | null;
  result?: unknown;
  haContextId?: string | null;
  durationMs?: number | null;
}

interface Row {
  id: number;
  ts: number;
  principal: string;
  session_id: string | null;
  run_id: string | null;
  agent_id: string | null;
  action: string;
  target: string | null;
  args: string | null;
  decision: AuditDecision;
  reason: string | null;
  result: string | null;
  ha_context_id: string | null;
  duration_ms: number | null;
}

const MAX_JSON = 8000;
const clip = (v: unknown) => {
  if (v === undefined || v === null) return null;
  const s = JSON.stringify(v);
  return s.length > MAX_JSON ? JSON.stringify({ truncated: true, preview: s.slice(0, MAX_JSON) }) : s;
};

/** Append-only record of every action against the home and every policy decision. */
export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly stream: StreamHub,
  ) {}

  record(input: AuditInput): number {
    const p = input.principal;
    const sessionId = p.kind === 'session' ? p.sessionId : p.kind === 'agent' ? (p.sessionId ?? null) : null;
    const runId = p.kind === 'session' || p.kind === 'agent' ? p.runId : null;
    const agentId = p.kind === 'agent' ? p.agentId : null;
    const r = this.db
      .prepare(
        `INSERT INTO audit_log (ts, principal, session_id, run_id, agent_id, action, target, args, decision, reason, result, ha_context_id, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        principalId(p),
        sessionId,
        runId,
        agentId,
        input.action,
        input.target ?? null,
        clip(input.args),
        input.decision,
        input.reason ?? null,
        clip(input.result),
        input.haContextId ?? null,
        input.durationMs ?? null,
      );
    const id = Number(r.lastInsertRowid);
    if (this.stream.hasSubscribers('system')) this.stream.publish('system', { kind: 'audit', id });
    return id;
  }

  query(q: {
    principal?: string;
    agentId?: string;
    sessionId?: string;
    runId?: string;
    entityId?: string;
    decision?: AuditDecision;
    before?: number;
    limit: number;
  }): AuditEntry[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.principal) {
      where.push('principal = ?');
      args.push(q.principal);
    }
    if (q.agentId) {
      where.push('agent_id = ?');
      args.push(q.agentId);
    }
    if (q.sessionId) {
      where.push('session_id = ?');
      args.push(q.sessionId);
    }
    if (q.runId) {
      where.push('run_id = ?');
      args.push(q.runId);
    }
    if (q.entityId) {
      where.push("(',' || target || ',') LIKE ?");
      args.push(`%,${q.entityId},%`);
    }
    if (q.decision) {
      where.push('decision = ?');
      args.push(q.decision);
    }
    if (q.before) {
      where.push('id < ?');
      args.push(q.before);
    }
    const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(...args, q.limit) as Row[];
    return rows.map((r) => ({
      id: r.id,
      ts: new Date(r.ts).toISOString(),
      principal: r.principal,
      sessionId: r.session_id,
      runId: r.run_id,
      agentId: r.agent_id,
      action: r.action,
      target: r.target,
      args: json.parse(r.args, null),
      decision: r.decision,
      reason: r.reason,
      result: json.parse(r.result, null),
      haContextId: r.ha_context_id,
      durationMs: r.duration_ms,
    }));
  }

  /** Remove records older than the retention period. */
  prune(olderThanMs: number): number {
    return this.db.prepare('DELETE FROM audit_log WHERE ts < ?').run(Date.now() - olderThanMs).changes;
  }
}

/** Map a gateway write outcome to an audit decision. */
export function decisionForError(code: string): AuditDecision {
  if (code.startsWith('policy_') || code === 'forbidden') return 'denied';
  if (code.startsWith('conflict_')) return 'conflict';
  if (code === 'approval_rejected') return 'rejected';
  return 'error';
}
