import { test } from "node:test";
import assert from "node:assert/strict";
import { listThemes, loadTheme } from "../src/theme.js";
import { contrast, ensureContrast } from "../src/chartpalette.js";

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
 * The debt list is the surfaces that clear 3:1 but not 4.5:1. It reads as a
 * to-do list and mostly is not one: `tools/contrast-debt.mjs` splits it three
 * ways, and only five of the original twenty-four were payable.
 *
 * `muted` is a dimmed `ink`. It may move toward ink; it may not cross the
 * ground and come out dark on a saturated divider under white headline type,
 * because that is a different design rather than a repaired one. Under that
 * one constraint, twelve of these surfaces cannot be fixed by any token edit —
 * their `ink` is already pure white and pure white does not clear 4.5:1 against
 * the ground, so nothing dimmer can. Another seven are reachable only by moving
 * muted so far into ink that the two are the same colour, which pays the debt
 * by deleting the distinction it exists to express.
 *
 * So the nineteen that remain are a question about those backgrounds, not about
 * these tokens, and changing a divider ground is the theme's identity. Run the
 * tool before assuming an entry here is simply outstanding work.
 *
 * The list is still a to-do
 * list for docs/ROADMAP.md 10 "Every theme against every slide type", not a
 * configuration: the test fails if an entry is left in after it is paid, so
 * the list cannot rot.
 */
const INK_FLOOR = 3.0;    // display type on its own surface
const MUTED_FLOOR = 4.5;  // eyebrow and subhead are not large text

const OWED = new Set([
  "blueprint section",                // 3.91:1
  "brutalist-paper section",          // 3.70:1
  "claymorphism section",             // 3.52:1
  "corporate-alegria section",        // 3.41:1
  "glassmorphism section",            // 3.49:1
  "gradient-mesh-dark section",       // 3.03:1
  "material-you section",             // 3.69:1
  "memphis-postmodern section",       // 3.21:1
  "minimal-muji section",             // 3.05:1
  "mono-terminal-light section",      // 3.81:1
  "nature-organic section",           // 3.52:1
  "neubrutalism section",             // 3.06:1
  "neumorphism section",              // 3.55:1
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

/**
 * The THIRD surface a theme paints under its own text, and the one that was
 * missing: an ink-filled panel in light mode.
 *
 * `callout`, `takeaway` and `compare`'s verdict bar invert the ground locally
 * — a near-black panel on a light page — and then drew the label in
 * `accent_alt`, which is the theme's secondary accent FOR THE PAGE, not for
 * the panel. Every theme redefines that token under `dark:` precisely because
 * the ground changed there; nothing did the same for a panel that inverts on
 * its own. Seventeen of the thirty-four put the label under 3:1 against the
 * panel it sits on, and `swiss-international` drew #1D3557 navy on #141414.
 *
 * No sweep could see it. The .pptx writes, the fit is clean, the colours are
 * valid, and the geometry watcher only asks whether the box is on the slide.
 *
 * `onInk()` in src/layouts.js is what these assert; the floors are its two
 * arguments. There is no debt list because after the nudge there is no debt.
 */
test("an ink-filled panel carries the accent drawn on it", async () => {
  const bad = [];
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    const raw = theme.palette.accent_alt ?? theme.palette.accent;
    const label = contrast(ensureContrast(raw, theme.palette.ink, MUTED_FLOOR), theme.palette.ink);
    // A bullet marker is a graphical element, so WCAG's non-text floor applies.
    const marker = contrast(ensureContrast(raw, theme.palette.ink, INK_FLOOR), theme.palette.ink);
    if (label < MUTED_FLOOR) bad.push(`${name}: panel label ${label.toFixed(2)}:1`);
    if (marker < INK_FLOOR) bad.push(`${name}: panel marker ${marker.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [], "callout/takeaway/verdict ink panel cannot carry its own accent");
});

/**
 * The body text on those same panels is the theme's `surface` token, which is
 * chosen to sit UNDER ink rather than on it. It happens to be the far side of
 * the same contrast, so it passes everywhere — but nothing said so, and a
 * theme darkening its surface would break the panel silently.
 */
test("an ink-filled panel carries its body text", async () => {
  const bad = [];
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    const ratio = contrast(theme.palette.surface, theme.palette.ink);
    if (ratio < MUTED_FLOOR) bad.push(`${name}: panel body ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [], "ink panel body text below the muted floor");
});
