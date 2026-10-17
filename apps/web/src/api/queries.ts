import type { AuthState, HaEntity, HaStatus, SystemInfo } from '@cangze/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './client.ts';

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
  useQuery({
    queryKey: qk.entities,
    queryFn: () => api.get<HaEntity[]>('/ha/entities', { includeHidden: true }),
  });
