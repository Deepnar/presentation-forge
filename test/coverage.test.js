import { test } from "node:test";
import assert from "node:assert/strict";
import { COVERING_THEMES, coverageReport, allThemeNames } from "../src/coverage.js";

/**
 * The claim `src/coverage.js` makes, held to.
 *
 * A visual sweep looks at the covering set and nothing else, on the grounds
 * that the layouts branch on composition axes rather than on themes. That is
 * only true while the set actually carries every axis value in the gallery — a
 * theme added with a frame or an opening none of them uses is a branch no
 * sweep will ever render, and the sweep will stay clean while it is broken.
 *
 * When this fails, add a theme to COVERING_THEMES. Do not widen the sweep to
 * all 34: that is 2,550 slides, nobody looks at them, and the sweep stops
 * happening at all.
 */

test("the covering themes exercise every composition axis value in the gallery", async () => {
  const { missing } = await coverageReport();
  assert.deepEqual(
    missing,
    [],
    `axis values no covering theme carries:\n${missing.map((m) => `  ${m.trait} (only on ${m.theme})`).join("\n")}`,
  );
});

test("no covering theme is there for nothing", async () => {
  const { redundant } = await coverageReport();
  assert.deepEqual(
    redundant,
    [],
    `these carry no axis value another already covers, so their slides are looked at for nothing: ${redundant.join(", ")}`,
  );
});

test("every covering theme exists on disk", async () => {
  const names = new Set(await allThemeNames());
  const gone = COVERING_THEMES.filter((t) => !names.has(t));
  assert.deepEqual(gone, [], `named in COVERING_THEMES but not in themes/: ${gone.join(", ")}`);
});
