import m0001 from './0001_init.ts';
import m0002 from './0002_scheduler.ts';
import m0003 from './0003_reports.ts';
import m0004 from './0004_usage_prices.ts';
import m0005 from './0005_drafts.ts';
import m0006 from './0006_agent_revision_authorization.ts';
import m0007 from './0007_drop_legacy_attachments.ts';
import m0008 from './0008_agent_rule_calls.ts';

/** Ordered list of migrations. Append new entries; never reorder or edit shipped ones. */
export const migrations: ReadonlyArray<{ id: number; name: string; sql: string }> = [
  { id: 1, name: 'init', sql: m0001 },
  { id: 2, name: 'scheduler', sql: m0002 },
  { id: 3, name: 'reports', sql: m0003 },
  { id: 4, name: 'usage_prices', sql: m0004 },
  { id: 5, name: 'drafts', sql: m0005 },
  { id: 6, name: 'agent_revision_authorization', sql: m0006 },
  { id: 7, name: 'drop_legacy_attachments', sql: m0007 },
  { id: 8, name: 'agent_rule_calls', sql: m0008 },
];

export const SCHEMA_VERSION = migrations[migrations.length - 1]!.id;
