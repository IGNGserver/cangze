import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadConfig } from '../src/core/config.ts';
import { createLogger, LogRing } from '../src/core/logger.ts';
import { buildServer, createServices, startServices, type Services } from '../src/context.ts';

export const ADMIN_KEY = 'correct horse battery staple';
export const ORIGIN = 'http://127.0.0.1:8080';

export interface Harness {
  s: Services;
  app: FastifyInstance;
  cookie: string;
  /** inject with the admin cookie and same-origin headers */
  call(method: string, url: string, body?: unknown): Promise<LightMyRequestResponse>;
}

export async function harness(
  env: Record<string, string> = {},
  opts: { setup?: boolean } = {},
): Promise<Harness> {
  const config = loadConfig({ CANGZE_DATA_DIR: '/nonexistent', ...env });
  const s = createServices(config, { memory: true, logger: createLogger('silent', new LogRing()) });
  const app = await buildServer(s);
  startServices(s);
  let cookie = '';
  if (opts.setup !== false) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      headers: { host: '127.0.0.1:8080', origin: ORIGIN },
      payload: { bootstrapCode: s.auth.currentBootstrapCode(), adminKey: ADMIN_KEY },
    });
    if (res.statusCode !== 200) throw new Error(`setup failed: ${res.body}`);
    cookie = cookieFrom(res);
  }
  const h: Harness = {
    s,
    app,
    cookie,
    call: (method, url, body) =>
      app.inject({
        method: method as never,
        url,
        headers: { host: '127.0.0.1:8080', origin: ORIGIN, cookie: h.cookie },
        ...(body !== undefined ? { payload: body as never } : {}),
      }),
  };
  return h;
}

export function cookieFrom(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? '').split(';')[0] ?? '';
}
