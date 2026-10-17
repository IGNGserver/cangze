import type { ThinkingLevel } from '@cangze/contracts';
import { Agent, type AgentEvent, type AgentMessage } from '@earendil-works/pi-agent-core';
import {
  lazyStream,
  type Api,
  type AssistantMessage,
  type Context,
  type Message,
  type Model,
  type Models,
  type Usage,
} from '@earendil-works/pi-ai';
import type { Logger } from 'pino';
import type { Principal } from '../../core/principal.ts';
import { buildContext, trimOldToolResults } from '../conversations/context.ts';
import { toWire, type ConversationStore, type StoredEntry } from '../conversations/store.ts';
import type { StreamHub } from '../stream/hub.ts';
import { toAgentTool, type ToolDef, type ToolEnv } from '../tools/types.ts';

export interface RunSpec {
  runId: string;
  conversationId: string;
  /** Stream topic receiving run events (`session:<id>` or `run:<id>`). */
  topic: string;
  principal: Principal;
  model: Model<Api>;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;
  tools: ToolDef[];
  toolEnv: Omit<ToolEnv, 'model'>;
  /** New entries attach below this entry (normally the active leaf). */
  parentEntryId: string | null;
  /** Messages that start the run (usually one user message). Empty = continue from the transcript. */
  input: AgentMessage[];
  maxTokens?: number;
  onAssistant?: (message: AssistantMessage) => void;
  onEntry?: (entry: StoredEntry) => void;
}

export type RunStatus = 'completed' | 'aborted' | 'error';

export interface RunOutcome {
  status: RunStatus;
  error?: string;
  lastEntryId: string | null;
  finalText: string;
  usage: Usage[];
}

const PARTIAL_THROTTLE_MS = 80;

/** A run in flight. Exposes steering, abort and a live snapshot for reconnecting clients. */
export class ActiveRun {
  readonly startedAt = new Date();
  partial: AssistantMessage | null = null;
  readonly tools = new Map<string, { toolCallId: string; name: string; args: unknown; partial?: unknown }>();
  readonly done: Promise<RunOutcome>;
  lastEntryId: string | null;

  constructor(
    readonly runId: string,
    private readonly agent: Agent,
    parentEntryId: string | null,
    run: (self: ActiveRun) => Promise<RunOutcome>,
  ) {
    this.lastEntryId = parentEntryId;
    this.done = run(this);
  }

  get queued(): number {
    return this.agent.peekQueuedMessages().length;
  }

  steer(message: AgentMessage): void {
    this.agent.steer(message);
  }

  followUp(message: AgentMessage): void {
    this.agent.followUp(message);
  }

  abort(): void {
    this.agent.abort();
  }

  snapshot() {
    return {
      runId: this.runId,
      startedAt: this.startedAt.toISOString(),
      partial: this.partial as unknown as Record<string, unknown> | null,
      tools: [...this.tools.values()],
      queued: this.queued,
    };
  }
}

/** Drives one pi Agent per run and persists everything it produces into the conversation tree. */
export class AgentRunner {
  constructor(
    private readonly models: Models,
    private readonly store: ConversationStore,
    private readonly stream: StreamHub,
    private readonly logger: Logger,
  ) {}

  start(spec: RunSpec): ActiveRun {
    const context = trimOldToolResults(
      buildContext(this.store.path(spec.conversationId, spec.parentEntryId)),
    );
    const env: ToolEnv = { ...spec.toolEnv, model: spec.model };
    const models = this.models;
    const agent = new Agent({
      initialState: {
        systemPrompt: spec.systemPrompt,
        model: spec.model,
        thinkingLevel: spec.thinkingLevel,
        tools: spec.tools.map((t) => toAgentTool(t, env)),
        messages: context,
      },
      streamFn: (model, ctx, options) => {
        try {
          return models.streamSimple(model, ctx as unknown as Context, {
            ...options,
            ...(spec.maxTokens ? { maxTokens: spec.maxTokens } : {}),
          });
        } catch (err) {
          return lazyStream(model, async () => {
            throw err;
          });
        }
      },
      transformContext: async (messages) => trimOldToolResults(messages),
      steeringMode: 'all',
      followUpMode: 'all',
      toolExecution: 'sequential',
      sessionId: spec.conversationId,
    });

    return new ActiveRun(spec.runId, agent, spec.parentEntryId, async (run) => {
      const publish = (data: unknown) => this.stream.publish(spec.topic, data);
      const usage: Usage[] = [];
      let lastAssistant: AssistantMessage | null = null;
      let partialTimer: NodeJS.Timeout | null = null;
      const flushPartial = () => {
        partialTimer = null;
        if (run.partial) publish({ kind: 'partial', runId: spec.runId, message: run.partial });
      };

      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        switch (event.type) {
          case 'message_start':
          case 'message_update': {
            const m = event.message as Message;
            if (m.role !== 'assistant') return;
            run.partial = m;
            if (!partialTimer) partialTimer = setTimeout(flushPartial, PARTIAL_THROTTLE_MS);
            return;
          }
          case 'message_end': {
            const m = event.message as Message;
            if (m.role === 'system') return;
            if (m.role === 'assistant') {
              if (partialTimer) clearTimeout(partialTimer);
              partialTimer = null;
              run.partial = null;
              lastAssistant = m;
              if (m.usage) usage.push(m.usage);
              spec.onAssistant?.(m);
            }
            const entry = this.store.append(
              spec.conversationId,
              run.lastEntryId,
              'message',
              { message: m },
              { role: m.role, runId: spec.runId },
            );
            run.lastEntryId = entry.id;
            spec.onEntry?.(entry);
            publish({ kind: 'entry', entry: toWire(entry), activeLeafId: entry.id });
            return;
          }
          case 'tool_execution_start':
            run.tools.set(event.toolCallId, {
              toolCallId: event.toolCallId,
              name: event.toolName,
              args: event.args,
            });
            publish({
              kind: 'tool_start',
              runId: spec.runId,
              toolCallId: event.toolCallId,
              name: event.toolName,
              args: event.args,
            });
            return;
          case 'tool_execution_update': {
            const t = run.tools.get(event.toolCallId);
            if (t) t.partial = event.partialResult;
            publish({
              kind: 'tool_update',
              runId: spec.runId,
              toolCallId: event.toolCallId,
              partial: event.partialResult,
            });
            return;
          }
          case 'tool_execution_end':
            run.tools.delete(event.toolCallId);
            publish({
              kind: 'tool_end',
              runId: spec.runId,
              toolCallId: event.toolCallId,
              isError: event.isError,
            });
            return;
          default:
            return;
        }
      });

      publish({ kind: 'run_start', runId: spec.runId, startedAt: run.startedAt.toISOString() });
      let status: RunStatus = 'completed';
      let error: string | undefined;
      try {
        if (spec.input.length) await agent.prompt(spec.input);
        else await agent.continue();
        await agent.waitForIdle();
        const last = lastAssistant as AssistantMessage | null;
        if (last?.stopReason === 'aborted') status = 'aborted';
        else if (last?.stopReason === 'error') {
          status = 'error';
          error = last.errorMessage ?? 'The model request failed';
        }
      } catch (err) {
        status = agent.signal?.aborted ? 'aborted' : 'error';
        error = err instanceof Error ? err.message : String(err);
        this.logger.warn({ module: 'engine', runId: spec.runId, error }, 'run failed');
      } finally {
        unsubscribe();
        if (partialTimer) clearTimeout(partialTimer);
        run.partial = null;
        run.tools.clear();
      }
      publish({ kind: 'run_end', runId: spec.runId, status, ...(error ? { error } : {}) });
      const finalText =
        (lastAssistant as AssistantMessage | null)?.content
          .filter((c) => c.type === 'text')
          .map((c) => (c as { text: string }).text)
          .join('')
          .trim() ?? '';
      return { status, error, lastEntryId: run.lastEntryId, finalText, usage };
    });
  }
}

export function userMessage(
  text: string,
  images: Array<{ data: string; mimeType: string }> = [],
): AgentMessage {
  if (!images.length) return { role: 'user', content: text, timestamp: Date.now() };
  return {
    role: 'user',
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...images.map((i) => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType })),
    ],
    timestamp: Date.now(),
  };
}
