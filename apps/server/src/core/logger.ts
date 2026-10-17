import { Writable } from 'node:stream';
import pino, { type Logger } from 'pino';

export interface LogRecord {
  time: number;
  level: number;
  msg: string;
  module?: string;
  [key: string]: unknown;
}

/** Keeps the most recent log records in memory for the logs page. */
export class LogRing {
  private readonly buf: LogRecord[] = [];
  constructor(private readonly capacity = 5000) {}

  push(rec: LogRecord): void {
    this.buf.push(rec);
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
  }

  query(opts: {
    minLevel?: number;
    module?: string;
    search?: string;
    before?: number;
    limit?: number;
  }): LogRecord[] {
    const limit = Math.min(opts.limit ?? 200, 1000);
    const out: LogRecord[] = [];
    for (let i = this.buf.length - 1; i >= 0 && out.length < limit; i--) {
      const r = this.buf[i]!;
      if (opts.before !== undefined && r.time >= opts.before) continue;
      if (opts.minLevel !== undefined && r.level < opts.minLevel) continue;
      if (opts.module && r.module !== opts.module) continue;
      if (opts.search && !JSON.stringify(r).toLowerCase().includes(opts.search.toLowerCase())) continue;
      out.push(r);
    }
    return out;
  }
}

/** Keys whose values must never reach logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.apiKey',
  '*.token',
  '*.password',
  '*.adminKey',
  '*.secret',
];

export function createLogger(level: string, ring: LogRing): Logger {
  const ringStream = new Writable({
    write(chunk, _enc, cb) {
      try {
        ring.push(JSON.parse(String(chunk)) as LogRecord);
      } catch {
        // ignore non-JSON lines
      }
      cb();
    },
  });
  const streams: pino.StreamEntry[] = [
    { level: level as pino.Level, stream: pino.destination(1) },
    { level: level as pino.Level, stream: ringStream },
  ];
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, pino.multistream(streams));
}
