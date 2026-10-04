// Legacy bridge: old decks stay readable; the six slice types map to intent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { legacySlideToIntent, legacyDeckToIntent } from "../packages/model/legacy.js";
import { validateDeckIntent } from "../packages/model/intent.js";

const LEGACY = [
  { type: "title", headline: "Solid-state batteries" },
  { type: "bullets", headline: "Problems", bullets: ["one", "two", "three", "four"] },
  {
    type: "compare", headline: "Liquid vs solid",
    left: { title: "Liquid", body: "Mature" }, right: { title: "Solid", body: "Safe" }, verdict: "Solid wins",
  },
  { type: "image-text", headline: "Stack", image: "assets/cell.png", side: "left", body: ["layer one", "layer two"] },
  {
    type: "chart", headline: "Conductivity",
    chart: { kind: "bar", categories: ["A", "B"], series: [{ name: "mS/cm", values: [1, 2] }] },
  },
  { type: "flow", headline: "Build", steps: [{ title: "Mix", body: "Blend" }, { title: "Press" }] },
];

describe("v2 legacy bridge", () => {
  it("maps all six slice types to valid intent", async () => {
    const { intent, unmapped } = legacyDeckToIntent({ title: "Legacy", slides: LEGACY });
    assert.deepEqual(unmapped, []);
    assert.equal(intent.slides.length, 6);
    const { ok, errors } = await validateDeckIntent(intent);
    assert.equal(ok, true, errors.join("\n"));
  });

  it("returns null for types with no recipe yet instead of degrading", () => {
    assert.equal(legacySlideToIntent({ type: "venn", headline: "V" }, 0), null);
    const { intent, unmapped } = legacyDeckToIntent({ title: "L", slides: [{ type: "venn", headline: "V" }] });
    assert.equal(intent.slides.length, 0);
    assert.deepEqual(unmapped, [{ index: 0, type: "venn" }]);
  });

  it("comparison keeps both sides and the verdict", () => {
    const out = legacySlideToIntent(LEGACY[2], 2);
    assert.equal(out.blocks.length, 3);
    assert.equal(out.layoutHint.recipe, "comparison");
  });
});
