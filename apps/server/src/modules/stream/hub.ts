import { randomUUID } from 'node:crypto';
import { StreamClientMessage, type StreamServerMessage } from '@cangze/contracts';
import type { Logger } from 'pino';
import type { WebSocket } from 'ws';
import { VERSION } from '../../core/version.ts';

const TOPIC_RE =
  /^(sessions|runs|agents|notifications|approvals|ha:status|ha:states|system|(session|run|agent):[A-Za-z0-9_-]{1,64})$/;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const HEARTBEAT_MS = 25_000;

interface Topic {
  seq: number;
  buffer: Array<{ seq: number; data: unknown }>;
  capacity: number;
  subscribers: Set<Client>;
  lastActivity: number;
}

interface Client {
  socket: WebSocket;
  topics: Set<string>;
  alive: boolean;
}

function capacityFor(topic: string): number {
  if (topic.startsWith('session:') || topic.startsWith('run:')) return 2000;
  if (topic === 'ha:states') return 300;
  return 500;
}

/**
 * Topic based fan-out with per-topic sequence numbers and a bounded replay buffer so that
 * reconnecting clients can resume without missing events.
 */
export class StreamHub {
  private readonly instanceId = randomUUID();
  private readonly topics = new Map<string, Topic>();
  private readonly clients = new Set<Client>();
  private readonly taps = new Map<string, Set<(data: unknown) => void>>();
  private heartbeat?: NodeJS.Timeout;

  constructor(private readonly logger: Logger) {}

  start(): void {
    this.heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.clients) c.socket.close(1001, 'server shutting down');
    this.clients.clear();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  static isValidTopic(topic: string): boolean {
    return TOPIC_RE.test(topic);
  }

  private topic(name: string): Topic {
    let t = this.topics.get(name);
    if (!t) {
      t = {
        seq: 0,
        buffer: [],
        capacity: capacityFor(name),
        subscribers: new Set(),
        lastActivity: Date.now(),
      };
      this.topics.set(name, t);
    }
    return t;
  }

  seq(topic: string): number {
    return this.topics.get(topic)?.seq ?? 0;
  }

  hasSubscribers(topic: string): boolean {
    return (this.topics.get(topic)?.subscribers.size ?? 0) > 0;
  }

  /** Server-side listener for a topic (e.g. to enforce limits on a run's events). */
  tap(topic: string, fn: (data: unknown) => void): () => void {
    let set = this.taps.get(topic);
    if (!set) {
      set = new Set();
      this.taps.set(topic, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.taps.delete(topic);
    };
  }

  publish(topicName: string, data: unknown): number {
    for (const fn of this.taps.get(topicName) ?? []) {
      try {
        fn(data);
      } catch {
        // listeners must not break publishing
      }
    }
    const t = this.topic(topicName);
    const seq = ++t.seq;
    t.buffer.push({ seq, data });
    if (t.buffer.length > t.capacity) t.buffer.splice(0, t.buffer.length - t.capacity);
    t.lastActivity = Date.now();
    if (t.subscribers.size) {
      const frame = JSON.stringify({
        type: 'event',
        topic: topicName,
        seq,
        data,
      } satisfies StreamServerMessage);
      for (const c of t.subscribers) this.sendRaw(c, frame);
    }
    return seq;
  }

  attach(socket: WebSocket): void {
    const client: Client = { socket, topics: new Set(), alive: true };
    this.clients.add(client);
    this.send(client, {
      type: 'hello',
      serverTime: Date.now(),
      version: VERSION,
      instanceId: this.instanceId,
    });

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (raw) => {
      let msg: StreamClientMessage;
      try {
        msg = StreamClientMessage.parse(JSON.parse(String(raw)));
      } catch {
        return this.send(client, { type: 'error', code: 'bad_message', message: 'Malformed message' });
      }
      this.handle(client, msg);
    });
    socket.on('close', () => this.detach(client));
    socket.on('error', () => this.detach(client));
  }

  private handle(client: Client, msg: StreamClientMessage): void {
    switch (msg.op) {
      case 'ping':
        return this.send(client, { type: 'pong', t: msg.t });
      case 'unsubscribe': {
        client.topics.delete(msg.topic);
        this.topics.get(msg.topic)?.subscribers.delete(client);
        return this.send(client, { type: 'unsubscribed', topic: msg.topic });
      }
      case 'subscribe': {
        if (!StreamHub.isValidTopic(msg.topic)) {
          return this.send(client, {
            type: 'error',
            code: 'bad_topic',
            message: 'Unknown topic',
            topic: msg.topic,
          });
        }
        if (client.topics.size >= 64) {
          return this.send(client, {
            type: 'error',
            code: 'too_many_topics',
            message: 'Subscription limit reached',
          });
        }
        const t = this.topic(msg.topic);
        t.subscribers.add(client);
        client.topics.add(msg.topic);
        let gap = false;
        const replay: Array<{ seq: number; data: unknown }> = [];
        if (msg.since !== undefined && msg.since < t.seq) {
          const oldest = t.buffer[0]?.seq ?? t.seq + 1;
          if (msg.since + 1 < oldest) gap = true;
          else for (const e of t.buffer) if (e.seq > msg.since) replay.push(e);
        } else if (msg.since !== undefined && msg.since > t.seq) {
          // server restarted: client is ahead of us
          gap = true;
        }
        this.send(client, { type: 'subscribed', topic: msg.topic, seq: t.seq, gap });
        for (const e of replay)
          this.send(client, { type: 'event', topic: msg.topic, seq: e.seq, data: e.data });
        return;
      }
    }
  }

  private detach(client: Client): void {
    if (!this.clients.delete(client)) return;
    for (const name of client.topics) this.topics.get(name)?.subscribers.delete(client);
  }

  private send(client: Client, msg: StreamServerMessage): void {
    this.sendRaw(client, JSON.stringify(msg));
  }

  private sendRaw(client: Client, frame: string): void {
    const s = client.socket;
    if (s.readyState !== s.OPEN) return;
    if (s.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.logger.warn({ module: 'stream' }, 'closing slow stream client');
      s.close(1013, 'client too slow');
      this.detach(client);
      return;
    }
    s.send(frame);
  }

  private beat(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.socket.terminate();
        this.detach(c);
        continue;
      }
      c.alive = false;
      try {
        c.socket.ping();
      } catch {
        this.detach(c);
      }
    }
    // forget idle topics without subscribers
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [name, t] of this.topics) {
      if (t.subscribers.size === 0 && t.lastActivity < cutoff) this.topics.delete(name);
    }
  }
}
