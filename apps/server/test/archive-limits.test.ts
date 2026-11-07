import { expect, it, vi } from 'vitest';
import type * as Zlib from 'node:zlib';

// Keep the production 1 GiB limit, but make the actual zlib boundary cheap to exercise in this test process.
vi.mock('node:zlib', async (importOriginal) => {
  const zlib = await importOriginal<typeof Zlib>();
  const boundedGunzip = ((input: Uint8Array, options: Record<string, unknown>, callback: never) =>
    zlib.gunzip(input, { ...options, maxOutputLength: 32 }, callback)) as typeof zlib.gunzip;
  return { ...zlib, gunzip: boundedGunzip };
});

import { packArchive, unpackArchive } from '../src/modules/backup/archive.ts';

it('maps the asynchronous gunzip output boundary to archive_too_large', async () => {
  const archive = await packArchive(
    {
      format: 1,
      appVersion: '0.1.2',
      schemaVersion: 1,
      createdAt: 'now',
      masterKeyFingerprint: 'x',
    },
    Buffer.concat([Buffer.from('SQLite format 3\u0000'), Buffer.alloc(100, 1)]),
  );
  await expect(unpackArchive(archive)).rejects.toMatchObject({ status: 413, code: 'archive_too_large' });
});
