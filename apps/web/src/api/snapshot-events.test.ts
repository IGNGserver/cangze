import { expect, it } from 'vitest';
import { SnapshotEvents } from './snapshot-events.ts';

it('does not overwrite concurrent events with a stale REST response, or replay snapshot events', () => {
  const events = new SnapshotEvents<string>();
  expect(events.push('live', 1)).toBe(false);
  events.begin();
  expect(events.push('already in snapshot', 2)).toBe(true);
  events.push('after snapshot', 4);
  events.push('after snapshot', 4);
  events.push('between', 3);
  expect(events.finish(2)).toEqual(['between', 'after snapshot']);
  expect(events.push('late replay already in snapshot', 2)).toBe(true);
  expect(events.push('live again', 5)).toBe(false);
  expect(events.finish(0)).toEqual([]);
});

it('discards old-process events and cursors on recovery', () => {
  const events = new SnapshotEvents<string>();
  events.begin();
  events.push('old process', 100);
  events.reset();
  events.push('new process', 2);
  expect(events.finish(1)).toEqual(['new process']);
});
