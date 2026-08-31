import { readdir } from "node:fs/promises";
import { loadTheme } from "./theme.js";
import { layoutOf } from "./composition.js";
import { THEMES } from "./paths.js";

/**
 * Which themes a visual sweep actually has to look at.
 *
 * 34 themes x 75 types is 2,550 slides, and nobody is going to look at that.
 * They do not need to: the layouts do not branch on a theme, they branch on the
 * COMPOSITION AXES a theme selects — the content frame, the opening mark, the
 * heading alignment, the list columns, whether the background is a plate. A
 * defect lives in one of those branches, so a set that exercises every value of
 * every axis sees every branch, and the other 26 themes are the same code with
 * different colours and typefaces.
 *
 * Eight themes cover all 31 values. The first three are the type-scale
 * extremes rather than an axis: every floor is a point size, so the widest and
 * narrowest type in the gallery decide which cases are tight, and a set without
 * them measures nothing about the ones that bind.
 *
 * `test/coverage.test.js` holds this to its claim. A theme that introduces an
 * axis value none of these carries fails it, and the answer is to add a theme
 * here — not to widen the sweep to all 34.
 */
export const COVERING_THEMES = [
  "high-contrast-mono",   // widest body, subhead and heading in the gallery
  "mono-terminal-light",  // narrowest body and heading; rule opening
  "sci-fi-hud",           // the sidebar frame, narrowest subhead, split title
  "gradient-mesh-dark",   // plate ground, centred heading, inset frame
  "corporate-clean-blue", // the offset frame, pill opening, numeral section
  "editorial-magazine",   // the only two-column list, with newsprint
  "minimal-muji",         // tightest margins, no opening mark, top title
  "bauhaus",              // numeral opening, block section, square markers
];

/**
 * The axis values one theme exercises.
 *
 * Anything the layouts read to decide a SHAPE. Palette and typeface are absent
 * on purpose: they change what a slide looks like, never which branch runs.
 */
export function themeTraits(theme) {
  const l = layoutOf(theme);
  return new Set([
    `frame:${l.content.frame}`,
    `opening:${l.heading.opening}`,
    `align:${l.heading.align}`,
    `rule:${l.heading.rule}`,
    `cols:${l.list.columns}`,
    `marker:${l.list.marker}`,
    `title:${l.title.composition}`,
    `section:${l.section.composition}`,
    `dropcap:${l.text.dropcap}`,
    `plate:${theme.plate?.enabled ? "yes" : "no"}`,
  ]);
}

/** Every theme on disk, by name. */
export async function allThemeNames() {
  return (await readdir(THEMES))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort();
}

/**
 * What the covering set exercises and what it misses.
 *
 * Returns `{ missing, redundant }` — `missing` is an axis value some theme has
 * and no covering theme does, which is a hole in every visual sweep; `redundant`
 * is a covering theme whose traits another already carries, which is a slide
 * someone will look at for nothing.
 */
export async function coverageReport(covering = COVERING_THEMES) {
  const names = await allThemeNames();
  const traits = new Map();
  for (const name of names) {
    try { traits.set(name, themeTraits(await loadTheme(name))); } catch { /* a theme that will not load is the theme loader's problem */ }
  }

  const covered = new Set();
  for (const name of covering) for (const t of traits.get(name) ?? []) covered.add(t);

  const missing = [];
  for (const [name, set] of traits) {
    for (const t of set) {
      if (!covered.has(t)) missing.push({ trait: t, theme: name });
    }
  }

  const redundant = covering.filter((name) => {
    const mine = traits.get(name) ?? new Set();
    const others = new Set(covering.filter((o) => o !== name).flatMap((o) => [...(traits.get(o) ?? [])]));
    return [...mine].every((t) => others.has(t));
  });

  return { missing, redundant, values: covered.size, themes: names.length };
}
