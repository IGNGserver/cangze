import {
  AuthState,
  ChangeAdminKeyRequest,
  ClaimPairingRequest,
  CreateDeviceTokenRequest,
  CreatedDeviceToken,
  DeviceToken,
  IdParams,
  LoginRequest,
  Ok,
  PairingCode,
  SetupRequest,
  SetupResponse,
  WebSession,
} from '@cangze/contracts';
import { z } from 'zod';
import { forbidden } from '../../core/errors.ts';
import { defineRoute, type RouteSpec } from '../../http/route.ts';
import { cookieOptions } from './hook.ts';
import { SESSION_COOKIE, type AuthService } from './service.ts';

export function authRoutes(auth: AuthService, publicOrigin: () => string | null): RouteSpec[] {
  return [
    defineRoute({
      method: 'GET',
      url: '/api/v1/auth/state',
      summary: 'Current authentication state',
      tags: ['auth'],
      auth: 'public',
      response: AuthState,
      handler: ({ req }) => ({
        authenticated: Boolean(req.caller),
        via: req.caller ? (req.caller.kind === 'cookie' ? ('cookie' as const) : ('device' as const)) : null,
        setupRequired: auth.setupRequired,
        deviceId: req.caller?.kind === 'device' ? req.caller.deviceId : null,
      }),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/setup',
      summary: 'Complete first-run setup with the bootstrap code',
      tags: ['auth'],
      auth: 'public',
      body: SetupRequest,
      response: SetupResponse,
      handler: async ({ body, req, reply }) => {
        const result = await auth.setup(body.bootstrapCode, body.adminKey, req.ip);
        const { token } = auth.createSession(req.ip, req.headers['user-agent']);
        reply.setCookie(SESSION_COOKIE, token, cookieOptions(req));
        return { ok: true as const, generatedAdminKey: result.generatedAdminKey };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/login',
      summary: 'Log in with the admin key (sets the session cookie)',
      tags: ['auth'],
      auth: 'public',
      body: LoginRequest,
      response: Ok,
      handler: async ({ body, req, reply }) => {
        const { token } = await auth.login(body.adminKey, req.ip, req.headers['user-agent']);
        reply.setCookie(SESSION_COOKIE, token, cookieOptions(req));
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/logout',
      summary: 'End the current web session',
      tags: ['auth'],
      response: Ok,
      handler: ({ req, reply }) => {
        if (req.caller?.kind === 'cookie') auth.logout(req.caller.sessionId);
        reply.clearCookie(SESSION_COOKIE, { path: '/' });
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/admin-key',
      summary: 'Change the admin key (signs out other web sessions)',
      tags: ['auth'],
      body: ChangeAdminKeyRequest,
      response: Ok,
      handler: async ({ body, req }) => {
        const keep = req.caller?.kind === 'cookie' ? req.caller.sessionId : null;
        await auth.changeAdminKey(body.currentKey, body.newKey, keep, body.revokeDevices, req.ip);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      summary: 'List active web sessions',
      tags: ['auth'],
      response: z.array(WebSession),
      handler: ({ req }) => auth.listSessions(req.caller?.kind === 'cookie' ? req.caller.sessionId : null),
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/auth/sessions/:id',
      summary: 'Sign out a web session',
      tags: ['auth'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        auth.logout(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'GET',
      url: '/api/v1/auth/devices',
      summary: 'List device tokens',
      tags: ['auth'],
      response: z.array(DeviceToken),
      handler: () => auth.listDevices(),
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/devices',
      summary: 'Create a device token (shown once)',
      tags: ['auth'],
      body: CreateDeviceTokenRequest,
      response: CreatedDeviceToken,
      status: 201,
      handler: ({ body, req }) => {
        if (req.caller?.kind !== 'cookie')
          throw forbidden('Device tokens can only be created from the web UI');
        return auth.createDevice(body.name, body.platform);
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/devices/:id/revoke',
      summary: 'Revoke a device token',
      tags: ['auth'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        auth.revokeDevice(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'DELETE',
      url: '/api/v1/auth/devices/:id',
      summary: 'Delete a device token',
      tags: ['auth'],
      params: IdParams,
      response: Ok,
      handler: ({ params }) => {
        auth.deleteDevice(params.id);
        return { ok: true as const };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/pairing',
      summary: 'Create a short-lived pairing code for a new device',
      tags: ['auth'],
      response: PairingCode,
      handler: ({ req }) => {
        if (req.caller?.kind !== 'cookie')
          throw forbidden('Pairing codes can only be created from the web UI');
        const { code, expiresAt } = auth.createPairingCode();
        const origin = publicOrigin() ?? `${req.protocol}://${req.headers.host ?? 'localhost'}`;
        return {
          code,
          expiresAt: new Date(expiresAt).toISOString(),
          ttlSeconds: Math.round((expiresAt - Date.now()) / 1000),
          uri: `cangze://pair?origin=${encodeURIComponent(origin)}&code=${encodeURIComponent(code)}`,
        };
      },
    }),
    defineRoute({
      method: 'POST',
      url: '/api/v1/auth/pairing/claim',
      summary: 'Exchange a pairing code for a device token',
      tags: ['auth'],
      auth: 'public',
      body: ClaimPairingRequest,
      response: CreatedDeviceToken,
      handler: ({ body, req }) => auth.claimPairing(body.code, body.name, body.platform, req.ip),
    }),
  ];
}
