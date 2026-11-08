import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { BackupInfo } from '@cangze/contracts';
import Database from 'better-sqlite3';
import { Cron } from 'croner';
import type { Logger } from 'pino';
import { z } from 'zod';
import { isPassphraseSealed, sha256 } from '../../core/crypto.ts';
import { AppError, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { VERSION } from '../../core/version.ts';
import { currentSchemaVersion, type Db } from '../../db/index.ts';
import { SCHEMA_VERSION } from '../../db/migrations/index.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { NotificationsService } from '../notifications/service.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { SettingsService } from '../settings/service.ts';
import { packArchive, peekManifest, unpackArchive, type BackupManifest } from './archive.ts';

interface Row {
  id: string;
  file: string;
  size: number;
  encrypted: number;
  kind: BackupInfo['kind'];
  schema_version: number;
  app_version: string;
  created_at: number;
}

const ScheduleSetting = z
  .object({
    enabled: z.boolean(),
    cron: z.string(),
    keep: z.number().int().min(1).max(365),
    encrypt: z.boolean(),
    includeCredentials: z.boolean(),
    passphraseSecretId: z.string().nullable(),
  })
  .default({
    enabled: true,
    cron: '30 3 * * *',
    keep: 7,
    encrypt: false,
    includeCredentials: false,
    passphraseSecretId: null,
  });

export const PENDING_RESTORE = 'restore-pending.czbak';

const SAFE_BACKUP_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,240}\.czbak$/;
function decodeMasterKey(value: string): Buffer | null {
  try {
    const key = Buffer.from(value, 'base64');
    return key.length === 32 && key.toString('base64') === value ? key : null;
  } catch {
    return null;
  }
}

function safeBackupFilename(file: unknown): string {
  if (typeof file !== 'string' || basename(file) !== file || !SAFE_BACKUP_FILENAME.test(file))
    throw new AppError(400, 'invalid_backup', 'Backup file name is invalid');
  return file;
}

function backupPath(dir: string, file: unknown): string {
  const name = safeBackupFilename(file);
  const root = resolve(dir);
  const full = resolve(root, name);
  const rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new AppError(400, 'invalid_backup', 'Backup file path is invalid');
  return full;
}

function chmod0600(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best effort on filesystems without POSIX modes.
  }
}

const toInfo = (r: Row): BackupInfo => ({
  id: r.id,
  file: r.file,
  size: r.size,
  encrypted: r.encrypted === 1,
  kind: r.kind,
  schemaVersion: r.schema_version,
  appVersion: r.app_version,
  createdAt: new Date(r.created_at).toISOString(),
});

/**
 * Consistent online backups of the SQLite database into `<data>/backups`. Restores are staged and
 * applied on the next start, before the database is opened, so no service ever sees a swapped file.
 */
export class BackupService {
  readonly schedule;
  private job: Cron | null = null;
  readonly dir: string;

  constructor(
    private readonly db: Db,
    private readonly dataDir: string,
    private readonly masterKey: Buffer,
    private readonly settings: SettingsService,
    private readonly secrets: SecretsService,
    private readonly ha: HaGateway,
    private readonly notifications: NotificationsService,
    private readonly logger: Logger,
    /** Called after a restore was staged; production exits so the supervisor restarts the hub. */
    private readonly requestRestart: () => void,
  ) {
    this.schedule = settings.define('backup.schedule', ScheduleSetting);
    this.dir = join(dataDir, 'backups');
  }

  start(): void {
    this.adoptFiles();
    this.arm();
  }

  /**
   * Register `.czbak` files that are in the folder but not in the table — e.g. the backup a restore
   * came from (its row was written after the snapshot) or files copied in by hand.
   */
  adoptFiles(): number {
    let adopted = 0;
    for (const file of this.orphanFiles()) {
      const full = backupPath(this.dir, file);
      const data = readFileSync(full);
      const encrypted = isPassphraseSealed(data);
      let schemaVersion = 0;
      let appVersion = 'unknown';
      let createdAt = statSync(full).mtimeMs;
      if (!encrypted) {
        try {
          const peek = peekManifest(data);
          schemaVersion = peek.schemaVersion;
          appVersion = peek.appVersion;
          createdAt = Date.parse(peek.createdAt) || createdAt;
        } catch {
          continue; // not a valid backup; leave it alone
        }
      }
      const kind: BackupInfo['kind'] = file.includes('-pre-restore')
        ? 'pre-restore'
        : file.includes('-scheduled')
          ? 'scheduled'
          : 'manual';
      this.db
        .prepare(
          'INSERT INTO backups (id, file, size, encrypted, kind, schema_version, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(newId('bak'), file, data.length, encrypted ? 1 : 0, kind, schemaVersion, appVersion, createdAt);
      adopted++;
    }
    return adopted;
  }

  stop(): void {
    this.job?.stop();
    this.job = null;
  }

  arm(): void {
    this.stop();
    const s = this.schedule.get();
    if (!s.enabled) return;
    try {
      this.job = new Cron(
        s.cron,
        { timezone: this.ha.getStatus().timeZone ?? undefined, protect: true },
        () => {
          void this.create({ kind: 'scheduled' }).catch((err: unknown) => {
            this.logger.error({ module: 'backup', err }, 'scheduled backup failed');
            this.notifications.create({
              kind: 'backup_failed',
              severity: 'error',
              title: 'Scheduled backup failed',
              body: String(err),
            });
          });
        },
      );
    } catch (err) {
      this.logger.warn({ module: 'backup', err }, 'invalid backup schedule');
    }
  }

  nextRun(): string | null {
    return this.job?.nextRun()?.toISOString() ?? null;
  }

  updateSchedule(input: {
    enabled: boolean;
    cron: string;
    keep: number;
    encrypt: boolean;
    includeCredentials: boolean;
    passphrase?: string;
  }): void {
    // Validate before rotating the passphrase or changing the persisted schedule.
    try {
      new Cron(input.cron, { paused: true }).stop();
    } catch (err) {
      throw new AppError(
        400,
        'bad_request',
        `Invalid backup cron expression: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (input.includeCredentials && !input.encrypt)
      throw new AppError(400, 'bad_request', 'Including credentials requires encryption');
    const cur = this.schedule.get();
    if (input.encrypt && !input.passphrase && !this.secrets.has(cur.passphraseSecretId))
      throw new AppError(400, 'bad_request', 'Set a passphrase to encrypt scheduled backups');
    this.settings.transaction(() => {
      const secretId = input.passphrase
        ? this.secrets.put('backup_passphrase', input.passphrase, cur.passphraseSecretId ?? undefined)
        : cur.passphraseSecretId;
      this.schedule.set({
        enabled: input.enabled,
        cron: input.cron,
        keep: input.keep,
        encrypt: input.encrypt,
        includeCredentials: input.includeCredentials,
        passphraseSecretId: secretId,
      });
    });
    this.arm();
  }

  list(): BackupInfo[] {
    return (this.db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as Row[])
      .map((r) => this.validRow(r))
      .map(toInfo);
  }

  private validRow(r: Row): Row {
    safeBackupFilename(r.file);
    return r;
  }

  private row(id: string): Row {
    const r = this.db.prepare('SELECT * FROM backups WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Backup');
    return this.validRow(r);
  }

  path(id: string): string {
    const file = this.row(id).file;
    const full = backupPath(this.dir, file);
    if (existsSync(full) && !lstatSync(full).isFile())
      throw new AppError(400, 'invalid_backup', 'Backup file is not a regular file');
    return full;
  }

  async create(
    opts: { kind?: BackupInfo['kind']; passphrase?: string; includeCredentials?: boolean } = {},
  ): Promise<BackupInfo> {
    const kind = opts.kind ?? 'manual';
    let passphrase = opts.passphrase;
    let includeCredentials = opts.includeCredentials ?? false;
    if (kind === 'scheduled') {
      const s = this.schedule.get();
      passphrase = s.encrypt ? (this.secrets.reveal(s.passphraseSecretId) ?? undefined) : undefined;
      includeCredentials = Boolean(passphrase) && s.includeCredentials;
    }
    if (includeCredentials && !passphrase)
      throw new AppError(400, 'passphrase_required', 'Including credentials requires a passphrase');
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const id = newId('bak');
    const tmp = join(this.dir, `.${id}.sqlite`);
    try {
      writeFileSync(tmp, Buffer.alloc(0), { mode: 0o600, flag: 'wx' });
      chmod0600(tmp);
      await this.db.backup(tmp);
      chmod0600(tmp);
      const dbBytes = readFileSync(tmp);
      const manifest: BackupManifest = {
        format: 1,
        appVersion: VERSION,
        schemaVersion: currentSchemaVersion(this.db),
        createdAt: new Date().toISOString(),
        masterKeyFingerprint: sha256(this.masterKey),
        ...(includeCredentials ? { masterKey: this.masterKey.toString('base64') } : {}),
      };
      const archive = await packArchive(manifest, dbBytes, passphrase);
      const stamp = manifest.createdAt.replace(/[:.]/g, '-');
      const file = `cangze-${stamp}-${kind}.czbak`;
      writeFileSync(join(this.dir, file), archive, { mode: 0o600 });
      this.db
        .prepare(
          'INSERT INTO backups (id, file, size, encrypted, kind, schema_version, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, file, archive.length, passphrase ? 1 : 0, kind, manifest.schemaVersion, VERSION, Date.now());
      this.logger.info({ module: 'backup', file, size: archive.length }, 'backup created');
      if (kind === 'scheduled') this.prune();
      return toInfo(this.row(id));
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  /** Keep the newest `keep` scheduled backups. Manual ones stay until deleted. */
  prune(): void {
    const keep = this.schedule.get().keep;
    const old = this.db
      .prepare("SELECT * FROM backups WHERE kind = 'scheduled' ORDER BY created_at DESC LIMIT -1 OFFSET ?")
      .all(keep) as Row[];
    for (const r of old) this.delete(r.id);
  }

  delete(id: string): void {
    const r = this.row(id);
    rmSync(backupPath(this.dir, r.file), { force: true });
    this.db.prepare('DELETE FROM backups WHERE id = ?').run(id);
  }

  /** Files in the backup folder that are not in the table (e.g. copied in by hand). */
  orphanFiles(): string[] {
    if (!existsSync(this.dir)) return [];
    const known = new Set(this.list().map((b) => b.file));
    return readdirSync(this.dir).filter((f) => {
      if (!f.endsWith('.czbak') || known.has(f)) return false;
      try {
        safeBackupFilename(f);
        return lstatSync(backupPath(this.dir, f)).isFile();
      } catch {
        return false;
      }
    });
  }

  /** Validate an uploaded archive and stage it for the next start. */
  async stageRestore(data: Buffer, passphrase?: string) {
    const { manifest, db } = await unpackArchive(data, passphrase);
    if (manifest.schemaVersion > SCHEMA_VERSION) {
      throw new AppError(
        409,
        'backup_too_new',
        `This backup was made by a newer Cangze (${manifest.appVersion}). Upgrade first.`,
      );
    }
    // Check the database itself before touching anything.
    const probe = join(this.dataDir, `.restore-check-${Date.now()}-${newId('tmp')}.sqlite`);
    writeFileSync(probe, db, { mode: 0o600, flag: 'wx' });
    chmod0600(probe);
    let check: InstanceType<typeof Database> | undefined;
    try {
      check = new Database(probe, { readonly: true });
      const ok = (check.pragma('integrity_check', { simple: true }) as string) === 'ok';
      if (!ok) throw new AppError(400, 'invalid_backup', 'The backup database failed its integrity check');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'invalid_backup', 'The backup database could not be opened');
    } finally {
      check?.close();
      rmSync(probe, { force: true });
    }
    // Stage an unencrypted copy (the data volume already holds the live database in clear);
    // a restored master key goes to a separate 0600 file next to it.
    const { masterKey, ...rest } = manifest;
    const pending = join(this.dataDir, PENDING_RESTORE);
    writeFileSync(pending, await packArchive(rest, db), { mode: 0o600 });
    chmod0600(pending);
    if (masterKey) {
      if (!decodeMasterKey(masterKey))
        throw new AppError(400, 'invalid_backup', 'Backup master key is invalid');
      writeFileSync(`${pending}.key`, masterKey + '\n', { mode: 0o600 });
      chmod0600(`${pending}.key`);
    } else rmSync(`${pending}.key`, { force: true });
    this.logger.warn({ module: 'backup', from: manifest.createdAt }, 'restore staged; restarting');
    setTimeout(() => this.requestRestart(), 300).unref();
    return {
      ok: true as const,
      restarting: true,
      manifest: {
        appVersion: manifest.appVersion,
        schemaVersion: manifest.schemaVersion,
        createdAt: manifest.createdAt,
        includesCredentials: Boolean(manifest.masterKey),
      },
    };
  }
}

/**
 * Apply a staged restore before the database is opened. Returns a note for the log/inbox, or null
 * when nothing was pending. Keeps a `pre-restore` copy of the replaced database.
 */
export async function applyPendingRestore(
  dataDir: string,
  logger: Logger,
): Promise<{ wipeSecrets: boolean; restoredFrom: string } | null> {
  const pending = join(dataDir, PENDING_RESTORE);
  if (!existsSync(pending)) return null;
  const keyFile = `${pending}.key`;
  const { manifest, db } = await unpackArchive(readFileSync(pending));
  const dbFile = join(dataDir, 'cangze.db');
  const backups = join(dataDir, 'backups');
  mkdirSync(backups, { recursive: true });
  const keyPath = join(dataDir, 'master.key');
  const currentKey = process.env.CANGZE_MASTER_KEY
    ? decodeMasterKey(process.env.CANGZE_MASTER_KEY)
    : existsSync(keyPath)
      ? decodeMasterKey(readFileSync(keyPath, 'utf8').trim())
      : null;
  if (existsSync(dbFile)) {
    // Keep the replaced data as a regular backup so it can be restored from the UI.
    const current = new Database(dbFile);
    const tmp = join(backups, `.pre-restore-${Date.now()}.sqlite`);
    writeFileSync(tmp, Buffer.alloc(0), { mode: 0o600, flag: 'wx' });
    chmod0600(tmp);
    await current.backup(tmp);
    chmod0600(tmp);
    const schemaVersion = currentSchemaVersion(current);
    current.close();
    const now = new Date().toISOString();
    const archive = await packArchive(
      {
        format: 1,
        appVersion: VERSION,
        schemaVersion,
        createdAt: now,
        masterKeyFingerprint: currentKey ? sha256(currentKey) : '',
      },
      readFileSync(tmp),
    );
    writeFileSync(join(backups, `cangze-${now.replace(/[:.]/g, '-')}-pre-restore.czbak`), archive, {
      mode: 0o600,
    });
    rmSync(tmp, { force: true });
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbFile}${suffix}`, { force: true });
  writeFileSync(dbFile, db, { mode: 0o600 });
  chmod0600(dbFile);

  let wipeSecrets = false;
  const restoredKey = existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '';
  const restoredKeyBytes = restoredKey ? decodeMasterKey(restoredKey) : null;
  if (restoredKey && (!restoredKeyBytes || sha256(restoredKeyBytes) !== manifest.masterKeyFingerprint)) {
    throw new AppError(400, 'invalid_backup', 'Backup master key does not match its fingerprint');
  }
  if (restoredKey && !process.env.CANGZE_MASTER_KEY) {
    writeFileSync(keyPath, restoredKey + '\n', { mode: 0o600 });
    chmod0600(keyPath);
  } else {
    wipeSecrets = !currentKey || sha256(currentKey) !== manifest.masterKeyFingerprint;
  }
  rmSync(pending, { force: true });
  rmSync(keyFile, { force: true });
  logger.warn({ module: 'backup', from: manifest.createdAt, wipeSecrets }, 'restored database from backup');
  return { wipeSecrets, restoredFrom: manifest.createdAt };
}
