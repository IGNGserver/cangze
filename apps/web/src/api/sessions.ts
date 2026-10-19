import type {
  Approval,
  Entry,
  ModelDefaults,
  ModelInfo,
  SessionDetail,
  SessionEvent,
  SessionSummary,
} from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api } from './client.ts';
import { stream, useTopic } from './stream.ts';
import { SnapshotEvents } from './snapshot-events.ts';
import { fetchEpochSnapshot } from './epoch-snapshot.ts';

export const sk = {
  list: (archived: boolean) => ['sessions', 'list', archived] as const,
  detail: (id: string) => ['sessions', 'detail', id] as const,
  models: ['models'] as const,
  defaults: ['models', 'defaults'] as const,
  providers: ['providers'] as const,
  catalog: ['providers', 'catalog'] as const,
  tools: ['tools'] as const,
};

export const useModels = () =>
  useQuery({ queryKey: sk.models, queryFn: () => api.get<ModelInfo[]>('/models') });
export const useModelDefaults = () =>
  useQuery({ queryKey: sk.defaults, queryFn: () => api.get<ModelDefaults>('/models/defaults') });

/** Session list kept current by the `sessions` topic. */
export function useSessionList(archived: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: sk.list(archived),
    queryFn: () => api.get<SessionSummary[]>('/sessions', { archived }),
  });
  useTopic<{ kind: 'upsert'; session: SessionSummary } | { kind: 'delete'; id: string }>(
    'sessions',
    (ev) => {
      for (const flag of [false, true]) {
        qc.setQueryData<SessionSummary[]>(sk.list(flag), (prev) => {
          if (!prev) return prev;
          if (ev.kind === 'delete') return prev.filter((s) => s.id !== ev.id);
          const without = prev.filter((s) => s.id !== ev.session.id);
          if (ev.session.archived !== flag) return without;
          return [ev.session, ...without].sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) ||
              Date.parse(b.lastMessageAt ?? b.createdAt) - Date.parse(a.lastMessageAt ?? a.createdAt),
          );
        });
      }
    },
    () => void qc.invalidateQueries({ queryKey: ['sessions', 'list'] }),
  );
  return q;
}

export interface LiveTool {
  toolCallId: string;
  name: string;
  args: unknown;
  done: boolean;
  isError: boolean;
}

/** What any live conversation view needs from its REST snapshot. */
export interface Snapshot {
  detail: SessionDetail | null;
  entries: Entry[];
  live: SessionDetail['live'];
  approvals: Approval[];
}

export interface ChatState {
  detail: SessionDetail | null;
  entries: Entry[];
  running: boolean;
  runId: string | null;
  partial: Record<string, unknown> | null;
  tools: Record<string, LiveTool>;
  approvals: Approval[];
  queued: number;
  lastError: string | null;
}

type Action =
  { type: 'snapshot'; snap: Snapshot } | { type: 'event'; event: SessionEvent } | { type: 'clearError' };

const initial: ChatState = {
  detail: null,
  entries: [],
  running: false,
  runId: null,
  partial: null,
  tools: {},
  approvals: [],
  queued: 0,
  lastError: null,
};

function reducer(state: ChatState, action: Action): ChatState {
  if (action.type === 'clearError') return { ...state, lastError: null };
  if (action.type === 'snapshot') {
    const d = action.snap;
    const tools: Record<string, LiveTool> = {};
    for (const t of d.live?.tools ?? [])
      tools[t.toolCallId] = {
        toolCallId: t.toolCallId,
        name: t.name,
        args: t.args,
        done: false,
        isError: false,
      };
    return {
      ...initial,
      detail: d.detail,
      entries: d.entries,
      running: Boolean(d.live),
      runId: d.live?.runId ?? null,
      partial: d.live?.partial ?? null,
      tools,
      approvals: d.approvals,
      queued: d.live?.queued ?? 0,
    };
  }
  const ev = action.event;
  switch (ev.kind) {
    case 'run_start':
      return { ...state, running: true, runId: ev.runId, partial: null, tools: {}, lastError: null };
    case 'run_end':
      return {
        ...state,
        running: false,
        runId: null,
        partial: null,
        queued: 0,
        lastError: ev.status === 'error' ? (ev.error ?? 'error') : null,
      };
    case 'partial':
      return state.running ? { ...state, partial: ev.message } : state;
    case 'entry': {
      const entry: Entry = ev.entry;
      if (state.entries.some((e) => e.id === entry.id)) return state;
      return {
        ...state,
        entries: [...state.entries, entry],
        partial: entry.role === 'assistant' ? null : state.partial,
      };
    }
    case 'tool_start':
      return {
        ...state,
        tools: {
          ...state.tools,
          [ev.toolCallId]: {
            toolCallId: ev.toolCallId,
            name: ev.name,
            args: ev.args,
            done: false,
            isError: false,
          },
        },
      };
    case 'tool_end': {
      const t = state.tools[ev.toolCallId];
      return t
        ? { ...state, tools: { ...state.tools, [ev.toolCallId]: { ...t, done: true, isError: ev.isError } } }
        : state;
    }
    case 'approval': {
      const a: Approval = ev.approval;
      const rest = state.approvals.filter((x) => x.id !== a.id);
      return { ...state, approvals: a.status === 'pending' ? [...rest, a] : rest };
    }
    case 'queued':
      return { ...state, queued: ev.count };
    case 'session':
      return state.detail ? { ...state, detail: { ...state.detail, ...ev.session } } : state;
    default:
      return state;
  }
}

/**
 * Live conversation state: a REST snapshot plus events on `topic`, refetched on gaps and when the
 * active branch moves. Used for sessions and (read-only) subagent runs.
 */
export function useLiveConversation<T>(
  queryKey: readonly unknown[],
  topic: string | null,
  fetcher: () => Promise<T>,
  toSnapshot: (data: T) => Snapshot & { streamSeq: number },
) {
  const [state, dispatch] = useReducer(reducer, initial);
  const qc = useQueryClient();
  const bufferRef = useRef({ topic, buffer: new SnapshotEvents<SessionEvent>() });
  if (bufferRef.current.topic !== topic)
    bufferRef.current = { topic, buffer: new SnapshotEvents<SessionEvent>() };
  const buffer = bufferRef.current.buffer;
  const snapshot = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      buffer.begin();
      return fetchEpochSnapshot(fetcher, stream.getEpoch, () => buffer.reset(), signal);
    },
    enabled: Boolean(topic),
    staleTime: 0,
    gcTime: 0,
    structuralSharing: false,
  });
  const snap = snapshot.data ? toSnapshot(snapshot.data.data) : null;

  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;
  const reload = useCallback(() => {
    buffer.reset();
    void qc.invalidateQueries({ queryKey: queryKeyRef.current });
  }, [buffer, qc]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const apply = (event: SessionEvent) => {
    if (event.kind === 'reload') return reload();
    if (event.kind === 'entry') {
      const tip = stateRef.current.entries.at(-1);
      if (
        tip &&
        event.entry.parentId !== tip.id &&
        !stateRef.current.entries.some((e) => e.id === event.entry.id)
      )
        return reload();
    }
    stateRef.current = reducer(stateRef.current, { type: 'event', event });
    dispatch({ type: 'event', event });
  };

  useEffect(() => {
    if (!snapshot.data) return;
    if (snapshot.data.epoch !== stream.getEpoch()) return reload();
    const fresh = toSnapshot(snapshot.data.data);
    stateRef.current = reducer(initial, { type: 'snapshot', snap: fresh });
    dispatch({ type: 'snapshot', snap: fresh });
    for (const event of buffer.finish(fresh.streamSeq)) apply(event);
    // Pure mapping and current event handler; only a new REST result installs a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.data]);

  useEffect(() => {
    if (snapshot.isError && !snapshot.isFetching) for (const event of buffer.finish(-1)) apply(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.isError, snapshot.isFetching]);

  useTopic<SessionEvent>(
    snap ? topic : null,
    (event, seq) => {
      if (!buffer.push(event, seq)) apply(event);
    },
    reload,
    snap?.streamSeq,
  );

  return {
    state,
    data: snapshot.data?.data,
    loading: snapshot.isLoading,
    error: snapshot.error,
    reload,
    clearError: () => dispatch({ type: 'clearError' }),
  };
}

export function useChat(id: string | null) {
  return useLiveConversation(
    sk.detail(id ?? ''),
    id ? `session:${id}` : null,
    () => api.get<SessionDetail>(`/sessions/${id}`),
    (d) => ({ detail: d, entries: d.entries, live: d.live, approvals: d.approvals, streamSeq: d.streamSeq }),
  );
}
