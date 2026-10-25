import { z } from 'zod';
import { ApiError } from '@cangze/contracts';
import type { RouteSpec } from './route.ts';

const toSchema = (s: z.ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(s, { target: 'draft-2020-12', io, unrepresentable: 'any' }) as Record<string, unknown>;

function stripMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _s, ...rest } = schema;
  return rest;
}

function parameters(spec: RouteSpec): unknown[] {
  const out: unknown[] = [];
  for (const [where, schema] of [
    ['path', spec.params],
    ['query', spec.query],
  ] as const) {
    if (!schema) continue;
    const js = toSchema(schema, 'input') as { properties?: Record<string, unknown>; required?: string[] };
    for (const [name, prop] of Object.entries(js.properties ?? {})) {
      out.push({
        name,
        in: where,
        required: where === 'path' || (js.required ?? []).includes(name),
        schema: prop,
      });
    }
  }
  return out;
}

/** Build a deterministic OpenAPI 3.1 document from registered routes. */
export function buildOpenApi(specs: RouteSpec[], version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const sorted = [...specs].sort((a, b) => (a.url + a.method).localeCompare(b.url + b.method));
  for (const spec of sorted) {
    const path = spec.url.replace(/:([A-Za-z_]+)/g, '{$1}');
    const op: Record<string, unknown> = {
      summary: spec.summary,
      tags: spec.tags,
      operationId: `${spec.method.toLowerCase()}${path.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string) => (c ? c.toUpperCase() : ''))}`,
      security: (spec.auth ?? 'admin') === 'public' ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: parameters(spec),
      responses: {
        [String(spec.status ?? 200)]:
          spec.status === 204
            ? { description: 'No content' }
            : {
                description: 'Success',
                content: {
                  [spec.raw && spec.contentType ? spec.contentType : 'application/json']: {
                    schema:
                      spec.raw && spec.contentType
                        ? { type: 'string', format: 'binary' }
                        : stripMeta(toSchema(spec.response, 'output')),
                  },
                },
              },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
      },
    };
    if (spec.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: stripMeta(toSchema(spec.body, 'input')) } },
      };
    }
    (paths[path] ??= {})[spec.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cangze API',
      version,
      description:
        'REST API of the Cangze hub. Live updates are delivered over the /api/v1/stream WebSocket.',
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    paths,
    components: {
      schemas: { ApiError: stripMeta(toSchema(ApiError, 'output')) },
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'cangze_session' },
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Device token' },
      },
    },
  };
}
