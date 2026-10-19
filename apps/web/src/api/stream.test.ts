import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StreamClient } from './stream.ts';

class FakeSocket {
  static OPEN = 1;
  static sockets: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen = () => {};
  onclose = () => {};
  onmessage = (_ev: { data: string }) => {};
  constructor(_url: string) {
    FakeSocket.sockets.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    this.onclose();
  }
  hello(instanceId = 'server-a') {
    this.readyState = 1;
    this.onopen();
    this.message({ type: 'hello', instanceId, serverTime: 0, version: 'test' });
  }
  message(data: unknown) {
    this.onmessage({ data: JSON.stringify(data) });
  }
}

let client: StreamClient;
beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.sockets = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost' });
  client = new StreamClient();
});
afterEach(() => {
  client.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('resumes missed events, deduplicates replay and refreshes REST views', () => {
  const event = vi.fn();
  const gap = vi.fn();
  const recover = vi.fn();
  client.onRecovery(recover);
  client.subscribe('runs', event, gap, 10);
  client.start();
  const a = FakeSocket.sockets[0]!;
  a.hello();
  expect(a.sent).toContainEqual({ op: 'subscribe', topic: 'runs', since: 10 });
  a.message({ type: 'event', topic: 'runs', seq: 11, data: 'first' });
  a.close();
  vi.advanceTimersByTime(1000);
  const b = FakeSocket.sockets[1]!;
  b.hello();
  expect(b.sent).toContainEqual({ op: 'subscribe', topic: 'runs', since: 11 });
  b.message({ type: 'subscribed', topic: 'runs', seq: 13, gap: false });
  for (const seq of [11, 12, 13]) b.message({ type: 'event', topic: 'runs', seq, data: seq });
  expect(event.mock.calls.map((c) => c[1])).toEqual([11, 12, 13]);
  expect(gap).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledTimes(2);
});

it('detects restart even with equal sequence numbers and ignores callbacks from old sockets', () => {
  const event = vi.fn();
  const gap = vi.fn();
  client.subscribe('runs', event, gap, 5);
  client.start();
  const a = FakeSocket.sockets[0]!;
  a.hello();
  a.close();
  vi.advanceTimersByTime(1000);
  const b = FakeSocket.sockets[1]!;
  b.hello('server-b');
  expect(b.sent).toContainEqual({ op: 'subscribe', topic: 'runs' });
  b.message({ type: 'subscribed', topic: 'runs', seq: 5, gap: false });
  b.message({ type: 'event', topic: 'runs', seq: 6, data: 'new' });
  a.message({ type: 'event', topic: 'runs', seq: 999, data: 'stale' });
  a.onclose();
  expect(event).toHaveBeenCalledExactlyOnceWith('new', 6);
  expect(client.getStatus()).toBe('online');
  expect(gap).toHaveBeenCalledTimes(1);
  client.stop();
  vi.advanceTimersByTime(60_000);
  expect(FakeSocket.sockets).toHaveLength(2);
});

it('recovers when the replay buffer has a gap', () => {
  const gap = vi.fn();
  const recovery = vi.fn();
  client.onRecovery(recovery);
  client.subscribe('runs', vi.fn(), gap, 1);
  client.start();
  const socket = FakeSocket.sockets[0]!;
  socket.hello();
  socket.message({ type: 'subscribed', topic: 'runs', seq: 1000, gap: true });
  expect(gap).toHaveBeenCalledOnce();
  expect(recovery).toHaveBeenCalledTimes(2);
});
