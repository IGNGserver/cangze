/** Never install a REST response obtained across stream connection generations. */
export async function fetchEpochSnapshot<T>(
  fetcher: () => Promise<T>,
  getEpoch: () => number,
  reset: () => void,
  signal: AbortSignal,
): Promise<{ data: T; epoch: number }> {
  for (;;) {
    signal.throwIfAborted();
    const epoch = getEpoch();
    const data = await fetcher();
    signal.throwIfAborted();
    if (epoch === getEpoch()) return { data, epoch };
    reset();
  }
}
