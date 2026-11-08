import type {
  AuthState,
  HaEntity,
  HaEntitySnapshot,
  HaStateEvent,
  HaStatus,
  SystemInfo,
} from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';
import { useLiveList } from './live-list.ts';

export const qk = {
  system: ['system'] as const,
  auth: ['auth'] as const,
  haStatus: ['ha', 'status'] as const,
  haSettings: ['ha', 'settings'] as const,
  entities: ['ha', 'entities'] as const,
  areas: ['ha', 'areas'] as const,
  floors: ['ha', 'floors'] as const,
  labels: ['ha', 'labels'] as const,
  devices: ['ha', 'devices'] as const,
  history: (id: string, hours: number) => ['ha', 'history', id, hours] as const,
  haConfig: (kind: string, configId: string) => ['ha', 'config', kind, configId] as const,
  security: ['settings', 'security'] as const,
  deviceTokens: ['auth', 'devices'] as const,
  webSessions: ['auth', 'sessions'] as const,
};

export const useSystemInfo = () =>
  useQuery({ queryKey: qk.system, queryFn: () => api.get<SystemInfo>('/system/info') });
export const useAuthState = () =>
  useQuery({ queryKey: qk.auth, queryFn: () => api.get<AuthState>('/auth/state') });
export const useHaStatus = () =>
  useQuery({
    queryKey: qk.haStatus,
    queryFn: () => api.get<HaStatus>('/ha/status'),
    refetchInterval: 30_000,
  });
export const useEntities = () =>
  useLiveList<HaEntity, { updates: HaStateEvent[]; registry?: boolean }>({
    queryKey: qk.entities,
    topic: 'ha:states',
    fetcher: () => api.get<HaEntitySnapshot>('/ha/entities', { includeHidden: true }),
    applyEvent: (items, event) => {
      if (event.registry || event.updates.some((u) => !items.some((e) => e.entity_id === u.entity_id)))
        return null;
      const byId = new Map(event.updates.map((u) => [u.entity_id, u]));
      return items
        .filter((e) => byId.get(e.entity_id)?.state !== null)
        .map((e) => {
          const u = byId.get(e.entity_id);
          if (!u) return e;
          return {
            ...e,
            state: u.state ?? e.state,
            attributes: u.attributes ?? e.attributes,
            last_changed: u.last_changed ?? e.last_changed,
            last_updated: u.last_updated ?? e.last_updated,
          };
        });
    },
  });
