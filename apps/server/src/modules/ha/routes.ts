import {
  HaArea,
  HaConfigDetail,
  HaConfigDetailParams,
  HaDevice,
  HaEntity,
  HaEntityQuery,
  HaEntitySnapshot,
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
import { AppError, badRequest, notFound } from '../../core/errors.ts';
import type { Principal } from '../../core/principal.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import type { SecretsService } from '../secrets/service.ts';
import type { HaGateway } from './gateway.ts';

const EntityParams = z.object({ entityId: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/) });
const ConfigParams = HaConfigDetailParams.extend({
  // Keep the route-level schema strict even if the shared contract changes: these values become URL path segments.
  kind: z.enum(['automation', 'script', 'scene']),
  configId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
});
const ServiceParams = z.object({
  domain: z.string().regex(/^[a-z0-9_]+$/),
  service: z.string().regex(/^[a-z0-9_]+$/),
});

const MAX_CAMERA_BYTES = 25 * 1024 * 1024;
async function readCameraBody(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_CAMERA_BYTES) {
    await res.body?.cancel();
    throw new AppError(413, 'camera_too_large', 'Camera image exceeds the 25 MiB limit');
  }
  if (!res.body) throw new AppError(502, 'camera_empty', 'Camera returned an empty response');
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CAMERA_BYTES) {
        await reader.cancel();
        throw new AppError(413, 'camera_too_large', 'Camera image exceeds the 25 MiB limit');
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

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
      auth: 'cookieAdmin',
      response: HaSettingsView,
      handler: view,
    }),
    defineRoute({
      method: 'PUT',
      url: '/api/v1/settings/ha',
      summary: 'Configure the Home Assistant connection and reconnect',
      tags: ['settings'],
      auth: 'cookieAdmin',
      body: HaSettingsInput,
      response: HaStatus,
      handler: ({ body }) => ha.configure(body),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/settings/ha',
      summary: 'Disconnect and forget the Home Assistant connection',
      tags: ['settings'],
      auth: 'cookieAdmin',
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
      auth: 'cookieAdmin',
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
      response: HaEntitySnapshot,
      handler: ({ query }) => ha.entitiesSnapshot(query),
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
      url: '/api/v1/ha/config/:kind/:configId',
      summary: 'Read a Home Assistant automation, script or scene configuration',
      tags: ['home-assistant'],
      params: ConfigParams,
      response: HaConfigDetail,
      handler: async ({ params }) => {
        const path = `/api/config/${params.kind}/config/${encodeURIComponent(params.configId)}`;
        let res: Response;
        try {
          res = await ha.rest('GET', path);
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(502, 'ha_error', 'Home Assistant configuration request failed');
        }
        if (res.status === 404) throw notFound('Home Assistant configuration');
        if (!res.ok) throw new AppError(502, 'ha_error', `Home Assistant returned HTTP ${res.status}`);
        let config: unknown;
        try {
          config = await res.json();
        } catch {
          throw new AppError(502, 'ha_error', 'Home Assistant returned invalid configuration JSON');
        }
        if (config === null || typeof config !== 'object' || Array.isArray(config))
          throw new AppError(502, 'ha_error', 'Home Assistant returned an invalid configuration object');
        return { kind: params.kind, configId: params.configId, config: config as Record<string, unknown> };
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
        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime()) ||
          end.getTime() <= start.getTime() ||
          end.getTime() - start.getTime() > 31 * 24 * 3600_000
        )
          throw badRequest('History range must be valid, positive and no longer than 31 days');
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
      contentType: 'image/jpeg',
      handler: async ({ params, reply }) => {
        if (!params.entityId.startsWith('camera.')) throw badRequest('Not a camera entity');
        const res = await ha.rest('GET', `/api/camera_proxy/${params.entityId}`);
        if (!res.ok) throw notFound('Camera image');
        const buf = await readCameraBody(res);
        await reply
          .header('content-type', res.headers.get('content-type') ?? 'image/jpeg')
          .header('cache-control', 'no-store')
          .send(buf);
      },
    }),
  ];
}
