// Phase 2/3 slice: intent -> scene is deterministic and recipe-correct.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeck, compileSlide, selectRecipe } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

describe("v2 compiler", () => {
  it("is byte-deterministic for the same intent", async () => {
    const design = await warmDesign();
    const a = JSON.stringify(compileDeck(sampleDeckIntent(), design));
    const b = JSON.stringify(compileDeck(sampleDeckIntent(), design));
    assert.equal(a, b);
  });

  it("selects recipes from block kinds without hints", () => {
    const kinds = (blocks) => selectRecipe({ id: "s", purpose: "p", blocks });
    assert.equal(kinds([{ id: "b", kind: "chart" }]), "chart");
    assert.equal(kinds([{ id: "b", kind: "image" }]), "media");
    assert.equal(kinds([{ id: "a", kind: "text" }]), "title");
    assert.equal(
      kinds([{ id: "a", kind: "text", label: "L" }, { id: "b", kind: "text", label: "R" }]),
      "comparison",
    );
  });

  it("honours explicit layout hints", () => {
    const slide = { id: "s", purpose: "p", blocks: [{ id: "b", kind: "list", items: ["a"] }], layoutHint: { recipe: "media" } };
    assert.equal(selectRecipe(slide), "media");
  });

  it("every recipe starts managed with stable element ids", async () => {
    const design = await warmDesign();
    for (const slide of sampleDeckIntent().slides) {
      const scene = compileSlide(slide, design);
      assert.equal(scene.layoutState, "managed");
      for (const el of scene.elements) assert.match(el.id, new RegExp(`^${slide.id}:`));
    }
  });

  it("chart scene carries editable series data, not a picture", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[4];
    const scene = compileSlide(slide, design);
    const chart = scene.elements.find((e) => e.kind === "chart");
    assert.ok(chart);
    assert.deepEqual(chart.chart.series[0].values, [1.2, 12.5, 0.4]);
  });
});
