import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { harness, ORIGIN, type Harness } from './helpers.ts';

let h: Harness | undefined;
afterEach(async () => {
  await h?.app.close();
  h = undefined;
});

function open(url: string, headers: Record<string, string>) {
  const ws = new WebSocket(url, { headers });
  const messages: unknown[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
  const waitFor = async (pred: (m: any) => boolean, ms = 2000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const m = messages.find(pred);
      if (m) return m as any;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timeout waiting for message: ' + JSON.stringify(messages));
  };
  return { ws, messages, waitFor };
}

describe('stream hub', () => {
  it('requires authentication', async () => {
    h = await harness();
    await h.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (h.app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/stream`);
    const status = await new Promise<number>((resolve) =>
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0)),
    );
    expect(status).toBe(401);
  });

  it('delivers events and replays missed ones on resume', async () => {
    h = await harness();
    await h.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (h.app.server.address() as { port: number }).port;
    const headers = { cookie: h.cookie, origin: ORIGIN, host: `127.0.0.1:${port}` };

    const a = open(`ws://127.0.0.1:${port}/api/v1/stream`, headers);
    await a.waitFor((m) => m.type === 'hello');
    a.ws.send(JSON.stringify({ op: 'subscribe', topic: 'session:abc' }));
    await a.waitFor((m) => m.type === 'subscribed');
    h.s.stream.publish('session:abc', { n: 1 });
    expect((await a.waitFor((m) => m.type === 'event')).seq).toBe(1);
    a.ws.close();

    h.s.stream.publish('session:abc', { n: 2 });
    h.s.stream.publish('session:abc', { n: 3 });

    const b = open(`ws://127.0.0.1:${port}/api/v1/stream`, headers);
    await b.waitFor((m) => m.type === 'hello');
    b.ws.send(JSON.stringify({ op: 'subscribe', topic: 'session:abc', since: 1 }));
    const sub = await b.waitFor((m) => m.type === 'subscribed');
    expect(sub).toMatchObject({ seq: 3, gap: false });
    await b.waitFor((m) => m.type === 'event' && m.seq === 3);
    expect(b.messages.filter((m: any) => m.type === 'event').map((m: any) => m.data.n)).toEqual([2, 3]);

    b.ws.send(JSON.stringify({ op: 'subscribe', topic: 'nope' }));
    await b.waitFor((m) => m.type === 'error' && m.code === 'bad_topic');
    b.ws.close();
  });

  it('rejects cross-site pages using the cookie', async () => {
    h = await harness();
    await h.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (h.app.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/stream`, {
      headers: { cookie: h.cookie, origin: 'https://evil.example', host: `127.0.0.1:${port}` },
    });
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(1008);
  });
});
