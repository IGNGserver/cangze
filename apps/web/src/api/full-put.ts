import type { QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { api } from './client.ts';

/** Serialize full-object PUT autosaves without letting an older response overwrite newer edits. */
export function useFullPut<T extends object>(input: {
  queryKey: QueryKey;
  url: string;
  data: T | undefined;
  onError: (error: unknown) => void;
}) {
  const { queryKey, url, data, onError } = input;
  const qc = useQueryClient();
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const latest = useRef<T | undefined>(data);
  const confirmed = useRef<T | undefined>(data);
  if (pending.current === 0 && data !== undefined) {
    latest.current = data;
    confirmed.current = data;
  }
  return useCallback(
    (patch: Partial<T>): Promise<void> => {
      const base = latest.current ?? data;
      if (!base) return Promise.resolve();
      const body = { ...base, ...patch };
      latest.current = body;
      qc.setQueryData(queryKey, body);
      pending.current++;
      const run = queue.current.then(async () => {
        try {
          const next = await api.put<T>(url, body);
          confirmed.current = next;
          if (latest.current === body) {
            latest.current = next;
            qc.setQueryData(queryKey, next);
          }
        } catch (error) {
          if (latest.current === body) {
            latest.current = confirmed.current;
            qc.setQueryData(queryKey, confirmed.current);
          }
          onError(error);
        } finally {
          pending.current--;
        }
      });
      queue.current = run;
      return run;
    },
    [data, onError, qc, queryKey, url],
  );
}
