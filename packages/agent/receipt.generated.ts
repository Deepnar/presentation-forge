/* DO NOT EDIT — generated from packages/agent/receipt.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface RunReceipt {
  step: number;
  tool: "get_project" | "get_slide" | "get_selected_elements" | "edit_content";
  ok: boolean;
  code:
    | null
    | "forbidden"
    | "invalid-input"
    | "budget-exceeded"
    | "unknown-slide"
    | "unknown-element"
    | "not-editable"
    | "locked"
    | "stale-revision"
    | "duplicate-id"
    | "invalid-edit"
    | "engine-refused"
    | "unavailable";
  changed: boolean;
  projectRevision: number;
  engineRevision: number;
  runRevision: number;
}
