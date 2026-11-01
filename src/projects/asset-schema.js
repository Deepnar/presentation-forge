// Images a project's scenes reference as `asset:<sha256>`. Content-addressed
// per project, so a deck that repeats one crest on every slide stores it once,
// and deleting the project removes its images with it.
export function assetSchema(dialect) {
  if (!['sqlite', 'postgres'].includes(dialect)) throw new Error('Invalid asset adapter.');
  const integer = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  const blob = dialect === 'postgres' ? 'BYTEA' : 'BLOB';
  return `
    CREATE TABLE IF NOT EXISTS v2_project_assets (
      project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      mime TEXT NOT NULL,
      width ${integer} NOT NULL,
      height ${integer} NOT NULL,
      size ${integer} NOT NULL,
      bytes ${blob} NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, hash)
    );
    CREATE INDEX IF NOT EXISTS idx_v2_project_assets_hash ON v2_project_assets(hash);
  `;
}
