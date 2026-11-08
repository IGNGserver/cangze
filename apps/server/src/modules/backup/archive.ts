import { promisify } from 'node:util';
import { gunzip, gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { isPassphraseSealed, openWithPassphrase, sealWithPassphrase, sha256 } from '../../core/crypto.ts';
import { AppError } from '../../core/errors.ts';

/**
 * `.czbak` archive: gzip( "CZBK1" | u32 manifest length | manifest JSON | SQLite database ),
 * optionally wrapped in passphrase encryption (`CZB1` header, scrypt + AES-256-GCM).
 */
const BaseManifestSchema = z.object({
  format: z.literal(1),
  appVersion: z.string().min(1).max(128),
  schemaVersion: z.number().int().nonnegative(),
  createdAt: z.string().min(1).max(128),
  /** sha256 of the master key the database's secrets are encrypted with. */
  masterKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  /** Base64 master key, only in encrypted archives created with "include credentials". */
  masterKey: z
    .string()
    .refine((value) => {
      const key = Buffer.from(value, 'base64');
      return key.length === 32 && key.toString('base64') === value;
    }, 'masterKey must encode exactly 32 bytes')
    .optional(),
});
const ManifestSchema = BaseManifestSchema.superRefine((manifest, ctx) => {
  if (!manifest.masterKey) return;
  const key = Buffer.from(manifest.masterKey, 'base64');
  if (sha256(key) !== manifest.masterKeyFingerprint)
    ctx.addIssue({ code: 'custom', message: 'masterKeyFingerprint does not match masterKey' });
});
export type BackupManifest = z.infer<typeof ManifestSchema>;

const MAGIC = Buffer.from('CZBK1');
export const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const gunzipAsync = promisify(gunzip);
const invalid = (message: string) => new AppError(400, 'invalid_backup', message);
const tooLarge = () => new AppError(413, 'archive_too_large', 'Uncompressed backup exceeds the 1 GiB limit');

function decompressError(error: unknown): AppError {
  const code = (error as { code?: string }).code;
  if (code === 'ERR_BUFFER_TOO_LARGE' || code === 'ERR_OUT_OF_RANGE') return tooLarge();
  return invalid('Not a Cangze backup file');
}

function parseArchive(raw: Buffer): { manifest: BackupManifest; db: Buffer } {
  const headerLength = MAGIC.length + 4;
  if (raw.length < headerLength || !raw.subarray(0, MAGIC.length).equals(MAGIC))
    throw invalid('Not a Cangze backup file');
  const len = raw.readUInt32BE(MAGIC.length);
  const start = headerLength;
  if (len === 0 || len > MAX_MANIFEST_BYTES || len > raw.length - start)
    throw invalid('Backup manifest is damaged');
  let json: unknown;
  try {
    json = JSON.parse(raw.subarray(start, start + len).toString('utf8'));
  } catch {
    throw invalid('Backup manifest is damaged');
  }
  const format = z.object({ format: z.number().int() }).safeParse(json);
  if (format.success && format.data.format !== 1)
    throw invalid(`Unsupported backup format ${format.data.format}`);
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) throw invalid('Backup manifest is damaged');
  const db = raw.subarray(start + len);
  if (db.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000')
    throw invalid('Backup database is damaged');
  return { manifest: parsed.data, db };
}

export async function packArchive(
  manifest: BackupManifest,
  db: Buffer,
  passphrase?: string,
): Promise<Buffer> {
  if (manifest.masterKey && !passphrase)
    throw new AppError(400, 'passphrase_required', 'Including credentials requires a passphrase');
  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) throw invalid('Backup manifest is damaged');
  const m = Buffer.from(JSON.stringify(parsed.data));
  if (m.length > MAX_MANIFEST_BYTES) throw invalid('Backup manifest is too large');
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
    raw = await gunzipAsync(plain, { maxOutputLength: MAX_UNCOMPRESSED_ARCHIVE_BYTES });
  } catch (error) {
    throw decompressError(error);
  }
  return { ...parseArchive(raw), encrypted };
}

/** Read the manifest of an unencrypted archive with the same output bound as full unpacking. */
export function peekManifest(data: Buffer): BackupManifest {
  let raw: Buffer;
  try {
    raw = gunzipSync(data, { maxOutputLength: MAX_UNCOMPRESSED_ARCHIVE_BYTES });
  } catch (error) {
    throw decompressError(error);
  }
  return parseArchive(raw).manifest;
}
