import type { StreamServerMessage } from '@cangze/contracts';
import { useEffect, useRef, useSyncExternalStore } from 'react';

type Listener = (data: unknown, seq: number) => void;
type GapListener = () => void;

interface TopicState {
  lastSeq: number | undefined;
  listeners: Set<Listener>;
  gapListeners: Set<GapListener>;
}

export type StreamStatus = 'connecting' | 'online' | 'offline';

/**
 * One WebSocket for the whole app. Topics are reference counted; on reconnect every topic is
 * re-subscribed with `since` so missed events replay, or its gap listeners fire to reload.
 */
class StreamClient {
  private ws: WebSocket | null = null;
  private readonly topics = new Map<string, TopicState>();
  private status: StreamStatus = 'offline';
  private readonly statusListeners = new Set<() => void>();
  private retry = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  start(): void {
    this.wanted = true;
    if (!this.ws) this.open();
  }

  stop(): void {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.setStatus('offline');
  }

  getStatus = (): StreamStatus => this.status;

  onStatus = (fn: () => void): (() => void) => {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  };

  private setStatus(s: StreamStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const l of this.statusListeners) l();
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/v1/stream`);
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.retry = 1000;
      this.setStatus('online');
      for (const [topic, st] of this.topics) this.send({ op: 'subscribe', topic, since: st.lastSeq });
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as StreamServerMessage);
    ws.onclose = () => {
      this.ws = null;
      this.setStatus('offline');
      if (!this.wanted) return;
      this.timer = setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 30_000);
    };
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: StreamServerMessage): void {
    if (msg.type === 'subscribed') {
      const st = this.topics.get(msg.topic);
      if (!st) return;
      if (msg.gap) for (const g of st.gapListeners) g();
      if (st.lastSeq === undefined || msg.gap) st.lastSeq = msg.seq;
    } else if (msg.type === 'event') {
      const st = this.topics.get(msg.topic);
      if (!st) return;
      if (st.lastSeq !== undefined && msg.seq <= st.lastSeq) return;
      st.lastSeq = msg.seq;
      for (const l of st.listeners) l(msg.data, msg.seq);
    }
  }

  /**
   * Subscribe to a topic. Pass `since` (the seq of a REST snapshot) to receive every event after it,
   * so a snapshot plus the stream never misses or duplicates an event.
   */
  subscribe(topic: string, listener: Listener, onGap?: GapListener, since?: number): () => void {
    let st = this.topics.get(topic);
    if (!st) {
      st = { lastSeq: since, listeners: new Set(), gapListeners: new Set() };
      this.topics.set(topic, st);
      this.send({ op: 'subscribe', topic, since });
    }
    st.listeners.add(listener);
    if (onGap) st.gapListeners.add(onGap);
    return () => {
      st!.listeners.delete(listener);
      if (onGap) st!.gapListeners.delete(onGap);
      if (st!.listeners.size === 0) {
        this.topics.delete(topic);
        this.send({ op: 'unsubscribe', topic });
      }
    };
  }
}

export const stream = new StreamClient();

/** Subscribe to a topic for the lifetime of the component. Handlers may change between renders. */
export function useTopic<T = unknown>(
  topic: string | null,
  onEvent: (data: T) => void,
  onGap?: () => void,
  since?: number,
): void {
  const ref = useRef({ onEvent, onGap });
  ref.current = { onEvent, onGap };
  useEffect(() => {
    if (!topic) return;
    return stream.subscribe(
      topic,
      (d) => ref.current.onEvent(d as T),
      () => ref.current.onGap?.(),
      since,
    );
    // `since` only matters when subscribing to a new topic
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
}

export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(stream.onStatus, stream.getStatus);
}
