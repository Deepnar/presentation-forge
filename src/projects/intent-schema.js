// The DeckIntent a project was compiled from, kept beside its scenes and
// never sent to or taken from the browser: saves carry scenes only. A
// theme change, a regenerated slide or an Assistant proposal compiles from
// it and carries the person's edits across (carryEdits). Deleting the
// project removes it with the project.
export function intentSchema(dialect) {
  if (!['sqlite', 'postgres'].includes(dialect)) throw new Error('Invalid intent adapter.');
  return `
    CREATE TABLE IF NOT EXISTS v2_project_intents (
      project_id TEXT PRIMARY KEY REFERENCES v2_projects(id) ON DELETE CASCADE,
      intent TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
}
