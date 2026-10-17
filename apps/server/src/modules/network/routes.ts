import { PUBLIC_HTTP_CONFIRMATION, SecuritySettings, UpdateSecuritySettings } from '@cangze/contracts';
import type { FastifyRequest } from 'fastify';
import { badRequest } from '../../core/errors.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import { isPrivateAddress } from './ip.ts';
import type { NetworkPolicy } from './policy.ts';

export function networkRoutes(
  network: NetworkPolicy,
  env: { publicOrigin?: string; trustedProxies: string[] },
): RouteSpec[] {
  const snapshot = (req: FastifyRequest) => {
    const at = network.allowPublicHttpAt.get();
    return {
      allowPublicHttp: network.allowPublicHttp.get(),
      allowPublicHttpAcknowledgedAt: at ? new Date(at).toISOString() : null,
      allowedHosts: network.extraHosts.get(),
      publicOrigin: env.publicOrigin ?? null,
      trustedProxies: env.trustedProxies,
      request: {
        ip: req.ip,
        protocol: req.protocol,
        host: req.headers.host ?? '',
        private: isPrivateAddress(req.ip),
      },
    };
  };

  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/settings/security',
      summary: 'Network security settings',
      tags: ['settings'],
      response: SecuritySettings,
      handler: ({ req }) => snapshot(req),
    }),
    defineRoute({
      method: 'PATCH',
      url: '/api/v1/settings/security',
      summary: 'Update network security settings',
      tags: ['settings'],
      body: UpdateSecuritySettings,
      response: SecuritySettings,
      handler: ({ body, req }) => {
        if (body.allowPublicHttp === true && !network.allowPublicHttp.get()) {
          if (body.confirmation !== PUBLIC_HTTP_CONFIRMATION) {
            throw badRequest(`Type "${PUBLIC_HTTP_CONFIRMATION}" to enable public HTTP`);
          }
          // Only allow turning this on from the local network, never from the public side itself.
          if (!isPrivateAddress(req.ip) && req.protocol !== 'https') {
            throw badRequest('Public HTTP can only be enabled from the local network');
          }
          network.allowPublicHttp.set(true);
          network.allowPublicHttpAt.set(Date.now());
          req.log.warn({ module: 'network', ip: req.ip }, 'public HTTP enabled by admin');
        } else if (body.allowPublicHttp === false) {
          network.allowPublicHttp.set(false);
          network.allowPublicHttpAt.set(null);
        }
        if (body.allowedHosts) {
          network.extraHosts.set([
            ...new Set(body.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)),
          ]);
        }
        return snapshot(req);
      },
    }),
  ];
}
