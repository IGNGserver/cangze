import { isIP } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SettingsService } from '../settings/service.ts';
import { isPrivateAddress } from './ip.ts';

export const LOCAL_SUFFIXES = ['.local', '.lan', '.home.arpa', '.localhost', '.internal', '.home'];

export interface NetworkPolicyConfig {
  publicOrigin?: string;
  allowedHosts: string[];
}

export class NetworkPolicy {
  readonly allowPublicHttp;
  readonly allowPublicHttpAt;
  readonly extraHosts;

  constructor(
    settings: SettingsService,
    private readonly config: NetworkPolicyConfig,
  ) {
    this.allowPublicHttp = settings.define('network.allowPublicHttp', z.boolean().default(false));
    this.allowPublicHttpAt = settings.define(
      'network.allowPublicHttpAcknowledgedAt',
      z.number().nullable().default(null),
    );
    this.extraHosts = settings.define('network.allowedHosts', z.array(z.string()).default([]));
  }

  get publicHost(): string | null {
    if (!this.config.publicOrigin) return null;
    try {
      return new URL(this.config.publicOrigin).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /** Accepts IP literals, localhost, local-only suffixes and explicitly configured names. */
  isHostAllowed(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    const host = parseHost(hostHeader);
    if (!host) return false;
    if (isIP(host)) return true;
    if (host === 'localhost') return true;
    if (LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return true;
    if (host === this.publicHost) return true;
    const extra = [...this.config.allowedHosts, ...this.extraHosts.get()].map((h) => h.toLowerCase());
    return extra.includes(host);
  }

  /** Decide whether a client may talk to the hub over the given protocol. */
  admit(ip: string, protocol: string): { ok: true } | { ok: false; code: string; message: string } {
    if (protocol === 'https' || isPrivateAddress(ip)) return { ok: true };
    if (this.allowPublicHttp.get()) return { ok: true };
    return {
      ok: false,
      code: 'public_http_blocked',
      message:
        'Cangze refuses plain HTTP from public networks. Use HTTPS (see docs/DEPLOYMENT.md) or enable public HTTP in Settings → Security from your local network.',
    };
  }

  /** Allowed Origin values for cookie-authenticated, state-changing requests. */
  isOriginAllowed(origin: string, hostHeader: string | undefined): boolean {
    try {
      const o = new URL(origin);
      const host = parseHost(hostHeader ?? '');
      if (host && o.hostname.toLowerCase() === host) return true;
      if (this.config.publicOrigin && o.origin === new URL(this.config.publicOrigin).origin) return true;
      return false;
    } catch {
      return false;
    }
  }

  install(app: FastifyInstance): void {
    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      const isHealth = req.url.startsWith('/health/');
      if (!isHealth && !this.isHostAllowed(req.headers.host)) {
        return deny(
          reply,
          req,
          421,
          'host_not_allowed',
          `Host "${req.headers.host ?? ''}" is not allowed. Open Cangze by IP address and add this name in Settings → Security, or set CANGZE_ALLOWED_HOSTS.`,
        );
      }
      const verdict = this.admit(req.ip, req.protocol);
      if (!verdict.ok && !isHealth) return deny(reply, req, 403, verdict.code, verdict.message);
    });
  }
}

export function parseHost(hostHeader: string): string | null {
  const h = hostHeader.trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end > 0 ? h.slice(1, end) : null;
  }
  const colon = h.lastIndexOf(':');
  // a bare IPv6 address without brackets has several colons
  if (colon > 0 && h.indexOf(':') === colon) return h.slice(0, colon);
  return h;
}

function deny(reply: FastifyReply, req: FastifyRequest, status: number, code: string, message: string) {
  const wantsHtml = !req.url.startsWith('/api/') && (req.headers.accept ?? '').includes('text/html');
  if (wantsHtml) {
    return reply
      .status(status)
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Cangze</title><body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>Cangze</h1><p>${escapeHtml(message)}</p></body>`,
      );
  }
  return reply.status(status).send({ error: { code, message } });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
