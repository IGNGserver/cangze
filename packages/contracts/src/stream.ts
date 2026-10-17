import { z } from 'zod';

/**
 * WebSocket protocol for `/api/v1/stream`.
 *
 * Topics: `session:<id>`, `sessions`, `run:<id>`, `runs`, `agents`, `agent:<id>`, `ha:status`,
 * `ha:states`, `notifications`, `approvals`.
 *
 * Every event carries a per-topic `seq`. A client that reconnects subscribes with `since` set
 * to the last seq it saw; if the server no longer buffers that far back it answers with
 * `gap: true` and the client must reload the topic's snapshot over REST.
 */
export const StreamClientMessage = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('subscribe'),
    topic: z.string().min(1).max(128),
    since: z.number().int().optional(),
  }),
  z.object({ op: z.literal('unsubscribe'), topic: z.string().min(1).max(128) }),
  z.object({ op: z.literal('ping'), t: z.number().optional() }),
]);
export type StreamClientMessage = z.infer<typeof StreamClientMessage>;

export type StreamServerMessage =
  | { type: 'hello'; serverTime: number; version: string }
  | { type: 'subscribed'; topic: string; seq: number; gap: boolean }
  | { type: 'unsubscribed'; topic: string }
  | { type: 'event'; topic: string; seq: number; data: unknown }
  | { type: 'pong'; t?: number }
  | { type: 'error'; code: string; message: string; topic?: string };
