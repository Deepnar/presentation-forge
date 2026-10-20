/* DO NOT EDIT — generated from packages/agent/provider-run-request.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface ProviderRunRequest {
  requestId: string;
  projectRevision: number;
  scope: {
    mode: "inspect" | "edit";
    /**
     * @maxItems 120
     */
    readableSlides: string[];
    /**
     * @maxItems 256
     */
    editableTargets: {
      slideId: string;
      elementId: string;
    }[];
    /**
     * @maxItems 32
     */
    selection: {
      slideId: string;
      elementId: string;
    }[];
  };
  deadlineAt: number;
  request: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  reads: [
    (
      | {
          tool: "get_project";
          args: {
            offset?: number;
            limit?: number;
          };
        }
      | {
          tool: "get_slide";
          args: {
            slideId: string;
            offset?: number;
            limit?: number;
          };
        }
      | {
          tool: "get_selected_elements";
          args: {};
        }
    ),
    ...(
      | {
          tool: "get_project";
          args: {
            offset?: number;
            limit?: number;
          };
        }
      | {
          tool: "get_slide";
          args: {
            slideId: string;
            offset?: number;
            limit?: number;
          };
        }
      | {
          tool: "get_selected_elements";
          args: {};
        }
    )[]
  ];
  contextChars: number;
  maxOutputTokens: number;
}
