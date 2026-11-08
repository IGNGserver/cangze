import type {
  HaArea,
  HaConfigDetail,
  HaConfigKind,
  HaFloor,
  HaHistoryPoint,
  HaLabel,
  HaTarget,
} from '@cangze/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import { qk } from './queries.ts';
import { useTopic } from './stream.ts';

export const useAreas = () => useQuery({ queryKey: qk.areas, queryFn: () => api.get<HaArea[]>('/ha/areas') });
export const useFloors = () =>
  useQuery({ queryKey: qk.floors, queryFn: () => api.get<HaFloor[]>('/ha/floors') });
export const useLabels = () =>
  useQuery({ queryKey: qk.labels, queryFn: () => api.get<HaLabel[]>('/ha/labels') });
export const useHistory = (entityId: string | null, hours: number) =>
  useQuery({
    queryKey: qk.history(entityId ?? '', hours),
    queryFn: () => api.get<HaHistoryPoint[]>('/ha/history', { entityId: entityId!, hours }),
    enabled: Boolean(entityId),
  });

export const useHaConfigDetail = (kind: HaConfigKind | null, configId: string | null) =>
  useQuery({
    queryKey: qk.haConfig(kind ?? '', configId ?? ''),
    queryFn: () => api.get<HaConfigDetail>(`/ha/config/${kind}/${encodeURIComponent(configId!)}`),
    enabled: Boolean(kind && configId),
  });

/** Keep connection-dependent caches current. Entity state lives in useEntities' snapshot barrier. */
export function useLiveEntities(): void {
  const qc = useQueryClient();
  useTopic('ha:status', () => {
    void qc.invalidateQueries({ queryKey: qk.haStatus });
  });
}

export function useCallService() {
  return useMutation({
    mutationFn: (v: { domain: string; service: string; target?: HaTarget; data?: Record<string, unknown> }) =>
      api.post<{ entityIds: string[] }>(`/ha/services/${v.domain}/${v.service}`, {
        target: v.target,
        data: v.data ?? {},
      }),
  });
}
