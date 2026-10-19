import { expect, it } from 'vitest';
import { parseJsonObject } from './json.ts';

it('accepts only JSON objects, without coercing invalid drafts to an empty object', () => {
  for (const text of ['', '{', '[]', 'null', 'false', '1', '"text"'])
    expect(parseJsonObject(text)).toEqual({ ok: false });
  expect(parseJsonObject('{"nested":{"value":[1]}}')).toEqual({
    ok: true,
    value: { nested: { value: [1] } },
  });
});
