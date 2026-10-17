import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Rule-based OpenAI-compatible chat completions server for UI development and end-to-end tests.
 * It streams like a real model and emits tool calls for a few recognizable requests:
 *  - "light"/"灯"     → ha_search_entities(domain=light), then a summary
 *  - "unlock"/"解锁"  → ha_call_service(lock.unlock, lock.front_door)
 *  - anything else    → a short echo
 */
interface ChatMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string }> | null;
  tool_calls?: unknown[];
  name?: string;
}

const text = (m: ChatMessage | undefined) =>
  !m?.content ? '' : typeof m.content === 'string' ? m.content : m.content.map((c) => c.text ?? '').join(' ');

function decide(messages: ChatMessage[]): {
  content?: string;
  tool?: { name: string; args: Record<string, unknown> };
} {
  const last = messages[messages.length - 1];
  if (last?.role === 'tool') {
    const result = text(last).split('\n').slice(0, 6).join('\n');
    return { content: `Here is what I found:\n\n\`\`\`\n${result}\n\`\`\`\n\nAnything else?` };
  }
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const q = text(lastUser).toLowerCase();
  const system = text(messages.find((m) => m.role === 'system' || m.role === 'developer')).toLowerCase();
  if (system.includes('short title'))
    return { content: q.includes('light') || q.includes('灯') ? 'Lights check' : 'Fake chat' };
  if (q.includes('unlock') || q.includes('解锁')) {
    return {
      tool: {
        name: 'ha_call_service',
        args: { domain: 'lock', service: 'unlock', target: { entity_id: ['lock.front_door'] } },
      },
    };
  }
  if (q.includes('light') || q.includes('灯'))
    return { tool: { name: 'ha_search_entities', args: { domain: 'light' } } };
  return { content: `**Echo:** ${text(lastUser).slice(0, 200)}` };
}

function sse(res: ServerResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export class FakeLlm {
  private server!: Server;
  url = '';
  requests = 0;

  async start(port = 0): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server.listen(port, '127.0.0.1', () => r()));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v1`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'fake-1' }, { id: 'fake-vision' }] }));
      return;
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    this.requests++;
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body) as { messages: ChatMessage[]; model: string; stream?: boolean };
    const answer = decide(payload.messages);
    const id = `chatcmpl-${Date.now()}`;
    const base = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: payload.model,
    };
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    sse(res, {
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    });
    if (answer.tool) {
      sse(res, {
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `call_${Date.now()}`,
                  type: 'function',
                  function: { name: answer.tool.name, arguments: JSON.stringify(answer.tool.args) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
      sse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
    } else {
      for (const piece of (answer.content ?? '').match(/.{1,12}/gs) ?? []) {
        sse(res, { ...base, choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] });
        await new Promise((r) => setTimeout(r, 25));
      }
      sse(res, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    }
    sse(res, {
      ...base,
      choices: [],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
