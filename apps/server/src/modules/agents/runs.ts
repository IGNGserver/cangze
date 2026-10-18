import type { AgentDefinition, RunStatus, RunSummary } from '@cangze/contracts';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, conflict, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import type { Principal } from '../../core/principal.ts';
import { json, type Db } from '../../db/index.ts';
import type { ApprovalsService } from '../approvals/service.ts';
import { toWire, type ConversationStore } from '../conversations/store.ts';
import { buildSystemPrompt } from '../engine/prompt.ts';
import { userMessage, type ActiveRun, type AgentRunner } from '../engine/runner.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { NotificationsService } from '../notifications/service.ts';
import type { ProvidersService } from '../providers/service.ts';
import type { SessionsService } from '../sessions/service.ts';
import type { SettingsService } from '../settings/service.ts';
import type { StreamHub } from '../stream/hub.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ToolDef } from '../tools/types.ts';
import { addUsage, normalizeUsage, ZERO_USAGE, type UsageLedger, type UsageTotals } from '../usage/ledger.ts';
import { canRead, readsEverything } from './permissions.ts';
import { SESSION_ONLY_GROUPS, type AgentsService } from './service.ts';

interface RunRow {
  id: string;
  agent_id: string;
  revision: number;
  trigger_id: string | null;
  trigger_kind: string;
  trigger_payload: string;
  requested_by: string | null;
  report_session_id: string | null;
  task: string | null;
  status: RunStatus;
  chain_depth: number;
  queued_at: number;
  started_at: number | null;
  finished_at: number | null;
  error: string | null;
  summary: string | null;
  usage: string;
}

export interface EnqueueInput {
  agentId: string;
  triggerId?: string | null;
  triggerKind: string;
  payload?: unknown;
  task?: string | null;
  requestedBy?: string | null;
  reportSessionId?: string | null;
  chainDepth?: number;
}

const iso = (n: number | null) => (n ? new Date(n).toISOString() : null);

export const SchedulerSetting = z
  .object({ concurrency: z.number().int().min(1).max(16) })
  .default({ concurrency: 2 });

/**
 * Executes subagent runs from a durable queue (the `runs` table) with a global concurrency limit,
 * per-agent overlap policy, daily budgets, time and tool-call limits.
 */
export class RunsService {
  readonly settings;
  private readonly active = new Map<string, { run: ActiveRun; agentId: string; timer: NodeJS.Timeout }>();
  private pumping = false;
  private stopped = false;
  private extraTools: (agentId: string) => ToolDef[] = () => [];

  constructor(
    private readonly db: Db,
    private readonly agents: AgentsService,
    private readonly store: ConversationStore,
    private readonly runner: AgentRunner,
    private readonly providers: ProvidersService,
    private readonly ha: HaGateway,
    private readonly tools: ToolRegistry,
    private readonly approvals: ApprovalsService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    private readonly usage: UsageLedger,
    private readonly stream: StreamHub,
    settings: SettingsService,
    private readonly logger: Logger,
  ) {
    this.settings = settings.define('scheduler', SchedulerSetting);
    agents.onChange(({ agentId, kind }) => {
      if (kind === 'delete' || agents.row(agentId).enabled) return;
      for (const r of this.list({ agentId, status: 'queued', limit: 10000 }))
        if (r.triggerKind !== 'manual') this.abort(r.id);
    });
    this.approvals.onChange((a) => {
      if (!a.runId || !a.agentId) return;
      if (a.status === 'pending') this.setStatus(a.runId, 'waiting_approval');
      else if (this.active.has(a.runId)) this.setStatus(a.runId, 'running');
    });
  }

  /** Memory tools and others bound to a specific agent. */
  setExtraTools(fn: (agentId: string) => ToolDef[]): void {
    this.extraTools = fn;
  }

  /** Runs left "running" by a crash cannot be resumed; mark them failed and pick up queued ones. */
  start(): void {
    this.stopped = false;
    const n = this.db
      .prepare(
        "UPDATE runs SET status = 'failed', error = 'interrupted by restart', finished_at = ? WHERE status IN ('running', 'waiting_approval')",
      )
      .run(Date.now()).changes;
    if (n) this.logger.warn({ module: 'runs', count: n }, 'marked interrupted runs as failed');
    void this.pump();
  }

  stop(): void {
    this.stopped = true;
    for (const a of this.active.values()) a.run.abort();
  }

  // ---------------------------------------------------------------- queries

  private row(id: string): RunRow {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
    if (!r) throw notFound('Run');
    return r;
  }

  private summary(r: RunRow): RunSummary {
    const name =
      (
        this.db.prepare('SELECT name FROM agents WHERE id = ?').get(r.agent_id) as
          { name: string } | undefined
      )?.name ?? '?';
    return {
      id: r.id,
      agentId: r.agent_id,
      agentName: name,
      revision: r.revision,
      triggerId: r.trigger_id,
      triggerKind: r.trigger_kind,
      triggerPayload: json.parse(r.trigger_payload, {}),
      requestedBy: r.requested_by,
      reportSessionId: r.report_session_id,
      task: r.task,
      status: r.status,
      chainDepth: r.chain_depth,
      queuedAt: new Date(r.queued_at).toISOString(),
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at),
      error: r.error,
      summary: r.summary,
      usage: normalizeUsage(json.parse<Partial<UsageTotals>>(r.usage, ZERO_USAGE)),
    };
  }

  get(id: string): RunSummary {
    return this.summary(this.row(id));
  }

  list(q: { agentId?: string; status?: RunStatus; limit?: number; before?: string }): RunSummary[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.agentId) {
      where.push('agent_id = ?');
      args.push(this.agents.row(q.agentId).id);
    }
    if (q.status) {
      where.push('status = ?');
      args.push(q.status);
    }
    if (q.before) {
      where.push('queued_at < (SELECT queued_at FROM runs WHERE id = ?)');
      args.push(q.before);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY queued_at DESC LIMIT ?`,
      )
      .all(...args, q.limit ?? 50) as RunRow[];
    return rows.map((r) => this.summary(r));
  }

  detail(id: string) {
    const r = this.row(id);
    const entries = (
      this.db.prepare('SELECT id FROM entries WHERE run_id = ? ORDER BY seq').all(id) as Array<{ id: string }>
    ).map((e) => toWire(this.store.get(e.id)));
    return {
      run: this.summary(r),
      entries,
      live: this.active.get(id)?.run.snapshot() ?? null,
      approvals: this.approvals.list({ status: 'pending' }).filter((a) => a.runId === id),
      streamSeq: this.stream.seq(`run:${id}`),
    };
  }

  isAgentRunning(agentId: string): boolean {
    return [...this.active.values()].some((a) => a.agentId === agentId);
  }

  /** Chain depth of an active run (for loop protection). */
  chainDepth(runId: string): number {
    return (
      (
        this.db.prepare('SELECT chain_depth FROM runs WHERE id = ?').get(runId) as
          { chain_depth: number } | undefined
      )?.chain_depth ?? 0
    );
  }

  stats(agentId: string) {
    const r = this.db
      .prepare(
        "SELECT COUNT(*) AS runs, SUM(status = 'succeeded') AS succeeded, SUM(status = 'failed') AS failed FROM runs WHERE agent_id = ?",
      )
      .get(agentId) as { runs: number; succeeded: number | null; failed: number | null };
    return { runs: r.runs, succeeded: r.succeeded ?? 0, failed: r.failed ?? 0 };
  }

  lastRun(agentId: string): RunSummary | null {
    const r = this.db
      .prepare('SELECT * FROM runs WHERE agent_id = ? ORDER BY queued_at DESC LIMIT 1')
      .get(agentId) as RunRow | undefined;
    return r ? this.summary(r) : null;
  }

  // ---------------------------------------------------------------- queue

  enqueue(input: EnqueueInput): RunSummary {
    const agent = this.agents.row(input.agentId);
    if (agent.halted) throw conflict('Agent was emergency stopped; enable it before dispatching tasks');
    if (!agent.enabled && input.triggerKind !== 'manual') throw conflict('Agent is disabled');
    const def = this.agents.definition(agent.id);
    const id = newId('run');
    const now = Date.now();
    let status: RunStatus = 'queued';
    let error: string | null = null;
    const busy = this.isAgentRunning(agent.id) || this.hasQueued(agent.id);
    if (busy && input.triggerKind !== 'manual') {
      if (def.limits.overlap === 'skip') {
        status = 'skipped';
        error = 'previous run still active';
      } else if (def.limits.overlap === 'replace') {
        for (const [runId, a] of this.active) if (a.agentId === agent.id) this.abort(runId);
        this.db
          .prepare(
            "UPDATE runs SET status = 'skipped', error = 'replaced by a newer run', finished_at = ? WHERE agent_id = ? AND status = 'queued'",
          )
          .run(now, agent.id);
      }
    }
    this.db
      .prepare(
        `INSERT INTO runs (id, agent_id, revision, trigger_id, trigger_kind, trigger_payload, requested_by, report_session_id, task, status, chain_depth, queued_at, finished_at, error, usage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        agent.id,
        agent.current_revision,
        input.triggerId ?? null,
        input.triggerKind,
        json.stringify(input.payload ?? {}),
        input.requestedBy ?? null,
        input.reportSessionId ?? null,
        input.task ?? null,
        status,
        input.chainDepth ?? 0,
        now,
        status === 'skipped' ? now : null,
        error,
        json.stringify(ZERO_USAGE),
      );
    this.publish(id);
    if (status === 'queued') void this.pump();
    return this.get(id);
  }

  private hasQueued(agentId: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 FROM runs WHERE agent_id = ? AND status = 'queued'").get(agentId),
    );
  }

  abort(id: string): void {
    const a = this.active.get(id);
    if (a) {
      a.run.abort();
      return;
    }
    const r = this.row(id);
    if (r.status === 'queued') {
      this.db
        .prepare("UPDATE runs SET status = 'aborted', finished_at = ?, error = 'cancelled' WHERE id = ?")
        .run(Date.now(), id);
      this.publish(id);
    }
  }

  emergencyStop(agentId: string): void {
    const id = this.agents.row(agentId).id;
    this.db.prepare('UPDATE agents SET halted = 1 WHERE id = ?').run(id);
    this.agents.setEnabled(id, false);
    for (const r of this.list({ agentId: id, status: 'queued', limit: 10000 })) this.abort(r.id);
    for (const [runId, active] of this.active) if (active.agentId === id) this.abort(runId);
  }

  private setStatus(id: string, status: RunStatus): void {
    this.db.prepare('UPDATE runs SET status = ? WHERE id = ? AND finished_at IS NULL').run(status, id);
    this.publish(id);
  }

  private publish(id: string): void {
    const s = this.get(id);
    this.stream.publish('runs', { kind: 'upsert', run: s });
    this.stream.publish(`agent:${s.agentId}`, { kind: 'run', run: s });
    this.stream.publish(`run:${s.id}`, { kind: 'run', run: s });
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (!this.stopped && this.active.size < this.settings.get().concurrency) {
        const busyAgents = [...new Set([...this.active.values()].map((a) => a.agentId))];
        const next = this.db
          .prepare(
            `SELECT * FROM runs WHERE status = 'queued' ${busyAgents.length ? `AND agent_id NOT IN (${busyAgents.map(() => '?').join(',')})` : ''} ORDER BY queued_at LIMIT 1`,
          )
          .get(...busyAgents) as RunRow | undefined;
        if (!next) break;
        this.launch(next);
      }
    } finally {
      this.pumping = false;
    }
  }

  private fail(r: RunRow, status: RunStatus, error: string): void {
    this.db
      .prepare('UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE id = ?')
      .run(status, error, Date.now(), r.id);
    this.publish(r.id);
  }

  private launch(r: RunRow): void {
    let def: AgentDefinition;
    try {
      def = this.agents.definition(r.agent_id, r.revision);
    } catch {
      return this.fail(r, 'failed', 'agent definition missing');
    }
    const agent = this.agents.row(r.agent_id);
    if (agent.halted) return this.fail(r, 'aborted', 'agent emergency stopped');
    if (!agent.enabled && r.trigger_kind !== 'manual') return this.fail(r, 'aborted', 'agent disabled');
    if (
      def.limits.dailyCostLimit !== null &&
      this.usage.costToday('agent', agent.id) >= def.limits.dailyCostLimit
    ) {
      this.fail(r, 'skipped', `daily cost limit of $${def.limits.dailyCostLimit} reached`);
      this.notifications.create({
        kind: 'agent_budget',
        severity: 'warning',
        title: `${agent.name}: daily budget reached`,
        body: `Runs are skipped until tomorrow (limit $${def.limits.dailyCostLimit}).`,
        data: { agentId: agent.id },
      });
      return;
    }
    let model;
    try {
      model = this.providers.resolve(def.modelRef);
    } catch (err) {
      return this.fail(r, 'failed', err instanceof Error ? err.message : String(err));
    }

    const principal: Principal = {
      kind: 'agent',
      agentId: agent.id,
      revision: r.revision,
      runId: r.id,
      sessionId: r.report_session_id ?? undefined,
    };
    const granted = def.tools.filter((t) => !SESSION_ONLY_GROUPS.has(this.tools.get(t)?.group ?? ''));
    const toolDefs = [...this.tools.pick(granted), ...this.extraTools(agent.id)];
    const conv = agent.conversation_id;
    const parent = def.contextMode === 'continuous' ? this.store.activeLeaf(conv) : null;
    const reg = this.ha.registry;
    const access = {
      readAll: readsEverything(def.permissions),
      canRead: (id: string) => canRead(def.permissions, id, reg),
    };

    this.db.prepare("UPDATE runs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), r.id);
    this.publish(r.id);

    let toolCalls = 0;
    let limitHit: string | null = null;
    const unsub = this.stream.tap(`run:${r.id}`, (data) => {
      const ev = data as { kind?: string };
      if (ev.kind === 'tool_start' && ++toolCalls > def.limits.maxToolCalls) {
        limitHit = `tool call limit of ${def.limits.maxToolCalls} reached`;
        this.active.get(r.id)?.run.abort();
      }
    });

    const run = this.runner.start({
      runId: r.id,
      conversationId: conv,
      topic: `run:${r.id}`,
      principal,
      model,
      thinkingLevel: model.reasoning
        ? (def.thinkingLevel ?? this.providers.defaults.get().thinkingLevel)
        : 'off',
      systemPrompt: buildSystemPrompt({
        role: 'agent',
        ha: this.ha,
        instructions: def.instructions,
        sections: this.promptSections(agent.id, def),
      }),
      tools: toolDefs,
      toolEnv: {
        principal,
        runId: r.id,
        agentId: agent.id,
        sessionId: r.report_session_id ?? undefined,
        access,
      },
      parentEntryId: parent,
      input: [userMessage(this.triggerMessage(r))],
      onAssistant: (m) => {
        if (!m.usage) return;
        const cur = normalizeUsage(
          json.parse<Partial<UsageTotals>>(
            (this.db.prepare('SELECT usage FROM runs WHERE id = ?').get(r.id) as { usage: string }).usage,
            ZERO_USAGE,
          ),
        );
        this.db
          .prepare('UPDATE runs SET usage = ? WHERE id = ?')
          .run(json.stringify(addUsage(cur, m.usage)), r.id);
        this.usage.record('agent', agent.id, m.provider, m.model, m.usage);
      },
    });
    const timer = setTimeout(() => {
      limitHit = `time limit of ${def.limits.maxRunSeconds}s reached`;
      run.abort();
    }, def.limits.maxRunSeconds * 1000);
    timer.unref();
    this.active.set(r.id, { run, agentId: agent.id, timer });

    void run.done.then((outcome) => {
      clearTimeout(timer);
      unsub();
      this.active.delete(r.id);
      const status: RunStatus = limitHit
        ? 'failed'
        : outcome.status === 'completed'
          ? 'succeeded'
          : outcome.status === 'aborted'
            ? 'aborted'
            : 'failed';
      const error = limitHit ?? outcome.error ?? null;
      const summary = outcome.finalText.slice(0, 4000) || null;
      this.db
        .prepare('UPDATE runs SET status = ?, error = ?, summary = ?, finished_at = ? WHERE id = ?')
        .run(status, error, summary, Date.now(), r.id);
      this.publish(r.id);
      this.afterRun(agent.name, def, this.get(r.id));
      void this.pump();
    });
  }

  private afterRun(agentName: string, def: AgentDefinition, run: RunSummary): void {
    if (run.reportSessionId && this.sessions.exists(run.reportSessionId)) {
      const ok = run.status === 'succeeded';
      this.sessions.addNotice(run.reportSessionId, {
        level: 'report',
        title: `${agentName} · ${ok ? 'task report' : `run ${run.status}`}`,
        body: ok
          ? (run.summary ?? '(no report)')
          : `${run.error ?? run.status}${run.summary ? `\n\n${run.summary}` : ''}`,
        forModel: true,
        data: { agentId: run.agentId, runId: run.id, status: run.status },
      });
    }
    if (run.status === 'failed' && def.notifyOnFailure) {
      this.notifications.create({
        kind: 'agent_failed',
        severity: 'error',
        title: `${agentName} failed`,
        body: run.error ?? 'The run failed',
        data: { agentId: run.agentId, runId: run.id },
      });
    }
  }

  private triggerMessage(r: RunRow): string {
    const payload = json.parse<Record<string, unknown>>(r.trigger_payload, {});
    const lines = [
      `[Run ${r.id} started by ${r.trigger_kind}${r.trigger_id ? ` trigger "${r.trigger_id}"` : ''} at ${new Date().toISOString()}]`,
    ];
    if (Object.keys(payload).length)
      lines.push(`Trigger data:\n${JSON.stringify(payload, null, 1).slice(0, 4000)}`);
    if (r.task) lines.push(`Task from ${r.requested_by ?? 'the user'}:\n${r.task}`);
    lines.push(
      'Do what your instructions say for this situation, then reply with a short report of what you observed and did.',
    );
    return lines.join('\n\n');
  }

  private promptSections(agentId: string, def: AgentDefinition) {
    const memory = this.agents
      .memory(agentId)
      .map((n) => `### ${n.title} (id: ${n.id})\n${n.content}`)
      .join('\n\n')
      .slice(0, 12_000);
    const recent =
      def.contextMode === 'isolated'
        ? this.list({ agentId, limit: 5 })
            .filter((x) => x.summary && x.status !== 'running' && x.status !== 'queued')
            .map(
              (x) =>
                `- ${x.finishedAt ?? x.queuedAt} [${x.status}] ${x.summary!.replace(/\s+/g, ' ').slice(0, 300)}`,
            )
            .join('\n')
        : '';
    const rules = def.permissions
      .map((p) => {
        const t = p.targets;
        const what = t.all
          ? 'everything'
          : [
              ...t.entities,
              ...t.domains.map((d) => `domain ${d}`),
              ...t.areas.map((a) => `area ${a}`),
              ...t.floors.map((f) => `floor ${f}`),
              ...t.devices.map((d) => `device ${d}`),
              ...t.labels.map((l) => `label ${l}`),
            ].join(', ');
        return `- ${p.effect} ${p.access} on ${what}${p.services.length ? ` (services: ${p.services.join(', ')})` : ''}`;
      })
      .join('\n');
    return [
      {
        title: 'Your permissions (enforced by the hub)',
        body: rules || '- none: you can only read nothing and change nothing; report this.',
      },
      { title: 'Your memory', body: memory || '(empty) Use memory_write to remember facts across runs.' },
      { title: 'Recent runs', body: recent },
    ];
  }

  ensureNotRunning(agentId: string): void {
    if (this.isAgentRunning(agentId)) throw new AppError(409, 'agent_busy', 'The agent is running');
  }
}
