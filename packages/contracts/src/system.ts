import { z } from 'zod';

export const HealthStatus = z.object({
  status: z.enum(['ok', 'degraded', 'starting']),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['ok', 'fail', 'skip'])),
});
export type HealthStatus = z.infer<typeof HealthStatus>;

export const SystemInfo = z.object({
  name: z.literal('cangze'),
  version: z.string(),
  apiVersion: z.literal(1),
  setupRequired: z.boolean(),
  node: z.string(),
  startedAt: z.string(),
});
export type SystemInfo = z.infer<typeof SystemInfo>;
