import {
  AgentDetail,
  AgentRevision,
  AgentSummary,
  EffectivePermissions,
  IdParams,
  MemoryNote,
  Ok,
  RunAgent,
  RunStatus,
  RunSummary,
  SaveAgent,
  SaveMemoryNote,
  UpcomingFire,
} from '@cangze/contracts';
import { z } from 'zod';
import { badRequest } from '../../core/errors.ts';
import { principalId } from '../../core/principal.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { Scheduler } from '../scheduler/service.ts';
import type { UsageLedger } from '../usage/ledger.ts';
import { adminPrincipal } from '../auth/hook.ts';
import { effectivePermissions } from './permissions.ts';
import type { RunsService } from './runs.ts';
import type { AgentsService } from './service.ts';

const MemoryParams = z.object({ id: z.string(), noteId: z.string() });
const TriggerParams = z.object({ id: z.string(), triggerId: z.string() });

export function agentRoutes(
  agents: AgentsService,
  runs: RunsService,
  scheduler: Scheduler,
  usage: UsageLedger,
  ha: HaGateway,
): RouteSpec[] {
  const summary = (id: string): AgentSummary => {
    const r = agents.row(id);
    const def = agents.definition(r.id);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      enabled: r.enabled === 1,
      revision: r.current_revision,
      modelRef: def.modelRef,
      triggerCount: def.triggers.length,
      running: runs.isAgentRunning(r.id),
      lastRun: runs.lastRun(r.id),
      nextFireAt: scheduler.nextFire(r.id),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  };
  const detail = (id: string): AgentDetail => {
    const s = summary(id);
    return {
      ...s,
      definition: agents.definition(s.id),
      triggers: scheduler.triggerStates(s.id),
      costToday: usage.costToday('agent', s.id),
      stats: runs.stats(s.id),
    };
  };

  return [
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/:id/stop',
      summary: 'Emergency stop a subagent',
      tags: ['agents'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        runs.emergencyStop(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/agents',
      summary: 'List subagents',
      tags: ['agents'],
      response: z.array(AgentSummary),
      handler: () => agents.rows().map((r) => summary(r.id)),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents',
      summary: 'Create a subagent',
      tags: ['agents'],
      body: SaveAgent,
      response: AgentDetail,
      status: 201,
      handler: ({ body, req }) =>
        detail(agents.create(body.definition, principalId(adminPrincipal(req)), body.note).id),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/validate',
      summary: 'Validate a definition without saving it',
      tags: ['agents'],
      body: SaveAgent,
      response: Ok,
      handler: ({ body }) => {
        agents.validate(body.definition);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/agents/:id',
      summary: 'Subagent with its current definition, trigger states and statistics',
      tags: ['agents'],
      params: IdParams,
      response: AgentDetail,
      handler: ({ params }) => detail(params.id),
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/agents/:id',
      summary: 'Save a new revision (requires baseRevision)',
      tags: ['agents'],
      params: IdParams,
      body: SaveAgent,
      response: AgentDetail,
      handler: ({ params, body, req }) => {
        if (body.baseRevision === undefined) throw badRequest('baseRevision is required');
        return detail(
          agents.update(
            params.id,
            body.baseRevision,
            body.definition,
            principalId(adminPrincipal(req)),
            body.note,
          ).id,
        );
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/:id/enabled',
      summary: 'Enable or disable a subagent',
      tags: ['agents'],
      params: IdParams,
      body: z.object({ enabled: z.boolean() }),
      response: AgentSummary,
      handler: ({ params, body }) => summary(agents.setEnabled(params.id, body.enabled).id),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/agents/:id',
      summary: 'Delete a subagent, its memory and runs',
      tags: ['agents'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        const r = agents.row(params.id);
        runs.ensureNotRunning(r.id);
        agents.delete(r.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/agents/:id/revisions',
      summary: 'All revisions of a subagent',
      tags: ['agents'],
      params: IdParams,
      response: z.array(AgentRevision),
      handler: ({ params }) => agents.revisions(params.id),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/agents/:id/permissions',
      summary: 'Entities the current rules resolve to',
      tags: ['agents'],
      params: IdParams,
      response: EffectivePermissions,
      handler: ({ params }) => effectivePermissions(agents.definition(params.id).permissions, ha.registry),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/permissions/preview',
      summary: 'Resolve unsaved permission rules to entities',
      tags: ['agents'],
      body: SaveAgent.shape.definition.shape.permissions,
      response: EffectivePermissions,
      handler: ({ body }) => effectivePermissions(body, ha.registry),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/:id/run',
      summary: 'Run a subagent now',
      tags: ['agents'],
      params: IdParams,
      body: RunAgent,
      response: RunSummary,
      handler: ({ params, body, req }) =>
        runs.enqueue({
          agentId: params.id,
          triggerKind: 'manual',
          task: body.task ?? null,
          requestedBy: principalId(adminPrincipal(req)),
        }),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/:id/triggers/:triggerId/test',
      summary: 'Fire a trigger once',
      tags: ['agents'],
      params: TriggerParams,
      response: Ok,
      handler: ({ params }) => {
        scheduler.test(agents.row(params.id).id, params.triggerId);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/agents/:id/memory',
      summary: 'Memory notes of a subagent',
      tags: ['agents'],
      params: IdParams,
      response: z.array(MemoryNote),
      handler: ({ params }) => agents.memory(params.id),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/agents/:id/memory',
      summary: 'Add a memory note',
      tags: ['agents'],
      params: IdParams,
      body: SaveMemoryNote,
      response: MemoryNote,
      handler: ({ params, body, req }) =>
        agents.saveMemory(params.id, body, principalId(adminPrincipal(req))),
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/agents/:id/memory/:noteId',
      summary: 'Edit a memory note',
      tags: ['agents'],
      params: MemoryParams,
      body: SaveMemoryNote,
      response: MemoryNote,
      handler: ({ params, body, req }) =>
        agents.saveMemory(params.id, { ...body, id: params.noteId }, principalId(adminPrincipal(req))),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/agents/:id/memory/:noteId',
      summary: 'Delete a memory note',
      tags: ['agents'],
      params: MemoryParams,
      response: Ok,
      handler: ({ params }) => {
        agents.deleteMemory(params.id, params.noteId);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/agents/:id/memory',
      summary: 'Clear all memory of a subagent',
      tags: ['agents'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        agents.clearMemory(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/runs',
      summary: 'Subagent runs, newest first',
      tags: ['agents'],
      query: z.object({
        agentId: z.string().max(64).optional(),
        status: RunStatus.optional(),
        before: z.string().max(64).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      response: z.array(RunSummary),
      handler: ({ query }) => runs.list(query),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/runs/:id',
      summary: 'A run with its transcript (read-only)',
      tags: ['agents'],
      params: IdParams,
      response: z.object({
        run: RunSummary,
        entries: z.array(z.record(z.string(), z.unknown())),
        live: z.record(z.string(), z.unknown()).nullable(),
        approvals: z.array(z.record(z.string(), z.unknown())),
        streamSeq: z.number(),
      }),
      handler: ({ params }) => runs.detail(params.id) as never,
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/runs/:id/abort',
      summary: 'Abort a queued or running run',
      tags: ['agents'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        runs.abort(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/scheduler/upcoming',
      summary: 'Next scheduled firings',
      tags: ['agents'],
      query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }),
      response: z.array(UpcomingFire),
      handler: ({ query }) => scheduler.upcoming(query.limit),
    }),
  ];
}
