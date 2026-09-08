import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, THEMES } from "./paths.js";

export function hex(c) {
  if (!c) return undefined;
  const s = String(c).replace(/^#/, "");
  return s.length === 8 ? s.slice(0, 6) : s; // drop alpha channel if present
}

export function alphaPct(c) {
  const s = String(c ?? "").replace(/^#/, "");
  if (s.length !== 8) return undefined;
  return Math.round((1 - parseInt(s.slice(6, 8), 16) / 255) * 100);
}

export async function listThemes() {
  const files = await readdir(THEMES);
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
  const file = path.join(THEMES, `${name}.yaml`);
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    const available = await listThemes();
    throw new Error(`Unknown theme "${name}". Available: ${available.join(", ")}`);
  }
  const t = YAML.parse(raw);

  if (style) {
    const s = await loadStyle(style);
    t.tokens = deepMerge(t.tokens ?? {}, s.tokens);
    t.voice = { ...(t.voice ?? {}), ...s.voice };
  }

  if (!t?.tokens?.palette) throw new Error(`Theme "${name}" is missing tokens.palette`);
  if (!t?.tokens?.type) throw new Error(`Theme "${name}" is missing tokens.type`);

  const palette = mode === "dark" && t.tokens.dark
    ? { ...t.tokens.palette, ...t.tokens.dark }
    : t.tokens.palette;

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

  const tokens = { ...t.tokens, palette };

  const type = {};
  for (const [key, spec] of Object.entries(t.tokens.type ?? {})) {
    type[key] = { ...spec, _role: key };
  }

  return {
    name: t.name ?? name,
    label: t.label ?? name,
    mode,
    palette,
    surfaces,
    tokens,
    type,
    grid: t.tokens.grid,
    shape: t.tokens.shape ?? {},
    shadow: t.tokens.shadow ?? {},
    plate: tokens.plate ?? { enabled: false },
    voice: t.voice ?? {},
  };
}

export function textStyle(theme, token, { color, scale = 1, ...rest } = {}) {
  const spec = theme.type[token];
  if (!spec) throw new Error(`Theme "${theme.name}" has no type token "${token}"`);
  const { _role, ...t } = spec;
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

export function applyTransform(theme, token, str) {
  return theme.type[token]?.transform === "upper" ? String(str).toUpperCase() : str;
}
