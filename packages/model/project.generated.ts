/* DO NOT EDIT — generated from packages/model/project.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * The durable project container. Children (artifacts, files, sources) point here via projectId; the project never mirrors child lists.
 */
export interface Project {
  id: string;
  title: string;
  brief?: {
    objective?: string;
    audience?: string;
    constraints?: string[];
  };
  createdAt?: string;
  updatedAt?: string;
}
