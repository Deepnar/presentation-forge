/* DO NOT EDIT — generated from packages/model/source.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * A normalized research/project source. Immutable: re-fetching changed content mints a new id so existing citations never change meaning. SlideIntent.sourceRefs references SourceRef.id.
 */
export interface SourceRef {
  id: string;
  projectId: string;
  kind: "web" | "paper" | "project-file" | "user-provided";
  title: string;
  url?: string;
  doi?: string;
  fileId?: string;
  locator?: string;
  excerpt?: string;
  searchProvider?: string;
  publishedAt?: string;
  retrievedAt?: string;
}
