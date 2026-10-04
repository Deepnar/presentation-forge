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
  };
  sourceRefs?: string[];
  speakerNotes?: string;
}
export interface ContentBlock {
  id: string;
  kind: "text" | "list" | "stat" | "image" | "chart" | "table" | "quote" | "callout";
  text?: string;
  /**
   * @maxItems 8
   */
  items?: string[];
  label?: string;
  value?: string;
  src?: string;
  alt?: string;
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
  rows?: string[][];
  header?: boolean;
  mediaRole?: "evidence" | "explanatory" | "decorative";
  measure?: "comparison" | "trend" | "composition" | "distribution" | "association";
}
