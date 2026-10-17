import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import type { Api, ImageContent, Model, Static, TSchema } from '@earendil-works/pi-ai';
import { AppError } from '../../core/errors.ts';
import type { Principal } from '../../core/principal.ts';
import { toolCallStore } from '../../core/tool-context.ts';

/** What a tool may do. Subagent definitions grant tools by name; risk drives UI badges and defaults. */
export type ToolRisk = 'read' | 'control' | 'configure' | 'system';

export interface ToolEnv {
  principal: Principal;
  runId: string;
  sessionId?: string;
  agentId?: string;
  model: Model<Api>;
  signal?: AbortSignal;
}

export interface ToolOutput {
  text: string;
  images?: ImageContent[];
  /** Structured data for the UI (not sent to the model). */
  details?: unknown;
  isError?: boolean;
}

export interface ToolDef<P extends TSchema = TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: P;
  risk: ToolRisk;
  group: 'home' | 'config' | 'system' | 'agents' | 'memory';
  /** Run tools of this kind one at a time (state-changing tools). */
  sequential?: boolean;
  execute(env: ToolEnv, params: Static<P>, signal?: AbortSignal): Promise<ToolOutput>;
}

/** Identity helper that keeps the parameter type of a tool while erasing it for collections. */
export function defineTool<P extends TSchema>(def: ToolDef<P>): ToolDef {
  return def as unknown as ToolDef;
}

export const MAX_TOOL_TEXT = 16_000;

export function clipText(text: string, max = MAX_TOOL_TEXT): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n…[output truncated: ${text.length - max} more characters. Narrow the query.]`;
}

/** Bind a tool definition to a run, exposing it to pi with tool-call context for guards. */
export function toAgentTool(def: ToolDef, env: ToolEnv): AgentTool {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    executionMode: def.sequential ? 'sequential' : undefined,
    execute: async (toolCallId, params, signal): Promise<AgentToolResult<unknown>> =>
      toolCallStore.run(
        {
          principal: env.principal,
          toolName: def.name,
          toolCallId,
          runId: env.runId,
          sessionId: env.sessionId,
          agentId: env.agentId,
          signal: signal ?? env.signal,
        },
        async () => {
          try {
            const out = await def.execute({ ...env, signal: signal ?? env.signal }, params as never, signal);
            return {
              content: [{ type: 'text', text: clipText(out.text) }, ...(out.images ?? [])],
              details: (out.details ?? null) as never,
              isError: out.isError,
            };
          } catch (err) {
            const e = err instanceof AppError ? err : null;
            const message = e
              ? `Error (${e.code}): ${e.message}`
              : `Error: ${err instanceof Error ? err.message : String(err)}`;
            return {
              content: [{ type: 'text', text: message }],
              details: { error: e?.code ?? 'error' } as never,
              isError: true,
            };
          }
        },
      ),
  };
}
