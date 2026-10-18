import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/core/config.ts';
import { createLogger, LogRing } from '../src/core/logger.ts';
import { buildServer, createServices, startServices, stopServices, type Services } from '../src/context.ts';
import { packArchive, unpackArchive } from '../src/modules/backup/archive.ts';
import { applyPendingRestore, PENDING_RESTORE } from '../src/modules/backup/service.ts';
import { ADMIN_KEY, cookieFrom, ORIGIN } from './helpers.ts';

const silent = () => createLogger('silent', new LogRing());
const opened: Services[] = [];

afterEach(async () => {
  for (const s of opened.splice(0)) await stopServices(s).catch(() => undefined);
  delete process.env.CANGZE_MASTER_KEY;
});

/** A file-backed hub (backups need a real data directory). */
async function fileHub(dataDir = mkdtempSync(join(tmpdir(), 'cz-bak-')), onRestart?: () => void) {
  const ring = new LogRing();
  const s = createServices(loadConfig({ CANGZE_DATA_DIR: dataDir }), {
    logger: createLogger('info', ring, { stdout: false }),
    ring,
    onRestartRequested: onRestart,
  });
  opened.push(s);
  const app = await buildServer(s);
  startServices(s);
  // make the in-process auth state deterministic
  s.auth.init();
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    headers: { host: '127.0.0.1', origin: ORIGIN.replace(':8080', '') },
    payload: { bootstrapCode: s.auth.currentBootstrapCode(), adminKey: ADMIN_KEY },
  });
  const cookie = cookieFrom(setup);
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: method as never,
      url,
      headers: { host: '127.0.0.1', origin: 'http://127.0.0.1', cookie, ...headers },
      ...(body !== undefined ? { payload: body as never } : {}),
    });
  return { s, app, call, dataDir };
}

describe('backup archive', () => {
  it('round-trips plain and encrypted archives', async () => {
    const db = Buffer.concat([Buffer.from('SQLite format 3\u0000'), Buffer.alloc(100, 1)]);
    const manifest = {
      format: 1 as const,
      appVersion: '0.1.0',
      schemaVersion: 1,
      createdAt: 'now',
      masterKeyFingerprint: 'x',
    };
    const plain = await packArchive(manifest, db);
    expect((await unpackArchive(plain)).db.equals(db)).toBe(true);
    const sealed = await packArchive({ ...manifest, masterKey: 'k' }, db, 'correct horse');
    await expect(unpackArchive(sealed)).rejects.toThrow(/passphrase/);
    await expect(unpackArchive(sealed, 'wrong pass')).rejects.toThrow(/wrong/);
    expect((await unpackArchive(sealed, 'correct horse')).manifest.masterKey).toBe('k');
    await expect(packArchive({ ...manifest, masterKey: 'k' }, db)).rejects.toThrow(/passphrase/);
    await expect(unpackArchive(Buffer.from('nope'))).rejects.toThrow(/Not a Cangze backup/);
  });
});

describe('backups and restore', () => {
  it('creates, lists, downloads and prunes backups', async () => {
    const { call, s } = await fileHub();
    const created = await call('POST', '/api/v1/backups', {});
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ kind: 'manual', encrypted: false });
    const enc = await call('POST', '/api/v1/backups', {
      passphrase: 'a long passphrase',
      includeCredentials: true,
    });
    expect(enc.json().encrypted).toBe(true);
    const noPass = await call('POST', '/api/v1/backups', { includeCredentials: true });
    expect(noPass.statusCode).toBe(400);
    const list = (await call('GET', '/api/v1/backups')).json();
    expect(list.items).toHaveLength(2);
    const dl = await call('GET', `/api/v1/backups/${created.json().id}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toContain('.czbak');
    // scheduled retention
    s.backup.schedule.set({ ...s.backup.schedule.get(), keep: 2 });
    for (let i = 0; i < 4; i++) await s.backup.create({ kind: 'scheduled' });
    expect(s.backup.list().filter((b) => b.kind === 'scheduled')).toHaveLength(2);
  });

  it('restores on the next start and keeps a pre-restore copy', async () => {
    let restarts = 0;
    const hub = await fileHub(undefined, () => restarts++);
    // state at backup time
    const session = (await hub.call('POST', '/api/v1/sessions', { title: 'before backup' })).json();
    const bak = (await hub.call('POST', '/api/v1/backups', {})).json();
    // change things after the backup
    await hub.call('POST', '/api/v1/sessions', { title: 'after backup' });
    const res = await hub.call('POST', `/api/v1/backups/${bak.id}/restore`, {});
    expect(res.json()).toMatchObject({ ok: true, restarting: true });
    expect(existsSync(join(hub.dataDir, PENDING_RESTORE))).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(restarts).toBe(1);

    await stopServices(hub.s);
    opened.splice(opened.indexOf(hub.s), 1);
    const applied = await applyPendingRestore(hub.dataDir, silent());
    expect(applied).toMatchObject({ wipeSecrets: false });
    expect(existsSync(join(hub.dataDir, PENDING_RESTORE))).toBe(false);
    const after = createServices(loadConfig({ CANGZE_DATA_DIR: hub.dataDir }), { logger: silent() });
    opened.push(after);
    expect(after.sessions.list().map((x) => x.title)).toEqual(['before backup']);
    expect(after.sessions.list()[0]!.id).toBe(session.id);
    // the source backup (row written after the snapshot) and the pre-restore copy are adopted on start
    expect(after.backup.adoptFiles()).toBe(2);
    expect(
      after.backup
        .list()
        .map((b) => b.kind)
        .sort(),
    ).toEqual(['manual', 'pre-restore']);
  });

  it('detects credentials from another installation and asks for them again', async () => {
    const a = await fileHub();
    a.s.secrets.put('ha_token', 'secret-token', 'sec_test');
    const file = join(a.s.backup.dir, (await a.s.backup.create({})).file);
    const archive = readFileSync(file);

    const b = await fileHub(undefined, () => undefined);
    await b.call('POST', '/api/v1/backups/restore', archive, { 'content-type': 'application/octet-stream' });
    await stopServices(b.s);
    opened.splice(opened.indexOf(b.s), 1);
    const applied = await applyPendingRestore(b.dataDir, silent());
    expect(applied).toMatchObject({ wipeSecrets: true });
  });

  it('carries the master key in encrypted backups that include credentials', async () => {
    const a = await fileHub();
    a.s.secrets.put('ha_token', 'secret-token', 'sec_test');
    const info = await a.s.backup.create({ passphrase: 'a long passphrase', includeCredentials: true });
    const archive = readFileSync(join(a.s.backup.dir, info.file));
    const b = await fileHub(undefined, () => undefined);
    const wrong = await b.call('POST', '/api/v1/backups/restore', archive, {
      'content-type': 'application/octet-stream',
      'x-backup-passphrase': 'nope nope nope',
    });
    expect(wrong.json().error.code).toBe('wrong_passphrase');
    const ok = await b.call('POST', '/api/v1/backups/restore', archive, {
      'content-type': 'application/octet-stream',
      'x-backup-passphrase': encodeURIComponent('a long passphrase'),
    });
    expect(ok.json().manifest.includesCredentials).toBe(true);
    await stopServices(b.s);
    opened.splice(opened.indexOf(b.s), 1);
    expect(await applyPendingRestore(b.dataDir, silent())).toMatchObject({ wipeSecrets: false });
    const restored = createServices(loadConfig({ CANGZE_DATA_DIR: b.dataDir }), { logger: silent() });
    opened.push(restored);
    expect(restored.secrets.reveal('sec_test')).toBe('secret-token');
  });

  it('rejects files that are not backups', async () => {
    const { call, dataDir } = await fileHub();
    writeFileSync(join(dataDir, 'x'), 'x');
    const res = await call('POST', '/api/v1/backups/restore', Buffer.from('definitely not a backup'), {
      'content-type': 'application/octet-stream',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_backup');
  });
});

describe('maintenance, logs and export', () => {
  it('prunes old audit records and isolated runs', async () => {
    const { s } = await fileHub();
    const old = Date.now() - 200 * 86_400_000;
    s.db
      .prepare("INSERT INTO audit_log (ts, principal, action, decision) VALUES (?, 'admin', 'x', 'allowed')")
      .run(old);
    s.db
      .prepare("INSERT INTO audit_log (ts, principal, action, decision) VALUES (?, 'admin', 'x', 'allowed')")
      .run(Date.now());
    const result = s.maintenance.run();
    expect(result.audit).toBe(1);
    expect(s.audit.query({ limit: 10 })).toHaveLength(1);
  });

  it('serves system logs, usage and session exports', async () => {
    const { call, s } = await fileHub();
    s.logger.warn({ module: 'test' }, 'something to find');
    const logs = (await call('GET', '/api/v1/logs/system?level=warn&search=something')).json();
    expect(logs[0]).toMatchObject({ msg: 'something to find', module: 'test' });
    const sid = (await call('POST', '/api/v1/sessions', { title: 'Export me' })).json().id;
    s.usage.record('session', sid, 'p', 'm', {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
    });
    const usage = (await call('GET', '/api/v1/usage?days=7')).json();
    expect(usage[0]).toMatchObject({ principalName: 'Export me', input: 10, cost: 0.01 });
    s.sessions.addNotice(sid, { level: 'info', title: 'Hello', body: 'world', forModel: false });
    const md = await call('GET', `/api/v1/sessions/${sid}/export?format=markdown`);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.body).toContain('# Export me');
    expect(md.body).toContain('> **Hello**');
    const jsonl = await call('GET', `/api/v1/sessions/${sid}/export?format=jsonl`);
    expect(
      jsonl.body
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l).type),
    ).toEqual(['session', 'notice']);
  });
});
