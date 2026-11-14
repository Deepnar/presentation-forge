// Files a person adds to a project as material — a report to treat as the
// truth, a deck to take the look from, a dataset — kept with the text read
// out of them so the Assistant can use them. Deleting the project removes
// them with it. The bytes themselves are not kept: what a project needs from
// a file is its text and its role.
export const FILE_ROLES = Object.freeze(["source", "source-of-truth", "visual-reference", "template", "brand", "dataset", "asset", "unknown"]);
export const FILE_LIMITS = Object.freeze({ bytes: 40 * 1024 * 1024, chars: 400000, perProject: 50 });

export function fileSchema(dialect) {
  if (!['sqlite', 'postgres'].includes(dialect)) throw new Error('Invalid file adapter.');
  const integer = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  return `
    CREATE TABLE IF NOT EXISTS v2_project_files (
      project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      role TEXT NOT NULL,
      size ${integer} NOT NULL,
      chars ${integer} NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, id)
    );
  `;
}

// Slide layouts a person saved in a project to reuse (F4c): a cleaned scene
// and a name. Project-scoped, because a layout's pictures are the
// project's own assets.
export const LAYOUT_LIMITS = Object.freeze({ perProject: 40, nameChars: 80, sceneChars: 200000 });
export function layoutSchema() {
  return `
    CREATE TABLE IF NOT EXISTS v2_project_layouts (
      project_id TEXT NOT NULL REFERENCES v2_projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      scene TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, id)
    );
  `;
}
