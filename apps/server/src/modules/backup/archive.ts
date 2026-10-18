import { gunzipSync, gzipSync } from 'node:zlib';
import { isPassphraseSealed, openWithPassphrase, sealWithPassphrase } from '../../core/crypto.ts';
import { AppError } from '../../core/errors.ts';

/**
 * `.czbak` archive: gzip( "CZBK1" | u32 manifest length | manifest JSON | SQLite database ),
 * optionally wrapped in passphrase encryption (`CZB1` header, scrypt + AES-256-GCM).
 */
export interface BackupManifest {
  format: 1;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  /** sha256 of the master key the database's secrets are encrypted with. */
  masterKeyFingerprint: string;
  /** Base64 master key, only in encrypted archives created with "include credentials". */
  masterKey?: string;
}

const MAGIC = Buffer.from('CZBK1');

export async function packArchive(
  manifest: BackupManifest,
  db: Buffer,
  passphrase?: string,
): Promise<Buffer> {
  if (manifest.masterKey && !passphrase)
    throw new AppError(400, 'passphrase_required', 'Including credentials requires a passphrase');
  const m = Buffer.from(JSON.stringify(manifest));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(m.length);
  const plain = gzipSync(Buffer.concat([MAGIC, len, m, db]), { level: 6 });
  return passphrase ? sealWithPassphrase(plain, passphrase) : plain;
}

export async function unpackArchive(
  data: Buffer,
  passphrase?: string,
): Promise<{ manifest: BackupManifest; db: Buffer; encrypted: boolean }> {
  let plain = data;
  const encrypted = isPassphraseSealed(data);
  if (encrypted) {
    if (!passphrase)
      throw new AppError(400, 'passphrase_required', 'This backup is encrypted; enter its passphrase');
    try {
      plain = await openWithPassphrase(data, passphrase);
    } catch {
      throw new AppError(400, 'wrong_passphrase', 'The passphrase is wrong or the file is damaged');
    }
  }
  let raw: Buffer;
  try {
    raw = gunzipSync(plain);
  } catch {
    throw new AppError(400, 'invalid_backup', 'Not a Cangze backup file');
  }
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC))
    throw new AppError(400, 'invalid_backup', 'Not a Cangze backup file');
  const len = raw.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(raw.subarray(start, start + len).toString('utf8')) as BackupManifest;
  } catch {
    throw new AppError(400, 'invalid_backup', 'Backup manifest is damaged');
  }
  if (manifest.format !== 1)
    throw new AppError(400, 'invalid_backup', `Unsupported backup format ${String(manifest.format)}`);
  const db = raw.subarray(start + len);
  if (db.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000')
    throw new AppError(400, 'invalid_backup', 'Backup database is damaged');
  return { manifest, db, encrypted };
}

/** Read the manifest of an unencrypted archive without keeping the database in memory twice. */
export function peekManifest(data: Buffer): BackupManifest {
  const raw = gunzipSync(data);
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC))
    throw new AppError(400, 'invalid_backup', 'Not a Cangze backup file');
  const len = raw.readUInt32BE(MAGIC.length);
  return JSON.parse(
    raw.subarray(MAGIC.length + 4, MAGIC.length + 4 + len).toString('utf8'),
  ) as BackupManifest;
}
