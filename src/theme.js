import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "./paths.js";

/** pptxgenjs wants bare hex — no leading '#', no alpha. */
export function hex(c) {
  if (!c) return undefined;
  const s = String(c).replace(/^#/, "");
  return s.length === 8 ? s.slice(0, 6) : s; // drop alpha channel if present
}

/** Alpha from an #RRGGBBAA token, as a 0-100 transparency for pptxgenjs. */
export function alphaPct(c) {
  const s = String(c ?? "").replace(/^#/, "");
  if (s.length !== 8) return undefined;
  return Math.round((1 - parseInt(s.slice(6, 8), 16) / 255) * 100);
}

export async function listThemes() {
  const files = await readdir(path.join(ROOT, "themes"));
  return files.filter((f) => f.endsWith(".yaml") && !f.startsWith("_")).map((f) => f.replace(/\.yaml$/, ""));
}

export async function listStyles() {
  const files = await readdir(path.join(ROOT, "styles"));
  return files.filter((f) => f.endsWith(".yaml") && !f.startsWith("_")).map((f) => f.replace(/\.yaml$/, ""));
}

export async function loadStyle(name) {
  let raw;
  try {
    raw = YAML.parse(await readFile(path.join(ROOT, "styles", `${name}.yaml`), "utf8"));
  } catch {
    const available = await listStyles();
    throw new Error(`Unknown style "${name}". Available: ${available.join(", ")}`);
  }
  return { name: raw.name ?? name, label: raw.label ?? name, tokens: raw.tokens ?? {}, voice: raw.voice ?? {} };
}

/** Arrays replace, objects merge — a style must not drop a whole theme block. */
function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === "object" && a && typeof a === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
    return out;
  }
  return b === undefined ? a : b;
}

export async function loadTheme(name, { mode = "light", style } = {}) {
  const file = path.join(ROOT, "themes", `${name}.yaml`);
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    const available = await listThemes();
    throw new Error(`Unknown theme "${name}". Available: ${available.join(", ")}`);
  }
  const t = YAML.parse(raw);

  // A style is a cross-cutting override: its tokens deep-merge over the theme's
  // and its voice merges over the theme's, so any theme can be rendered in any
  // style without a theme copy.
  if (style) {
    const s = await loadStyle(style);
    t.tokens = deepMerge(t.tokens ?? {}, s.tokens);
    t.voice = { ...(t.voice ?? {}), ...s.voice };
  }

  if (!t?.tokens?.palette) throw new Error(`Theme "${name}" is missing tokens.palette`);
  if (!t?.tokens?.type) throw new Error(`Theme "${name}" is missing tokens.type`);

  // Dark mode is an optional palette override; everything else is shared.
  const palette = mode === "dark" && t.tokens.dark
    ? { ...t.tokens.palette, ...t.tokens.dark }
    : t.tokens.palette;

  // Special surfaces fall back to sensible derivations so a theme can omit them.
  const surfaces = {
    title: {
      bg: palette.ink, ink: palette.surface, muted: palette.ink_muted, accent: palette.accent,
      ...(t.tokens.surfaces?.title ?? {}),
    },
    section: {
      bg: palette.accent, ink: palette.on_accent ?? palette.surface, muted: palette.on_accent ?? palette.surface,
      ...(t.tokens.surfaces?.section ?? {}),
    },
  };

  return {
    name: t.name ?? name,
    label: t.label ?? name,
    mode,
    palette,
    surfaces,
    type: t.tokens.type,
    grid: t.tokens.grid,
    shape: t.tokens.shape ?? {},
    shadow: t.tokens.shadow ?? {},
    plate: t.tokens.plate ?? { enabled: false },
    voice: t.voice ?? {},
  };
}

/**
 * Turn a type token into pptxgenjs text options.
 * `size` is the theme's point size; callers may scale it (the fitter shrinks,
 * never grows — growing would break the theme's vertical rhythm).
 */
export function textStyle(theme, token, { color, scale = 1, ...rest } = {}) {
  const t = theme.type[token];
  if (!t) throw new Error(`Theme "${theme.name}" has no type token "${token}"`);
  const opts = {
    fontFace: t.family,
    fontSize: Math.round(t.size * scale * 10) / 10,
    bold: (t.weight ?? 400) >= 600,
    color: hex(color ?? theme.palette.ink),
    charSpacing: t.tracking ?? 0,
    lineSpacing: Math.round(t.size * scale * (t.line ?? 1.3)),
    ...rest,
  };
  if (t.transform === "upper") opts._upper = true; // applied by the caller on the string
  return opts;
}

/** Apply a type token's text transform. */
export function applyTransform(theme, token, str) {
  return theme.type[token]?.transform === "upper" ? String(str).toUpperCase() : str;
}
