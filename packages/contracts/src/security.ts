import { z } from 'zod';

/** Typing this phrase is required to enable plain HTTP from public networks. */
export const PUBLIC_HTTP_CONFIRMATION = 'I UNDERSTAND THE RISK';

export const SecuritySettings = z.object({
  allowPublicHttp: z.boolean(),
  allowPublicHttpAcknowledgedAt: z.string().nullable(),
  allowedHosts: z.array(z.string()),
  publicOrigin: z.string().nullable(),
  trustedProxies: z.array(z.string()),
  /** What the hub sees for the current request, to help users configure proxies. */
  request: z.object({ ip: z.string(), protocol: z.string(), host: z.string(), private: z.boolean() }),
});
export type SecuritySettings = z.infer<typeof SecuritySettings>;

export const UpdateSecuritySettings = z.object({
  allowPublicHttp: z.boolean().optional(),
  confirmation: z.string().optional(),
  allowedHosts: z.array(z.string().min(1).max(253)).max(50).optional(),
});
