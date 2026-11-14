/* DO NOT EDIT — generated from packages/tools/request.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

export type ToolRequest =
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
      tool: "web_search";
      /**
       * Bounded semantic web search. Project identity and backend configuration are trusted host inputs, never query arguments.
       */
      args: {
        query: string;
        limit?: number;
        perHost?: number;
        language?: string;
        timeRange?: "day" | "month" | "year";
      };
    }
  | {
      tool: "add_slide";
      /**
       * Propose a new slide, written as content only: the compiler lays it out in the project's theme. It is added only after the person approves.
       */
      args: {
        baseRevision: number;
        /**
         * The slide it follows; null puts it first.
         */
        afterSlideId: string | null;
        slide: {
          title: string;
          purpose?: string;
          /**
           * @minItems 1
           * @maxItems 8
           */
          blocks: [
            {
              kind: "text" | "list" | "stat" | "quote";
              label?: string;
              text?: string;
              value?: string;
              /**
               * @minItems 1
               * @maxItems 8
               */
              items?: [string, ...string[]];
            },
            ...{
              kind: "text" | "list" | "stat" | "quote";
              label?: string;
              text?: string;
              value?: string;
              /**
               * @minItems 1
               * @maxItems 8
               */
              items?: [string, ...string[]];
            }[]
          ];
        };
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
      tool: "rewrite_slide";
      /**
       * Propose new content for an existing slide: the compiler lays it out again in the project's theme, keeping what the person moved, locked or added. It changes only after the person approves.
       */
      args: {
        baseRevision: number;
        slide: {
          title: string;
          purpose?: string;
          /**
           * @minItems 1
           * @maxItems 8
           */
          blocks: [
            {
              kind: "text" | "list" | "stat" | "quote";
              label?: string;
              text?: string;
              value?: string;
              /**
               * @minItems 1
               * @maxItems 8
               */
              items?: [string, ...string[]];
            },
            ...{
              kind: "text" | "list" | "stat" | "quote";
              label?: string;
              text?: string;
              value?: string;
              /**
               * @minItems 1
               * @maxItems 8
               */
              items?: [string, ...string[]];
            }[]
          ];
        };
        /**
         * The slide to rewrite.
         */
        slideId: string;
      };
    }
  | {
      tool: "change_layout";
      /**
       * Propose laying an existing slide out another way, keeping its content: auto is the compiler's own choice; cards, compare (side by side), steps, steps-down, cycle, tiers, hub, bands, funnel, pyramid, quadrants (four parts), venn (two to four overlapping parts). The compiler draws it in the project's theme and refuses a layout the content does not fit. It changes only after the person approves.
       */
      args: {
        baseRevision: number;
        /**
         * The slide to lay out again.
         */
        slideId: string;
        layout:
          | "auto"
          | "cards"
          | "compare"
          | "steps"
          | "steps-down"
          | "cycle"
          | "tiers"
          | "hub"
          | "bands"
          | "funnel"
          | "pyramid"
          | "quadrants"
          | "venn";
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
  | {
      tool: "list_files";
      /**
       * The files the person added to this project, with the role each plays (source-of-truth outranks other sources).
       */
      args: {};
    }
  | {
      tool: "read_file";
      /**
       * A page of a project file's text.
       */
      args: {
        fileId: string;
        offset?: number;
        limit?: number;
      };
    };
