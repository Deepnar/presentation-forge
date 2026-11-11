/* DO NOT EDIT — generated from packages/model/intent.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * Layer A: semantic intent. The model's creative language. No coordinates, colours, or font names.
 */
export interface DeckIntent {
  id: string;
  title: string;
  audience?: string;
  objective?: string;
  narrative?: string;
  designDirection?: string;
  sourcePolicy?: {
    mode: "research" | "source-of-truth" | "none";
    fileIds?: string[];
  };
  /**
   * @minItems 1
   * @maxItems 60
   */
  slides: [SlideIntent, ...SlideIntent[]];
}
export interface SlideIntent {
  id: string;
  purpose: string;
  title?: string;
  takeaway?: string;
  /**
   * @minItems 1
   * @maxItems 12
   */
  blocks: [ContentBlock, ...ContentBlock[]];
  visualDirection?: string;
  rhetoricalRole?:
    | "opening"
    | "context"
    | "problem"
    | "method"
    | "explanation"
    | "evidence"
    | "decision"
    | "recommendation"
    | "limitation"
    | "conclusion"
    | "transition";
  relationship?: "comparison" | "sequence" | "cause-effect" | "cycle" | "hierarchy" | "part-whole";
  layoutHint?: {
    recipe?: "title" | "content" | "comparison" | "media" | "chart" | "process";
    emphasis?: string;
    mediaSide?: "left" | "right";
    /**
     * Whether a sequence reads left to right or top to bottom. Absent means across.
     */
    flowDirection?: "across" | "down";
    /**
     * How blocks are arranged. Hierarchies: the first block above the rest (tiers), at the centre with the rest around it (radial), every block a full-width band stacked top first (layers) or bands narrowing downward (funnel) or widening downward (pyramid), or a node graph along its connections (graph). Card grids: four blocks as a 2x2 between the slide's axes (quadrants), one row per block group in first-seen order (lanes), or two to four overlapping sets (venn). Absent means the family's default.
     */
    arrangement?: "tiers" | "radial" | "layers" | "funnel" | "pyramid" | "graph" | "quadrants" | "lanes" | "venn";
  };
  sourceRefs?: string[];
  speakerNotes?: string;
  /**
   * The dimensions a slide's blocks are placed along: what each axis measures, its low and high ends, and any tick labels (a roadmap's time periods).
   */
  axes?: {
    x?: {
      label?: string;
      low?: string;
      high?: string;
      /**
       * @maxItems 12
       */
      ticks?: string[];
    };
    y?: {
      label?: string;
      low?: string;
      high?: string;
      /**
       * @maxItems 12
       */
      ticks?: string[];
    };
  };
  /**
   * Directed links between blocks on this slide, by block id — the edges of a diagram.
   *
   * @maxItems 30
   */
  connections?: {
    from: string;
    to: string;
    label?: string;
  }[];
}
export interface ContentBlock {
  id: string;
  kind: "text" | "list" | "stat" | "image" | "chart" | "table" | "quote" | "callout";
  text?: string;
  /**
   * @maxItems 16
   */
  items?: string[];
  label?: string;
  value?: string;
  src?: string;
  alt?: string;
  /**
   * Whether the image may be cropped to fill its region (cover) or must show whole (contain).
   */
  fit?: "cover" | "contain";
  /**
   * A short emoji or symbol that heads the block, drawn as text.
   */
  icon?: string;
  /**
   * The named group (a roadmap phase, a lane) this block belongs to.
   */
  group?: string;
  caption?: string;
  chartKind?: "bar" | "hbar" | "line" | "pie" | "doughnut" | "area";
  categories?: string[];
  /**
   * @maxItems 4
   */
  series?: {
    name: string;
    /**
     * @minItems 1
     */
    values: [number, ...number[]];
  }[];
  unit?: string;
  emphasis?: "primary" | "supporting" | "context";
  /**
   * @minItems 1
   */
  evidenceRefs?: [string, ...string[]];
  outcome?: "favorable" | "unfavorable" | "mixed" | "neutral";
  uncertainty?: "qualified" | "mixed" | "inconclusive" | "contested";
  /**
   * Authored implementation status. Absent means unspecified — never defaulted. Orthogonal to outcome, uncertainty, emphasis, and role.
   */
  status?: "implemented" | "planned";
  rows?: string[][];
  header?: boolean;
  mediaRole?: "evidence" | "explanatory" | "decorative";
  measure?: "comparison" | "trend" | "composition" | "distribution" | "association";
}
