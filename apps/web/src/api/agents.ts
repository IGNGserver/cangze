import type {
  AgentDetail,
  AgentSummary,
  Approval,
  Entry,
  MemoryNote,
  RunSummary,
  UpcomingFire,
} from '@cangze/contracts';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.ts';
import { useLiveConversation } from './sessions.ts';
import { useTopic } from './stream.ts';

export const ak = {
  list: ['agents'] as const,
  detail: (id: string) => ['agents', id] as const,
  memory: (id: string) => ['agents', id, 'memory'] as const,
  revisions: (id: string) => ['agents', id, 'revisions'] as const,
  runs: (filter: Record<string, string | number | undefined>) => ['runs', filter] as const,
  run: (id: string) => ['run', id] as const,
  upcoming: ['scheduler', 'upcoming'] as const,
};

export function useAgents() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ak.list, queryFn: () => api.get<AgentSummary[]>('/agents') });
  useTopic('agents', () => void qc.invalidateQueries({ queryKey: ak.list }));
  useTopic('runs', () => void qc.invalidateQueries({ queryKey: ak.list }));
  return q;
}

export function useAgent(id: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ak.detail(id ?? ''),
    queryFn: () => api.get<AgentDetail>(`/agents/${id}`),
    enabled: Boolean(id),
  });
  useTopic<{ kind: string }>(id ? `agent:${id}` : null, (ev) => {
    if (ev.kind === 'memory') void qc.invalidateQueries({ queryKey: ak.memory(id!) });
    else void qc.invalidateQueries({ queryKey: ['agents', id] });
    void qc.invalidateQueries({ queryKey: ['runs'] });
  });
  return q;
}

export const useMemory = (id: string) =>
  useQuery({ queryKey: ak.memory(id), queryFn: () => api.get<MemoryNote[]>(`/agents/${id}/memory`) });

export function useRuns(filter: { agentId?: string; status?: string; limit?: number }) {
  const qc = useQueryClient();
  const key = { agentId: filter.agentId, status: filter.status, limit: filter.limit ?? 50 };
  const q = useQuery({
    queryKey: ak.runs(key),
    queryFn: () =>
      api.get<RunSummary[]>('/runs', {
        agentId: filter.agentId,
        status: filter.status,
        limit: filter.limit ?? 50,
      }),
  });
  useTopic('runs', () => void qc.invalidateQueries({ queryKey: ['runs'] }));
  return q;
}

export function useRunHistory(filter: { agentId?: string; status?: string }) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['runs', 'history', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<RunSummary[]>('/runs', { ...filter, before: pageParam, limit: 50 }),
    getNextPageParam: (last) => (last.length === 50 ? last.at(-1)!.id : undefined),
  });
  useTopic('runs', () => void qc.invalidateQueries({ queryKey: ['runs'] }));
  return q;
}

export function useUpcoming() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ak.upcoming,
    queryFn: () => api.get<UpcomingFire[]>('/scheduler/upcoming', { limit: 100 }),
    refetchInterval: 60_000,
  });
  useTopic('agents', () => void qc.invalidateQueries({ queryKey: ak.upcoming }));
  return q;
}

interface RunDetail {
  run: RunSummary;
  entries: Entry[];
  live: {
    runId: string;
    startedAt: string;
    partial: Record<string, unknown> | null;
    tools: Array<{ toolCallId: string; name: string; args: unknown }>;
    queued: number;
  } | null;
  approvals: Approval[];
  streamSeq: number;
}

/** Read-only live transcript of one subagent run. */
export function useRunTranscript(runId: string | null) {
  const qc = useQueryClient();
  const key = ak.run(runId ?? '');
  const live = useLiveConversation<RunDetail>(
    key,
    runId ? `run:${runId}` : null,
    () => api.get<RunDetail>(`/runs/${runId}`),
    (d) => ({
      detail: null,
      entries: d.entries,
      live: d.live,
      approvals: d.approvals,
      streamSeq: d.streamSeq,
    }),
  );
  useTopic<{ kind: string; run?: RunSummary }>(runId ? 'runs' : null, (ev) => {
    if (ev.kind !== 'upsert' || !ev.run || ev.run.id !== runId) return;
    // Fetch a matching transcript and sequence, not just metadata over an old snapshot.
    void qc.invalidateQueries({ queryKey: key });
  });
  return live;
}
