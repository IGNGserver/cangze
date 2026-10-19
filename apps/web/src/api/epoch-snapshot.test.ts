import { expect, it, vi } from 'vitest';
import { fetchEpochSnapshot } from './epoch-snapshot.ts';

it('discards responses from a previous connection and retries against the new epoch', async () => {
  let epoch = 0;
  let resolve!: (value: string) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue('new');
  const reset = vi.fn();
  const pending = fetchEpochSnapshot(fetcher, () => epoch, reset, new AbortController().signal);
  epoch++;
  resolve('old');
  await expect(pending).resolves.toEqual({ data: 'new', epoch: 1 });
  expect(reset).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not retry a cancelled snapshot after a reconnect', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(async () => {
    controller.abort();
    return 'old';
  });
  await expect(fetchEpochSnapshot(fetcher, () => 0, vi.fn(), controller.signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
