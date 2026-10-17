import m0001 from './0001_init.ts';

/** Ordered list of migrations. Append new entries; never reorder or edit shipped ones. */
export const migrations: ReadonlyArray<{ id: number; name: string; sql: string }> = [
  { id: 1, name: 'init', sql: m0001 },
];

export const SCHEMA_VERSION = migrations[migrations.length - 1]!.id;
