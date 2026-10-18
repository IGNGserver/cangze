export default `
ALTER TABLE agents ADD COLUMN halted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trigger_state ADD COLUMN signature TEXT;
CREATE TABLE trigger_waits (
  trigger_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  deadline INTEGER NOT NULL,
  state_stamp TEXT NOT NULL,
  payload TEXT NOT NULL,
  chain_depth INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(trigger_id, entity_id)
);
`;
