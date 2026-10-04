/* DO NOT EDIT — generated from packages/model/design.schema.json by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */

/**
 * Normalized renderer-neutral design. Produced by pure normalizeDesign() from parsed theme/style documents; never hand-written, never carries raw theme data, paths, renderer options, or agent voice.
 */
export interface DesignSystem {
  name: string;
  label?: string;
  summary?: string;
  mode?: "light" | "dark";
  palette: Palette;
  surfaces: {
    title: Surface;
    section: Surface;
  };
  roles: {
    [k: string]: Role;
  };
  grid: {
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    gutter: number;
    columns: number;
    band: {
      eyebrowY: number;
      titleY: number;
      bodyY: number;
    };
  };
  shape: {
    radii: {
      card: number;
      chip: number;
      pill: number;
    };
    border: {
      color: Color;
      width: number;
    };
    cardPad: number;
    cardFill: Color;
  };
  shadow?: {
    card?: {
      type: "outer";
      blur: number;
      offset: number;
      angle: number;
      color: Color;
    };
  };
  chart?: {
    series?: Color[];
  };
  layoutPreferences: {
    [k: string]: {
      [k: string]: string | number | boolean;
    };
  };
  background?: {
    decor?: DecorShape[];
  };
}
export interface Palette {
  bg: Color;
  surface: Color;
  ink: Color;
  inkMuted: Color;
  accent: Color;
  accentAlt: Color;
  rule: Color;
  onAccent: Color;
}
export interface Color {
  hex: string;
  alpha?: number;
}
export interface Surface {
  bg: Color;
  ink: Color;
  muted: Color;
  accent?: Color;
}
export interface Role {
  family: string;
  weight: number;
  size: number;
  line?: number;
  tracking?: number;
  transform?: string;
}
export interface DecorShape {
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: Color;
  rotation?: number;
}
