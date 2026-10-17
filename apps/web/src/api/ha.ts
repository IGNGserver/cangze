import type {
  HaArea,
  HaEntity,
  HaFloor,
  HaHistoryPoint,
  HaLabel,
  HaStateEvent,
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

/** Keep the cached entity list current from the `ha:states` stream. */
export function useLiveEntities(): void {
  const qc = useQueryClient();
  useTopic<{ updates: HaStateEvent[] }>(
    'ha:states',
    ({ updates }) => {
      qc.setQueryData<HaEntity[]>(qk.entities, (prev) => {
        if (!prev) return prev;
        const byId = new Map(updates.map((u) => [u.entity_id, u]));
        return prev.map((e) => {
          const u = byId.get(e.entity_id);
          if (!u) return e;
          if (u.state === null) return { ...e, state: 'unavailable' };
          return {
            ...e,
            state: u.state,
            attributes: u.attributes ?? e.attributes,
            last_changed: u.last_changed ?? e.last_changed,
            last_updated: u.last_updated ?? e.last_updated,
          };
        });
      });
    },
    () => void qc.invalidateQueries({ queryKey: qk.entities }),
  );
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
