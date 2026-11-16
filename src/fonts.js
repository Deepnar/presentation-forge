// The font families this install has: the ones `npm run fonts` (and the
// container build) put in place, listed in tools/fonts.manifest.json. Every
// choice offered from here renders the same in the browser, the .pptx and
// server-side previews, which is why a person's font picks come from this
// list and nowhere else.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadThemeDocument } from "./theme-loader.js";

const MANIFEST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "fonts.manifest.json");
let cached = null;

export async function installedFamilies() {
  if (!cached) {
    try { cached = Object.keys(JSON.parse(await readFile(MANIFEST, "utf8")).families ?? {}); }
    catch { cached = []; }
  }
  return [...cached];
}

// The installed families with a theme's own first — heading, then body —
// so the toolbar leads with what the theme was designed around.
export async function fontChoices(themeName = null) {
  const all = await installedFamilies();
  let own = [];
  if (themeName) {
    try {
      const type = (await loadThemeDocument(themeName)).tokens?.type ?? {};
      own = [type.heading?.family, type.body?.family].filter((f, i, a) => f && all.includes(f) && a.indexOf(f) === i);
    } catch { own = []; }
  }
  return { theme: own, families: [...own, ...all.filter((f) => !own.includes(f)).sort((a, b) => a.localeCompare(b))] };
}
