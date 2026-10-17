/**
 * In-process events shared between modules. Payloads are plain data; modules that need
 * richer objects look them up by id.
 */
export interface HubEvents extends Record<string, unknown> {
  'settings.changed': { key: string };
  'auth.sessions_revoked': { reason: string };
}
