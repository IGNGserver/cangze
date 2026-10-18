import { createReadStream } from 'node:fs';
import {
  BackupInfo,
  BackupSchedule,
  CreateBackup,
  IdParams,
  Ok,
  RestoreResult,
  UpdateBackupSchedule,
} from '@cangze/contracts';
import { z } from 'zod';
import { badRequest } from '../../core/errors.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { BackupService } from './service.ts';

export function backupRoutes(backup: BackupService, secrets: SecretsService): RouteSpec[] {
  const scheduleView = () => {
    const s = backup.schedule.get();
    return {
      enabled: s.enabled,
      cron: s.cron,
      keep: s.keep,
      encrypt: s.encrypt,
      includeCredentials: s.includeCredentials,
      hasPassphrase: secrets.has(s.passphraseSecretId),
    };
  };
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/backups',
      summary: 'Backups in the data volume',
      tags: ['backup'],
      response: z.object({ items: z.array(BackupInfo), nextScheduled: z.string().nullable() }),
      handler: () => ({ items: backup.list(), nextScheduled: backup.nextRun() }),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/backups',
      summary: 'Create a backup now',
      tags: ['backup'],
      body: CreateBackup,
      response: BackupInfo,
      status: 201,
      handler: ({ body }) =>
        backup.create({
          kind: 'manual',
          passphrase: body.passphrase,
          includeCredentials: body.includeCredentials,
        }),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/backups/:id/download',
      summary: 'Download a backup file',
      tags: ['backup'],
      params: IdParams,
      response: z.unknown(),
      raw: true,
      handler: async ({ params, reply }) => {
        const path = backup.path(params.id);
        const name = path.split('/').pop()!;
        await reply
          .header('content-type', 'application/octet-stream')
          .header('content-disposition', `attachment; filename="${name}"`)
          .send(createReadStream(path));
      },
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/backups/:id',
      summary: 'Delete a backup',
      tags: ['backup'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        backup.delete(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/backups/:id/restore',
      summary: 'Restore a stored backup (the hub restarts)',
      tags: ['backup'],
      params: IdParams,
      body: z.object({ passphrase: z.string().max(256).optional() }),
      response: RestoreResult,
      handler: async ({ params, body }) => {
        const { readFileSync } = await import('node:fs');
        return backup.stageRestore(readFileSync(backup.path(params.id)), body.passphrase);
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/backups/restore',
      summary:
        'Upload a backup file (application/octet-stream) and restore it; passphrase in X-Backup-Passphrase',
      tags: ['backup'],
      response: RestoreResult,
      bodyLimit: 1024 * 1024 * 1024,
      handler: async ({ req }) => {
        if (!Buffer.isBuffer(req.body)) throw badRequest('Send the backup file as application/octet-stream');
        const header = req.headers['x-backup-passphrase'];
        const passphrase = typeof header === 'string' && header ? decodeURIComponent(header) : undefined;
        return backup.stageRestore(req.body, passphrase);
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/settings/backup',
      summary: 'Scheduled backup settings',
      tags: ['settings'],
      response: BackupSchedule,
      handler: scheduleView,
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/settings/backup',
      summary: 'Update scheduled backups',
      tags: ['settings'],
      body: UpdateBackupSchedule,
      response: BackupSchedule,
      handler: ({ body }) => {
        const cur = backup.schedule.get();
        let secretId = cur.passphraseSecretId;
        if (body.passphrase)
          secretId = secrets.put('backup_passphrase', body.passphrase, secretId ?? undefined);
        if (body.encrypt && !secrets.has(secretId))
          throw badRequest('Set a passphrase to encrypt scheduled backups');
        if (body.includeCredentials && !body.encrypt)
          throw badRequest('Including credentials requires encryption');
        backup.schedule.set({
          enabled: body.enabled,
          cron: body.cron,
          keep: body.keep,
          encrypt: body.encrypt,
          includeCredentials: body.includeCredentials,
          passphraseSecretId: secretId,
        });
        backup.arm();
        return scheduleView();
      },
    }),
  ];
}
