import { describe, expect, it } from 'vitest';
import { ADMIN_KEY, cookieFrom, harness, ORIGIN } from './helpers.ts';

const local = { host: '127.0.0.1:8080', origin: ORIGIN };

describe('setup and login', () => {
  it('requires setup before anything else and rejects a wrong bootstrap code', async () => {
    const h = await harness({}, { setup: false });
    const state = await h.app.inject({ method: 'GET', url: '/api/v1/auth/state', headers: local });
    expect(state.json()).toMatchObject({ authenticated: false, setupRequired: true });

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      headers: local,
      payload: { bootstrapCode: 'AAAA-BBBB-CCCC', adminKey: ADMIN_KEY },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('invalid_bootstrap_code');
  });

  it('generates an admin key when none is given', async () => {
    const h = await harness({}, { setup: false });
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      headers: local,
      payload: { bootstrapCode: h.s.auth.currentBootstrapCode()!.toLowerCase().replace(/-/g, '') },
    });
    expect(res.statusCode).toBe(200);
    const key = res.json().generatedAdminKey as string;
    expect(key.length).toBeGreaterThanOrEqual(24);
    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: local,
      payload: { adminKey: key },
    });
    expect(login.statusCode).toBe(200);
  });

  it('cannot run setup twice', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      headers: local,
      payload: { bootstrapCode: 'x'.repeat(8), adminKey: ADMIN_KEY },
    });
    expect(res.statusCode).toBe(409);
  });

  it('logs in, authenticates with the cookie and logs out', async () => {
    const h = await harness();
    const unauth = await h.app.inject({ method: 'GET', url: '/api/v1/auth/devices', headers: local });
    expect(unauth.statusCode).toBe(401);

    const login = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: local,
      payload: { adminKey: ADMIN_KEY },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = String(login.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const cookie = cookieFrom(login);

    const ok = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { ...local, cookie },
    });
    expect(ok.statusCode).toBe(200);

    await h.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { ...local, cookie } });
    const after = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/devices',
      headers: { ...local, cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('locks out an address after repeated failures', async () => {
    const h = await harness();
    for (let i = 0; i < 5; i++) {
      const r = await h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: local,
        payload: { adminKey: 'nope' },
      });
      expect(r.statusCode).toBe(401);
    }
    const locked = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: local,
      payload: { adminKey: ADMIN_KEY },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.details.retryAfter).toBeGreaterThan(0);
  });

  it('rejects cross-origin state changes made with the cookie', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/devices',
      headers: { host: '127.0.0.1:8080', origin: 'https://evil.example', cookie: h.cookie },
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('origin_mismatch');
    const noOrigin = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/devices',
      headers: { host: '127.0.0.1:8080', cookie: h.cookie },
      payload: { name: 'x' },
    });
    expect(noOrigin.statusCode).toBe(403);
  });

  it('changes the admin key and signs out other sessions', async () => {
    const h = await harness();
    const other = cookieFrom(
      await h.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: local,
        payload: { adminKey: ADMIN_KEY },
      }),
    );
    const res = await h.call('POST', '/api/v1/auth/admin-key', {
      currentKey: ADMIN_KEY,
      newKey: 'a brand new admin key',
    });
    expect(res.statusCode).toBe(200);
    expect((await h.call('GET', '/api/v1/auth/sessions')).statusCode).toBe(200);
    const stale = await h.app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { ...local, cookie: other },
    });
    expect(stale.statusCode).toBe(401);
  });
});

describe('device tokens and pairing', () => {
  it('creates a device token that works as a bearer token until revoked', async () => {
    const h = await harness();
    const created = await h.call('POST', '/api/v1/auth/devices', { name: 'Pixel', platform: 'android' });
    expect(created.statusCode).toBe(201);
    const { token, device } = created.json();
    expect(token).toMatch(/^czd_/);

    const bearer = { host: '127.0.0.1:8080', authorization: `Bearer ${token}` };
    const state = await h.app.inject({ method: 'GET', url: '/api/v1/auth/state', headers: bearer });
    expect(state.json()).toMatchObject({ authenticated: true, via: 'device', deviceId: device.id });
    // bearer requests are not subject to the Origin check
    const sec = await h.app.inject({
      method: 'PATCH',
      url: '/api/v1/settings/security',
      headers: bearer,
      payload: { allowedHosts: ['hub.home'] },
    });
    expect(sec.statusCode).toBe(200);
    // devices cannot mint more devices
    const mint = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/devices',
      headers: bearer,
      payload: { name: 'x' },
    });
    expect(mint.statusCode).toBe(403);

    await h.call('POST', `/api/v1/auth/devices/${device.id}/revoke`);
    const after = await h.app.inject({ method: 'GET', url: '/api/v1/auth/devices', headers: bearer });
    expect(after.statusCode).toBe(401);
  });

  it('pairs a device with a one-time code', async () => {
    const h = await harness();
    const pairing = await h.call('POST', '/api/v1/auth/pairing');
    const { code, uri } = pairing.json();
    expect(uri).toContain('cangze://pair?origin=');
    const claim = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/pairing/claim',
      headers: local,
      payload: { code, name: 'Phone', platform: 'android' },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().token).toMatch(/^czd_/);
    const again = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/pairing/claim',
      headers: local,
      payload: { code, name: 'Phone', platform: 'android' },
    });
    expect(again.statusCode).toBe(401);
  });
});
