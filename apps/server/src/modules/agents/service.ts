import { AgentDefinition, type AgentDefinitionInput, type MemoryNote } from '@cangze/contracts';
import { Cron } from 'croner';
import { z } from 'zod';
import { AppError, badRequest, conflict, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { json, type Db } from '../../db/index.ts';
import type { ConversationStore } from '../conversations/store.ts';
import type { ProvidersService } from '../providers/service.ts';
import type { StreamHub } from '../stream/hub.ts';
import type { ToolRegistry } from '../tools/registry.ts';

export interface AgentRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: number;
  current_revision: number;
  conversation_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface RevisionRow {
  agent_id: string;
  revision: number;
  definition: string;
  created_by: string;
  note: string | null;
  created_at: number;
}

interface MemoryRow {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

/** Tools that only main sessions may use; subagents can never be granted them. */
export const SESSION_ONLY_GROUPS = new Set(['agents']);

export const MEMORY_TOOLS = ['memory_list', 'memory_write', 'memory_delete'];

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const toNote = (r: MemoryRow): MemoryNote => ({
  id: r.id,
  title: r.title,
  content: r.content,
  updatedBy: r.updated_by,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

export type AgentChange = { kind: 'upsert' | 'delete'; agentId: string };

/**
 * Subagent definitions. Definitions are immutable revisions; edits must name the revision they
 * are based on so that equal main sessions cannot silently overwrite each other.
 */
export class AgentsService {
  private readonly listeners = new Set<(c: AgentChange) => void>();

  constructor(
    private readonly db: Db,
    private readonly store: ConversationStore,
    private readonly tools: ToolRegistry,
    private readonly providers: ProvidersService,
    private readonly stream: StreamHub,
  ) {}

  onChange(fn: (c: AgentChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(c: AgentChange): void {
    this.stream.publish('agents', c);
    this.stream.publish(`agent:${c.agentId}`, { kind: 'changed' });
    for (const l of this.listeners) l(c);
  }

  // ---------------------------------------------------------------- reads

  rows(): AgentRow[] {
    return this.db
      .prepare('SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE')
      .all() as AgentRow[];
  }

  row(idOrSlug: string): AgentRow {
    const r = this.db
      .prepare('SELECT * FROM agents WHERE (id = ? OR slug = ?) AND deleted_at IS NULL')
      .get(idOrSlug, idOrSlug) as AgentRow | undefined;
    if (!r) throw notFound('Agent');
    return r;
  }

  definition(agentId: string, revision?: number): AgentDefinition {
    const r = this.row(agentId);
    const rev = this.db
      .prepare('SELECT * FROM agent_revisions WHERE agent_id = ? AND revision = ?')
      .get(r.id, revision ?? r.current_revision) as RevisionRow | undefined;
    if (!rev) throw notFound('Agent revision');
    return AgentDefinition.parse(json.parse(rev.definition, {}));
  }

  revisions(agentId: string) {
    const r = this.row(agentId);
    const rows = this.db
      .prepare('SELECT * FROM agent_revisions WHERE agent_id = ? ORDER BY revision DESC')
      .all(r.id) as RevisionRow[];
    return rows.map((x) => ({
      revision: x.revision,
      createdBy: x.created_by,
      note: x.note,
      createdAt: new Date(x.created_at).toISOString(),
      definition: AgentDefinition.parse(json.parse(x.definition, {})),
    }));
  }

  /** Names of tools a subagent may be granted. */
  grantableTools(): string[] {
    return [
      ...this.tools
        .all()
        .filter((t) => !SESSION_ONLY_GROUPS.has(t.group))
        .map((t) => t.name),
      // memory tools are bound per agent and always available; listing them is allowed
      ...MEMORY_TOOLS,
    ];
  }

  // ---------------------------------------------------------------- validation

  validate(input: AgentDefinitionInput): AgentDefinition {
    const parsed = AgentDefinition.safeParse(input);
    if (!parsed.success) throw badRequest('Invalid agent definition', z.treeifyError(parsed.error));
    const def = parsed.data;
    const grantable = new Set(this.grantableTools());
    const unknown = def.tools.filter((t) => !grantable.has(t));
    if (unknown.length) throw badRequest(`Tools cannot be granted to subagents: ${unknown.join(', ')}`);
    const dupe = (list: Array<{ id: string }>) =>
      list.map((x) => x.id).find((id, i, a) => a.indexOf(id) !== i);
    const dTrigger = dupe(def.triggers);
    if (dTrigger) throw badRequest(`Duplicate trigger id ${dTrigger}`);
    const dRule = dupe(def.permissions);
    if (dRule) throw badRequest(`Duplicate permission rule id ${dRule}`);
    for (const t of def.triggers) {
      if (t.kind === 'cron') {
        try {
          new Cron(t.expression, { paused: true }).stop();
        } catch (err) {
          throw badRequest(
            `Invalid cron expression "${t.expression}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    if (def.modelRef) this.providers.resolve(def.modelRef);
    return def;
  }

  // ---------------------------------------------------------------- writes

  create(input: AgentDefinitionInput, createdBy: string, note?: string): AgentRow {
    const def = this.validate(input);
    const id = newId('agt');
    let slug = slugify(def.name) || 'agent';
    for (let i = 2; this.db.prepare('SELECT 1 FROM agents WHERE slug = ?').get(slug); i++)
      slug = `${slugify(def.name) || 'agent'}-${i}`;
    const now = Date.now();
    const conv = this.store.create('agent', id);
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO agents (id, slug, name, description, enabled, current_revision, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)',
        )
        .run(id, slug, def.name, def.description, conv, now, now);
      this.db
        .prepare(
          'INSERT INTO agent_revisions (agent_id, revision, definition, created_by, note, created_at) VALUES (?, 1, ?, ?, ?, ?)',
        )
        .run(id, json.stringify(def), createdBy, note ?? null, now);
    })();
    this.changed({ kind: 'upsert', agentId: id });
    return this.row(id);
  }

  update(
    agentId: string,
    baseRevision: number | undefined,
    input: AgentDefinitionInput,
    createdBy: string,
    note?: string,
  ): AgentRow {
    const r = this.row(agentId);
    if (baseRevision === undefined) throw badRequest('baseRevision is required when editing an agent');
    if (baseRevision !== r.current_revision) {
      throw new AppError(
        409,
        'revision_conflict',
        `The agent changed meanwhile (now at revision ${r.current_revision}). Reload it and apply your change again.`,
        {
          currentRevision: r.current_revision,
        },
      );
    }
    const def = this.validate(input);
    const next = r.current_revision + 1;
    const now = Date.now();
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO agent_revisions (agent_id, revision, definition, created_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(r.id, next, json.stringify(def), createdBy, note ?? null, now);
      this.db
        .prepare(
          'UPDATE agents SET name = ?, description = ?, current_revision = ?, updated_at = ? WHERE id = ? AND current_revision = ?',
        )
        .run(def.name, def.description, next, now, r.id, baseRevision);
    })();
    this.changed({ kind: 'upsert', agentId: r.id });
    return this.row(r.id);
  }

  setEnabled(agentId: string, enabled: boolean): AgentRow {
    const r = this.row(agentId);
    this.db
      .prepare('UPDATE agents SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, Date.now(), r.id);
    this.changed({ kind: 'upsert', agentId: r.id });
    return this.row(r.id);
  }

  delete(agentId: string): void {
    const r = this.row(agentId);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM agents WHERE id = ?').run(r.id);
      this.store.delete(r.conversation_id);
    })();
    this.changed({ kind: 'delete', agentId: r.id });
  }

  // ---------------------------------------------------------------- memory

  memory(agentId: string): MemoryNote[] {
    const r = this.row(agentId);
    return (
      this.db
        .prepare('SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY updated_at DESC')
        .all(r.id) as MemoryRow[]
    ).map(toNote);
  }

  saveMemory(agentId: string, note: { id?: string; title: string; content: string }, by: string): MemoryNote {
    const r = this.row(agentId);
    const now = Date.now();
    if (note.id) {
      const res = this.db
        .prepare(
          'UPDATE agent_memory SET title = ?, content = ?, updated_by = ?, updated_at = ? WHERE id = ? AND agent_id = ?',
        )
        .run(note.title, note.content, by, now, note.id, r.id);
      if (!res.changes) throw notFound('Memory note');
      return toNote(this.db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(note.id) as MemoryRow);
    }
    const count = (
      this.db.prepare('SELECT COUNT(*) AS n FROM agent_memory WHERE agent_id = ?').get(r.id) as { n: number }
    ).n;
    if (count >= 200) throw conflict('Memory is full (200 notes); delete or merge notes first');
    const id = newId('mem');
    this.db
      .prepare(
        'INSERT INTO agent_memory (id, agent_id, title, content, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, r.id, note.title, note.content, by, now, now);
    this.stream.publish(`agent:${r.id}`, { kind: 'memory' });
    return toNote(this.db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(id) as MemoryRow);
  }

  deleteMemory(agentId: string, noteId: string): void {
    const r = this.row(agentId);
    const res = this.db.prepare('DELETE FROM agent_memory WHERE id = ? AND agent_id = ?').run(noteId, r.id);
    if (!res.changes) throw notFound('Memory note');
    this.stream.publish(`agent:${r.id}`, { kind: 'memory' });
  }

  clearMemory(agentId: string): void {
    const r = this.row(agentId);
    this.db.prepare('DELETE FROM agent_memory WHERE agent_id = ?').run(r.id);
    this.stream.publish(`agent:${r.id}`, { kind: 'memory' });
  }
}
