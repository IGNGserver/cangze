/**
 * Composer drafts. `scope` is either the literal `new` (the single unsent new chat) or a
 * session id. Attachments live in the database so backups and restores carry them along.
 */
export default /* sql */ `
CREATE TABLE drafts (
  scope TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((scope = 'new' AND session_id IS NULL) OR scope = session_id)
);
CREATE INDEX drafts_session ON drafts(session_id);

CREATE TABLE draft_attachments (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL REFERENCES drafts(scope) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX draft_attachments_scope ON draft_attachments(scope, created_at);
`;
