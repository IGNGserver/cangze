import type { z } from 'zod';
import type { Db } from '../../db/index.ts';
import type { EventBus } from '../../core/events.ts';
import type { HubEvents } from '../../core/hub-events.ts';

export interface SettingHandle<T> {
  readonly key: string;
  get(): T;
  set(value: T): void;
}

/**
 * Typed key/value settings. Each module defines the keys it owns with a zod schema whose
 * default applies when the key is unset or the stored value no longer validates.
 */
export class SettingsService {
  private readonly defs = new Map<string, z.ZodType>();
  private readonly cache = new Map<string, unknown>();

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus<HubEvents>,
  ) {}

  define<S extends z.ZodType>(key: string, schema: S): SettingHandle<z.output<S>> {
    if (this.defs.has(key)) throw new Error(`setting ${key} defined twice`);
    this.defs.set(key, schema);
    return {
      key,
      get: () => this.get(key) as z.output<S>,
      set: (value) => this.set(key, value),
    };
  }

  get(key: string): unknown {
    if (this.cache.has(key)) return this.cache.get(key);
    const schema = this.schema(key);
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    let raw: unknown = undefined;
    if (row) {
      try {
        raw = JSON.parse(row.value);
      } catch {
        raw = undefined;
      }
    }
    const parsed = schema.safeParse(raw);
    const value = parsed.success ? parsed.data : schema.parse(undefined);
    this.cache.set(key, value);
    return value;
  }

  set(key: string, value: unknown): void {
    const parsed = this.schema(key).parse(value);
    this.db
      .prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      )
      .run(key, JSON.stringify(parsed), Date.now());
    this.cache.set(key, parsed);
    this.bus.emit('settings.changed', { key });
  }

  /** Drop cached values, e.g. after a restore swapped the database. */
  invalidate(): void {
    this.cache.clear();
  }

  private schema(key: string): z.ZodType {
    const s = this.defs.get(key);
    if (!s) throw new Error(`unknown setting ${key}`);
    return s;
  }
}
