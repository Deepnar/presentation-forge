/* DO NOT EDIT — generated from packages/model/scene.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * Layer C: editable scene graph. Source of truth for the browser editor and the PPTX exporter. Canonical units are inches on a 13.333x7.5 canvas.
 */
export interface SlideScene {
  id: string;
  width: 13.333;
  height: 7.5;
  background: {
    fill: string;
    /**
     * Theme-owned native dressing resolved by the compiler from DesignSystem. Projected behind all elements; never edited, never a ContentBlock carrier.
     */
    decor?: BackgroundDecor[];
    image?: BackgroundImage;
  };
  layoutState: "managed" | "customized" | "detached";
  /**
   * Slide-scoped regeneration tombstones: compiler element IDs deleted by human command. Regeneration skips fresh elements with these IDs instead of resurrecting them; matching is by exact element ID only, so renamed or genuinely new elements are never suppressed. Human-added deletions record nothing here.
   */
  suppressed?: {
    id: string;
    semanticRef?: string;
  }[];
  recipeId?: string;
  elements: SceneElement[];
}
export interface BackgroundDecor {
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  fillAlpha?: number;
  rotation?: number;
}
/**
 * Adapter-resolved decorative background asset (e.g. a rasterized theme plate). Opaque renderer-ready reference: data URIs embed portably, other adapters may supply blob-backed sources. Content stays native above it; the hash is the determinism proof and dedup key.
 */
export interface BackgroundImage {
  src: string;
  hash: string;
}
export interface SceneElement {
  id: string;
  kind: "text" | "shape" | "image" | "line" | "chart" | "table" | "group";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  valign?: "top" | "middle" | "bottom";
  z: number;
  provenance: "compiler" | "agent" | "human" | "import";
  semanticRef?: string;
  customized?: boolean;
  /**
   * Human rewrote this element's authored content (text). Geometry ownership stays on `customized`; regeneration keeps human paragraphs when this is set and refreshes them from the compiler when it is not.
   */
  contentCustomized?: boolean;
  /**
   * Human restyled this shape's appearance (fill/stroke). Geometry ownership stays on `customized`, text on `contentCustomized`; regeneration keeps the human shape styling when this is set and refreshes it from the compiler when it is not.
   */
  styleCustomized?: boolean;
  /**
   * Human restyled this text's appearance (color/size/bold/italic). Wording ownership stays on `contentCustomized`, geometry on `customized`; regeneration keeps the human run appearance when this is set and refreshes wording from the compiler when content is not customized.
   */
  formatCustomized?: boolean;
  /**
   * Human edited this chart's data (categories, series values/names, chart kind). Geometry ownership stays on `customized`; regeneration keeps the human chart payload when this is set and refreshes it from the compiler when it is not. Label typography stays compiler-owned always.
   */
  dataCustomized?: boolean;
  /**
   * Human edited this table's cells (rows content and structure). Geometry ownership stays on `customized`; regeneration keeps the human matrix when this is set and refreshes it from the compiler when it is not. Header flag, layout, and typography stay compiler-owned always.
   */
  tableCustomized?: boolean;
  /**
   * Human hid this element in the editor. Hidden elements are preserved verbatim in the scene but omitted from browser and PowerPoint projections (never deleted, never rasterized); re-showing restores content, geometry, and draw order exactly.
   */
  hidden?: boolean;
  fitPolicy?: "wrap" | "one-line" | "stat";
  paragraphs?: Paragraph[];
  shape?: {
    form?: "rect" | "roundRect" | "ellipse";
    fill?: string;
    fillAlpha?: number;
    stroke?: string;
    strokeWidth?: number;
    strokeAlpha?: number;
  };
  image?: {
    src: string;
    alt?: string;
  };
  line?: {
    x2: number;
    y2: number;
    stroke?: string;
    strokeWidth?: number;
  };
  chart?: {
    chartKind: "bar" | "hbar" | "line" | "pie" | "doughnut" | "area";
    categories: string[];
    series: {
      name: string;
      values: number[];
    }[];
    /**
     * Compiler-resolved chart label typography (category axis, value axis, legend). Renderers project these sizes rather than guessing; labels never shrink below them.
     */
    labels?: {
      family: string;
      size: number;
      color: string;
    };
  };
  table?: {
    rows: string[][];
    header?: boolean;
    /**
     * Compiler-resolved table presentation: row geometry, header treatment, cell typography, padding, grid. Renderers project it verbatim and never recompute it.
     */
    layout?: {
      rowHeights?: number[];
      /**
       * Resolved column widths in inches, summing to the element width. Both renderers divide columns from these numbers so measurement and projection agree.
       */
      colWidths?: number[];
      headerFill?: string;
      headerColor?: string;
      headerSize?: number;
      headerBold?: boolean;
      bodyColor?: string;
      bodySize?: number;
      fontFamily?: string;
      padding?: number;
      gridColor?: string;
    };
  };
  group?: {
    children: SceneElement[];
  };
}
export interface Paragraph {
  runs: TextRun[];
  align?: "left" | "center" | "right";
  bullet?: boolean;
}
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  role?: string;
  family?: string;
  weight?: number;
  tracking?: number;
  line?: number;
  transform?: "upper";
}
