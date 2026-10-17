import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createLogger, LogRing } from '../src/core/logger.ts';
import { systemRoutes } from '../src/modules/system/routes.ts';

async function app(ready = true) {
  return createApp({
    logger: createLogger('silent', new LogRing()),
    routes: systemRoutes({
      startedAt: new Date(0),
      readiness: { db: () => ready },
      setupRequired: () => true,
    }),
  });
}

describe('system routes', () => {
  it('reports liveness', async () => {
    const res = await (await app()).inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 when a readiness check fails', async () => {
    const res = await (await app(false)).inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { db: 'fail' } });
  });

  it('serves public system info', async () => {
    const res = await (await app()).inject({ method: 'GET', url: '/api/v1/system/info' });
    expect(res.json()).toMatchObject({ name: 'cangze', apiVersion: 1, setupRequired: true });
  });

  it('uses the error envelope for unknown routes', async () => {
    const res = await (await app()).inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Route not found' } });
  });
});
