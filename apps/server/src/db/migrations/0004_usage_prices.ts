export default `
ALTER TABLE usage_ledger ADD COLUMN unknown_requests INTEGER NOT NULL DEFAULT 0;
`;
