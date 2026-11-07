import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEpochSnapshot } from './epoch-snapshot.ts';
import { SnapshotEvents } from './snapshot-events.ts';
import { stream, useTopic } from './stream.ts';

export interface ListSnapshot<T> {
  items: T[];
  streamSeq: number;
}

/**
 * REST/WS list barrier. The server captures streamSeq before reading rows; replay starts there,
 * and events arriving during the fetch are merged into that exact snapshot. Returning null from
 * applyEvent requests a fresh page (for example, when a filtered page would need backfilling).
 */
export function useLiveList<T, E>(input: {
  queryKey: QueryKey;
  topic: string;
  fetcher: () => Promise<ListSnapshot<T>>;
  applyEvent: (items: T[], event: E) => T[] | null;
  enabled?: boolean;
}) {
  const { queryKey, topic, fetcher, applyEvent, enabled = true } = input;
  const qc = useQueryClient();
  const bufferRef = useRef(new SnapshotEvents<E>());
  const buffer = bufferRef.current;
  const applyRef = useRef(applyEvent);
  applyRef.current = applyEvent;
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  const [items, setItems] = useState<T[] | undefined>();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      buffer.begin();
      return fetchEpochSnapshot(fetcher, stream.getEpoch, () => buffer.reset(), signal);
    },
    enabled,
    staleTime: 0,
    structuralSharing: false,
  });
  const reload = useCallback(() => {
    buffer.reset();
    void qc.invalidateQueries({ queryKey: keyRef.current });
  }, [buffer, qc]);
  const apply = useCallback(
    (event: E) => {
      setItems((current) => {
        if (!current) return current;
        const next = applyRef.current(current, event);
        if (!next) queueMicrotask(reload);
        return next ?? current;
      });
    },
    [reload],
  );
  useEffect(() => {
    if (!query.data) return;
    if (query.data.epoch !== stream.getEpoch()) return reload();
    let merged = query.data.data.items;
    for (const event of buffer.finish(query.data.data.streamSeq)) {
      const next = applyRef.current(merged, event);
      if (!next) return reload();
      merged = next;
    }
    setItems(merged);
  }, [query.data, buffer, reload]);
  useTopic<E>(
    query.data && enabled ? topic : null,
    (event, seq) => {
      if (!buffer.push(event, seq)) apply(event);
    },
    reload,
    query.data?.data.streamSeq,
  );
  return { ...query, data: items };
}
