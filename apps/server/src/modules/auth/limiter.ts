import { AppError } from '../../core/errors.ts';

/** Sliding-window failure counter per key (client IP) plus a global ceiling. */
export class FailureLimiter {
  private readonly failures = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly opts: { perKey: number; global: number; windowMs: number }) {}

  private prune(list: number[], now: number): number[] {
    const from = now - this.opts.windowMs;
    let i = 0;
    while (i < list.length && list[i]! < from) i++;
    return i ? list.slice(i) : list;
  }

  /** Throws 429 with Retry-After seconds when the key or the whole hub is locked out. */
  assertAllowed(key: string, now = Date.now()): void {
    const own = this.prune(this.failures.get(key) ?? [], now);
    this.failures.set(key, own);
    this.global = this.prune(this.global, now);
    const blockedBy =
      own.length >= this.opts.perKey ? own : this.global.length >= this.opts.global ? this.global : null;
    if (blockedBy) {
      const retryAfter = Math.ceil((blockedBy[0]! + this.opts.windowMs - now) / 1000);
      throw new AppError(429, 'rate_limited', 'Too many failed attempts. Try again later.', { retryAfter });
    }
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...(this.failures.get(key) ?? []), now]);
    this.global.push(now);
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}
