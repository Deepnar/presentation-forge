// Runs are children of the canonical project, never retained deck copies.
export const RUN_DDL = `
 CREATE TABLE IF NOT EXISTS v2_agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE(project_id, request_key)
 );
 CREATE INDEX IF NOT EXISTS idx_v2_agent_project ON v2_agent_runs(project_id);
 CREATE TABLE IF NOT EXISTS v2_agent_receipts (
  run_id TEXT NOT NULL REFERENCES v2_agent_runs(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(run_id, step)
 );
`;
