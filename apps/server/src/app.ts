import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyReply,
} from 'fastify';
import type { Logger } from 'pino';
import { AppError } from './core/errors.ts';
import { registerRoutes, type RouteSpec } from './http/route.ts';

/**
 * Content Security Policy for the web UI. Ant Design injects its CSS-in-JS as <style> tags, so
 * inline styles are allowed; scripts only ever come from this origin.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export interface AppOptions {
  logger: Logger;
  routes: RouteSpec[];
  /** Directory with the built web UI; served with SPA fallback when present. */
  webDir?: string;
  /** Hooks installed before routes (network policy, auth). */
  plugins?: Array<(app: FastifyInstance) => void | Promise<void>>;
  trustProxy?: boolean | string[];
}

export async function createApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: opts.logger as unknown as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: opts.trustProxy ?? false,
    bodyLimit: 2 * 1024 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'request failed');
    return reply.status(status).send({
      error: {
        code: status === 413 ? 'payload_too_large' : status >= 500 ? 'internal' : 'bad_request',
        message: status >= 500 ? 'Internal server error' : err.message,
      },
    });
  });

  app.addHook('onSend', (req, reply, _payload, done) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('cross-origin-opener-policy', 'same-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    reply.header('content-security-policy', CSP);
    // Only meaningful (and only honoured) over HTTPS, e.g. behind the bundled Caddy profile.
    if (req.protocol === 'https') reply.header('strict-transport-security', 'max-age=31536000');
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    if (req.url.startsWith('/api/') && reply.statusCode >= 400) {
      req.log.info({ method: req.method, url: req.url, status: reply.statusCode, module: 'http' }, 'request');
    }
    done();
  });

  // Binary uploads (backup restore).
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 1024 * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  for (const plugin of opts.plugins ?? []) await plugin(app);

  registerRoutes(app, opts.routes);

  const webDir = opts.webDir;
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    // Wildcard mode: missing files fall through to the not-found handler (SPA fallback below).
    await app.register(fastifyStatic, { root: webDir, wildcard: true, index: false, maxAge: '1h' });
    const sendIndex = (reply: FastifyReply) =>
      reply.header('cache-control', 'no-cache').sendFile('index.html', webDir);
    app.get('/', (_req, reply) => sendIndex(reply));
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/health')) {
        // Hashed assets are served by the static plugin; everything else is a client route.
        if (req.url.startsWith('/assets/')) return reply.status(404).send();
        return sendIndex(reply);
      }
      return reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) =>
      reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }),
    );
  }

  return app;
}
