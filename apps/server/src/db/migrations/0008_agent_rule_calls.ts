export default /* sql */ `
CREATE TABLE agent_rule_calls (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  called_at INTEGER NOT NULL
);
CREATE INDEX agent_rule_calls_lookup ON agent_rule_calls(agent_id, revision, rule_id, called_at);
`;
