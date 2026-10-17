import { z } from 'zod';
import { Approval } from './approvals.ts';
import { ModelRef, ThinkingLevel } from './models.ts';

/**
 * Message payloads follow pi-ai's message shapes (user / assistant / toolResult) so that
 * conversations round-trip with pi tooling. They are typed loosely here on purpose: the
 * server is the only producer and clients render known block types.
 */
export const ContentBlock = z.union([
  z.object({ type: z.literal('text'), text: z.string() }).passthrough(),
  z
    .object({ type: z.literal('thinking'), thinking: z.string(), redacted: z.boolean().optional() })
    .passthrough(),
  z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() }).passthrough(),
  z
    .object({
      type: z.literal('toolCall'),
      id: z.string(),
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
]);
export type ContentBlock = z.infer<typeof ContentBlock>;

export const UsageTotals = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cost: z.number(),
});
export type UsageTotals = z.infer<typeof UsageTotals>;

export const EntryKind = z.enum(['message', 'compaction', 'notice', 'model_change']);

export const Entry = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  seq: z.number(),
  kind: EntryKind,
  role: z.string().nullable(),
  runId: z.string().nullable(),
  createdAt: z.string(),
  /** For `message`: the pi message; `compaction`: `{ summary, tokensBefore }`; `notice`: `{ level, title, body, data }`. */
  data: z.record(z.string(), z.unknown()),
  /** Present on user messages that have siblings (edited branches). */
  branch: z.object({ index: z.number(), count: z.number(), siblingIds: z.array(z.string()) }).nullable(),
});
export type Entry = z.infer<typeof Entry>;

export const SessionSummary = z.object({
  id: z.string(),
  title: z.string(),
  pinned: z.boolean(),
  archived: z.boolean(),
  modelRef: z.string().nullable(),
  thinkingLevel: ThinkingLevel.nullable(),
  running: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const LiveRun = z.object({
  runId: z.string(),
  startedAt: z.string(),
  /** Assistant message being streamed right now (pi partial message), if any. */
  partial: z.record(z.string(), z.unknown()).nullable(),
  /** Tool calls executing right now. */
  tools: z.array(
    z.object({
      toolCallId: z.string(),
      name: z.string(),
      args: z.unknown(),
      partial: z.unknown().optional(),
    }),
  ),
  queued: z.number(),
});
export type LiveRun = z.infer<typeof LiveRun>;

export const SessionDetail = SessionSummary.extend({
  instructions: z.string(),
  usage: UsageTotals,
  contextTokens: z.number().nullable(),
  contextWindow: z.number().nullable(),
  entries: z.array(Entry),
  live: LiveRun.nullable(),
  approvals: z.array(Approval),
  /** Stream seq at snapshot time: subscribe to `session:<id>` with `since` = this. */
  streamSeq: z.number(),
});
export type SessionDetail = z.infer<typeof SessionDetail>;

export const CreateSession = z.object({
  title: z.string().max(200).optional(),
  modelRef: ModelRef.optional(),
  thinkingLevel: ThinkingLevel.optional(),
  instructions: z.string().max(20_000).optional(),
});

export const UpdateSession = z.object({
  title: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  modelRef: ModelRef.nullable().optional(),
  thinkingLevel: ThinkingLevel.nullable().optional(),
  instructions: z.string().max(20_000).optional(),
});

export const ImageInput = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  /** Base64 without data: prefix. Clients should downscale photos first. */
  data: z.string().max(7_000_000),
});

export const SendMessage = z.object({
  text: z.string().max(100_000),
  images: z.array(ImageInput).max(4).default([]),
  /** When the session is busy: inject after the current step (`steer`) or after the run (`followUp`). */
  whenBusy: z.enum(['steer', 'followUp']).default('steer'),
});

export const EditMessage = z.object({ entryId: z.string(), text: z.string().min(1).max(100_000) });
export const EntryRef = z.object({ entryId: z.string() });

export const RunAccepted = z.object({ runId: z.string().nullable(), queued: z.boolean() });

/** Events on the `session:<id>` topic. */
export type SessionEvent =
  | { kind: 'run_start'; runId: string; startedAt: string }
  | { kind: 'run_end'; runId: string; status: 'completed' | 'aborted' | 'error'; error?: string }
  | { kind: 'entry'; entry: Entry; activeLeafId: string }
  | { kind: 'partial'; runId: string; message: Record<string, unknown> }
  | { kind: 'tool_start'; runId: string; toolCallId: string; name: string; args: unknown }
  | { kind: 'tool_update'; runId: string; toolCallId: string; partial: unknown }
  | { kind: 'tool_end'; runId: string; toolCallId: string; isError: boolean }
  | { kind: 'approval'; approval: Approval }
  | { kind: 'queued'; count: number }
  | { kind: 'session'; session: SessionSummary }
  | { kind: 'reload' };
