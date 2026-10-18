/* DO NOT EDIT — generated from packages/tools/result.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export type ToolResult =
  | {
      ok: false;
      code:
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
      message: string;
    }
  | {
      ok: true;
      revision: number;
      changed: boolean;
      preserved: ("geometry" | "styling" | "untargeted-content" | "tombstones")[];
      warnings: string[];
      data: {
        [k: string]: unknown;
      };
    };
