import { test } from "node:test";
import assert from "node:assert/strict";
import { listThemes, loadTheme } from "../src/theme.js";
import { contrast } from "../src/chartpalette.js";

/**
 * The two surfaces a theme paints under its own text.
 *
 * A title and a divider are the only slides where the theme chooses both the
 * ground and the ink, and the pairing is never checked by rendering: the .pptx
 * writes, the colours are valid, and a headline at 2.9:1 looks fine to whoever
 * picked it. `claymorphism` shipped a divider headline at 2.95:1 and its
 * standfirst at 2.35:1; `chalkboard` set its section number at 1.33:1, which
 * is not secondary text, it is absent.
 *
 * Headline ink is display type — large, so 3:1 is its floor. Everything muted
 * is a section number at eyebrow size or a standfirst at subhead size, neither
 * of which is large text, so 4.5:1 is the floor there.
 *
 * The debt list is the surfaces that clear 3:1 but not 4.5:1. It is a to-do
 * list for docs/ROADMAP.md 10 "Every theme against every slide type", not a
 * configuration: the test fails if an entry is left in after it is paid, so
 * the list cannot rot.
 */
const INK_FLOOR = 3.0;    // display type on its own surface
const MUTED_FLOOR = 4.5;  // eyebrow and subhead are not large text

const OWED = new Set([
  "bauhaus section",                  // 4.35:1
  "blueprint section",                // 3.91:1
  "brutalist-paper section",          // 3.70:1
  "chalkboard section",               // 3.97:1
  "claymorphism section",             // 3.52:1
  "corporate-alegria section",        // 3.41:1
  "corporate-clean-blue section",     // 4.42:1
  "glassmorphism section",            // 3.49:1
  "gradient-mesh-dark section",       // 3.03:1
  "material-you section",             // 3.69:1
  "memphis-postmodern section",       // 3.21:1
  "minimal-muji section",             // 3.05:1
  "mono-terminal-light section",      // 3.81:1
  "nature-organic section",           // 3.52:1
  "neubrutalism section",             // 3.06:1
  "neumorphism section",              // 3.55:1
  "newsprint section",                // 4.48:1
  "notion-clean section",             // 3.96:1
  "paper-pastel section",             // 4.21:1
  "risograph section",                // 3.07:1
  "soft-glass-light section",         // 3.55:1
  "sunset section",                   // 3.90:1
  "swiss-international section",      // 3.86:1
  "warm-humanist section",            // 3.25:1
].map((s) => s.trim()));

async function surfaces() {
  const out = [];
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    for (const surface of ["title", "section"]) {
      out.push({ key: `${name} ${surface}`, ...theme.surfaces[surface] });
    }
  }
  return out;
}

test("every title and divider surface carries its own headline", async () => {
  const bad = (await surfaces())
    .map((s) => ({ key: s.key, ratio: contrast(s.ink, s.bg) }))
    .filter((s) => s.ratio < INK_FLOOR)
    .map((s) => `${s.key}: headline ${s.ratio.toFixed(2)}:1`);
  assert.deepEqual(bad, [], `divider or title headline below ${INK_FLOOR}:1`);
});

test("every title and divider surface carries its secondary text", async () => {
  const unexpected = [], paid = [];
  for (const s of await surfaces()) {
    const ratio = contrast(s.muted, s.bg);
    // Nothing may fall below the headline floor, recorded as debt or not:
    // below that the text is not muted, it is gone.
    assert.ok(ratio >= INK_FLOOR, `${s.key}: secondary text at ${ratio.toFixed(2)}:1 is not muted, it is absent`);
    if (ratio < MUTED_FLOOR && !OWED.has(s.key)) unexpected.push(`${s.key}: ${ratio.toFixed(2)}:1`);
    if (ratio >= MUTED_FLOOR && OWED.has(s.key)) paid.push(s.key);
  }
  assert.deepEqual(unexpected, [], `secondary text below ${MUTED_FLOOR}:1 and not recorded as debt`);
  assert.deepEqual(paid, [], "the debt list names surfaces that now pass — delete those lines");
});
