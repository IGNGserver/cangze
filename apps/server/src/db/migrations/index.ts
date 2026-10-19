import m0001 from './0001_init.ts';
import m0002 from './0002_scheduler.ts';
import m0003 from './0003_reports.ts';

/** Ordered list of migrations. Append new entries; never reorder or edit shipped ones. */
export const migrations: ReadonlyArray<{ id: number; name: string; sql: string }> = [
  { id: 1, name: 'init', sql: m0001 },
  { id: 2, name: 'scheduler', sql: m0002 },
  { id: 3, name: 'reports', sql: m0003 },
];

export const SCHEMA_VERSION = migrations[migrations.length - 1]!.id;
