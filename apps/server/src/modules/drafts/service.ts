import type { Draft, DraftEvent, DraftImage, UploadDraftImage } from '@cangze/contracts';
import { AppError, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import type { Db } from '../../db/index.ts';
import type { StreamHub } from '../stream/hub.ts';

const MAX_IMAGES = 4;

interface DraftRow {
  scope: string;
  session_id: string | null;
  text: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

interface ImageRow {
  id: string;
  scope: string;
  mime_type: DraftImage['mimeType'];
  width: number | null;
  height: number | null;
  bytes: Buffer;
  created_at: number;
}

export interface DraftImagePayload {
  mimeType: DraftImage['mimeType'];
  data: string;
}

export interface ConsumedDraft {
  draft: Draft;
  images: DraftImagePayload[];
  event: Extract<DraftEvent, { kind: 'delete' }>;
}

interface MutationResult {
  draft: Draft | null;
  deleted: Extract<DraftEvent, { kind: 'delete' }> | null;
}

/**
 * Unsent composer content, keyed by `new` (the single new chat) or a session id.
 * Text saves use an optimistic revision; attachment changes are discrete and bump it too.
 * `consume` deliberately does not publish: callers that wrap it in an outer transaction
 * publish the returned delete event only after that transaction commits.
 */
export class DraftsService {
  constructor(
    private readonly db: Db,
    private readonly stream: StreamHub,
  ) {}

  snapshot(): { items: Draft[]; streamSeq: number } {
    return { items: this.list(), streamSeq: this.stream.seq('drafts') };
  }

  list(): Draft[] {
    const rows = this.db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC, scope').all() as DraftRow[];
    return rows.map((r) => this.toDraft(r));
  }

  get(scope: string): Draft | null {
    const r = this.row(scope);
    return r ? this.toDraft(r) : null;
  }

  put(scope: string, text: string, baseRevision: number | null): Draft | null {
    this.assertScope(scope);
    const result = this.db.transaction((): MutationResult => {
      const r = this.row(scope);
      const images = this.imageRows(scope);
      if (!text.trim() && !images.length) {
        if (!r) return { draft: null, deleted: null };
        this.db.prepare('DELETE FROM drafts WHERE scope = ?').run(scope);
        return { draft: null, deleted: this.deleteEvent(r, 'cleared') };
      }
      const now = Date.now();
      if (baseRevision === null) {
        if (r) throw this.conflict(r);
        this.db
          .prepare(
            'INSERT INTO drafts (scope, session_id, text, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
          )
          .run(scope, scope === 'new' ? null : scope, text, now, now);
      } else {
        if (!r) throw this.conflict(null);
        const res = this.db
          .prepare(
            'UPDATE drafts SET text = ?, revision = revision + 1, updated_at = ? WHERE scope = ? AND revision = ?',
          )
          .run(text, now, scope, baseRevision);
        if (!res.changes) throw this.conflict(r);
      }
      return { draft: this.toDraft(this.row(scope)!), deleted: null };
    })();
    if (result.draft) this.publish({ kind: 'upsert', draft: result.draft });
    else if (result.deleted) this.publish(result.deleted);
    return result.draft;
  }

  addImage(scope: string, input: UploadDraftImage): Draft {
    this.assertScope(scope);
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length) throw new AppError(400, 'empty_image', 'Image is empty');
    const draft = this.db.transaction(() => {
      const now = Date.now();
      if (!this.row(scope)) {
        this.db
          .prepare(
            "INSERT INTO drafts (scope, session_id, text, revision, created_at, updated_at) VALUES (?, ?, '', 1, ?, ?)",
          )
          .run(scope, scope === 'new' ? null : scope, now, now);
      }
      const count = (
        this.db.prepare('SELECT COUNT(*) AS n FROM draft_attachments WHERE scope = ?').get(scope) as {
          n: number;
        }
      ).n;
      if (count >= MAX_IMAGES)
        throw new AppError(409, 'too_many_images', `A draft can hold at most ${MAX_IMAGES} images`);
      this.db
        .prepare(
          'INSERT INTO draft_attachments (id, scope, mime_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(newId('dimg'), scope, input.mimeType, input.width ?? null, input.height ?? null, bytes, now);
      this.db
        .prepare('UPDATE drafts SET revision = revision + 1, updated_at = ? WHERE scope = ?')
        .run(now, scope);
      return this.toDraft(this.row(scope)!);
    })();
    this.publish({ kind: 'upsert', draft });
    return draft;
  }

  image(scope: string, imageId: string): { bytes: Buffer; mimeType: string } {
    const r = this.db
      .prepare('SELECT mime_type, bytes FROM draft_attachments WHERE scope = ? AND id = ?')
      .get(scope, imageId) as { mime_type: string; bytes: Buffer } | undefined;
    if (!r) throw notFound('Draft image');
    return { bytes: Buffer.from(r.bytes), mimeType: r.mime_type };
  }

  deleteImage(scope: string, imageId: string): Draft | null {
    const result = this.db.transaction((): MutationResult => {
      const r = this.row(scope);
      if (!r) throw notFound('Draft');
      const image = this.db
        .prepare('SELECT 1 FROM draft_attachments WHERE scope = ? AND id = ?')
        .get(scope, imageId);
      if (!image) throw notFound('Draft image');
      this.db.prepare('DELETE FROM draft_attachments WHERE id = ?').run(imageId);
      const images = this.imageRows(scope);
      if (!r.text.trim() && !images.length) {
        this.db.prepare('DELETE FROM drafts WHERE scope = ?').run(scope);
        return { draft: null, deleted: this.deleteEvent(r, 'cleared') };
      }
      this.db
        .prepare('UPDATE drafts SET revision = revision + 1, updated_at = ? WHERE scope = ?')
        .run(Date.now(), scope);
      return { draft: this.toDraft(this.row(scope)!), deleted: null };
    })();
    if (result.draft) this.publish({ kind: 'upsert', draft: result.draft });
    else if (result.deleted) this.publish(result.deleted);
    return result.draft;
  }

  /**
   * Delete the draft if it is still at `revision` and return the images that belong to the
   * message. `undefined` means the caller does not use drafts; `null` means "there should be
   * none". Does not publish; see the class comment.
   */
  consume(
    scope: string,
    revision: number | null | undefined,
    opts: { sessionId?: string; reason?: 'sent' | 'cleared' } = {},
  ): ConsumedDraft | null {
    if (revision === undefined) return null;
    this.assertScope(scope);
    return this.db.transaction((): ConsumedDraft | null => {
      const r = this.row(scope);
      if (revision === null) {
        if (r) throw this.conflict(r);
        return null;
      }
      if (!r) throw this.conflict(null);
      if (r.revision !== revision) throw this.conflict(r);
      const rows = this.imageRows(scope);
      const draft = this.toDraftFrom(r, rows);
      const images = rows.map((img) => ({
        mimeType: img.mime_type,
        data: img.bytes.toString('base64'),
      }));
      this.db.prepare('DELETE FROM drafts WHERE scope = ?').run(scope);
      return {
        draft,
        images,
        event: {
          kind: 'delete',
          scope,
          revision: r.revision,
          reason: opts.reason ?? 'sent',
          ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        },
      };
    })();
  }

  publish(event: DraftEvent): void {
    this.stream.publish('drafts', event);
  }

  private assertScope(scope: string): void {
    if (scope === 'new') return;
    const exists = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(scope);
    if (!exists) throw notFound('Session');
  }

  private row(scope: string): DraftRow | undefined {
    return this.db.prepare('SELECT * FROM drafts WHERE scope = ?').get(scope) as DraftRow | undefined;
  }

  private imageRows(scope: string): ImageRow[] {
    return this.db
      .prepare('SELECT * FROM draft_attachments WHERE scope = ? ORDER BY created_at, rowid')
      .all(scope) as ImageRow[];
  }

  private toDraft(r: DraftRow): Draft {
    return this.toDraftFrom(r, this.imageRows(r.scope));
  }

  private toDraftFrom(
    r: DraftRow,
    images: Array<Pick<ImageRow, 'id' | 'mime_type' | 'width' | 'height'>>,
  ): Draft {
    return {
      scope: r.scope,
      text: r.text,
      images: images.map((img) => ({
        id: img.id,
        mimeType: img.mime_type,
        width: img.width,
        height: img.height,
      })),
      revision: r.revision,
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  private deleteEvent(r: DraftRow, reason: 'cleared' | 'sent'): Extract<DraftEvent, { kind: 'delete' }> {
    return { kind: 'delete', scope: r.scope, revision: r.revision, reason };
  }

  private conflict(current: DraftRow | null): AppError {
    return new AppError(409, 'draft_conflict', 'Draft changed on another device', {
      draft: current ? this.toDraft(current) : null,
    });
  }
}
