import { HealthStatus, SystemInfo } from '@cangze/contracts';
import { z } from 'zod';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import { VERSION } from '../../core/version.ts';

export interface SystemDeps {
  startedAt: Date;
  /** Named readiness checks; each returns true when healthy. */
  readiness: Record<string, () => boolean>;
  setupRequired: () => boolean;
}

function safeCheck(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

export function systemRoutes(deps: SystemDeps): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/health/live',
      summary: 'Liveness probe',
      tags: ['system'],
      auth: 'public',
      response: z.object({ status: z.literal('ok') }),
      handler: () => ({ status: 'ok' as const }),
    }),
    defineRoute({
      method: 'GET',
      url: '/health/ready',
      summary: 'Readiness probe',
      tags: ['system'],
      auth: 'public',
      response: HealthStatus,
      handler: ({ reply }) => {
        const checks: Record<string, 'ok' | 'fail' | 'skip'> = {};
        for (const [name, check] of Object.entries(deps.readiness)) {
          checks[name] = safeCheck(check) ? 'ok' : 'fail';
        }
        const healthy = Object.values(checks).every((c) => c !== 'fail');
        if (!healthy) reply.status(503);
        return { status: healthy ? ('ok' as const) : ('degraded' as const), version: VERSION, checks };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/system/info',
      summary: 'Public system information',
      tags: ['system'],
      auth: 'public',
      response: SystemInfo,
      handler: () => ({
        name: 'cangze' as const,
        version: VERSION,
        apiVersion: 1 as const,
        setupRequired: deps.setupRequired(),
        node: process.version,
        startedAt: deps.startedAt.toISOString(),
      }),
    }),
  ];
}
