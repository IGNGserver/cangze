import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../core/errors.ts';

/**
 * Who may call a route:
 * - `public`: anyone admitted by the network policy (health, setup status, login)
 * - `admin`: an authenticated admin (cookie session or device token)
 */
export type RouteAuth = 'public' | 'admin';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  req: FastifyRequest;
  reply: FastifyReply;
}

export interface RouteSpec<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  method: Method;
  url: string;
  summary: string;
  tags: string[];
  auth?: RouteAuth;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  /** Success status code. Default 200. */
  status?: number;
  /** Raw response (file download, stream). The response schema is still documented. */
  raw?: boolean;
  /** Override global body size limit (bytes). */
  bodyLimit?: number;
  handler: (ctx: RouteContext<z.output<P>, z.output<Q>, z.output<B>>) => Promise<z.input<R>> | z.input<R>;
}

/** All registered specs, used for OpenAPI generation. */
export const routeRegistry: RouteSpec[] = [];

declare module 'fastify' {
  interface FastifyContextConfig {
    auth?: RouteAuth;
  }
}

function parse<T extends z.ZodType>(schema: T | undefined, value: unknown, where: string): unknown {
  if (!schema) return value;
  const r = schema.safeParse(value ?? (where === 'body' ? undefined : {}));
  if (!r.success) throw badRequest(`Invalid ${where}`, z.treeifyError(r.error));
  return r.data;
}

export function defineRoute<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
>(spec: RouteSpec<P, Q, B, R>): RouteSpec<P, Q, B, R> {
  return spec;
}

export function registerRoutes(app: FastifyInstance, specs: RouteSpec[]): void {
  for (const spec of specs) {
    routeRegistry.push(spec);
    app.route({
      method: spec.method,
      url: spec.url,
      config: { auth: spec.auth ?? 'admin' },
      ...(spec.bodyLimit ? { bodyLimit: spec.bodyLimit } : {}),
      handler: async (req, reply) => {
        const params = parse(spec.params, req.params, 'params');
        const query = parse(spec.query, req.query, 'query');
        const body = parse(spec.body, req.body, 'body');
        const result = await spec.handler({ params, query, body, req, reply } as never);
        if (spec.raw) return reply;
        if (spec.status === 204) return reply.status(204).send();
        if (spec.status && reply.statusCode === 200) reply.status(spec.status);
        return reply.send(result);
      },
    });
  }
}
