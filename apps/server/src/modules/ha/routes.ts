import {
  HaArea,
  HaDevice,
  HaEntity,
  HaEntityQuery,
  HaFloor,
  HaHistoryPoint,
  HaHistoryQuery,
  HaLabel,
  HaService,
  HaServiceCall,
  HaServiceCallResult,
  HaSettingsInput,
  HaStatus,
  HaTestResult,
  Ok,
} from '@cangze/contracts';
import { z } from 'zod';
import { badRequest, notFound } from '../../core/errors.ts';
import type { Principal } from '../../core/principal.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { HaGateway } from './gateway.ts';

const EntityParams = z.object({ entityId: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/) });
const ServiceParams = z.object({
  domain: z.string().regex(/^[a-z0-9_]+$/),
  service: z.string().regex(/^[a-z0-9_]+$/),
});

const HaSettingsView = z.object({
  url: z.string().nullable(),
  verifyTls: z.boolean(),
  hasToken: z.boolean(),
  tokenHint: z.string().nullable(),
});

export function haRoutes(
  ha: HaGateway,
  secrets: SecretsService,
  adminPrincipal: (req: unknown) => Principal,
): RouteSpec[] {
  const view = () => {
    const c = ha.connection.get();
    return {
      url: c?.url ?? null,
      verifyTls: c?.verifyTls ?? true,
      hasToken: secrets.has(c?.tokenSecretId),
      tokenHint: secrets.hint(c?.tokenSecretId),
    };
  };

  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/status',
      summary: 'Home Assistant connection status',
      tags: ['home-assistant'],
      response: HaStatus,
      handler: () => ha.getStatus(),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/settings/ha',
      summary: 'Home Assistant connection settings (token is never returned)',
      tags: ['settings'],
      response: HaSettingsView,
      handler: view,
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/settings/ha',
      summary: 'Configure the Home Assistant connection and reconnect',
      tags: ['settings'],
      body: HaSettingsInput,
      response: HaStatus,
      handler: ({ body }) => ha.configure(body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/settings/ha',
      summary: 'Disconnect and forget the Home Assistant connection',
      tags: ['settings'],
      response: Ok,
      handler: async () => {
        await ha.clear();
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/settings/ha/test',
      summary: 'Test Home Assistant connection parameters without saving them',
      tags: ['settings'],
      body: HaSettingsInput,
      response: HaTestResult,
      handler: ({ body }) => ha.test(body),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/entities',
      summary: 'Search entities (registry merged with live state)',
      tags: ['home-assistant'],
      query: HaEntityQuery,
      response: z.array(HaEntity),
      handler: ({ query }) => ha.registry.search(query),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/entities/:entityId',
      summary: 'One entity',
      tags: ['home-assistant'],
      params: EntityParams,
      response: HaEntity,
      handler: ({ params }) => {
        const e = ha.registry.toEntity(params.entityId);
        if (!e) throw notFound('Entity');
        return e;
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/areas',
      summary: 'Areas',
      tags: ['home-assistant'],
      response: z.array(HaArea),
      handler: () => [...ha.registry.areas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/floors',
      summary: 'Floors',
      tags: ['home-assistant'],
      response: z.array(HaFloor),
      handler: () => [...ha.registry.floors.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0)),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/devices',
      summary: 'Devices',
      tags: ['home-assistant'],
      response: z.array(HaDevice),
      handler: () => [...ha.registry.devices.values()].filter((d) => !d.disabled_by),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/labels',
      summary: 'Labels',
      tags: ['home-assistant'],
      response: z.array(HaLabel),
      handler: () => [...ha.registry.labels.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/services',
      summary: 'Service catalog',
      tags: ['home-assistant'],
      query: z.object({ domain: z.string().max(64).optional() }),
      response: z.array(HaService),
      handler: ({ query }) => ha.listServices(query.domain),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/ha/services/:domain/:service',
      summary: 'Call a service as the admin (audited)',
      tags: ['home-assistant'],
      params: ServiceParams,
      body: HaServiceCall,
      response: HaServiceCallResult,
      handler: ({ params, body, req }) =>
        ha.callService(adminPrincipal(req), {
          domain: params.domain,
          service: params.service,
          target: body.target,
          data: body.data,
          returnResponse: body.returnResponse,
        }),
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/history',
      summary: 'State history of one entity',
      tags: ['home-assistant'],
      query: HaHistoryQuery,
      response: z.array(HaHistoryPoint),
      handler: async ({ query }) => {
        const end = query.end ? new Date(query.end) : new Date();
        const start = query.start ? new Date(query.start) : new Date(end.getTime() - query.hours * 3600_000);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
          throw badRequest('Invalid time range');
        const res = await ha.history([query.entityId], start, end, false);
        return res[query.entityId] ?? [];
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/ha/camera/:entityId',
      summary: 'Camera snapshot (image bytes)',
      tags: ['home-assistant'],
      params: EntityParams,
      response: z.unknown(),
      raw: true,
      handler: async ({ params, reply }) => {
        if (!params.entityId.startsWith('camera.')) throw badRequest('Not a camera entity');
        const res = await ha.rest('GET', `/api/camera_proxy/${params.entityId}`);
        if (!res.ok) throw notFound('Camera image');
        const buf = Buffer.from(await res.arrayBuffer());
        await reply
          .header('content-type', res.headers.get('content-type') ?? 'image/jpeg')
          .header('cache-control', 'no-store')
          .send(buf);
      },
    }),
  ];
}
