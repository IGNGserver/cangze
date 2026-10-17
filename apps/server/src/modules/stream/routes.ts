import type { FastifyInstance } from 'fastify';
import type { NetworkPolicy } from '../network/policy.ts';
import type { StreamHub } from './hub.ts';

/** Registers the `/api/v1/stream` WebSocket. Authentication runs in the shared preHandler hook. */
export function registerStream(app: FastifyInstance, hub: StreamHub, network: NetworkPolicy): void {
  app.get('/api/v1/stream', { websocket: true, config: { auth: 'admin' } }, (socket, req) => {
    // Browsers always send Origin on WebSocket upgrades; reject cross-site pages using the cookie.
    if (req.caller?.kind === 'cookie') {
      const origin = req.headers.origin;
      if (!origin || !network.isOriginAllowed(origin, req.headers.host)) {
        socket.close(1008, 'origin not allowed');
        return;
      }
    }
    hub.attach(socket);
  });
}
