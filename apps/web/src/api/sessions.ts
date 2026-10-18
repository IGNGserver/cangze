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
import { useTopic } from './stream.ts';

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
  const snapshot = useQuery({ queryKey, queryFn: fetcher, enabled: Boolean(topic), staleTime: 0, gcTime: 0 });
  const snap = snapshot.data ? toSnapshot(snapshot.data) : null;

  useEffect(() => {
    if (snapshot.data) dispatch({ type: 'snapshot', snap: toSnapshot(snapshot.data) });
    // toSnapshot is a pure mapping
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.data]);

  const keyString = JSON.stringify(queryKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => void qc.invalidateQueries({ queryKey }), [qc, keyString]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useTopic<SessionEvent>(
    snap ? topic : null,
    (event) => {
      if (event.kind === 'reload') return reload();
      if (event.kind === 'entry') {
        // An entry that does not continue the branch on screen means the active branch moved.
        const tip = stateRef.current.entries.at(-1);
        const { parentId, id: entryId } = event.entry;
        if (tip && parentId !== tip.id && !stateRef.current.entries.some((e) => e.id === entryId))
          return reload();
      }
      dispatch({ type: 'event', event });
    },
    reload,
    snap?.streamSeq,
  );

  return {
    state,
    data: snapshot.data,
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
