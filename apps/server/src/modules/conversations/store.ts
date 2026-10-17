import type { Entry } from '@cangze/contracts';
import { notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { json, type Db } from '../../db/index.ts';

export type EntryKind = 'message' | 'compaction' | 'notice' | 'model_change';

interface Row {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  seq: number;
  kind: EntryKind;
  role: string | null;
  data: string;
  run_id: string | null;
  created_at: number;
}

export interface StoredEntry {
  id: string;
  conversationId: string;
  parentId: string | null;
  seq: number;
  kind: EntryKind;
  role: string | null;
  data: Record<string, unknown>;
  runId: string | null;
  createdAt: number;
}

const toEntry = (r: Row): StoredEntry => ({
  id: r.id,
  conversationId: r.conversation_id,
  parentId: r.parent_id,
  seq: r.seq,
  kind: r.kind,
  role: r.role,
  data: json.parse<Record<string, unknown>>(r.data, {}),
  runId: r.run_id,
  createdAt: r.created_at,
});

/**
 * Conversations are trees of entries with an active leaf, shared by main sessions and subagents.
 * Appending never rewrites history: edits and regenerations create sibling branches.
 */
export class ConversationStore {
  constructor(private readonly db: Db) {}

  create(ownerKind: 'session' | 'agent', ownerId: string): string {
    const id = newId('cnv');
    const now = Date.now();
    this.db
      .prepare(
        'INSERT INTO conversations (id, owner_kind, owner_id, active_leaf_id, next_seq, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?)',
      )
      .run(id, ownerKind, ownerId, now, now);
    return id;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  activeLeaf(id: string): string | null {
    const r = this.db.prepare('SELECT active_leaf_id FROM conversations WHERE id = ?').get(id) as
      { active_leaf_id: string | null } | undefined;
    if (!r) throw notFound('Conversation');
    return r.active_leaf_id;
  }

  setActiveLeaf(id: string, leafId: string | null): void {
    this.db
      .prepare('UPDATE conversations SET active_leaf_id = ?, updated_at = ? WHERE id = ?')
      .run(leafId, Date.now(), id);
  }

  /** Append an entry under `parentId` and make it the active leaf. */
  append(
    conversationId: string,
    parentId: string | null,
    kind: EntryKind,
    data: Record<string, unknown>,
    opts: { role?: string | null; runId?: string | null; activate?: boolean } = {},
  ): StoredEntry {
    const id = newId('ent');
    const now = Date.now();
    let seq = 0;
    this.db.transaction(() => {
      const c = this.db.prepare('SELECT next_seq FROM conversations WHERE id = ?').get(conversationId) as
        { next_seq: number } | undefined;
      if (!c) throw notFound('Conversation');
      seq = c.next_seq;
      this.db
        .prepare(
          'INSERT INTO entries (id, conversation_id, parent_id, seq, kind, role, data, run_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          conversationId,
          parentId,
          seq,
          kind,
          opts.role ?? null,
          json.stringify(data),
          opts.runId ?? null,
          now,
        );
      this.db
        .prepare(
          'UPDATE conversations SET next_seq = next_seq + 1, updated_at = ?' +
            (opts.activate === false ? '' : ', active_leaf_id = ?') +
            ' WHERE id = ?',
        )
        .run(...(opts.activate === false ? [now, conversationId] : [now, id, conversationId]));
    })();
    return {
      id,
      conversationId,
      parentId,
      seq,
      kind,
      role: opts.role ?? null,
      data,
      runId: opts.runId ?? null,
      createdAt: now,
    };
  }

  get(entryId: string): StoredEntry {
    const r = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Row | undefined;
    if (!r) throw notFound('Entry');
    return toEntry(r);
  }

  /** Entries from the root to `leafId` (inclusive). */
  path(conversationId: string, leafId: string | null): StoredEntry[] {
    if (!leafId) return [];
    const rows = this.db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 0 FROM entries WHERE id = ? AND conversation_id = ?
           UNION ALL
           SELECT e.id, e.parent_id, chain.depth + 1 FROM entries e JOIN chain ON e.id = chain.parent_id
         )
         SELECT entries.* FROM entries JOIN chain ON entries.id = chain.id ORDER BY chain.depth DESC`,
      )
      .all(leafId, conversationId) as Row[];
    return rows.map(toEntry);
  }

  activePath(conversationId: string): StoredEntry[] {
    return this.path(conversationId, this.activeLeaf(conversationId));
  }

  children(conversationId: string, parentId: string | null): StoredEntry[] {
    const rows = (
      parentId === null
        ? this.db.prepare(
            'SELECT * FROM entries WHERE conversation_id = ? AND parent_id IS NULL ORDER BY seq',
          )
        : this.db.prepare('SELECT * FROM entries WHERE conversation_id = ? AND parent_id = ? ORDER BY seq')
    ).all(...(parentId === null ? [conversationId] : [conversationId, parentId])) as Row[];
    return rows.map(toEntry);
  }

  /** Follow the newest child repeatedly to find the leaf a branch currently ends at. */
  deepestLeaf(conversationId: string, entryId: string): string {
    let current = entryId;
    for (let i = 0; i < 100_000; i++) {
      const next = this.db
        .prepare(
          'SELECT id FROM entries WHERE conversation_id = ? AND parent_id = ? ORDER BY seq DESC LIMIT 1',
        )
        .get(conversationId, current) as { id: string } | undefined;
      if (!next) return current;
      current = next.id;
    }
    return current;
  }

  /** Entries of the active path decorated with branch info for user messages, as served to clients. */
  view(conversationId: string, limit = 2000): Entry[] {
    const path = this.activePath(conversationId);
    const shown = path.slice(-limit);
    return shown.map((e) => {
      let branch: Entry['branch'] = null;
      if (e.kind === 'message' && e.role === 'user') {
        const siblings = this.children(conversationId, e.parentId).filter(
          (s) => s.kind === 'message' && s.role === 'user',
        );
        if (siblings.length > 1) {
          branch = {
            index: siblings.findIndex((s) => s.id === e.id),
            count: siblings.length,
            siblingIds: siblings.map((s) => s.id),
          };
        }
      }
      return toWire(e, branch);
    });
  }

  countEntries(conversationId: string): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM entries WHERE conversation_id = ?').get(conversationId) as {
        n: number;
      }
    ).n;
  }
}

export function toWire(e: StoredEntry, branch: Entry['branch'] = null): Entry {
  return {
    id: e.id,
    parentId: e.parentId,
    seq: e.seq,
    kind: e.kind,
    role: e.role,
    runId: e.runId,
    createdAt: new Date(e.createdAt).toISOString(),
    data: e.data,
    branch,
  };
}
