import { z } from 'zod';

export const NotificationSeverity = z.enum(['info', 'success', 'warning', 'error']);

export const Notification = z.object({
  id: z.string(),
  kind: z.string(),
  severity: NotificationSeverity,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof Notification>;
