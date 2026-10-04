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
  };
  layoutState: "managed" | "customized" | "detached";
  recipeId?: string;
  elements: SceneElement[];
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
  z: number;
  provenance: "compiler" | "agent" | "human" | "import";
  semanticRef?: string;
  customized?: boolean;
  fitPolicy?: "wrap" | "one-line" | "stat";
  paragraphs?: Paragraph[];
  shape?: {
    form?: "rect" | "roundRect" | "ellipse";
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
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
