import { StringEnum, Type } from '@earendil-works/pi-ai';
import { AppError } from '../../core/errors.ts';
import { principalId } from '../../core/principal.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import { defineTool, type ToolDef, type ToolEnv } from '../tools/types.ts';
import type { RunsService } from './runs.ts';
import type { AgentsService } from './service.ts';

function sessionOnly(env: ToolEnv): string {
  if (env.principal.kind !== 'session')
    throw new AppError(403, 'forbidden', 'Only main sessions can manage subagents');
  return env.principal.sessionId;
}

const Json = Type.Record(Type.String(), Type.Unknown());

const DEFINITION_HELP = `An agent definition is JSON with:
- name, description, instructions (what to do when triggered; be specific), modelRef (null = default), contextMode ("isolated" | "continuous")
- tools: names from tools_catalog (e.g. ["ha_search_entities","ha_get_states","ha_call_service","memory_write"])
- permissions: rules {id, effect:"allow"|"deny", access:"read"|"control"|"configure", targets:{all?, entities?:["light.*"], domains?, areas?, floors?, devices?, labels?}, services?:["turn_on"], constraints?:{numeric?:[{field,min,max}], timeWindow?:{start:"22:00",end:"06:00",days?:[]}, maxCallsPerHour?}}
  Default deny: grant only what the task needs. Control includes read.
- triggers: {id, kind, ...} kinds: cron {expression:"0 7 * * *"}, interval {minutes}, ha_state {entityIds, to?, from?, attribute?, forSeconds?}, ha_event {eventType, dataMatch?}, ha_trigger {trigger:{platform:"sun",event:"sunset"}}, manual {}
- highRisk: "deny" | "approve" | "allow"; allowIndirectActions (default false; scripts/scenes/automations can affect devices beyond their target); limits {maxRunSeconds, maxToolCalls, dailyCostLimit, overlap, misfire}; priority 1-100; respectManualMinutes.`;

/** Tools that let main sessions create and direct subagents. Never grantable to subagents. */
export function agentManagementTools(
  agents: AgentsService,
  runs: RunsService,
  registry: () => ToolRegistry,
): ToolDef[] {
  const brief = (id: string) => {
    const row = agents.row(id);
    const def = agents.definition(row.id);
    const last = runs.lastRun(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      enabled: row.enabled === 1,
      revision: row.current_revision,
      description: def.description,
      triggers: def.triggers.map((t) => `${t.id}:${t.kind}${t.enabled ? '' : '(off)'}`),
      lastRun: last ? { id: last.id, status: last.status, at: last.finishedAt ?? last.queuedAt } : null,
    };
  };

  return [
    defineTool({
      name: 'tools_catalog',
      label: 'Tool catalog',
      group: 'agents',
      risk: 'system',
      description: 'Tools that can be granted to subagents, with their risk level.',
      parameters: Type.Object({}),
      execute: async (env) => {
        sessionOnly(env);
        const grantable = new Set(agents.grantableTools());
        const lines = registry()
          .catalog()
          .filter((t) => grantable.has(t.name))
          .map((t) => `${t.name} [${t.risk}] — ${t.description.split('. ')[0]}`);
        return {
          text: `${lines.join('\n')}\nmemory_list / memory_write / memory_delete [memory] — always available to subagents`,
        };
      },
    }),
    defineTool({
      name: 'agents_list',
      label: 'List subagents',
      group: 'agents',
      risk: 'system',
      description: 'All subagents with their triggers and last run.',
      parameters: Type.Object({}),
      execute: async (env) => {
        sessionOnly(env);
        const list = agents.rows().map((r) => brief(r.id));
        return { text: list.length ? JSON.stringify(list, null, 1) : 'No subagents yet.' };
      },
    }),
    defineTool({
      name: 'agent_get',
      label: 'Read subagent',
      group: 'agents',
      risk: 'system',
      description:
        'Full definition (with current revision), memory and recent runs of a subagent, by id or slug.',
      parameters: Type.Object({ agent: Type.String() }),
      execute: async (env, p) => {
        sessionOnly(env);
        const row = agents.row(p.agent);
        return {
          text: JSON.stringify(
            {
              ...brief(row.id),
              definition: agents.definition(row.id),
              memory: agents
                .memory(row.id)
                .map((m) => ({ title: m.title, content: m.content.slice(0, 500) })),
              recentRuns: runs.list({ agentId: row.id, limit: 5 }).map((r) => ({
                id: r.id,
                status: r.status,
                at: r.queuedAt,
                summary: r.summary?.slice(0, 300),
                error: r.error,
              })),
            },
            null,
            1,
          ),
        };
      },
    }),
    defineTool({
      name: 'agent_create',
      label: 'Create subagent',
      group: 'agents',
      risk: 'system',
      sequential: true,
      description: `Create a persistent subagent that runs on its triggers with its own memory.\n${DEFINITION_HELP}`,
      parameters: Type.Object({ definition: Json, note: Type.Optional(Type.String()) }),
      execute: async (env, p) => {
        sessionOnly(env);
        const row = agents.create(p.definition as never, principalId(env.principal), p.note);
        return {
          text: `Created subagent ${row.name} (id ${row.id}, slug ${row.slug}, revision 1).`,
          details: { agentId: row.id },
        };
      },
    }),
    defineTool({
      name: 'agent_update',
      label: 'Update subagent',
      group: 'agents',
      risk: 'system',
      sequential: true,
      description:
        'Replace a subagent definition. Read it with agent_get first and pass that revision as base_revision; if another session changed it meanwhile the update fails and you must re-read and merge.',
      parameters: Type.Object({
        agent: Type.String(),
        base_revision: Type.Integer(),
        definition: Json,
        note: Type.Optional(Type.String()),
      }),
      execute: async (env, p) => {
        sessionOnly(env);
        const row = agents.update(
          p.agent,
          p.base_revision,
          p.definition as never,
          principalId(env.principal),
          p.note,
        );
        return { text: `Updated ${row.name}; now at revision ${row.current_revision}.` };
      },
    }),
    defineTool({
      name: 'agent_set_enabled',
      label: 'Enable/disable subagent',
      group: 'agents',
      risk: 'system',
      parameters: Type.Object({ agent: Type.String(), enabled: Type.Boolean() }),
      description: "Turn a subagent's triggers on or off.",
      execute: async (env, p) => {
        sessionOnly(env);
        const row = agents.setEnabled(p.agent, p.enabled);
        return { text: `${row.name} is now ${row.enabled ? 'enabled' : 'disabled'}.` };
      },
    }),
    defineTool({
      name: 'agent_delete',
      label: 'Delete subagent',
      group: 'agents',
      risk: 'system',
      sequential: true,
      description: 'Delete a subagent with its memory and run history. Confirm with the user first.',
      parameters: Type.Object({ agent: Type.String() }),
      execute: async (env, p) => {
        sessionOnly(env);
        const row = agents.row(p.agent);
        runs.ensureNotRunning(row.id);
        agents.delete(row.id);
        return { text: `Deleted subagent ${row.name}.` };
      },
    }),
    defineTool({
      name: 'agent_run',
      label: 'Dispatch task',
      group: 'agents',
      risk: 'system',
      description:
        'Ask a subagent to run now with a task. Its report is added to this conversation when it finishes (report_back, default true). Returns immediately.',
      parameters: Type.Object({
        agent: Type.String(),
        task: Type.String(),
        report_back: Type.Optional(Type.Boolean({ default: true })),
      }),
      execute: async (env, p) => {
        const sessionId = sessionOnly(env);
        const row = agents.row(p.agent);
        const run = runs.enqueue({
          agentId: row.id,
          triggerKind: 'manual',
          task: p.task,
          requestedBy: principalId(env.principal),
          reportSessionId: p.report_back === false ? null : sessionId,
        });
        return {
          text: `Queued run ${run.id} for ${row.name}${p.report_back === false ? '' : '; its report will appear here when done'}.`,
          details: { runId: run.id },
        };
      },
    }),
    defineTool({
      name: 'agent_runs',
      label: 'Subagent runs',
      group: 'agents',
      risk: 'system',
      description: 'Recent runs of a subagent with their status and report.',
      parameters: Type.Object({
        agent: Type.String(),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
        status: Type.Optional(
          StringEnum([
            'queued',
            'running',
            'waiting_approval',
            'succeeded',
            'failed',
            'aborted',
            'skipped',
          ] as const),
        ),
      }),
      execute: async (env, p) => {
        sessionOnly(env);
        const list = runs.list({ agentId: p.agent, limit: p.limit ?? 10, status: p.status });
        return {
          text: list.length
            ? list
                .map(
                  (r) =>
                    `${r.id} ${r.status} ${r.queuedAt} (${r.triggerKind})${r.error ? ` error: ${r.error}` : ''}\n  ${r.summary?.replace(/\s+/g, ' ').slice(0, 400) ?? ''}`,
                )
                .join('\n')
            : 'No runs yet.',
        };
      },
    }),
  ];
}

/** Memory tools bound to one subagent. */
export function memoryTools(agents: AgentsService, agentId: string): ToolDef[] {
  return [
    defineTool({
      name: 'memory_list',
      label: 'Read memory',
      group: 'memory',
      risk: 'read',
      description: 'Your memory notes (also shown in your instructions).',
      parameters: Type.Object({}),
      execute: async () => {
        const notes = agents.memory(agentId);
        return {
          text: notes.length
            ? notes.map((n) => `[${n.id}] ${n.title}\n${n.content}`).join('\n\n')
            : 'Memory is empty.',
        };
      },
    }),
    defineTool({
      name: 'memory_write',
      label: 'Write memory',
      group: 'memory',
      risk: 'read',
      description:
        'Remember something across runs. Pass id to update an existing note instead of creating a duplicate.',
      parameters: Type.Object({
        title: Type.String({ maxLength: 200 }),
        content: Type.String({ maxLength: 20_000 }),
        id: Type.Optional(Type.String()),
      }),
      execute: async (env, p) => {
        const note = agents.saveMemory(agentId, p, principalId(env.principal));
        return { text: `Saved note ${note.id}.` };
      },
    }),
    defineTool({
      name: 'memory_delete',
      label: 'Delete memory',
      group: 'memory',
      risk: 'read',
      description: 'Delete a memory note by id.',
      parameters: Type.Object({ id: Type.String() }),
      execute: async (_env, p) => {
        agents.deleteMemory(agentId, p.id);
        return { text: 'Deleted.' };
      },
    }),
  ];
}
