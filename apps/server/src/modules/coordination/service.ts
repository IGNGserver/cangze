import { z } from 'zod';
import { AppError } from '../../core/errors.ts';
import type { EventBus } from '../../core/events.ts';
import type { HubEvents } from '../../core/hub-events.ts';
import { principalId, type Principal } from '../../core/principal.ts';
import type { HaGateway, WriteRequest } from '../ha/gateway.ts';
import type { SettingsService } from '../settings/service.ts';

export const CoordinationSetting = z
  .object({
    /** A higher-priority writer's change is protected from lower-priority writers for this long. */
    holdMinutes: z.number().int().min(0).max(1440),
    /** Maximum writes per entity per minute by subagents (flap protection). */
    maxWritesPerMinute: z.number().int().min(1).max(600),
    /** Event chains (agent → state change → agent …) deeper than this are dropped. */
    maxChainDepth: z.number().int().min(1).max(10),
  })
  .default({ holdMinutes: 5, maxWritesPerMinute: 6, maxChainDepth: 3 });

type AgentPrincipal = Extract<Principal, { kind: 'agent' }>;

interface WriteRecord {
  principal: string;
  priority: number;
  at: number;
  agentId: string | null;
}

/** Context ids of writes we made, so triggers can tell our own effects (and their origin) apart. */
interface ContextOrigin {
  agentId: string | null;
  runId: string | null;
  chainDepth: number;
  at: number;
}

const SESSION_PRIORITY = 1000;
const ADMIN_PRIORITY = 2000;

/**
 * Arbitrates writes between humans, main sessions and subagents:
 * human changes win for a while, higher priority writers are protected from lower ones,
 * entities cannot be flapped, and trigger chains are traced to prevent loops.
 */
export class CoordinationService {
  readonly config;
  private readonly lastWrite = new Map<string, WriteRecord>();
  private readonly writeTimes = new Map<string, number[]>();
  private readonly manualAt = new Map<string, number>();
  private readonly origins = new Map<string, ContextOrigin>();
  /** Priority / respect-manual settings of agents, provided by the agents module. */
  private agentInfo: (
    p: AgentPrincipal,
  ) => { priority: number; respectManualMinutes: number; chainDepth: number } | null = () => null;

  constructor(
    settings: SettingsService,
    private readonly ha: HaGateway,
    bus: EventBus<HubEvents>,
  ) {
    this.config = settings.define('coordination', CoordinationSetting);
    bus.on('ha.state_changed', (e) => {
      const user = e.context.user_id;
      if (user && user !== this.ha.ownUserId) this.manualAt.set(e.entityId, Date.now());
    });
  }

  setAgentInfo(fn: CoordinationService['agentInfo']): void {
    this.agentInfo = fn;
  }

  install(): void {
    this.ha.addWriteGuard((req) => this.guard(req));
    this.ha.addWriteObserver((req, outcome) => {
      if (outcome.ok) this.record(req.principal, req.entityIds, outcome.result.contextId);
    });
  }

  private priorityOf(p: Principal): number {
    if (p.kind === 'admin') return ADMIN_PRIORITY;
    if (p.kind === 'session' || p.kind === 'system') return SESSION_PRIORITY;
    return this.agentInfo(p)?.priority ?? 50;
  }

  guard(req: WriteRequest): void {
    const p = req.principal;
    if (p.kind !== 'agent' || req.kind !== 'service') return;
    const info = this.agentInfo(p);
    const cfg = this.config.get();
    const now = Date.now();
    const myPriority = info?.priority ?? 50;
    const me = principalId(p);
    for (const id of req.entityIds) {
      const manual = this.manualAt.get(id);
      const respect = (info?.respectManualMinutes ?? 30) * 60_000;
      if (manual && now - manual < respect) {
        throw new AppError(
          409,
          'conflict_manual',
          `${id} was changed by a person ${Math.round((now - manual) / 60_000)} min ago; leave it alone for ${Math.round(respect / 60_000)} min.`,
        );
      }
      const last = this.lastWrite.get(id);
      if (
        last &&
        last.principal !== me &&
        last.priority > myPriority &&
        now - last.at < cfg.holdMinutes * 60_000
      ) {
        throw new AppError(
          409,
          'conflict_priority',
          `${id} was just changed by ${last.principal}, which has higher priority.`,
        );
      }
      const times = (this.writeTimes.get(id) ?? []).filter((t) => now - t < 60_000);
      if (times.length >= cfg.maxWritesPerMinute) {
        throw new AppError(
          409,
          'conflict_flap',
          `${id} changed ${times.length} times in the last minute; refusing to flap it.`,
        );
      }
    }
  }

  record(p: Principal, entityIds: string[], contextId: string | null): void {
    const now = Date.now();
    const rec: WriteRecord = {
      principal: principalId(p),
      priority: this.priorityOf(p),
      at: now,
      agentId: p.kind === 'agent' ? p.agentId : null,
    };
    for (const id of entityIds) {
      this.lastWrite.set(id, rec);
      this.writeTimes.set(id, [...(this.writeTimes.get(id) ?? []).filter((t) => now - t < 60_000), now]);
    }
    if (contextId) {
      this.origins.set(contextId, {
        agentId: rec.agentId,
        runId: p.kind === 'agent' || p.kind === 'session' ? p.runId : null,
        chainDepth: p.kind === 'agent' ? (this.agentInfo(p)?.chainDepth ?? 0) : 0,
        at: now,
      });
    }
    this.prune(now);
  }

  /** Where an HA context came from: one of our runs (and how deep its chain is) or elsewhere. */
  originOf(context: { id: string; parent_id: string | null }): ContextOrigin | null {
    return (
      this.origins.get(context.id) ??
      (context.parent_id ? (this.origins.get(context.parent_id) ?? null) : null)
    );
  }

  lastManualChange(entityId: string): number | null {
    return this.manualAt.get(entityId) ?? null;
  }

  private prune(now: number): void {
    if (this.origins.size < 5000) return;
    for (const [k, v] of this.origins) if (now - v.at > 30 * 60_000) this.origins.delete(k);
  }
}
