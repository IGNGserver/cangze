import type { Approval, ApprovalStatus, RiskLevel } from '@cangze/contracts';
import { AppError, conflict, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { principalId, type Principal } from '../../core/principal.ts';
import { json, type Db } from '../../db/index.ts';
import type { StreamHub } from '../stream/hub.ts';

interface Row {
  id: string;
  principal: string;
  session_id: string | null;
  run_id: string | null;
  agent_id: string | null;
  tool_name: string;
  tool_call_id: string;
  args: string;
  summary: string;
  risk: RiskLevel;
  status: ApprovalStatus;
  created_at: number;
  expires_at: number;
  decided_at: number | null;
  note: string | null;
}

const toApproval = (r: Row): Approval => ({
  id: r.id,
  principal: r.principal,
  sessionId: r.session_id,
  runId: r.run_id,
  agentId: r.agent_id,
  toolName: r.tool_name,
  toolCallId: r.tool_call_id,
  summary: r.summary,
  args: json.parse(r.args, null),
  risk: r.risk,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  expiresAt: new Date(r.expires_at).toISOString(),
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  note: r.note,
});

export interface ApprovalRequest {
  principal: Principal;
  toolName: string;
  toolCallId: string;
  summary: string;
  args: unknown;
  risk: RiskLevel;
  sessionId?: string;
  runId?: string;
  agentId?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Human-in-the-loop decisions for risky actions. A request blocks the calling tool until the
 * admin approves or denies it in any client, it times out, or the run is aborted.
 */
export class ApprovalsService {
  private readonly waiters = new Map<string, (status: ApprovalStatus) => void>();
  private readonly listeners = new Set<(a: Approval) => void>();

  constructor(
    private readonly db: Db,
    private readonly stream: StreamHub,
  ) {}

  /** Pending approvals cannot survive a restart: the runs waiting on them are gone. */
  expireAbandoned(): number {
    return this.db
      .prepare(
        "UPDATE approvals SET status = 'expired', decided_at = ?, note = 'hub restarted' WHERE status = 'pending'",
      )
      .run(Date.now()).changes;
  }

  onChange(fn: (a: Approval) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private publish(a: Approval): void {
    this.stream.publish('approvals', { approval: a });
    if (a.sessionId) this.stream.publish(`session:${a.sessionId}`, { kind: 'approval', approval: a });
    if (a.runId && a.agentId) this.stream.publish(`run:${a.runId}`, { kind: 'approval', approval: a });
    for (const l of this.listeners) l(a);
  }

  async request(req: ApprovalRequest): Promise<ApprovalStatus> {
    const id = newId('apr');
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO approvals (id, principal, session_id, run_id, agent_id, tool_name, tool_call_id, args, summary, risk, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        id,
        principalId(req.principal),
        req.sessionId ?? null,
        req.runId ?? null,
        req.agentId ?? null,
        req.toolName,
        req.toolCallId,
        json.stringify(req.args),
        req.summary,
        req.risk,
        now,
        now + req.timeoutMs,
      );
    this.publish(this.get(id));
    return new Promise<ApprovalStatus>((resolve) => {
      const timer = setTimeout(() => this.finish(id, 'expired', 'timed out'), req.timeoutMs);
      timer.unref();
      const onAbort = () => this.finish(id, 'expired', 'run aborted');
      req.signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.set(id, (status) => {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        resolve(status);
      });
    });
  }

  private finish(id: string, status: ApprovalStatus, note?: string): Approval {
    const r = this.db
      .prepare(
        "UPDATE approvals SET status = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'pending'",
      )
      .run(status, Date.now(), note ?? null, id);
    const a = this.get(id);
    if (r.changes) {
      this.publish(a);
      const w = this.waiters.get(id);
      this.waiters.delete(id);
      w?.(status);
    }
    return a;
  }

  decide(id: string, approve: boolean, note?: string): Approval {
    const current = this.get(id);
    if (current.status !== 'pending') throw conflict(`Approval is already ${current.status}`);
    if (!this.waiters.has(id)) {
      this.finish(id, 'expired', 'no longer waiting');
      throw new AppError(410, 'approval_gone', 'The action is no longer waiting for approval');
    }
    return this.finish(id, approve ? 'approved' : 'denied', note);
  }

  get(id: string): Approval {
    const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Approval');
    return toApproval(r);
  }

  list(q: { status?: ApprovalStatus; sessionId?: string; agentId?: string; limit?: number }): Approval[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.status) {
      where.push('status = ?');
      args.push(q.status);
    }
    if (q.sessionId) {
      where.push('session_id = ?');
      args.push(q.sessionId);
    }
    if (q.agentId) {
      where.push('agent_id = ?');
      args.push(q.agentId);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM approvals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...args, q.limit ?? 100) as Row[];
    return rows.map(toApproval);
  }
}
