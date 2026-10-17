import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations, SCHEMA_VERSION } from './migrations/index.ts';

export type Db = Database.Database;

export interface OpenOptions {
  /** File path or ':memory:'. */
  file: string;
  readonly?: boolean;
}

export function openDatabase({ file, readonly = false }: OpenOptions): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file, { readonly, fileMustExist: readonly });
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function currentSchemaVersion(db: Db): number {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_migrations'").get();
  if (!exists) return 0;
  const row = db.prepare('SELECT MAX(id) AS v FROM _migrations').get() as { v: number | null };
  return row.v ?? 0;
}

/** Applies pending migrations, each in its own transaction. Returns the ids that were applied. */
export function migrate(db: Db): number[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
  );
  const current = currentSchemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this Cangze build (${SCHEMA_VERSION}). Upgrade Cangze or restore an older backup.`,
    );
  }
  const applied: number[] = [];
  for (const m of migrations) {
    if (m.id <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        m.id,
        m.name,
        Date.now(),
      );
    })();
    applied.push(m.id);
  }
  return applied;
}

/** JSON helpers for TEXT columns. */
export const json = {
  parse<T>(value: string | null | undefined, fallback: T): T {
    if (value === null || value === undefined || value === '') return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
  stringify(value: unknown): string {
    return JSON.stringify(value ?? null);
  },
};

export const bool = (v: unknown): boolean => v === 1 || v === true;
