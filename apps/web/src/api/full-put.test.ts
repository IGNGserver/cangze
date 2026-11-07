import { beforeEach, expect, it, vi } from 'vitest';
import { useFullPut } from './full-put.ts';

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  setQueryData: vi.fn(),
  onError: vi.fn(),
}));

vi.mock('react', () => ({
  useRef: <T>(value: T) => ({ current: value }),
  useCallback: <T>(callback: T) => callback,
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: mocks.setQueryData }),
}));
vi.mock('./client.ts', () => ({ api: { put: mocks.put } }));

interface Settings {
  name: string;
  enabled: boolean;
  server?: string;
}

beforeEach(() => {
  mocks.put.mockReset();
  mocks.setQueryData.mockReset();
  mocks.onError.mockReset();
});

it('serializes full PUT bodies and never lets an older response overwrite newer edits', async () => {
  const initial: Settings = { name: 'initial', enabled: false };
  let visible = initial;
  const responses: Array<(value: Settings) => void> = [];
  mocks.put.mockImplementation(
    () =>
      new Promise<Settings>((resolve) => {
        responses.push(resolve);
      }),
  );
  mocks.setQueryData.mockImplementation((_key, value) => {
    visible = value;
  });
  const save = useFullPut({
    queryKey: ['settings'],
    url: '/settings',
    data: initial,
    onError: mocks.onError,
  });

  const first = save({ name: 'first edit' });
  const second = save({ enabled: true });
  expect(visible).toEqual({ name: 'first edit', enabled: true });
  await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));

  responses[0]!({ name: 'first edit', enabled: false, server: 'old response' });
  await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
  expect(mocks.put.mock.calls[1]![1]).toEqual({ name: 'first edit', enabled: true });
  expect(visible).toEqual({ name: 'first edit', enabled: true });

  responses[1]!({ name: 'first edit', enabled: true, server: 'latest response' });
  await Promise.all([first, second]);
  expect(visible).toEqual({ name: 'first edit', enabled: true, server: 'latest response' });
  expect(mocks.onError).not.toHaveBeenCalled();
});

it('rolls back only when the failed body is still the latest optimistic state', async () => {
  const initial: Settings = { name: 'initial', enabled: false };
  let visible = initial;
  mocks.setQueryData.mockImplementation((_key, value) => {
    visible = value;
  });
  mocks.put.mockRejectedValueOnce(new Error('failed'));
  const save = useFullPut({
    queryKey: ['settings'],
    url: '/settings',
    data: initial,
    onError: mocks.onError,
  });
  await save({ name: 'rejected' });
  expect(visible).toEqual(initial);
  expect(mocks.onError).toHaveBeenCalledOnce();
});
