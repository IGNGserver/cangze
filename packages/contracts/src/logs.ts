import { z } from 'zod';

export const SystemLogEntry = z.object({
  time: z.number(),
  level: z.number(),
  msg: z.string(),
  module: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});
export type SystemLogEntry = z.infer<typeof SystemLogEntry>;

export const SystemLogQuery = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  module: z.string().max(64).optional(),
  search: z.string().max(200).optional(),
  before: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export const UsageRow = z.object({
  day: z.string(),
  principalKind: z.string(),
  principalId: z.string(),
  principalName: z.string(),
  provider: z.string(),
  model: z.string(),
  requests: z.number(),
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cost: z.number(),
});
export type UsageRow = z.infer<typeof UsageRow>;

export const RetentionSettings = z.object({
  auditDays: z.number().int().min(7).max(3650),
  runsDays: z.number().int().min(7).max(3650),
  usageDays: z.number().int().min(30).max(3650),
});
export type RetentionSettings = z.infer<typeof RetentionSettings>;
