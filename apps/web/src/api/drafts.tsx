import type { Draft, DraftEvent, DraftImage, DraftSnapshot } from '@cangze/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './client.ts';
import { fetchEpochSnapshot } from './epoch-snapshot.ts';
import { SnapshotEvents } from './snapshot-events.ts';
import { stream, useTopic } from './stream.ts';

const DRAFTS_KEY = ['drafts'] as const;
const DRAFTS_TOPIC = 'drafts';

export interface DraftsValue {
  snapshot: DraftSnapshot | null;
  loading: boolean;
  error: unknown;
  /**
   * Apply a local mutation result. Ignored when the feed already holds a newer revision.
   * `atRevision` is the revision a delete was based on; pass null when it assumed no draft.
   */
  setDraft: (
    scope: string,
    draft: Draft | null,
    opts?: { force?: boolean; atRevision?: number | null },
  ) => void;
}

export const DraftsContext = createContext<DraftsValue>({
  snapshot: null,
  loading: true,
  error: null,
  setDraft: () => undefined,
});

/** Keep the highest revision per scope; deletes win only over revisions they have seen. */
export function applyDraftEvent(snapshot: DraftSnapshot, event: DraftEvent): DraftSnapshot {
  if (event.kind === 'upsert') {
    const current = snapshot.items.find((d) => d.scope === event.draft.scope);
    if (current && current.revision >= event.draft.revision) return snapshot;
    return {
      ...snapshot,
      items: [...snapshot.items.filter((d) => d.scope !== event.draft.scope), event.draft],
    };
  }
  const current = snapshot.items.find((d) => d.scope === event.scope);
  if (current && current.revision > event.revision) return snapshot;
  return { ...snapshot, items: snapshot.items.filter((d) => d.scope !== event.scope) };
}

export function setDraftInSnapshot(
  snapshot: DraftSnapshot | null,
  scope: string,
  draft: Draft | null,
): DraftSnapshot | null {
  if (!snapshot) return snapshot;
  if (!draft) return { ...snapshot, items: snapshot.items.filter((d) => d.scope !== scope) };
  return {
    ...snapshot,
    items: [...snapshot.items.filter((d) => d.scope !== scope), draft],
  };
}

function useDraftsSync(): DraftsValue {
  const qc = useQueryClient();
  const bufferRef = useRef(new SnapshotEvents<DraftEvent>());
  const buffer = bufferRef.current;
  const query = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: ({ signal }) => {
      buffer.begin();
      return fetchEpochSnapshot(
        () => api.get<DraftSnapshot>('/drafts'),
        stream.getEpoch,
        () => buffer.reset(),
        signal,
      );
    },
    staleTime: 0,
    structuralSharing: false,
  });
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);

  const reload = useCallback(() => {
    buffer.reset();
    void qc.invalidateQueries({ queryKey: DRAFTS_KEY });
  }, [buffer, qc]);

  useEffect(() => {
    if (!query.data) return;
    if (query.data.epoch !== stream.getEpoch()) {
      reload();
      return;
    }
    const fresh = query.data.data;
    let merged = fresh;
    for (const event of buffer.finish(fresh.streamSeq)) merged = applyDraftEvent(merged, event);
    setSnapshot(merged);
  }, [query.data, buffer, reload]);

  useTopic<DraftEvent>(
    query.data ? DRAFTS_TOPIC : null,
    (event, seq) => {
      if (buffer.push(event, seq)) return;
      setSnapshot((prev) => (prev ? applyDraftEvent(prev, event) : prev));
    },
    reload,
    query.data?.data.streamSeq,
  );

  const setDraft = useCallback<DraftsValue['setDraft']>((scope, draft, opts = {}) => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      const current = prev.items.find((d) => d.scope === scope);
      if (!opts.force) {
        if (draft) {
          if (current && current.revision > draft.revision) return prev;
        } else if (opts.atRevision !== undefined) {
          if (current && (opts.atRevision === null || current.revision > opts.atRevision)) return prev;
        }
      }
      return setDraftInSnapshot(prev, scope, draft);
    });
  }, []);

  return useMemo(
    () => ({
      snapshot,
      loading: query.isLoading && !snapshot,
      error: query.error,
      setDraft,
    }),
    [snapshot, query.isLoading, query.error, setDraft],
  );
}

export function DraftsProvider({ children }: { children: ReactNode }) {
  const value = useDraftsSync();
  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

export function useDrafts(): DraftsValue {
  return useContext(DraftsContext);
}

export function useDraft(scope: string | null): {
  draft: Draft | null;
  images: DraftImage[];
  loading: boolean;
  error: unknown;
} {
  const { snapshot, loading, error } = useDrafts();
  const draft = scope ? (snapshot?.items.find((d) => d.scope === scope) ?? null) : null;
  return { draft, images: draft?.images ?? [], loading, error };
}

export const draftImageUrl = (scope: string, imageId: string): string =>
  `/api/v1/drafts/${encodeURIComponent(scope)}/images/${encodeURIComponent(imageId)}`;

export const draftApi = {
  put: (scope: string, text: string, baseRevision: number | null) =>
    api.put<{ draft: Draft | null }>(`/drafts/${encodeURIComponent(scope)}`, { text, baseRevision }),
  addImage: (scope: string, image: { mimeType: string; data: string; width: number; height: number }) =>
    api.post<{ draft: Draft }>(`/drafts/${encodeURIComponent(scope)}/images`, image),
  deleteImage: (scope: string, imageId: string) =>
    api.del<{ draft: Draft | null }>(
      `/drafts/${encodeURIComponent(scope)}/images/${encodeURIComponent(imageId)}`,
    ),
};

/** Best-effort flush while the page is going away. */
export function saveDraftOnExit(scope: string, text: string, baseRevision: number | null): void {
  void fetch(`/api/v1/drafts/${encodeURIComponent(scope)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, baseRevision }),
    keepalive: true,
  }).catch(() => undefined);
}
