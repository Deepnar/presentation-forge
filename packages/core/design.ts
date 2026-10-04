// @forge/core — deterministic theme normalization. Pure and
// filesystem-free: accepts already-parsed theme/style documents and
// returns a normalized DesignSystem. No voice, no plate, no raw
// passthrough, no renderer vocabulary.

import type { DesignSystem, Color, DecorShape, Surface } from "../model/design.generated.ts";

interface ThemeDocument {
  name?: string;
  label?: string;
  summary?: string;
  tokens?: Record<string, unknown>;
}

interface StyleDocument {
  tokens?: Record<string, unknown>;
}

export interface NormalizeInput {
  theme: ThemeDocument;
  style?: StyleDocument;
  mode: "light" | "dark";
}

const BASELINE_ROLES = ["display", "heading", "subhead", "body", "caption", "eyebrow", "stat"];

function deepMerge(a: unknown, b: unknown): unknown {
  if (Array.isArray(b)) return b;
  if (b && typeof b === "object" && a && typeof a === "object") {
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge((a as Record<string, unknown>)[k], v);
    return out;
  }
  return b === undefined ? a : b;
}

function rec(base: unknown, path: string): Record<string, unknown> {
  const node = path.split(".").reduce<unknown>((o, k) => (o != null && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), base);
  return node != null && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>) : {};
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Normalized color: bare 6-hex plus optional opacity. Eight-digit input
// contributes AA/255 at full precision; legacy 0-100 transparency becomes
// 1 - t/100 (transparency is the inverse of opacity); shadow opacity is
// already opacity. Nothing is composited or rounded here.
function toColor(value: unknown, fallback: string): Color {
  const s = String(value ?? fallback).replace(/^#/, "");
  if (s.length === 8) {
    return { hex: s.slice(0, 6), alpha: parseInt(s.slice(6, 8), 16) / 255 };
  }
  return { hex: s };
}

function withTransparency(color: Color, transparency: unknown): Color {
  if (transparency === undefined || transparency === null) return color;
  return { ...color, alpha: 1 - Number(transparency) / 100 };
}

export function normalizeDesign({ theme, style, mode }: NormalizeInput): DesignSystem {
  const name = theme.name ?? "unnamed";
  const merged = (
    style?.tokens ? (deepMerge(theme.tokens ?? {}, style.tokens) as Record<string, unknown>) : { ...theme.tokens }
  ) as Record<string, unknown>;

  if (!merged.palette || typeof merged.palette !== "object") {
    throw new Error(`DesignSystem: theme "${name}" is missing tokens.palette`);
  }
  if (!merged.type || typeof merged.type !== "object") {
    throw new Error(`DesignSystem: theme "${name}" is missing tokens.type`);
  }
  const typeMap = merged.type as Record<string, unknown>;
  for (const role of BASELINE_ROLES) {
    if (typeMap[role] == null || typeof typeMap[role] !== "object") {
      throw new Error(`DesignSystem: theme "${name}" is missing type role "${role}"`);
    }
  }

  const dark = mode === "dark" ? rec(merged, "dark") : {};
  const rawPalette = { ...rec(merged, "palette"), ...dark };
  const P = (key: string, fallback: string): Color => toColor(rawPalette[key] ?? fallback, fallback);
  const palette = {
    bg: P("bg", "#FFFFFF"),
    surface: P("surface", "#FFFFFF"),
    ink: P("ink", "#111111"),
    inkMuted: toColor(rawPalette.ink_muted ?? rawPalette.ink ?? "#555555", "#555555"),
    accent: P("accent", "#C05D4E"),
    accentAlt: toColor(rawPalette.accent_alt, "#C05D4E"),
    rule: P("rule", "#DDDDDD"),
    onAccent: P("on_accent", "#FFFFFF"),
  };

  const surfaces = rec(merged, "surfaces");
  const surface = (key: string, defaults: Surface): Surface => {
    const over = rec(surfaces, key);
    const out: Surface = { ...defaults };
    for (const k of ["bg", "ink", "muted", "accent"] as const) {
      if (over[k] !== undefined) out[k] = toColor(over[k], "#FFFFFF");
    }
    return out;
  };

  const roles: Record<string, DesignSystem["roles"][string]> = {};
  for (const [key, spec] of Object.entries(typeMap)) {
    const s = (spec ?? {}) as Record<string, unknown>;
    const role: DesignSystem["roles"][string] = {
      family: String(s.family ?? ""),
      weight: Number(s.weight ?? 400),
      size: Number(s.size ?? 12),
    };
    if (s.line !== undefined) role.line = Number(s.line);
    if (s.tracking !== undefined) role.tracking = Number(s.tracking);
    if (s.transform !== undefined) role.transform = String(s.transform);
    roles[key] = role;
  }

  const grid = rec(merged, "grid");
  const margin = rec(grid, "margin");
  const band = rec(grid, "band");
  const shape = rec(merged, "shape");
  const radii = rec(shape, "radius");
  const border = rec(shape, "border");
  const shadowCard = rec(rec(merged, "shadow"), "card");
  const chartDecl = rec(merged, "chart").series;
  const decor = rec(merged, "background").decor;

  const design: DesignSystem = {
    name,
    palette,
    surfaces: {
      title: surface("title", { bg: palette.ink, ink: palette.surface, muted: palette.inkMuted, accent: palette.accent }),
      section: surface("section", { bg: palette.accent, ink: palette.onAccent, muted: palette.onAccent }),
    },
    roles,
    grid: {
      margins: {
        top: num(margin.top) ?? 0.62,
        right: num(margin.right) ?? 0.7,
        bottom: num(margin.bottom) ?? 0.7,
        left: num(margin.left) ?? 0.7,
      },
      gutter: num(grid.gutter) ?? 0.3,
      columns: typeof grid.columns === "number" ? grid.columns : 12,
      band: {
        eyebrowY: num(band.eyebrow_y) ?? 0.62,
        titleY: num(band.title_y) ?? 1.3,
        bodyY: num(band.body_y) ?? 2.55,
      },
    },
    shape: {
      radii: {
        card: num(radii.card) ?? 0.1,
        chip: num(radii.chip) ?? 0.1,
        pill: num(radii.pill) ?? 0.3,
      },
      border: {
        color: toColor(border.color, "#000000"),
        width: num(border.width) ?? 0,
      },
      cardPad: num(shape.card_pad) ?? 0.28,
      cardFill: shape.card_fill != null && typeof shape.card_fill === "object"
        ? withTransparency(
            toColor((shape.card_fill as Record<string, unknown>).color, "#FFFFFF"),
            (shape.card_fill as Record<string, unknown>).transparency,
          )
        : { ...palette.surface },
    },
    layoutPreferences: (() => {
      const layout = rec(merged, "layout");
      const out: Record<string, Record<string, string | number | boolean>> = {};
      for (const [group, keys] of Object.entries(layout)) {
        if (keys == null || typeof keys !== "object" || Array.isArray(keys)) continue;
        const g: Record<string, string | number | boolean> = {};
        for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") g[k] = v;
        }
        out[group] = g;
      }
      return out;
    })(),
  };

  if (theme.label !== undefined) design.label = theme.label;
  if (theme.summary !== undefined) design.summary = theme.summary;
  design.mode = mode;

  if (Object.keys(shadowCard).length) {
    const color = toColor(shadowCard.color, "#000000");
    if (shadowCard.opacity !== undefined) color.alpha = Number(shadowCard.opacity);
    design.shadow = {
      card: {
        type: (shadowCard.type ?? "outer") as "outer",
        blur: num(shadowCard.blur) ?? 0,
        offset: num(shadowCard.offset) ?? 0,
        angle: num(shadowCard.angle) ?? 90,
        color,
      },
    };
  }

  if (Array.isArray(chartDecl)) {
    design.chart = { series: chartDecl.map((c) => toColor(c, "#000000")) };
  }

  if (Array.isArray(decor)) {
    design.background = {
      decor: (decor as Record<string, unknown>[]).map((d): DecorShape => ({
        shape: d.shape as DecorShape["shape"],
        x: Number(d.x),
        y: Number(d.y),
        w: Number(d.w),
        h: Number(d.h),
        fill: withTransparency(toColor(d.fill, "#FFFFFF"), d.transparency),
        ...(d.rotation !== undefined ? { rotation: Number(d.rotation) } : {}),
      })),
    };
  }

  return design;
}
