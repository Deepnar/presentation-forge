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
        projectId: string;
        total: number;
        slides: {
          slideId: string;
          position: number;
          elementCount: number;
          layoutState: "managed" | "customized" | "detached";
        }[];
        nextOffset: number | null;
      };
      tool: "get_project";
    }
  | {
      ok: true;
      revision: number;
      changed: boolean;
      preserved: ("geometry" | "styling" | "untargeted-content" | "tombstones")[];
      warnings: string[];
      data: {
        slideId: string;
        total: number;
        elements: ElementProjection[];
        nextOffset: number | null;
      };
      tool: "get_slide";
    }
  | {
      ok: true;
      revision: number;
      changed: boolean;
      preserved: ("geometry" | "styling" | "untargeted-content" | "tombstones")[];
      warnings: string[];
      data: {
        elements: {
          slideId: string;
          element: ElementProjection;
        }[];
      };
      tool: "get_selected_elements";
    }
  | {
      ok: true;
      revision: number;
      changed: boolean;
      preserved: ("geometry" | "styling" | "untargeted-content" | "tombstones")[];
      warnings: string[];
      data: {
        edited: {
          slideId: string;
          elementId: string;
        }[];
      };
      tool: "edit_content";
    };
export type ElementProjection =
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "text";
      paragraphs: {
        runs: {
          text: string;
        }[];
      }[];
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "chart";
      chart: {
        chartKind: "bar" | "hbar" | "line" | "pie" | "doughnut" | "area";
        categories: string[];
        series: {
          name: string;
          values: number[];
        }[];
      } | null;
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "table";
      table: {
        header: boolean | null;
        rows: string[][];
      } | null;
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "shape";
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "image";
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "line";
    }
  | {
      elementId: string;
      locked: boolean;
      hidden: boolean;
      editable: boolean;
      kind: "group";
    };
