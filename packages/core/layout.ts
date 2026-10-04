// @forge/core — canonical layout vocabulary and frame geometry. Pure:
// no filesystem, renderers, brand, identity, or legacy slide-type names.
// Legacy src/composition.js delegates resolution and geometry here while
// keeping its WeakMap cache, wide-type compatibility rule, and drawing.

import type { DesignSystem } from "../model/design.generated.ts";

export type LayoutPreferences = DesignSystem["layoutPreferences"];

export interface ResolvedLayout {
  title: { composition: "flush-bottom" | "centred" | "split" | "band" | "top" };
  section: { composition: "flush" | "centred" | "numeral" | "band" | "block" | "rules" };
  heading: {
    align: "left" | "centre";
    opening: "pill" | "rule" | "bar" | "numeral" | "none";
    rule: "none" | "under";
  };
  content: { frame: "full" | "inset" | "offset" | "sidebar" };
  list: {
    marker: "dot" | "dash" | "square" | "arrow" | "number" | "none";
    columns: 1 | 2;
  };
  text: { dropcap: boolean };
}

const AXES = {
  title: { composition: ["flush-bottom", "centred", "split", "band", "top"] },
  section: { composition: ["flush", "centred", "numeral", "band", "block", "rules"] },
  heading: {
    align: ["left", "centre"],
    opening: ["pill", "rule", "bar", "numeral", "none"],
    rule: ["none", "under"],
  },
  content: { frame: ["full", "inset", "sidebar", "offset"] },
  list: { marker: ["dot", "dash", "square", "arrow", "number", "none"], columns: [1, 2] },
  text: { dropcap: [false, true] },
};

const DEFAULTS = Object.fromEntries(
  Object.entries(AXES).map(([group, keys]) => [
    group,
    Object.fromEntries(Object.entries(keys).map(([key, values]) => [key, values[0]])),
  ]),
) as unknown as ResolvedLayout;

export function resolveLayout(
  given?: LayoutPreferences | null,
  themeName = "theme",
): ResolvedLayout {
  const out = structuredClone(DEFAULTS) as unknown as Record<string, Record<string, unknown>>;
  for (const [group, keys] of Object.entries(given ?? {})) {
    if (!out[group]) {
      throw new Error(`${themeName}: unknown layout group "${group}" (expected ${Object.keys(AXES).join(", ")})`);
    }
    for (const [key, value] of Object.entries(keys ?? {})) {
      const allowed = (AXES as Record<string, Record<string, unknown[]>>)[group][key];
      if (!allowed) {
        throw new Error(`${themeName}: unknown layout key "${group}.${key}" (expected ${Object.keys((AXES as Record<string, Record<string, unknown>>)[group]).join(", ")})`);
      }
      if (!allowed.includes(value)) {
        throw new Error(`${themeName}: layout.${group}.${key} = ${JSON.stringify(value)} is not one of ${allowed.map((v) => JSON.stringify(v)).join(", ")}`);
      }
      out[group][key] = value;
    }
  }
  return out as unknown as ResolvedLayout;
}

export function listColumns(layout: ResolvedLayout): 1 | 2 {
  return layout.list.columns;
}

export function hasDropcap(layout: ResolvedLayout): boolean {
  return layout.text.dropcap;
}

export function sectionStyle(layout: ResolvedLayout): {
  place: "numeral" | "centred" | "flush";
  field: "block" | "band" | "rules" | "none";
} {
  const comp = layout.section.composition;
  const place = comp === "numeral" ? "numeral"
    : ["centred", "band", "rules"].includes(comp) ? "centred"
    : "flush";
  const field = ["block", "band", "rules"].includes(comp) ? comp as "block" | "band" | "rules" : "none";
  return { place, field };
}

export function titlePlacement(layout: ResolvedLayout): ResolvedLayout["title"]["composition"] {
  return layout.title.composition;
}

const FRAMES = {
  full: { inset: 0, offset: 0, sidebar: 0 },
  inset: { inset: 0.55, offset: 0, sidebar: 0 },
  offset: { inset: 0, offset: 1.1, sidebar: 0 },
  sidebar: { inset: 0, offset: 0, sidebar: 3.4 },
};

const SIDEBAR_BODY_Y = 1.25;
const SIDEBAR_GUTTER = 0.5;

export interface FrameBase {
  x: number;
  y: number;
  w: number;
  right: number;
  bottom: number;
  titleW: number;
}

export interface FrameInput {
  base: FrameBase;
  frame: ResolvedLayout["content"]["frame"];
  band: { eyebrowY: number; titleY: number; bodyY: number };
}

export interface FrameBox extends FrameBase {
  frame: ResolvedLayout["content"]["frame"];
  bodyY: number;
  mark: { x: number; y: number; w: number };
  head: { x: number; y: number; w: number; wide: number; budget: number };
}

export function frameGeometry({ base, frame, band }: FrameInput): FrameBox {
  const geom = FRAMES[frame];
  const reserve = base.w - base.titleW; // the crest's horizontal reservation

  const out: FrameBox = {
    ...base,
    frame,
    bodyY: band.bodyY,
    mark: { x: base.x, y: band.eyebrowY, w: base.titleW },
    head: { x: base.x, y: band.titleY, w: base.titleW, wide: base.w, budget: 1.05 },
  };

  if (geom.inset) {
    out.x = base.x + geom.inset;
    out.w = base.w - geom.inset * 2;
    out.right = base.right - geom.inset;
    out.titleW = out.w - reserve;
    out.mark = { x: out.x, y: band.eyebrowY, w: out.titleW };
    out.head = { x: out.x, y: band.titleY, w: out.titleW, wide: out.w, budget: 1.05 };
  }

  if (geom.offset) {
    out.x = base.x + geom.offset;
    out.w = base.w - geom.offset;
    out.titleW = out.w - reserve;
    out.mark = { x: base.x, y: band.eyebrowY, w: geom.offset - 0.15 };
    out.head = { x: out.x, y: band.titleY, w: out.titleW, wide: out.w, budget: 1.05 };
  }

  if (geom.sidebar) {
    const colW = geom.sidebar;
    out.x = base.x + colW + SIDEBAR_GUTTER;
    out.w = base.right - out.x;
    out.titleW = out.w - reserve;
    out.bodyY = SIDEBAR_BODY_Y;
    out.mark = { x: base.x, y: band.eyebrowY, w: colW };
    out.head = { x: base.x, y: band.titleY, w: colW, wide: colW, budget: 2.2 };
  }

  return out;
}
