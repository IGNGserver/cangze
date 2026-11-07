import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { harness, type Harness } from './helpers.ts';

let h: Harness;
beforeEach(async () => {
  h = await harness();
});
afterEach(async () => {
  await h.app.close();
});

it('commits settings atomically and publishes changes only after commit', () => {
  const first = h.s.settings.define('test.first', z.string().default('first default'));
  const second = h.s.settings.define('test.second', z.string().default('second default'));
  const changed: string[] = [];
  h.s.bus.on('settings.changed', (event) => changed.push(event.key));

  const result = h.s.settings.transaction(() => {
    first.set('first committed');
    second.set('second committed');
    expect(changed).toEqual([]);
    return 42;
  });
  expect(result).toBe(42);
  expect([first.get(), second.get()]).toEqual(['first committed', 'second committed']);
  expect(changed).toEqual(['test.first', 'test.second']);

  changed.length = 0;
  expect(() =>
    h.s.settings.transaction(() => {
      first.set('must roll back');
      second.set('must also roll back');
      throw new Error('abort transaction');
    }),
  ).toThrow('abort transaction');
  expect(changed).toEqual([]);

  // Bypass the restored in-memory snapshot: the database itself must have rolled back too.
  h.s.settings.invalidate();
  expect([first.get(), second.get()]).toEqual(['first committed', 'second committed']);
});
