import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, unauthorized } from '../../core/errors.ts';
import type { NetworkPolicy } from '../network/policy.ts';
import { SESSION_COOKIE, type AuthService, type Caller } from './service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    caller?: Caller;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Resolves the caller from a bearer device token or the session cookie. */
export function resolveCaller(auth: AuthService, req: FastifyRequest): Caller | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const id = auth.validateDevice(header.slice(7).trim(), req.ip);
    return id ? { kind: 'device', deviceId: id } : undefined;
  }
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie) {
    const id = auth.validateSession(cookie, req.ip);
    if (id) return { kind: 'cookie', sessionId: id };
  }
  return undefined;
}

export function installAuth(app: FastifyInstance, auth: AuthService, network: NetworkPolicy): void {
  app.addHook('preHandler', async (req) => {
    const mode = req.routeOptions.config?.auth ?? 'admin';
    req.caller = resolveCaller(auth, req);
    if (mode === 'public') return;
    if (!req.caller) throw unauthorized();
    // Cookie sessions are ambient credentials: require a same-origin Origin on state changes.
    if (req.caller.kind === 'cookie' && !SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !network.isOriginAllowed(origin, req.headers.host)) {
        throw new AppError(403, 'origin_mismatch', 'Cross-origin request rejected');
      }
    }
  });
}

export function cookieOptions(req: FastifyRequest) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: req.protocol === 'https',
    maxAge: 30 * 24 * 3600,
  };
}
