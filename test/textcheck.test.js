import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { ROOT } from "../src/paths.js";
import { textCheck, wordsOf, slideStrings, substitutedFaces } from "../src/textcheck.js";
import { loadTheme } from "../src/theme.js";
import { specimenDeck } from "../src/specimens.js";

const run = promisify(execFile);

/**
 * The words have to still be there, and still be spelled the way they were
 * written.
 *
 * Two failures get past everything else. A word wider than its column is
 * broken in the middle of itself at raster time — every fragment fits, so the
 * fitter is satisfied and the .pptx is valid. And a layout can simply never
 * draw a field the schema lets the model fill: `funnel` accepted a `body` per
 * stage and dropped all of them, which no test and no thumbnail showed.
 *
 * Rasterising and reading the text back is the only way to see either. This
 * runs LibreOffice, so it covers the two frames that bracket the range — the
 * default full measure and the narrowest sidebar — rather than all 34 themes.
 * `node tools/textcheck.mjs` is the full sweep, and takes minutes.
 */

// Types whose columns are narrowest, plus the ones that carry a long compound.
const AT_RISK = [
  "cards", "stacked-list", "kpi-dashboard", "data-cards", "team-grid",
  "before-after", "equation", "funnel", "feature-grid", "compare", "pros-cons",
  "timeline", "journey", "attribution", "glossary", "faq", "flow",
  "branching-flow", "bullets", "agenda",
];

// The widest measure the product ships and the narrowest.
const BRACKET = ["notion-clean", "sci-fi-hud"];

async function have(bin, args) {
  try { await run(bin, args, { timeout: 20_000 }); return true; } catch { return false; }
}

test("slideStrings skips the fields that are not text", () => {
  const strings = slideStrings({
    type: "journey", headline: "The onboarding journey", image: "photo.png",
    stages: [{ label: "Discovery", body: "excited about the promise", sentiment: "positive" }],
    notes: "never rendered", left: "__placeholder__",
  });
  assert.ok(strings.includes("The onboarding journey"));
  assert.ok(strings.includes("excited about the promise"));
  for (const skipped of ["photo.png", "positive", "never rendered", "__placeholder__", "journey"]) {
    assert.ok(!strings.includes(skipped), `${skipped} should not be checked as slide text`);
  }
});

test("wordsOf checks compounds in parts, since a hyphen is a legal wrap point", () => {
  assert.deepEqual(wordsOf("edge-to-core latency"), ["latency"]);
  assert.deepEqual(wordsOf("Acknowledgements"), ["acknowledgements"]);
  assert.deepEqual(wordsOf("a b cd"), []);
});

test("every declared word survives onto the page", async (t) => {
  if (!(await have("soffice", ["--version"])) || !(await have("pdftotext", ["-v"]))) {
    t.skip("needs LibreOffice and pdftotext");
    return;
  }
  // This reads the rasterised page, so it only means anything when the page
  // was rasterised in the theme's own faces. On a machine with the fonts
  // missing, LibreOffice substitutes a wider one and a word that fits breaks —
  // a fact about that machine, not about the layout. The image job in CI is
  // what asserts the fonts are installed; see docs/TRAPS.md.
  for (const theme of BRACKET) {
    const missing = await substitutedFaces(await loadTheme(theme));
    if (missing.length) {
      t.skip(`${theme} would rasterise in substituted faces (${missing.join(", ")}); run npm run fonts`);
      return;
    }
  }

  const base = await specimenDeck();
  base.title = "The shape of an argument";
  base.subtitle = "A neutral specimen";
  base.slides = AT_RISK.map((type) => base.slides.find((s) => s.type === type)).filter(Boolean);
  assert.equal(base.slides.length, AT_RISK.length, "the specimen no longer carries every at-risk type");

  const work = path.join(ROOT, ".themeaudit", "textcheck-test");
  await rm(work, { recursive: true, force: true });

  for (const theme of BRACKET) {
    const dir = path.join(work, theme);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "meta.yaml"), "chrome:\n  branding: none\n", "utf8");
    const r = await textCheck({
      deck: structuredClone(base), deckDir: dir, themeName: theme,
      out: path.join(dir, "deck.pptx"),
    });
    const lost = r.missing.map((m) => `slide ${m.index} (${m.type}): "${m.word ?? m.note}"`);
    assert.deepEqual(lost, [], `${theme}: word(s) broken mid-word or never drawn`);
  }
});
