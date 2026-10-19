export default `
ALTER TABLE runs ADD COLUMN reported_at INTEGER;
CREATE TABLE session_reports (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  notice TEXT NOT NULL,
  delivered_at INTEGER
);
CREATE TABLE session_continuations (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0
);
-- Do not retroactively wake old sessions when upgrading an existing installation.
UPDATE runs SET reported_at = finished_at WHERE finished_at IS NOT NULL;
`;
