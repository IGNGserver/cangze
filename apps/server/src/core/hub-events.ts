import type { HaEntityState } from '@cangze/contracts';

/**
 * In-process events shared between modules. Payloads are plain data; modules that need
 * richer objects look them up by id.
 */
export interface HubEvents extends Record<string, unknown> {
  'settings.changed': { key: string };
  'auth.sessions_revoked': { reason: string };
  'ha.status': { state: string };
  'ha.ready': { timeZone: string };
  'ha.state_changed': {
    entityId: string;
    oldState: HaEntityState | null;
    newState: HaEntityState | null;
    context: { id: string; user_id: string | null; parent_id: string | null };
    timeFired: string;
  };
}
