/* DO NOT EDIT — generated from packages/agent/run-plan.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export interface RunPlan {
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
  /**
   * @minItems 1
   * @maxItems 64
   */
  steps: [
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
      | {
          tool: "edit_content";
          args: {
            baseRevision: number;
            /**
             * @minItems 1
             * @maxItems 32
             */
            edits: [
              (
                | {
                    kind: "text";
                    slideId: string;
                    elementId: string;
                    paragraphIndex: number;
                    runIndex: number;
                    text: string;
                  }
                | {
                    kind: "chart";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    categories: [string, ...string[]];
                    /**
                     * @minItems 1
                     * @maxItems 20
                     */
                    series: [
                      {
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      },
                      ...{
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      }[]
                    ];
                  }
                | {
                    kind: "table";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    rows: [[string, ...string[]], ...[string, ...string[]][]];
                  }
              ),
              ...(
                | {
                    kind: "text";
                    slideId: string;
                    elementId: string;
                    paragraphIndex: number;
                    runIndex: number;
                    text: string;
                  }
                | {
                    kind: "chart";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    categories: [string, ...string[]];
                    /**
                     * @minItems 1
                     * @maxItems 20
                     */
                    series: [
                      {
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      },
                      ...{
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      }[]
                    ];
                  }
                | {
                    kind: "table";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    rows: [[string, ...string[]], ...[string, ...string[]][]];
                  }
              )[]
            ];
          };
        }
      | {
          tool: "insert_slide";
          /**
           * Host-only plan step: a slide the compiler already laid out. Never offered to a model.
           */
          args: {
            baseRevision: number;
            index: number;
            scene: {
              [k: string]: unknown;
            };
          };
        }
      | {
          tool: "replace_slide";
          /**
           * Host-only plan step: a slide's replacement, already laid out. Never offered to a model.
           */
          args: {
            baseRevision: number;
            scene: {
              [k: string]: unknown;
            };
            slideId: string;
          };
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
      | {
          tool: "edit_content";
          args: {
            baseRevision: number;
            /**
             * @minItems 1
             * @maxItems 32
             */
            edits: [
              (
                | {
                    kind: "text";
                    slideId: string;
                    elementId: string;
                    paragraphIndex: number;
                    runIndex: number;
                    text: string;
                  }
                | {
                    kind: "chart";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    categories: [string, ...string[]];
                    /**
                     * @minItems 1
                     * @maxItems 20
                     */
                    series: [
                      {
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      },
                      ...{
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      }[]
                    ];
                  }
                | {
                    kind: "table";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    rows: [[string, ...string[]], ...[string, ...string[]][]];
                  }
              ),
              ...(
                | {
                    kind: "text";
                    slideId: string;
                    elementId: string;
                    paragraphIndex: number;
                    runIndex: number;
                    text: string;
                  }
                | {
                    kind: "chart";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    categories: [string, ...string[]];
                    /**
                     * @minItems 1
                     * @maxItems 20
                     */
                    series: [
                      {
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      },
                      ...{
                        name: string;
                        /**
                         * @minItems 1
                         * @maxItems 120
                         */
                        values: [number, ...number[]];
                      }[]
                    ];
                  }
                | {
                    kind: "table";
                    slideId: string;
                    elementId: string;
                    /**
                     * @minItems 1
                     * @maxItems 120
                     */
                    rows: [[string, ...string[]], ...[string, ...string[]][]];
                  }
              )[]
            ];
          };
        }
      | {
          tool: "insert_slide";
          /**
           * Host-only plan step: a slide the compiler already laid out. Never offered to a model.
           */
          args: {
            baseRevision: number;
            index: number;
            scene: {
              [k: string]: unknown;
            };
          };
        }
      | {
          tool: "replace_slide";
          /**
           * Host-only plan step: a slide's replacement, already laid out. Never offered to a model.
           */
          args: {
            baseRevision: number;
            scene: {
              [k: string]: unknown;
            };
            slideId: string;
          };
        }
    )[]
  ];
  maxSteps: number;
  maxFailures: number;
  deadlineAt: number;
}
