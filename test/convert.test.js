import { test } from "node:test";
import assert from "node:assert/strict";
import { convertSlide, compatibleRemap } from "../src/ai/generate.js";

const DECK = {
  title: "Test",
  sections: ["Intro"],
  slides: [
    { type: "bullets", section: 0, presenter: "Alice", headline: "Points", bullets: ["a", "b", "c"] },
    { type: "cards", section: 0, presenter: "Bob", headline: "Facts", cards: [{ title: "A", body: "body" }, { title: "B", body: "more" }] },
  ],
};

test("compatibleRemap maps bullets → numbered-list losslessly", () => {
  const out = compatibleRemap(DECK.slides[0], "numbered-list");
  assert.equal(out.type, "numbered-list");
  assert.deepEqual(out.items, ["a", "b", "c"]);
  assert.equal(out.presenter, "Alice");
});

test("compatibleRemap maps cards → feature-grid", () => {
  const out = compatibleRemap(DECK.slides[1], "feature-grid");
  assert.equal(out.type, "feature-grid");
  assert.deepEqual(out.items, [{ title: "A", body: "body" }, { title: "B", body: "more" }]);
});

test("compatibleRemap returns null for an incompatible pair", () => {
  assert.equal(compatibleRemap(DECK.slides[0], "pyramid"), null);
});

test("convertSlide remaps a compatible type without a model", async () => {
  const r = await convertSlide({
    deck: DECK,
    index: 0,
    targetType: "checklist",
    model: "mock",
    chat: async () => { throw new Error("model must not be called for a remap"); },
  });
  assert.equal(r.method, "remap");
  assert.equal(r.slide.type, "checklist");
  assert.equal(r.slide.presenter, "Alice");
  assert.deepEqual(r.slide.items.map((i) => i.text), ["a", "b", "c"]);
});

test("convertSlide uses the model when no compatible remap exists", async () => {
  let called = false;
  const chat = async ({ schema }) => {
    called = true;
    const target = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    assert.equal(target, "pyramid");
    return {
      data: {
        ops: [{ op: "replace_slide", index: 0, slide: { type: "pyramid", headline: "New pyramid", levels: [{ label: "base" }, { label: "mid" }, { label: "top" }] } }],
      },
    };
  };
  const r = await convertSlide({
    deck: DECK,
    index: 0,
    targetType: "pyramid",
    model: "mock",
    chat,
  });
  assert.equal(called, true);
  assert.equal(r.method, "model");
  assert.equal(r.slide.type, "pyramid");
  assert.equal(r.slide.presenter, "Alice"); // presenter preserved
  assert.equal(r.slide.section, 0);
});

test("convertSlide preserves presenter even when the model omits it", async () => {
  const chat = async () => ({
    data: { ops: [{ op: "replace_slide", index: 1, slide: { type: "feature-grid", headline: "Facts", items: [{ title: "A", body: "x" }] } }] },
  });
  const r = await convertSlide({ deck: DECK, index: 1, targetType: "feature-grid", model: "mock", chat });
  assert.equal(r.slide.presenter, "Bob");
});
