import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, migrate } from '../src/db/index.ts';
import { SCHEMA_VERSION } from '../src/db/migrations/index.ts';

describe('migrations', () => {
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
