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
  };
  table?: {
    rows: string[][];
    header?: boolean;
    /**
     * Compiler-resolved table presentation: row geometry, header treatment, cell typography, padding, grid. Renderers project it verbatim and never recompute it.
     */
    layout?: {
      rowHeights?: number[];
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
