import type { SessionDetail, SessionSummary, ThinkingLevel } from '@cangze/contracts';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Message } from '@earendil-works/pi-ai';
import type { Logger } from 'pino';
import { AppError, conflict, notFound } from '../../core/errors.ts';
import { newId } from '../../core/ids.ts';
import { json, type Db } from '../../db/index.ts';
import type { ApprovalsService } from '../approvals/service.ts';
import {
  buildContext,
  chooseCompactionCut,
  estimateTokens,
  summarize,
  type CompactionData,
  type NoticeData,
} from '../conversations/context.ts';
import { toWire, type ConversationStore } from '../conversations/store.ts';
import { buildSystemPrompt } from '../engine/prompt.ts';
import { userMessage, type ActiveRun, type AgentRunner } from '../engine/runner.ts';
import type { HaGateway } from '../ha/gateway.ts';
import type { ProvidersService } from '../providers/service.ts';
import type { StreamHub } from '../stream/hub.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import { addUsage, normalizeUsage, ZERO_USAGE, type UsageLedger, type UsageTotals } from '../usage/ledger.ts';

interface Row {
  id: string;
  title: string;
  conversation_id: string;
  pinned: number;
  archived: number;
  model_ref: string | null;
  thinking_level: ThinkingLevel | null;
  instructions: string;
  settings: string;
  usage: string;
  created_at: number;
  updated_at: number;
  last_message_at: number | null;
}

/** Extra system prompt sections contributed by other modules (e.g. the subagent roster). */
export type PromptSectionProvider = () => Array<{ title: string; body: string }>;

const COMPACT_AT = 0.8;
const KEEP_AFTER_COMPACTION = 0.25;

const TITLE_PROMPT =
  'Write a short title (at most 6 words, no quotes, no trailing punctuation) for a conversation that starts with the message below. Use the language of the message.';

export class SessionsService {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly runLocks = new Map<string, Promise<void>>();
  private readonly sectionProviders: PromptSectionProvider[] = [];

  constructor(
    private readonly db: Db,
    private readonly store: ConversationStore,
    private readonly runner: AgentRunner,
    private readonly providers: ProvidersService,
    private readonly ha: HaGateway,
    private readonly tools: ToolRegistry,
    private readonly approvals: ApprovalsService,
    private readonly stream: StreamHub,
    private readonly usage: UsageLedger,
    private readonly logger: Logger,
  ) {}

  addPromptSections(p: PromptSectionProvider): void {
    this.sectionProviders.push(p);
  }

  // ------------------------------------------------------------------ queries

  private row(id: string): Row {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Session');
    return r;
  }

  private summary(r: Row): SessionSummary {
    return {
      id: r.id,
      title: r.title,
      pinned: r.pinned === 1,
      archived: r.archived === 1,
      modelRef: r.model_ref,
      thinkingLevel: r.thinking_level,
      running: this.runs.has(r.id),
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    };
  }

  list(archived = false): SessionSummary[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE archived = ? ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC',
      )
      .all(archived ? 1 : 0) as Row[];
    return rows.map((r) => this.summary(r));
  }

  exists(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id));
  }

  get(id: string): SessionDetail {
    const r = this.row(id);
    const streamSeq = this.stream.seq(`session:${id}`);
    const path = this.store.activePath(r.conversation_id);
    const ctxTokens = path.length ? estimateTokens(buildContext(path)) : 0;
    const info = this.providers.modelInfo(r.model_ref ?? this.providers.defaults.get().chat ?? '');
    return {
      ...this.summary(r),
      instructions: r.instructions,
      usage: normalizeUsage(json.parse<Partial<UsageTotals>>(r.usage, ZERO_USAGE)),
      contextTokens: ctxTokens,
      contextWindow: info?.contextWindow ?? null,
      entries: this.store.view(r.conversation_id),
      live: this.runs.get(id)?.snapshot() ?? null,
      approvals: this.approvals.list({ sessionId: id, status: 'pending' }),
      streamSeq,
    };
  }

  // ------------------------------------------------------------------ CRUD

  create(input: {
    title?: string;
    modelRef?: string;
    thinkingLevel?: ThinkingLevel;
    instructions?: string;
  }): SessionSummary {
    if (input.modelRef) this.providers.resolve(input.modelRef);
    const id = newId('ses');
    const now = Date.now();
    const conv = this.store.create('session', id);
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, conversation_id, pinned, archived, model_ref, thinking_level, instructions, settings, usage, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?, '{}', ?, ?, ?)`,
      )
      .run(
        id,
        input.title?.trim() ?? '',
        conv,
        input.modelRef ?? null,
        input.thinkingLevel ?? null,
        input.instructions ?? '',
        json.stringify(ZERO_USAGE),
        now,
        now,
      );
    const s = this.summary(this.row(id));
    this.stream.publish('sessions', { kind: 'upsert', session: s });
    return s;
  }

  update(
    id: string,
    patch: {
      title?: string;
      pinned?: boolean;
      archived?: boolean;
      modelRef?: string | null;
      thinkingLevel?: ThinkingLevel | null;
      instructions?: string;
    },
  ): SessionSummary {
    const r = this.row(id);
    if (patch.modelRef) this.providers.resolve(patch.modelRef);
    const modelChanged = patch.modelRef !== undefined && patch.modelRef !== r.model_ref;
    this.db
      .prepare(
        'UPDATE sessions SET title = ?, pinned = ?, archived = ?, model_ref = ?, thinking_level = ?, instructions = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        patch.title ?? r.title,
        patch.pinned === undefined ? r.pinned : patch.pinned ? 1 : 0,
        patch.archived === undefined ? r.archived : patch.archived ? 1 : 0,
        patch.modelRef === undefined ? r.model_ref : patch.modelRef,
        patch.thinkingLevel === undefined ? r.thinking_level : patch.thinkingLevel,
        patch.instructions ?? r.instructions,
        Date.now(),
        id,
      );
    if (modelChanged && !this.runs.has(id)) {
      const entry = this.store.append(
        r.conversation_id,
        this.store.activeLeaf(r.conversation_id),
        'model_change',
        {
          modelRef: patch.modelRef ?? null,
        },
      );
      this.stream.publish(`session:${id}`, { kind: 'entry', entry: toWire(entry), activeLeafId: entry.id });
    }
    return this.publishSummary(id);
  }

  delete(id: string): void {
    const r = this.row(id);
    this.runs.get(id)?.abort();
    this.runs.delete(id);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      this.store.delete(r.conversation_id);
    })();
    this.stream.publish('sessions', { kind: 'delete', id });
  }

  private publishSummary(id: string): SessionSummary {
    const s = this.summary(this.row(id));
    this.stream.publish('sessions', { kind: 'upsert', session: s });
    this.stream.publish(`session:${id}`, { kind: 'session', session: s });
    return s;
  }

  // ------------------------------------------------------------------ conversation

  isRunning(id: string): boolean {
    return this.runs.has(id);
  }

  async send(
    id: string,
    input: {
      text: string;
      images: Array<{ data: string; mimeType: string }>;
      whenBusy: 'steer' | 'followUp';
    },
  ) {
    if (!input.text.trim() && !input.images.length)
      throw new AppError(400, 'empty_message', 'Message is empty');
    const msg = userMessage(input.text, input.images);
    return this.withRunLock(id, async () => {
      const r = this.row(id);
      const active = this.runs.get(id);
      if (active) {
        if (input.whenBusy === 'followUp') active.followUp(msg);
        else active.steer(msg);
        this.stream.publish(`session:${id}`, { kind: 'queued', count: active.queued });
        return { runId: active.runId, queued: true };
      }
      const runId = await this.startRun(r, this.store.activeLeaf(r.conversation_id), [msg]);
      return { runId, queued: false };
    });
  }

  /** Edit a user message: the edit becomes a sibling branch and the conversation continues from it. */
  async edit(id: string, entryId: string, text: string) {
    return this.withRunLock(id, async () => {
      const r = this.row(id);
      this.assertIdle(id);
      const original = this.store.get(entryId);
      if (
        original.conversationId !== r.conversation_id ||
        original.kind !== 'message' ||
        original.role !== 'user'
      ) {
        throw new AppError(400, 'not_user_message', 'Only user messages can be edited');
      }
      const prev = original.data.message as Extract<Message, { role: 'user' }>;
      const images = Array.isArray(prev.content) ? prev.content.filter((c) => c.type === 'image') : [];
      const runId = await this.startRun(r, original.parentId, [
        userMessage(text, images as Array<{ data: string; mimeType: string }>),
      ]);
      return { runId, queued: false };
    });
  }

  /** Answer a user message again as a new branch. */
  async regenerate(id: string, entryId: string) {
    return this.withRunLock(id, async () => {
      const r = this.row(id);
      this.assertIdle(id);
      const e = this.store.get(entryId);
      if (e.conversationId !== r.conversation_id) throw notFound('Entry');
      // Regenerating an assistant reply means answering its user message again.
      let anchor = e;
      while (!(anchor.kind === 'message' && anchor.role === 'user')) {
        if (!anchor.parentId) throw new AppError(400, 'nothing_to_regenerate', 'No user message to answer');
        anchor = this.store.get(anchor.parentId);
      }
      const runId = await this.startRun(r, anchor.id, []);
      return { runId, queued: false };
    });
  }

  switchBranch(id: string, entryId: string): SessionDetail {
    const r = this.row(id);
    this.assertIdle(id);
    const e = this.store.get(entryId);
    if (e.conversationId !== r.conversation_id) throw notFound('Entry');
    this.store.setActiveLeaf(r.conversation_id, this.store.deepestLeaf(r.conversation_id, entryId));
    this.stream.publish(`session:${id}`, { kind: 'reload' });
    return this.get(id);
  }

  abort(id: string): void {
    this.runs.get(id)?.abort();
  }

  /** Add a notice (e.g. a subagent task report) to the end of a session. */
  addNotice(id: string, notice: NoticeData): void {
    const r = this.row(id);
    const active = this.runs.get(id);
    const parent = active?.lastEntryId ?? this.store.activeLeaf(r.conversation_id);
    const entry = this.store.append(
      r.conversation_id,
      parent,
      'notice',
      notice as unknown as Record<string, unknown>,
    );
    if (active) active.lastEntryId = entry.id;
    this.db
      .prepare('UPDATE sessions SET last_message_at = ?, updated_at = ? WHERE id = ?')
      .run(Date.now(), Date.now(), id);
    this.stream.publish(`session:${id}`, { kind: 'entry', entry: toWire(entry), activeLeafId: entry.id });
    this.publishSummary(id);
  }

  async compact(id: string): Promise<boolean> {
    return this.withRunLock(id, async () => {
      const r = this.row(id);
      this.assertIdle(id);
      return this.compactConversation(r, true);
    });
  }

  private assertIdle(id: string): void {
    if (this.runs.has(id)) throw conflict('The session is busy; stop the current reply first');
  }

  /** Serialize the idle check and asynchronous run setup for one session. */
  private async withRunLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.runLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.runLocks.set(id, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.runLocks.get(id) === current) this.runLocks.delete(id);
    }
  }

  private async compactConversation(r: Row, force: boolean): Promise<boolean> {
    const model = this.providers.resolve(r.model_ref);
    const path = this.store.activePath(r.conversation_id);
    const context = buildContext(path);
    const tokens = estimateTokens(context);
    if (!force && tokens < model.contextWindow * COMPACT_AT) return false;
    // Manual compaction keeps only the latest turn; automatic compaction keeps a quarter of the window.
    const cut = chooseCompactionCut(
      path,
      force ? 0 : Math.floor(model.contextWindow * KEEP_AFTER_COMPACTION),
    );
    if (cut <= 0) return false;
    const older = buildContext(path.slice(0, cut));
    if (!older.length) return false;
    const summary = await summarize(this.providers.models, this.providers.resolve(null, 'utility'), older);
    const data: CompactionData = { summary, firstKeptEntryId: path[cut]!.id, tokensBefore: tokens };
    const entry = this.store.append(
      r.conversation_id,
      path[path.length - 1]!.id,
      'compaction',
      data as unknown as Record<string, unknown>,
    );
    this.stream.publish(`session:${r.id}`, { kind: 'entry', entry: toWire(entry), activeLeafId: entry.id });
    this.logger.info({ module: 'sessions', session: r.id, tokensBefore: tokens }, 'conversation compacted');
    return true;
  }

  private async startRun(r: Row, parentEntryId: string | null, input: AgentMessage[]): Promise<string> {
    const model = this.providers.resolve(r.model_ref);
    // Auto-compact when the context is getting full (only when continuing the active branch).
    if (parentEntryId && parentEntryId === this.store.activeLeaf(r.conversation_id)) {
      try {
        if (await this.compactConversation(r, false))
          parentEntryId = this.store.activeLeaf(r.conversation_id);
      } catch (err) {
        this.logger.warn({ module: 'sessions', err }, 'automatic compaction failed');
      }
    }
    const runId = newId('run');
    const defaults = this.providers.defaults.get();
    const thinking = (r.thinking_level ?? defaults.thinkingLevel) as ThinkingLevel;
    const sections = this.sectionProviders.flatMap((p) => p());
    const firstUserText =
      input.length && !this.store.activeLeaf(r.conversation_id) ? textOf(input[0]!) : null;
    const run = this.runner.start({
      runId,
      conversationId: r.conversation_id,
      topic: `session:${r.id}`,
      principal: { kind: 'session', sessionId: r.id, runId },
      model,
      thinkingLevel: model.reasoning ? thinking : 'off',
      systemPrompt: buildSystemPrompt({
        role: 'session',
        ha: this.ha,
        instructions: r.instructions,
        sections,
      }),
      tools: this.tools.all(),
      toolEnv: { principal: { kind: 'session', sessionId: r.id, runId }, runId, sessionId: r.id },
      parentEntryId,
      input,
      onAssistant: (m) => {
        if (!m.usage) return;
        const cur = normalizeUsage(
          json.parse<Partial<UsageTotals>>(
            (
              this.db.prepare('SELECT usage FROM sessions WHERE id = ?').get(r.id) as
                { usage: string } | undefined
            )?.usage,
            ZERO_USAGE,
          ),
        );
        this.db
          .prepare('UPDATE sessions SET usage = ? WHERE id = ?')
          .run(json.stringify(addUsage(cur, m.usage)), r.id);
        this.usage.record('session', r.id, m.provider, m.model, m.usage);
      },
      onEntry: () => {
        this.db
          .prepare('UPDATE sessions SET last_message_at = ?, updated_at = ? WHERE id = ?')
          .run(Date.now(), Date.now(), r.id);
      },
    });
    this.runs.set(r.id, run);
    this.publishSummary(r.id);
    void run.done.then((outcome) => {
      if (this.runs.get(r.id) === run) this.runs.delete(r.id);
      if (!this.exists(r.id)) return;
      this.publishSummary(r.id);
      if (outcome.status === 'completed' && firstUserText && !this.row(r.id).title)
        void this.autoTitle(r.id, firstUserText);
    });
    return runId;
  }

  private async autoTitle(id: string, firstMessage: string): Promise<void> {
    try {
      const model = this.providers.resolve(null, 'utility');
      const res = await this.providers.models.completeSimple(
        model,
        {
          systemPrompt: TITLE_PROMPT,
          messages: [{ role: 'user', content: firstMessage.slice(0, 2000), timestamp: Date.now() }],
        },
        { maxTokens: 40, signal: AbortSignal.timeout(30_000) },
      );
      const title = res.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { text: string }).text)
        .join('')
        .replace(/["'“”«»*_#`>]/g, '')
        .trim()
        .slice(0, 80);
      if (title && this.exists(id) && !this.row(id).title) this.update(id, { title });
    } catch (err) {
      this.logger.debug({ module: 'sessions', err }, 'title generation failed');
    }
  }

  /** Export the active branch as Markdown or pi-style JSONL. */
  export(id: string, format: 'markdown' | 'jsonl'): string {
    const r = this.row(id);
    const path = this.store.activePath(r.conversation_id);
    if (format === 'jsonl') {
      const header = {
        type: 'session',
        version: 1,
        id: r.id,
        title: r.title,
        timestamp: new Date(r.created_at).toISOString(),
      };
      return [
        header,
        ...path.map((e) => ({
          type: e.kind,
          id: e.id,
          parentId: e.parentId,
          timestamp: new Date(e.createdAt).toISOString(),
          ...e.data,
        })),
      ]
        .map((x) => JSON.stringify(x))
        .join('\n')
        .concat('\n');
    }
    const lines = [`# ${r.title || 'Cangze session'}`, '', `_${new Date(r.created_at).toISOString()}_`, ''];
    for (const e of path) {
      if (e.kind === 'notice') {
        const n = e.data as unknown as NoticeData;
        lines.push(`> **${n.title}**`, ...n.body.split('\n').map((l) => `> ${l}`), '');
        continue;
      }
      if (e.kind === 'compaction') {
        lines.push(
          `> _Summary of earlier messages:_ ${(e.data as unknown as CompactionData).summary.replace(/\n/g, ' ')}`,
          '',
        );
        continue;
      }
      if (e.kind !== 'message') continue;
      const m = e.data.message as Message;
      if (m.role === 'user') lines.push('**You:**', '', textOf(m as AgentMessage), '');
      else if (m.role === 'assistant') {
        for (const c of m.content) {
          if (c.type === 'text' && c.text.trim()) lines.push(c.text, '');
          if (c.type === 'toolCall') lines.push(`- _tool_ \`${c.name}\` ${JSON.stringify(c.arguments)}`);
        }
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  /** Stop all runs (shutdown). */
  abortAll(): void {
    for (const run of this.runs.values()) run.abort();
  }
}

function textOf(m: AgentMessage): string {
  const content = (m as Extract<Message, { role: 'user' }>).content;
  if (typeof content === 'string') return content;
  return content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join(' ');
}
