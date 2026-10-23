// Runs are children of the canonical project, never retained deck copies.
const RUN_TABLE_DDL = `
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

// Private chat bodies are separate from bounded operational metadata. Attempts
// deliberately lack a turn FK so unresolved receipts survive a chat generation.
export const TURN_DDL = `
 CREATE TABLE IF NOT EXISTS v2_agent_conversations (
  project_id TEXT PRIMARY KEY REFERENCES v2_projects(id) ON DELETE CASCADE,
  payload TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS v2_agent_turns (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
  generation TEXT NOT NULL,
  request_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  private_payload TEXT NOT NULL,
  UNIQUE(project_id,generation,request_key)
 );
 CREATE INDEX IF NOT EXISTS idx_v2_agent_turn_project ON v2_agent_turns(project_id);
 CREATE TABLE IF NOT EXISTS v2_agent_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL UNIQUE REFERENCES v2_agent_turns(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  private_payload TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_v2_agent_proposal_project ON v2_agent_proposals(project_id);
 CREATE TABLE IF NOT EXISTS v2_agent_attempts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
  payload TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_v2_agent_attempt_project ON v2_agent_attempts(project_id);
`;

export const RUN_DDL = RUN_TABLE_DDL + TURN_DDL;
