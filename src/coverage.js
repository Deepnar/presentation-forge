import { readdir } from "node:fs/promises";
import { loadTheme } from "./theme.js";
import { layoutOf } from "./composition.js";
import { THEMES } from "./paths.js";

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

export async function allThemeNames() {
  return (await readdir(THEMES))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""))
    .sort();
}

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
