import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "../src/validate.js";
import { buildOpsSchema, applyOps, scrubLayoutOps, layoutForTypeChange } from "../src/ai/ops.js";
import { slideCatalog, catalogForType, deckSchema } from "../src/ai/catalog.js";
import { sweepDeck, insertSlide, convertSlide, compatibleRemap } from "../src/ai/generate.js";
import { fieldLengthPass } from "../src/ai/fieldlength.js";

/**
 * Slice 1 of the full-free canvas: the human-only layout-override layer as
 * data. Content stays semantic; a per-slide human `layout` block wins at
 * render time (slice 2). The model grammars exclude it everywhere, and every
 * AI pass preserves it verbatim or refuses the slide with a visible reason.
 *
 * These tests hold the data contract and the preservation rule. They use stub
 * chats throughout — no model is called, because what is under test is what
 * the pipeline does with (or refuses from) the model, not what the model says.
 */

const LAYOUT = {
  elements: [{ target: "body", x: 1, y: 2, w: 5, h: 3 }],
  paint: [
    { target: "body", fill: "palette.accent" },
    { target: "headline", color: "#FF0000" },
  ],
  textboxes: [{ text: "spoken aside", x: 10, y: 5, w: 2, h: 1 }],
  images: [{ asset: "assets/photo.png", x: 10, y: 1, w: 2, h: 2 }],
};

const slideWithLayout = (over = {}) => ({
  type: "bullets",
  section: 0,
  headline: "Points",
  bullets: ["one", "two", "three", "four"],
  overrides: structuredClone(LAYOUT),
  ...over,
});

/* ------------------------------------------------------- schema + validation */

test("a full layout block validates", async () => {
  const deck = { title: "T", slides: [slideWithLayout()] };
  assert.deepEqual(await validateDeck(deck), { ok: true, errors: [], structural: [], tooLong: [] });
});

test("a slide without layout still validates — the block is optional", async () => {
  const { overrides, ...bare } = slideWithLayout();
  assert.ok((await validateDeck({ title: "T", slides: [bare] })).ok);
  assert.ok(overrides, "the fixture carries a block");
});

for (const [name, mutate] of [
  ["negative x", (l) => { l.elements[0].x = -1; }],
  ["geometry off the canvas", (l) => { l.elements[0].w = 99; }],
  ["unknown block key", (l) => { l.rotation = 30; }],
  ["empty target", (l) => { l.elements[0].target = ""; }],
  ["free-text paint value", (l) => { l.paint[0].fill = "red"; }],
  ["empty textbox", (l) => { l.textboxes[0].text = ""; }],
  ["oversized type", (l) => { l.textboxes[0].size = 200; }],
  ["empty asset", (l) => { l.images[0].asset = ""; }],
]) {
  test(`validation refuses a layout with ${name}`, async () => {
    const slide = slideWithLayout();
    mutate(slide.overrides);
    const r = await validateDeck({ title: "T", slides: [slide] });
    assert.equal(r.ok, false, "expected a structural failure");
    assert.ok(r.structural.length > 0, "expected a structural error naming the field");
  });
}

/* ------------------------------------------------------- grammar exclusion */

test("no model-facing grammar can name the overrides field", async () => {
  // "layout" still appears in guidance prose ("the layout is a four-up grid"),
  // so match field position: after a separator, followed by a shape paren, a
  // comma, or the end of the list.
  const fieldRef = /([,(] *)overrides( \(|,|\)|$)/m;
  const catalog = await slideCatalog();
  assert.ok(!fieldRef.test(catalog), "slide catalog lists overrides as a field");
  for (const t of ["bullets", "freeform", "chart", "diagram"]) {
    assert.ok(!fieldRef.test(await catalogForType(t)), `${t} catalog lists overrides as a field`);
  }

  const schema = await deckSchema();
  for (const opts of [{ slideCount: 0 }, { slideCount: 3 }, { slideCount: 3, onlyTypes: ["bullets"] }]) {
    const g = buildOpsSchema(schema, opts);
    const slideProps = g.properties.ops.items.properties.slide.properties;
    // Note: `layout` legitimately appears here — `diagram` owns it as a
    // content field (vertical|horizontal|radial). The human block is `overrides`.
    assert.ok(!("overrides" in slideProps), `slide grammar names overrides (${JSON.stringify(opts)})`);
    const patch = g.properties.ops.items.properties.patch;
    if (patch?.properties) assert.ok(!("overrides" in patch.properties), "patch grammar names overrides");
  }
});

/* ------------------------------------------------------- ops scrub + preserve */

test("scrubLayoutOps strips model-written layout and reports it", () => {
  const ops = [
    { op: "update_slide", index: 0, patch: { headline: "H", overrides: structuredClone(LAYOUT) } },
    { op: "replace_slide", index: 1, slide: { type: "bullets", overrides: structuredClone(LAYOUT) } },
    { op: "append_slide", slide: { type: "bullets", headline: "H" } },
  ];
  const { ops: out, scrubbed } = scrubLayoutOps(ops);
  assert.equal(out[0].patch.overrides, undefined);
  assert.equal(out[1].slide.overrides, undefined);
  assert.equal(out[0].patch.headline, "H", "content survives the scrub");
  assert.deepEqual(scrubbed.map((s) => s.index), [0, 1]);
});

test("replace_slide preserves the human block; update_slide cannot touch it", () => {
  const deck = { title: "T", slides: [slideWithLayout()] };
  const replaced = applyOps(deck, [{ op: "replace_slide", index: 0, slide: { type: "bullets", headline: "New" } }]);
  assert.ok(replaced.ok);
  assert.deepEqual(replaced.deck.slides[0].overrides, LAYOUT, "replace keeps the human block");

  const patched = applyOps(deck, [{ op: "update_slide", index: 0, patch: { headline: "New", overrides: { elements: [] } } }]);
  assert.ok(patched.ok);
  assert.deepEqual(patched.deck.slides[0].overrides, LAYOUT, "a model patch cannot rewrite it");
  assert.equal(patched.deck.slides[0].headline, "New");
});

test("move and duplicate carry the block with the slide", () => {
  const deck = { title: "T", slides: [slideWithLayout(), { type: "bullets", headline: "Plain" }] };
  const moved = applyOps(deck, [{ op: "move_slide", index: 0, to: 2 }]);
  assert.deepEqual(moved.deck.slides[1].overrides, LAYOUT);
  const duped = applyOps(deck, [{ op: "duplicate_slide", index: 0 }]);
  assert.deepEqual(duped.deck.slides[1].overrides, LAYOUT, "a duplicate keeps the manual work");
});

test("layoutForTypeChange drops geometry and keeps the rest", () => {
  assert.deepEqual(
    layoutForTypeChange(LAYOUT),
    { paint: LAYOUT.paint, textboxes: LAYOUT.textboxes, images: LAYOUT.images },
    "elements go, everything else stays",
  );
  assert.equal(layoutForTypeChange({ elements: [{ target: "body" }] }), undefined, "geometry-only leaves no block");
  assert.equal(layoutForTypeChange(undefined), undefined);
});

/* ------------------------------------------------------- per-pass preservation */

test("sweepDeck preserves the block verbatim through a rewrite", async () => {
  const deck = { title: "T", slides: [slideWithLayout()] };
  const chat = async () => ({
    data: { ops: [{ op: "update_slide", index: 0, patch: { headline: "Points, tightened" } }] },
  });
  const r = await sweepDeck({ deck, density: "balanced", model: "mock", chat });
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT);
  assert.equal(r.deck.slides[0].headline, "Points, tightened");
});

test("sweepDeck preserves the block even when the model invents one", async () => {
  const deck = { title: "T", slides: [slideWithLayout()] };
  const chat = async () => ({
    data: {
      ops: [{
        op: "update_slide",
        index: 0,
        patch: { headline: "Points", overrides: { elements: [{ target: "body", x: 0, y: 0, w: 1, h: 1 }] } },
      }],
    },
  });
  const r = await sweepDeck({ deck, density: "balanced", model: "mock", chat });
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT, "the model's geometry never lands");
});

test("fieldLengthPass preserves the block through a rewrite", async () => {
  const deck = {
    title: "T",
    theme: "warm-humanist",
    slides: [slideWithLayout({ bullets: ["one", "two", "three", "a fourth point that runs far past its cap and ends mid-sentence…"] })],
  };
  const chat = async () => ({
    data: {
      ops: [{
        op: "update_slide",
        slide: { type: "bullets", headline: "Points", bullets: ["one", "two", "three", "a fourth point, complete."] },
      }],
    },
  });
  const r = await fieldLengthPass({ deck, model: "mock", chat });
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT);
});

test("insertSlide never seats a model-written block on the new slide", async () => {
  const deck = {
    title: "T",
    slides: [
      { type: "title", headline: "T" },
      { type: "bullets", headline: "A", bullets: ["a", "b", "c", "d"] },
    ],
  };
  const chat = async () => ({
    data: {
      ops: [{
        op: "append_slide",
        slide: { type: "bullets", headline: "B", bullets: ["e", "f", "g", "h"], overrides: structuredClone(LAYOUT) },
      }],
    },
  });
  const r = await insertSlide({
    deck,
    plan: { title: "T", sections: [] },
    after: 1,
    type: "bullets",
    purpose: "one more point",
    chat,
  });
  assert.equal(r.slide.overrides, undefined, "an inserted slide starts un-overridden");
});

test("a compatible remap drops geometry and keeps paint", () => {
  const out = compatibleRemap(slideWithLayout(), "checklist");
  assert.equal(out.type, "checklist");
  assert.equal(out.overrides.elements, undefined, "geometry cannot transfer between layouts");
  assert.deepEqual(out.overrides.paint, LAYOUT.paint);
  assert.deepEqual(out.overrides.textboxes, LAYOUT.textboxes);
});

test("a compatible remap of a geometry-only block leaves no block", () => {
  const slide = slideWithLayout({ overrides: { elements: [{ target: "body", x: 1, y: 1, w: 2, h: 2 }] } });
  const out = compatibleRemap(slide, "checklist");
  assert.equal(out.overrides, undefined);
});

test("convertSlide via model keeps paint, drops geometry and model layout", async () => {
  const deck = { title: "T", sections: ["S"], slides: [slideWithLayout()] };
  const chat = async () => ({
    data: {
      ops: [{
        op: "replace_slide",
        index: 0,
        slide: {
          type: "pyramid",
          headline: "P",
          levels: [{ label: "a" }, { label: "b" }, { label: "c" }],
          overrides: { elements: [{ target: "x", x: 0, y: 0, w: 1, h: 1 }] },
        },
      }],
    },
  });
  const r = await convertSlide({ deck, index: 0, targetType: "pyramid", model: "mock", chat });
  assert.equal(r.method, "model");
  assert.equal(r.slide.overrides.elements, undefined, "geometry cannot transfer between layouts");
  assert.deepEqual(r.slide.overrides.paint, LAYOUT.paint, "paint survives the swap");
});
