import { randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import { ADMIN_KEY_MIN, type DeviceToken } from '@cangze/contracts';
import { hashPassword, randomToken, safeEqual, sha256, verifyPassword } from '../../core/crypto.ts';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../../core/errors.ts';
import type { EventBus } from '../../core/events.ts';
import type { HubEvents } from '../../core/hub-events.ts';
import { newId } from '../../core/ids.ts';
import type { Db } from '../../db/index.ts';
import type { SettingsService } from '../settings/service.ts';
import { FailureLimiter } from './limiter.ts';

export const SESSION_COOKIE = 'cangze_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const SEEN_UPDATE_MS = 60 * 1000;
const PAIRING_TTL_MS = 10 * 60 * 1000;

export type Caller = { kind: 'cookie'; sessionId: string } | { kind: 'device'; deviceId: string };

interface SessionRow {
  id: string;
  token_hash: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
}

interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  token_hash: string;
  created_at: number;
  last_used_at: number | null;
  last_ip: string | null;
  revoked_at: number | null;
}

const BOOTSTRAP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function humanCode(groups: number): string {
  const bytes = randomBytes(groups * 4);
  const chars = [...bytes].map((b) => BOOTSTRAP_ALPHABET[b % BOOTSTRAP_ALPHABET.length]);
  const out: string[] = [];
  for (let i = 0; i < groups; i++) out.push(chars.slice(i * 4, i * 4 + 4).join(''));
  return out.join('-');
}

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function toDevice(row: DeviceRow): DeviceToken {
  return {
    id: row.id,
    name: row.name,
    platform: (['android', 'ios', 'desktop', 'cli', 'other'].includes(row.platform)
      ? row.platform
      : 'other') as DeviceToken['platform'],
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    lastIp: row.last_ip,
    revoked: row.revoked_at !== null,
  };
}

export class AuthService {
  readonly setupCompleted;
  readonly adminKeyHash;
  private bootstrapCode: string | null = null;
  private readonly pairing = new Map<string, number>();
  readonly loginLimiter = new FailureLimiter({ perKey: 5, global: 50, windowMs: 15 * 60 * 1000 });
  readonly pairingLimiter = new FailureLimiter({ perKey: 10, global: 100, windowMs: 15 * 60 * 1000 });

  constructor(
    private readonly db: Db,
    settings: SettingsService,
    private readonly bus: EventBus<HubEvents>,
    private readonly logger: Logger,
    private readonly printBanner = true,
  ) {
    this.setupCompleted = settings.define('setup.completed', z.boolean().default(false));
    this.adminKeyHash = settings.define('auth.adminKeyHash', z.string().nullable().default(null));
  }

  get setupRequired(): boolean {
    return !this.setupCompleted.get() || !this.adminKeyHash.get();
  }

  /** Called on start: prints a fresh one-time bootstrap code while setup is pending. */
  init(): void {
    if (!this.setupRequired) return;
    this.bootstrapCode = humanCode(3);
    this.logger.warn({ bootstrap: true }, `setup pending, bootstrap code: ${this.bootstrapCode}`);
    if (!this.printBanner) return;
    // Plain banner as well, so `docker compose logs` is readable without a JSON viewer.
    const line = '='.repeat(60);
    process.stdout.write(
      `\n${line}\n  Cangze is not set up yet. Open the web UI and enter the\n  bootstrap code:   ${this.bootstrapCode}\n  (a new code is printed every time the container restarts)\n${line}\n\n`,
    );
  }

  /** Test hook. */
  currentBootstrapCode(): string | null {
    return this.bootstrapCode;
  }

  async setup(
    code: string,
    adminKey: string | undefined,
    ip: string,
  ): Promise<{ generatedAdminKey: string | null }> {
    if (!this.setupRequired) throw conflict('Setup has already been completed');
    this.loginLimiter.assertAllowed(ip);
    if (!this.bootstrapCode || !safeEqual(normalizeCode(code), normalizeCode(this.bootstrapCode))) {
      this.loginLimiter.fail(ip);
      throw new AppError(401, 'invalid_bootstrap_code', 'Bootstrap code is invalid');
    }
    const generated = adminKey ? null : randomToken('cz-').slice(0, 40);
    const key = adminKey ?? generated!;
    if (key.length < ADMIN_KEY_MIN)
      throw badRequest(`Admin key must have at least ${ADMIN_KEY_MIN} characters`);
    this.adminKeyHash.set(await hashPassword(key));
    this.setupCompleted.set(true);
    this.bootstrapCode = null;
    this.loginLimiter.succeed(ip);
    this.logger.info('setup completed');
    return { generatedAdminKey: generated };
  }

  async verifyAdminKey(key: string, ip: string): Promise<void> {
    this.loginLimiter.assertAllowed(ip);
    const stored = this.adminKeyHash.get();
    if (!stored || !(await verifyPassword(key, stored))) {
      this.loginLimiter.fail(ip);
      this.logger.warn({ ip }, 'admin key rejected');
      throw new AppError(401, 'invalid_admin_key', 'Admin key is incorrect');
    }
    this.loginLimiter.succeed(ip);
  }

  async login(
    key: string,
    ip: string,
    userAgent: string | undefined,
  ): Promise<{ token: string; sessionId: string }> {
    if (this.setupRequired) throw new AppError(409, 'setup_required', 'Complete setup first');
    await this.verifyAdminKey(key, ip);
    return this.createSession(ip, userAgent);
  }

  createSession(ip: string, userAgent: string | undefined): { token: string; sessionId: string } {
    const token = randomToken('czs_');
    const id = newId('aus');
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO auth_sessions (id, token_hash, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, sha256(token), ip, userAgent?.slice(0, 300) ?? null, now, now, now + SESSION_TTL_MS);
    return { token, sessionId: id };
  }

  /** Validates a session cookie and slides its expiry. */
  validateSession(token: string, ip: string): string | null {
    if (!token.startsWith('czs_')) return null;
    const row = this.db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(sha256(token)) as
      SessionRow | undefined;
    const now = Date.now();
    if (!row) return null;
    if (row.expires_at < now) {
      this.db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(row.id);
      return null;
    }
    if (now - row.last_seen_at > SEEN_UPDATE_MS) {
      this.db
        .prepare('UPDATE auth_sessions SET last_seen_at = ?, expires_at = ?, ip = ? WHERE id = ?')
        .run(now, now + SESSION_TTL_MS, ip, row.id);
    }
    return row.id;
  }

  validateDevice(token: string, ip: string): string | null {
    if (!token.startsWith('czd_')) return null;
    const row = this.db.prepare('SELECT * FROM device_tokens WHERE token_hash = ?').get(sha256(token)) as
      DeviceRow | undefined;
    if (!row || row.revoked_at !== null) return null;
    const now = Date.now();
    if (!row.last_used_at || now - row.last_used_at > SEEN_UPDATE_MS) {
      this.db
        .prepare('UPDATE device_tokens SET last_used_at = ?, last_ip = ? WHERE id = ?')
        .run(now, ip, row.id);
    }
    return row.id;
  }

  logout(sessionId: string): void {
    this.db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
  }

  listSessions(currentId: string | null) {
    const rows = this.db
      .prepare('SELECT * FROM auth_sessions WHERE expires_at > ? ORDER BY last_seen_at DESC')
      .all(Date.now()) as SessionRow[];
    return rows.map((r) => ({
      id: r.id,
      current: r.id === currentId,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: new Date(r.created_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    }));
  }

  async changeAdminKey(
    current: string,
    next: string,
    keepSessionId: string | null,
    revokeDevices: boolean,
    ip: string,
  ) {
    await this.verifyAdminKey(current, ip);
    this.adminKeyHash.set(await hashPassword(next));
    if (keepSessionId) this.db.prepare('DELETE FROM auth_sessions WHERE id != ?').run(keepSessionId);
    else this.db.prepare('DELETE FROM auth_sessions').run();
    if (revokeDevices)
      this.db.prepare('UPDATE device_tokens SET revoked_at = ? WHERE revoked_at IS NULL').run(Date.now());
    this.bus.emit('auth.sessions_revoked', { reason: 'admin key changed' });
    this.logger.info({ revokeDevices }, 'admin key changed');
  }

  createDevice(name: string, platform: string): { device: DeviceToken; token: string } {
    const token = randomToken('czd_');
    const id = newId('dev');
    this.db
      .prepare(
        'INSERT INTO device_tokens (id, name, platform, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, name, platform, sha256(token), Date.now());
    return { device: this.getDevice(id), token };
  }

  getDevice(id: string): DeviceToken {
    const row = this.db.prepare('SELECT * FROM device_tokens WHERE id = ?').get(id) as DeviceRow | undefined;
    if (!row) throw notFound('Device');
    return toDevice(row);
  }

  listDevices(): DeviceToken[] {
    return (this.db.prepare('SELECT * FROM device_tokens ORDER BY created_at DESC').all() as DeviceRow[]).map(
      toDevice,
    );
  }

  revokeDevice(id: string): void {
    const r = this.db
      .prepare('UPDATE device_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(Date.now(), id);
    if (r.changes === 0) this.getDevice(id);
  }

  deleteDevice(id: string): void {
    const r = this.db.prepare('DELETE FROM device_tokens WHERE id = ?').run(id);
    if (r.changes === 0) throw notFound('Device');
  }

  createPairingCode(): { code: string; expiresAt: number } {
    const now = Date.now();
    for (const [c, exp] of this.pairing) if (exp < now) this.pairing.delete(c);
    const code = humanCode(2);
    const expiresAt = now + PAIRING_TTL_MS;
    this.pairing.set(normalizeCode(code), expiresAt);
    return { code, expiresAt };
  }

  claimPairing(code: string, name: string, platform: string, ip: string) {
    this.pairingLimiter.assertAllowed(ip);
    const key = normalizeCode(code);
    const exp = this.pairing.get(key);
    if (!exp || exp < Date.now()) {
      this.pairingLimiter.fail(ip);
      throw new AppError(401, 'invalid_pairing_code', 'Pairing code is invalid or expired');
    }
    this.pairing.delete(key);
    this.pairingLimiter.succeed(ip);
    return this.createDevice(name, platform);
  }

  /** CLI recovery: forget the admin key so the next start prints a bootstrap code. Data is kept. */
  resetAdmin(): void {
    this.adminKeyHash.set(null);
    this.setupCompleted.set(false);
    this.db.prepare('DELETE FROM auth_sessions').run();
  }

  requireCaller(caller: Caller | undefined): Caller {
    if (!caller) throw unauthorized();
    return caller;
  }
}
