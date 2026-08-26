import { test } from "node:test";
import assert from "node:assert/strict";
import { themeMatrix, signature } from "../src/themematrix.js";

/**
 * Every theme against every slide type, as a permanent gate.
 *
 * A layout or margin change is cheap to make in one theme and expensive to
 * notice in another: the fitter drops to the readable floor, refuses to go
 * below it, and the slide ships with a body missing. The .pptx still writes,
 * so nothing fails. This runs the whole 38 x 75 product in about three seconds
 * and holds the failure set exactly where it is.
 *
 * ALLOWED is a debt list, not a configuration. Adding a line to it is a
 * decision to ship a slide that cannot seat its text; removing one is the
 * point. The test fails in both directions — a new failure is a regression, a
 * stale entry is a claim about the product that is no longer true.
 */
const ALLOWED = [
  // The vertical spine budgets its six step bodies to within ~0.02in of the
  // readable floor, so a theme with slightly larger body type loses one.
  // docs/ROADMAP.md 10: "flow's vertical spine is one line from failing".
  "chalkboard flow",
  "editorial-serif-light flow",
  "high-contrast-mono flow",
  "minimal-muji flow",
  "minimal-warm flow",
  // Branch captions sit in the narrowest cell any layout allocates; mono and
  // condensed faces measure wider than the budget assumes.
  "blueprint branching-flow",
  "high-contrast-mono branching-flow",
  "retro-crt branching-flow",
  "sci-fi-hud branching-flow",
  // Two column headings on one row, in a monospace face.
  "mono-terminal-light before-after",
  "retro-crt before-after",
  "retro-terminal before-after",
];

test("every theme seats every slide type at a readable size", async () => {
  const result = await themeMatrix();

  const failed = result.runs.filter((r) => r.failed);
  assert.equal(failed.length, 0, `render threw: ${failed.map((r) => `${r.theme}: ${r.problems[0].detail}`).join("; ")}`);

  const now = signature(result);
  const tally = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const have = tally(now), want = tally([...ALLOWED].sort());

  const unexpected = [...have].filter(([k, n]) => n > (want.get(k) ?? 0)).map(([k]) => k);
  assert.deepEqual(
    unexpected, [],
    `new fit failure(s): ${unexpected.join(", ")}\n` +
    `Fix the layout, or record the debt in ALLOWED with why it is acceptable.`,
  );

  const stale = [...want].filter(([k, n]) => n > (have.get(k) ?? 0)).map(([k]) => k);
  assert.deepEqual(
    stale, [],
    `ALLOWED names failure(s) that no longer happen: ${stale.join(", ")}\n` +
    `Delete those lines — the list is debt, and this one is paid.`,
  );
});
