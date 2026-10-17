import { z } from 'zod';

export const AuditDecision = z.enum(['allowed', 'denied', 'conflict', 'approved', 'rejected', 'error']);
export type AuditDecision = z.infer<typeof AuditDecision>;

export const AuditEntry = z.object({
  id: z.number(),
  ts: z.string(),
  principal: z.string(),
  sessionId: z.string().nullable(),
  runId: z.string().nullable(),
  agentId: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  args: z.unknown().nullable(),
  decision: AuditDecision,
  reason: z.string().nullable(),
  result: z.unknown().nullable(),
  haContextId: z.string().nullable(),
  durationMs: z.number().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditQuery = z.object({
  principal: z.string().max(200).optional(),
  agentId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  runId: z.string().max(64).optional(),
  entityId: z.string().max(255).optional(),
  decision: AuditDecision.optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
