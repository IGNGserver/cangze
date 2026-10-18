import { z } from 'zod';

export const BackupInfo = z.object({
  id: z.string(),
  file: z.string(),
  size: z.number(),
  encrypted: z.boolean(),
  kind: z.enum(['manual', 'scheduled', 'pre-restore']),
  schemaVersion: z.number(),
  appVersion: z.string(),
  createdAt: z.string(),
});
export type BackupInfo = z.infer<typeof BackupInfo>;

export const CreateBackup = z.object({
  /** Encrypt the archive; required to include credentials. */
  passphrase: z.string().min(8).max(256).optional(),
  /** Include the master key so credentials survive a restore on another installation. */
  includeCredentials: z.boolean().default(false),
});

export const BackupSchedule = z.object({
  enabled: z.boolean(),
  /** Cron expression in the home's time zone. */
  cron: z.string().min(9).max(120),
  keep: z.number().int().min(1).max(365),
  /** Encrypt scheduled backups with a stored passphrase. */
  encrypt: z.boolean(),
  includeCredentials: z.boolean(),
  hasPassphrase: z.boolean(),
});
export type BackupSchedule = z.infer<typeof BackupSchedule>;

export const UpdateBackupSchedule = BackupSchedule.omit({ hasPassphrase: true }).extend({
  passphrase: z.string().min(8).max(256).optional(),
});

export const RestoreResult = z.object({
  ok: z.literal(true),
  restarting: z.boolean(),
  manifest: z.object({
    appVersion: z.string(),
    schemaVersion: z.number(),
    createdAt: z.string(),
    includesCredentials: z.boolean(),
  }),
});
