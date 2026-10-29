export function sourceSchema(dialect) {
  if (!['sqlite', 'postgres'].includes(dialect)) throw new Error('Invalid source adapter.');
  const integer = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  const collate = dialect === 'postgres' ? '"C"' : 'BINARY';
  return `
    CREATE TABLE IF NOT EXISTS v2_project_source_catalog (
      project_id TEXT PRIMARY KEY REFERENCES v2_projects(id) ON DELETE CASCADE,
      generation ${integer} NOT NULL, revision ${integer} NOT NULL,
      count ${integer} NOT NULL, bytes ${integer} NOT NULL, policy_version ${integer} NOT NULL
    );
    CREATE TABLE IF NOT EXISTS v2_project_sources (
      project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
      source_id TEXT COLLATE ${collate} NOT NULL, payload TEXT NOT NULL,
      payload_bytes ${integer} NOT NULL, PRIMARY KEY(project_id, source_id)
    );
  `;
}
