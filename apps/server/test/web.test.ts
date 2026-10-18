import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/core/config.ts';
import { createLogger, LogRing } from '../src/core/logger.ts';
import { buildServer, createServices } from '../src/context.ts';

describe('web UI serving', () => {
  it('serves the SPA shell and assets without authentication', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cz-web-'));
    writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    const s = createServices(loadConfig({ CANGZE_DATA_DIR: '/nonexistent' }), {
      memory: true,
      logger: createLogger('silent', new LogRing()),
    });
    const app = await buildServer(s, dir);
    const headers = { host: '127.0.0.1:8080' };

    const root = await app.inject({ method: 'GET', url: '/', headers });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('id="root"');
    expect(root.headers['content-security-policy']).toContain("script-src 'self'");
    expect(root.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(root.headers['x-content-type-options']).toBe('nosniff');
    expect(root.headers['x-frame-options']).toBe('DENY');
    expect(root.headers['referrer-policy']).toBe('no-referrer');
    expect(root.headers['strict-transport-security']).toBeUndefined();

    const deep = await app.inject({ method: 'GET', url: '/sessions/abc', headers });
    expect(deep.statusCode).toBe(200);
    expect(deep.body).toContain('id="root"');

    expect((await app.inject({ method: 'GET', url: '/assets/app.js', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/assets/missing.js', headers })).statusCode).toBe(404);

    const api = await app.inject({ method: 'GET', url: '/api/v1/auth/devices', headers });
    expect(api.statusCode).toBe(401);
    const unknownApi = await app.inject({ method: 'GET', url: '/api/v1/nope', headers });
    expect(unknownApi.statusCode).toBe(401);
  });
});
