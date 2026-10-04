/* DO NOT EDIT — generated from packages/model/file.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * A file that has entered Forge's durable project domain. Immutable with respect to content: replacing content mints a new id. storageKey is opaque to the domain and resolved by the active storage adapter; it never carries paths or URLs.
 */
export interface FileRef {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  hash?: string;
  storageKey: string;
  role: "source" | "source-of-truth" | "visual-reference" | "template" | "brand" | "dataset" | "asset" | "unknown";
  createdAt?: string;
}
