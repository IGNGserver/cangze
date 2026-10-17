import { describe, expect, it } from 'vitest';
import { inCidr, isPrivateAddress } from '../src/modules/network/ip.ts';
import { parseHost } from '../src/modules/network/policy.ts';
import { harness } from './helpers.ts';

describe('ip ranges', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.5.79', true],
    ['100.64.1.1', true],
    ['8.8.8.8', false],
    ['::1', true],
    ['fd12:3456::1', true],
    ['fe80::1', true],
    ['2001:db8::1', false],
    ['::ffff:192.168.1.2', true],
    ['::ffff:1.1.1.1', false],
  ])('%s private=%s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  it('matches cidrs', () => {
    expect(inCidr('172.18.0.5', '172.16.0.0/12')).toBe(true);
    expect(inCidr('203.0.113.9', '203.0.113.9')).toBe(true);
    expect(inCidr('203.0.113.9', '::/0')).toBe(false);
  });

  it('parses host headers', () => {
    expect(parseHost('hub.local:8080')).toBe('hub.local');
    expect(parseHost('[::1]:8080')).toBe('::1');
    expect(parseHost('192.168.1.2')).toBe('192.168.1.2');
  });
});

describe('network policy', () => {
  it('refuses unknown host names (DNS rebinding)', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/system/info',
      headers: { host: 'evil.example.com' },
    });
    expect(res.statusCode).toBe(421);
    expect(res.json().error.code).toBe('host_not_allowed');
  });

  it('accepts local names and the public origin', async () => {
    const h = await harness({ CANGZE_PUBLIC_ORIGIN: 'https://home.example.com' });
    for (const host of ['hub.local', 'cangze.lan:8080', '192.168.1.5:8080', 'home.example.com']) {
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/system/info', headers: { host } });
      expect(res.statusCode, host).toBe(200);
    }
  });

  it('blocks plain HTTP from public addresses unless enabled', async () => {
    const h = await harness();
    const pub = { host: '192.168.1.5', 'x-forwarded-for': '8.8.8.8' };
    // without trusted proxies the socket address (loopback in inject) is used
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/system/info', headers: pub })).statusCode).toBe(
      200,
    );

    const p = await harness({ CANGZE_TRUSTED_PROXIES: '127.0.0.1' });
    const blocked = await p.app.inject({ method: 'GET', url: '/api/v1/system/info', headers: pub });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('public_http_blocked');
    const https = await p.app.inject({
      method: 'GET',
      url: '/api/v1/system/info',
      headers: { ...pub, 'x-forwarded-proto': 'https' },
    });
    expect(https.statusCode).toBe(200);

    p.s.network.allowPublicHttp.set(true);
    expect((await p.app.inject({ method: 'GET', url: '/api/v1/system/info', headers: pub })).statusCode).toBe(
      200,
    );
  });

  it('requires the confirmation phrase to enable public HTTP', async () => {
    const h = await harness();
    const bad = await h.call('PATCH', '/api/v1/settings/security', {
      allowPublicHttp: true,
      confirmation: 'yes',
    });
    expect(bad.statusCode).toBe(400);
    const ok = await h.call('PATCH', '/api/v1/settings/security', {
      allowPublicHttp: true,
      confirmation: 'I UNDERSTAND THE RISK',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().allowPublicHttp).toBe(true);
    expect(ok.json().allowPublicHttpAcknowledgedAt).toBeTruthy();
  });
});
