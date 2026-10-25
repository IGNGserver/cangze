import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, migrate } from '../src/db/index.ts';
import { migrations, SCHEMA_VERSION } from '../src/db/migrations/index.ts';

describe('migrations', () => {
  it('adds unknown-price counters without losing existing usage', () => {
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    );
    for (const m of migrations.filter((m) => m.id < 4)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations VALUES (?, ?, 0)').run(m.id, m.name);
    }
    db.prepare(
      "INSERT INTO usage_ledger (day, principal_kind, principal_id, provider, model, requests, input, output, cache_read, cache_write, cost) VALUES ('2026-10-19', 'agent', 'a', 'p', 'm', 2, 10, 5, 0, 0, 0.2)",
    ).run();
    expect(migrate(db)).toEqual([4, 5]);
    expect(db.prepare('SELECT requests, cost, unknown_requests FROM usage_ledger').get()).toEqual({
      requests: 2,
      cost: 0.2,
      unknown_requests: 0,
    });
    db.close();
  });

  it('applies all migrations once', () => {
    const db = new Database(':memory:');
    expect(migrate(db)).toHaveLength(SCHEMA_VERSION);
    expect(migrate(db)).toEqual([]);
    expect(currentSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['settings', 'secrets', 'entries', 'runs', 'audit_log']),
    );
  });

  it('refuses a database from a newer version', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
      SCHEMA_VERSION + 1,
      'future',
      0,
    );
    expect(() => migrate(db)).toThrow(/newer than this Cangze build/);
  });
});
