import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from './principal.ts';

/** Metadata of the tool call currently executing, visible to guards deep inside the HA gateway. */
export interface ToolCallContext {
  principal: Principal;
  toolName: string;
  toolCallId: string;
  runId: string;
  sessionId?: string;
  agentId?: string;
  signal?: AbortSignal;
}

export const toolCallStore = new AsyncLocalStorage<ToolCallContext>();

export const currentToolCall = (): ToolCallContext | undefined => toolCallStore.getStore();
