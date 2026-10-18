import type { Trigger } from '@cangze/contracts';
import { Cron } from 'croner';
import type { Logger } from 'pino';
import type { EventBus } from '../../core/events.ts';
import type { HubEvents } from '../../core/hub-events.ts';
import type { Db } from '../../db/index.ts';
import type { RunsService } from '../agents/runs.ts';
import type { AgentsService } from '../agents/service.ts';
import type { CoordinationService } from '../coordination/service.ts';
import type { HaGateway, HassEvent } from '../ha/gateway.ts';

interface Armed {
  agentId: string;
  revision: number;
  trigger: Trigger;
  stop: () => void;
  next?: () => Date | null;
  error?: string;
}

interface StateRow {
  trigger_id: string;
  agent_id: string;
  last_fired_at: number | null;
  next_fire_at: number | null;
  fire_count: number;
}

const key = (agentId: string, triggerId: string) => `${agentId}:${triggerId}`;

function subsetMatch(data: Record<string, unknown>, match: Record<string, unknown>): boolean {
  return Object.entries(match).every(([k, v]) => {
    const actual = data[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && actual && typeof actual === 'object') {
      return subsetMatch(actual as Record<string, unknown>, v as Record<string, unknown>);
    }
    return JSON.stringify(actual) === JSON.stringify(v);
  });
}

/**
 * Arms the triggers of enabled subagents and turns firings into queued runs. Event triggers are
 * traced through HA context ids so an agent's own changes never re-trigger it and chains stay short.
 */
export class Scheduler {
  private readonly armed = new Map<string, Armed>();
  private readonly lastFire = new Map<string, number>();
  private started = false;

  constructor(
    private readonly db: Db,
    private readonly agents: AgentsService,
    private readonly runs: RunsService,
    private readonly ha: HaGateway,
    private readonly coordination: CoordinationService,
    private readonly bus: EventBus<HubEvents>,
    private readonly logger: Logger,
  ) {
    agents.onChange((c) => this.started && this.syncAgent(c.agentId));
    this.bus.on('ha.ready', () => {
      // Time zone may have changed and HA trigger subscriptions need a live connection.
      if (this.started) this.syncAll();
    });
  }

  start(): void {
    this.started = true;
    this.syncAll();
    this.catchUpMisfires();
  }

  stop(): void {
    this.started = false;
    for (const a of this.armed.values()) a.stop();
    this.armed.clear();
  }

  private timeZone(): string | undefined {
    return this.ha.getStatus().timeZone ?? undefined;
  }

  syncAll(): void {
    const ids = new Set(this.agents.rows().map((r) => r.id));
    for (const [k, a] of this.armed) {
      if (!ids.has(a.agentId)) {
        a.stop();
        this.armed.delete(k);
      }
    }
    for (const id of ids) this.syncAgent(id);
  }

  private syncAgent(agentId: string): void {
    for (const [k, a] of this.armed) {
      if (a.agentId === agentId) {
        a.stop();
        this.armed.delete(k);
      }
    }
    let row;
    try {
      row = this.agents.row(agentId);
    } catch {
      return;
    }
    if (!row.enabled) return;
    const def = this.agents.definition(agentId);
    for (const t of def.triggers) {
      if (!t.enabled || t.kind === 'manual') continue;
      try {
        const armed = this.arm(agentId, row.current_revision, t);
        this.armed.set(key(agentId, t.id), armed);
        this.saveNext(agentId, t.id, armed.next?.() ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.armed.set(key(agentId, t.id), {
          agentId,
          revision: row.current_revision,
          trigger: t,
          stop: () => undefined,
          error: message,
        });
        this.logger.warn(
          { module: 'scheduler', agentId, trigger: t.id, error: message },
          'cannot arm trigger',
        );
      }
    }
  }

  private arm(agentId: string, revision: number, t: Trigger): Armed {
    const fire = (payload: Record<string, unknown>, chainDepth = 0) =>
      this.fire(agentId, t, payload, chainDepth);
    switch (t.kind) {
      case 'cron': {
        const job = new Cron(t.expression, { timezone: this.timeZone(), protect: true }, () => {
          fire({ scheduledFor: new Date().toISOString(), expression: t.expression });
          this.saveNext(agentId, t.id, job.nextRun());
        });
        return { agentId, revision, trigger: t, stop: () => job.stop(), next: () => job.nextRun() };
      }
      case 'interval': {
        const ms = t.minutes * 60_000;
        let next = Date.now() + ms;
        const timer = setInterval(() => {
          next = Date.now() + ms;
          fire({ everyMinutes: t.minutes });
          this.saveNext(agentId, t.id, new Date(next));
        }, ms);
        timer.unref();
        return {
          agentId,
          revision,
          trigger: t,
          stop: () => clearInterval(timer),
          next: () => new Date(next),
        };
      }
      case 'ha_state': {
        const pending = new Map<string, NodeJS.Timeout>();
        const unsub = this.subscribeState(
          t,
          agentId,
          (payload, chainDepth, entityId) => {
            if (!t.forSeconds) return fire(payload, chainDepth);
            clearTimeout(pending.get(entityId));
            const timer = setTimeout(() => {
              pending.delete(entityId);
              // still in the target state?
              const now = this.ha.registry.states.get(entityId);
              const value = t.attribute ? JSON.stringify(now?.attributes[t.attribute]) : now?.state;
              if (t.to === undefined || value === (t.attribute ? JSON.stringify(t.to) : t.to))
                fire({ ...payload, heldForSeconds: t.forSeconds }, chainDepth);
            }, t.forSeconds * 1000);
            timer.unref();
            pending.set(entityId, timer);
          },
          (entityId) => {
            // left the target state: cancel a pending "for" timer
            clearTimeout(pending.get(entityId));
            pending.delete(entityId);
          },
        );
        return {
          agentId,
          revision,
          trigger: t,
          stop: () => {
            unsub();
            for (const timer of pending.values()) clearTimeout(timer);
          },
        };
      }
      case 'ha_event': {
        const unsub = this.ha.onEvent(t.eventType, (ev: HassEvent) => {
          if (!subsetMatch(ev.data ?? {}, t.dataMatch)) return;
          const depth = this.chainDepthFor(ev.context, agentId);
          if (depth === null) return;
          fire({ eventType: ev.event_type, data: ev.data, timeFired: ev.time_fired }, depth);
        });
        return { agentId, revision, trigger: t, stop: unsub };
      }
      case 'ha_trigger': {
        let unsub: (() => Promise<void>) | null = null;
        let stopped = false;
        if (this.ha.connected) {
          void this.ha
            .subscribeTrigger(t.trigger, (vars) => {
              const trig = (vars.trigger ?? {}) as Record<string, unknown>;
              const ctx = (trig.context ??
                (trig.to_state as Record<string, unknown> | undefined)?.context) as
                { id: string; parent_id: string | null } | undefined;
              const depth = ctx ? this.chainDepthFor(ctx, agentId) : 0;
              if (depth === null) return;
              fire({ trigger: sanitize(trig) }, depth);
            })
            .then((u) => {
              if (stopped) void u().catch(() => undefined);
              else unsub = u;
            })
            .catch((err: unknown) => {
              const a = this.armed.get(key(agentId, t.id));
              if (a)
                a.error =
                  err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
              this.logger.warn(
                { module: 'scheduler', agentId, trigger: t.id, error: a?.error },
                'HA rejected trigger',
              );
            });
        }
        return {
          agentId,
          revision,
          trigger: t,
          stop: () => {
            stopped = true;
            void unsub?.().catch(() => undefined);
          },
          ...(this.ha.connected ? {} : { error: 'waiting for Home Assistant' }),
        };
      }
      default:
        throw new Error(`unsupported trigger kind ${(t as { kind: string }).kind}`);
    }
  }

  private subscribeState(
    t: Extract<Trigger, { kind: 'ha_state' }>,
    agentId: string,
    onMatch: (payload: Record<string, unknown>, chainDepth: number, entityId: string) => void,
    onLeave: (entityId: string) => void,
  ): () => void {
    const ids = new Set(t.entityIds.map((e) => e.toLowerCase()));
    return this.bus.on('ha.state_changed', (e) => {
      if (!ids.has(e.entityId)) return;
      const pick = (s: typeof e.newState) =>
        s ? (t.attribute ? JSON.stringify(s.attributes[t.attribute]) : s.state) : null;
      const before = pick(e.oldState);
      const after = pick(e.newState);
      if (before === after) return; // attribute-only change irrelevant to this trigger
      const want = (v: string | undefined) =>
        v === undefined ? undefined : t.attribute ? JSON.stringify(v) : v;
      if (want(t.from) !== undefined && before !== want(t.from)) return;
      if (want(t.to) !== undefined && after !== want(t.to)) {
        onLeave(e.entityId);
        return;
      }
      const depth = this.chainDepthFor(e.context, agentId);
      if (depth === null) return;
      onMatch(
        {
          entityId: e.entityId,
          from: e.oldState?.state ?? null,
          to: e.newState?.state ?? null,
          ...(t.attribute ? { attribute: t.attribute, fromValue: before, toValue: after } : {}),
          changedByPerson: Boolean(e.context.user_id && e.context.user_id !== this.ha.ownUserId),
          at: e.timeFired,
        },
        depth,
        e.entityId,
      );
    });
  }

  /**
   * Chain depth for a run triggered by an event with this context, or null to drop it:
   * the agent's own changes never trigger itself, and chains deeper than the limit stop.
   */
  private chainDepthFor(context: { id: string; parent_id: string | null }, agentId: string): number | null {
    const origin = this.coordination.originOf(context);
    if (!origin) return 0;
    if (origin.agentId === agentId) return null;
    const depth = origin.chainDepth + 1;
    if (depth > this.coordination.config.get().maxChainDepth) {
      this.logger.warn({ module: 'scheduler', agentId, depth }, 'dropping trigger: chain too deep');
      return null;
    }
    return depth;
  }

  private fire(agentId: string, t: Trigger, payload: Record<string, unknown>, chainDepth: number): void {
    const k = key(agentId, t.id);
    const now = Date.now();
    if (t.debounceSeconds && now - (this.lastFire.get(k) ?? 0) < t.debounceSeconds * 1000) return;
    this.lastFire.set(k, now);
    this.db
      .prepare(
        `INSERT INTO trigger_state (trigger_id, agent_id, last_fired_at, fire_count) VALUES (?, ?, ?, 1)
         ON CONFLICT(trigger_id) DO UPDATE SET last_fired_at = excluded.last_fired_at, fire_count = fire_count + 1`,
      )
      .run(k, agentId, now);
    try {
      this.runs.enqueue({ agentId, triggerId: t.id, triggerKind: t.kind, payload, chainDepth });
    } catch (err) {
      this.logger.warn({ module: 'scheduler', agentId, trigger: t.id, err }, 'cannot enqueue run');
    }
  }

  private saveNext(agentId: string, triggerId: string, next: Date | null): void {
    this.db
      .prepare(
        `INSERT INTO trigger_state (trigger_id, agent_id, next_fire_at) VALUES (?, ?, ?)
         ON CONFLICT(trigger_id) DO UPDATE SET next_fire_at = excluded.next_fire_at`,
      )
      .run(key(agentId, triggerId), agentId, next ? next.getTime() : null);
  }

  /** After downtime, run each schedule whose fire time passed at most once (when the agent asks for it). */
  private catchUpMisfires(): void {
    const now = Date.now();
    const rows = this.db
      .prepare('SELECT * FROM trigger_state WHERE next_fire_at IS NOT NULL AND next_fire_at < ?')
      .all(now - 60_000) as StateRow[];
    for (const r of rows) {
      const [agentId, triggerId] = r.trigger_id.split(':') as [string, string];
      try {
        const def = this.agents.definition(agentId);
        const t = def.triggers.find((x) => x.id === triggerId);
        if (!t || !t.enabled || def.limits.misfire !== 'run_once' || !this.agents.row(agentId).enabled)
          continue;
        this.runs.enqueue({
          agentId,
          triggerId,
          triggerKind: t.kind,
          payload: { misfired: true, scheduledFor: new Date(r.next_fire_at!).toISOString() },
        });
      } catch {
        // agent deleted meanwhile
      }
    }
  }

  triggerStates(agentId: string) {
    const def = this.agents.definition(agentId);
    return def.triggers.map((t) => {
      const k = key(agentId, t.id);
      const row = this.db.prepare('SELECT * FROM trigger_state WHERE trigger_id = ?').get(k) as
        StateRow | undefined;
      const armed = this.armed.get(k);
      const next = armed?.next?.() ?? null;
      return {
        triggerId: t.id,
        lastFiredAt: row?.last_fired_at ? new Date(row.last_fired_at).toISOString() : null,
        nextFireAt: next ? next.toISOString() : null,
        fireCount: row?.fire_count ?? 0,
        error: armed?.error ?? null,
      };
    });
  }

  nextFire(agentId: string): string | null {
    let best: Date | null = null;
    for (const a of this.armed.values()) {
      if (a.agentId !== agentId) continue;
      const n = a.next?.();
      if (n && (!best || n < best)) best = n;
    }
    return best ? best.toISOString() : null;
  }

  upcoming(limit = 50) {
    const out: Array<{
      agentId: string;
      agentName: string;
      triggerId: string;
      triggerName: string;
      kind: Trigger['kind'];
      at: string;
    }> = [];
    for (const a of this.armed.values()) {
      const n = a.next?.();
      if (!n) continue;
      const name = this.agentName(a.agentId);
      if (name === null) continue;
      out.push({
        agentId: a.agentId,
        agentName: name,
        triggerId: a.trigger.id,
        triggerName: a.trigger.name || a.trigger.id,
        kind: a.trigger.kind,
        at: n.toISOString(),
      });
    }
    return out.sort((x, y) => x.at.localeCompare(y.at)).slice(0, limit);
  }

  private agentName(id: string): string | null {
    try {
      return this.agents.row(id).name;
    } catch {
      return null;
    }
  }

  /** Fire a trigger by hand (UI "test trigger" button). */
  test(agentId: string, triggerId: string): void {
    const def = this.agents.definition(agentId);
    const t = def.triggers.find((x) => x.id === triggerId);
    if (!t) throw new Error('trigger not found');
    this.runs.enqueue({ agentId, triggerId, triggerKind: t.kind, payload: { test: true } });
  }
}

function sanitize(v: Record<string, unknown>): Record<string, unknown> {
  const s = JSON.stringify(v, (_k, val: unknown) =>
    typeof val === 'string' && val.length > 2000 ? val.slice(0, 2000) : val,
  );
  return JSON.parse(s.length > 20_000 ? JSON.stringify({ truncated: true }) : s) as Record<string, unknown>;
}
