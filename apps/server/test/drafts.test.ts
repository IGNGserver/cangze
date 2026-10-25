import { afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers.ts';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const PNG_BYTES = Buffer.from(PNG, 'base64');

let h: Harness | undefined;
afterEach(async () => {
  await h?.app.close();
  h = undefined;
});

async function session(): Promise<string> {
  const res = await h!.call('POST', '/api/v1/sessions', {});
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe('composer drafts', () => {
  it('creates, updates, clears and reports conflicts with revisions', async () => {
    h = await harness();
    let res = await h.call('GET', '/api/v1/drafts');
    expect(res.json()).toEqual({ items: [], streamSeq: 0 });

    res = await h.call('PUT', '/api/v1/drafts/new', { text: 'hello', baseRevision: null });
    expect(res.statusCode).toBe(200);
    expect(res.json().draft).toMatchObject({ scope: 'new', text: 'hello', revision: 1, images: [] });

    res = await h.call('PUT', '/api/v1/drafts/new', { text: 'hello world', baseRevision: 1 });
    expect(res.json().draft).toMatchObject({ text: 'hello world', revision: 2 });

    res = await h.call('PUT', '/api/v1/drafts/new', { text: 'stale', baseRevision: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'draft_conflict',
      details: { draft: { text: 'hello world', revision: 2 } },
    });

    const seq = (await h.call('GET', '/api/v1/drafts')).json().streamSeq;
    expect(seq).toBeGreaterThan(0);

    res = await h.call('PUT', '/api/v1/drafts/new', { text: '   ', baseRevision: 2 });
    expect(res.json().draft).toBeNull();
    expect((await h.call('GET', '/api/v1/drafts')).json().items).toEqual([]);
  });

  it('validates the scope against existing sessions', async () => {
    h = await harness();
    const res = await h.call('PUT', '/api/v1/drafts/ses_missing', {
      text: 'hi',
      baseRevision: null,
    });
    expect(res.statusCode).toBe(404);
  });

  it('stores draft images as attachments and keeps them when the text is empty', async () => {
    h = await harness();
    let res = await h.call('POST', '/api/v1/drafts/new/images', {
      mimeType: 'image/png',
      data: PNG,
      width: 1,
      height: 1,
    });
    expect(res.statusCode).toBe(201);
    const image = res.json().draft.images[0];
    expect(image).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 });
    const revision = res.json().draft.revision as number;

    res = await h.call('GET', `/api/v1/drafts/new/images/${image.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(Buffer.compare(res.rawPayload, PNG_BYTES)).toBe(0);

    res = await h.call('PUT', '/api/v1/drafts/new', { text: '', baseRevision: revision });
    expect(res.json().draft).toMatchObject({ text: '', images: [{ id: image.id }] });

    res = await h.call('DELETE', `/api/v1/drafts/new/images/${image.id}`);
    expect(res.json().draft).toBeNull();
    expect((await h.call('GET', '/api/v1/drafts')).json().items).toEqual([]);
    expect((await h.call('GET', `/api/v1/drafts/new/images/${image.id}`)).statusCode).toBe(404);
  });

  it('limits a draft to four images', async () => {
    h = await harness();
    for (let i = 0; i < 4; i++) {
      const res = await h.call('POST', '/api/v1/drafts/new/images', {
        mimeType: 'image/png',
        data: PNG,
      });
      expect(res.statusCode).toBe(201);
    }
    const fifth = await h.call('POST', '/api/v1/drafts/new/images', {
      mimeType: 'image/png',
      data: PNG,
    });
    expect(fifth.statusCode).toBe(409);
    expect(fifth.json().error.code).toBe('too_many_images');
  });

  it('publishes draft changes and deletes a draft with its session', async () => {
    h = await harness();
    const events: any[] = [];
    const off = h.s.stream.tap('drafts', (event) => events.push(event));
    const id = await session();
    await h.call('PUT', `/api/v1/drafts/${id}`, { text: 'session draft', baseRevision: null });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'upsert', draft: expect.objectContaining({ scope: id }) }),
    );

    const del = await h.call('DELETE', `/api/v1/sessions/${id}`);
    expect(del.statusCode).toBe(200);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'delete', scope: id, reason: 'session_deleted' }),
    );
    expect((await h.call('GET', '/api/v1/drafts')).json().items).toEqual([]);
    off();
  });
});
