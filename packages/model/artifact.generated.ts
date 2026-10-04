/* DO NOT EDIT — generated from packages/model/artifact.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * A renderable project product. Draft becomes ready on successful render; content changes are new revisions, never in-place rewrites. Export artifacts must name their source artifact, format, and storage key; expiry is computed from expiresAt, never written by a sweeper.
 */
export interface Artifact {
  id: string;
  projectId: string;
  kind: "presentation" | "report" | "script" | "export";
  status: "draft" | "ready";
  title: string;
  sourceIds?: string[];
  fileIds?: string[];
  exportOf?: string;
  format?: string;
  storageKey?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
