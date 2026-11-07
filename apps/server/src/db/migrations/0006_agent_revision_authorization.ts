export default /* sql */ `
ALTER TABLE agent_revisions ADD COLUMN authorized_by TEXT;

-- Revisions written through administrator/system APIs retain their existing unattended behavior.
-- Session-written revisions need an explicit administrator approval recorded by the new code.
UPDATE agent_revisions
SET authorized_by = created_by
WHERE created_by IS NOT NULL AND created_by NOT LIKE 'session:%';
`;
