import type { ConnectionOptions, HaWebSocket } from 'home-assistant-js-websocket';
import { ERR_CANNOT_CONNECT, ERR_INVALID_AUTH } from 'home-assistant-js-websocket';
import WebSocket from 'ws';

/**
 * Socket factory for home-assistant-js-websocket built on `ws`, so that we can talk to HA
 * instances with self-signed certificates and keep a bounded connect timeout.
 * Mirrors the library's own auth handshake.
 */
export function socketFactory(opts: {
  wsUrl: string;
  token: string;
  verifyTls: boolean;
  connectTimeoutMs?: number;
}) {
  return (_options: ConnectionOptions): Promise<HaWebSocket> =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(opts.wsUrl, {
        rejectUnauthorized: opts.verifyTls,
        handshakeTimeout: opts.connectTimeoutMs ?? 10_000,
        maxPayload: 64 * 1024 * 1024,
      });
      let settled = false;
      let invalidAuth = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(invalidAuth ? ERR_INVALID_AUTH : ERR_CANNOT_CONNECT);
      };
      socket.on('error', fail);
      socket.on('close', fail);
      socket.on('message', (raw) => {
        let msg: { type?: string; ha_version?: string };
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: opts.token }));
        } else if (msg.type === 'auth_invalid') {
          invalidAuth = true;
          socket.close();
        } else if (msg.type === 'auth_ok') {
          settled = true;
          socket.removeAllListeners('message');
          socket.removeListener('error', fail);
          socket.removeListener('close', fail);
          const ha = socket as unknown as HaWebSocket;
          ha.haVersion = msg.ha_version ?? '';
          // Enable message coalescing (HA 2022.9+).
          socket.send(
            JSON.stringify({ type: 'supported_features', id: 1, features: { coalesce_messages: 1 } }),
          );
          resolve(ha);
        }
      });
    });
}

export function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = u.pathname.replace(/\/$/, '') + '/api/websocket';
  u.search = '';
  return u.toString();
}
