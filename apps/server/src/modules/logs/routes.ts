import {
  AuditEntry,
  AuditQuery,
  RetentionSettings,
  SystemLogEntry,
  SystemLogQuery,
  UsageRow,
} from '@cangze/contracts';
import { z } from 'zod';
import type { LogRing } from '../../core/logger.ts';
import type { Db } from '../../db/index.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { AuditService } from '../audit/service.ts';
import type { MaintenanceService } from '../maintenance/service.ts';
import type { UsageLedger } from '../usage/ledger.ts';

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
const OMIT = new Set(['time', 'level', 'msg', 'module', 'pid', 'hostname']);

export function logRoutes(
  ring: LogRing,
  audit: AuditService,
  usage: UsageLedger,
  db: Db,
  maintenance: MaintenanceService,
): RouteSpec[] {
  const names = () => {
    const m = new Map<string, string>();
    for (const r of db.prepare('SELECT id, title FROM sessions').all() as Array<{
      id: string;
      title: string;
    }>)
      m.set(`session:${r.id}`, r.title || r.id);
    for (const r of db.prepare('SELECT id, name FROM agents').all() as Array<{ id: string; name: string }>)
      m.set(`agent:${r.id}`, r.name);
    return m;
  };
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/logs/system',
      summary: 'Recent hub log records (in memory)',
      tags: ['logs'],
      query: SystemLogQuery,
      response: z.array(SystemLogEntry),
      handler: ({ query }) =>
        ring
          .query({
            minLevel: LEVELS[query.level],
            module: query.module,
            search: query.search,
            before: query.before,
            limit: query.limit,
          })
          .map((r) => ({
            time: r.time,
            level: r.level,
            msg: r.msg,
            ...(typeof r.module === 'string' ? { module: r.module } : {}),
            data: Object.fromEntries(Object.entries(r).filter(([k]) => !OMIT.has(k))),
          })),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/audit',
      summary: 'Audit log of actions against the home and policy decisions',
      tags: ['logs'],
      query: AuditQuery,
      response: z.array(AuditEntry),
      handler: ({ query }) => audit.query(query),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/usage',
      summary: 'Token and cost usage per day, principal and model',
      tags: ['logs'],
      query: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }),
      response: z.array(UsageRow),
      handler: ({ query }) => {
        const n = names();
        return usage.query(query.days).map((r) => ({
          day: r.day,
          principalKind: r.principal_kind,
          principalId: r.principal_id,
          principalName: n.get(`${r.principal_kind}:${r.principal_id}`) ?? r.principal_id,
          provider: r.provider,
          model: r.model,
          requests: r.requests,
          input: r.input,
          output: r.output,
          cacheRead: r.cache_read,
          cacheWrite: r.cache_write,
          cost: r.cost,
          unknownRequests: r.unknown_requests,
        }));
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/settings/retention',
      summary: 'How long logs and history are kept',
      tags: ['settings'],
      response: RetentionSettings,
      handler: () => maintenance.retention.get(),
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/settings/retention',
      summary: 'Update retention',
      tags: ['settings'],
      body: RetentionSettings,
      response: RetentionSettings,
      handler: ({ body }) => {
        maintenance.retention.set(body);
        return body;
      },
    }),
  ];
}
