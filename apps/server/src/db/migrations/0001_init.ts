/**
 * Initial schema. Append-only: never edit a migration after it shipped in a release;
 * add a new `NNNN_<name>.ts` instead. Timestamps are Unix milliseconds.
 */
export default /* sql */ `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE secrets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE device_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other',
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  last_ip TEXT,
  revoked_at INTEGER
);

CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  builtin_id TEXT,
  name TEXT NOT NULL,
  base_url TEXT,
  secret_id TEXT REFERENCES secrets(id) ON DELETE SET NULL,
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  active_leaf_id TEXT,
  next_seq INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_owner ON conversations(owner_kind, owner_id);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id TEXT,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  role TEXT,
  data TEXT NOT NULL,
  run_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX entries_conversation ON entries(conversation_id, seq);
CREATE INDEX entries_parent ON entries(parent_id);
CREATE INDEX entries_run ON entries(run_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  model_ref TEXT,
  thinking_level TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  usage TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER
);
CREATE INDEX sessions_recent ON sessions(archived, pinned DESC, last_message_at DESC);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  current_revision INTEGER NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE agent_revisions (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  definition TEXT NOT NULL,
  created_by TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, revision)
);

CREATE TABLE trigger_state (
  trigger_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  last_fired_at INTEGER,
  next_fire_at INTEGER,
  fire_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX agent_memory_agent ON agent_memory(agent_id, updated_at DESC);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  trigger_id TEXT,
  trigger_kind TEXT NOT NULL,
  trigger_payload TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT,
  report_session_id TEXT,
  task TEXT,
  status TEXT NOT NULL,
  chain_depth INTEGER NOT NULL DEFAULT 0,
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  error TEXT,
  summary TEXT,
  usage TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX runs_agent ON runs(agent_id, queued_at DESC);
CREATE INDEX runs_status ON runs(status, queued_at);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  principal TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  agent_id TEXT,
  tool_name TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  args TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  decided_at INTEGER,
  note TEXT
);
CREATE INDEX approvals_status ON approvals(status, created_at DESC);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  principal TEXT NOT NULL,
  session_id TEXT,
  run_id TEXT,
  agent_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  args TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  result TEXT,
  ha_context_id TEXT,
  duration_ms INTEGER
);
CREATE INDEX audit_ts ON audit_log(ts DESC);
CREATE INDEX audit_agent ON audit_log(agent_id, ts DESC);
CREATE INDEX audit_session ON audit_log(session_id, ts DESC);

CREATE TABLE usage_ledger (
  day TEXT NOT NULL,
  principal_kind TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input INTEGER NOT NULL DEFAULT 0,
  output INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, principal_kind, principal_id, provider, model)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX notifications_recent ON notifications(created_at DESC);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  size INTEGER NOT NULL,
  encrypted INTEGER NOT NULL,
  kind TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;
