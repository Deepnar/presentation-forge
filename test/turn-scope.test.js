import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpsSchema } from "../src/ai/ops.js";
import { deckSchema } from "../src/ai/catalog.js";
import { runTurn } from "../src/ai/turn.js";

/**
 * `buildOpsSchema` assigns every selected type's properties into one flat
 * object, so a property name that two types share belongs to whichever was
 * walked last. That is harmless while a turn really may write any type, and
 * wrong the moment a caller knows which type it is editing.
 *
 * Thirteen slide types declare `items`. Asked to repair a clipped card body on
 * a `feature-grid`, the fix turn was handed `contact`'s `{label, value}` items
 * and its output failed validation with `missing required field "title"`. The
 * model could not have got it right: constrained decoding made the correct
 * answer unrepresentable and the incorrect one mandatory.
 */

const itemsOf = (schema) => schema.properties.ops.items.properties.patch.properties.items;

test("an unscoped turn carries one type's `items` shape for all thirteen", async () => {
  const merged = itemsOf(buildOpsSchema(await deckSchema(), { slideCount: 12 }));
  // Not asserting WHICH type wins — that is schema order, and pinning it would
  // fail for the wrong reason. The point is that one shape stands for all.
  assert.equal(merged.items.type, "object");
  assert.ok(merged.items.required?.length, "and it brings its own required keys");
});

test("scoping to feature-grid gives feature-grid's items, not another type's", async () => {
  const scoped = itemsOf(buildOpsSchema(await deckSchema(), {
    slideCount: 12,
    onlyTypes: ["feature-grid"],
  }));
  assert.deepEqual(scoped.items.required, ["title"]);
  assert.deepEqual(
    Object.keys(scoped.items.properties).sort(),
    ["body", "icon", "title"],
    "the card shape the type actually declares",
  );
  assert.equal(scoped.items.properties.body.maxLength, 53);
});

test("runTurn passes its type scope through to the grammar", async () => {
  const deck = {
    title: "t",
    slides: [{ type: "feature-grid", headline: "h", items: [{ title: "a" }, { title: "b" }] }],
  };
  let seen = null;
  const chat = async ({ schema }) => {
    seen = schema;
    // A patch in the RIGHT shape — the one the unscoped grammar forbade.
    return {
      data: {
        ops: [{
          op: "update_slide",
          index: 0,
          patch: { items: [{ title: "a", body: "A whole sentence." }, { title: "b", body: "Another." }] },
        }],
      },
    };
  };

  const turn = await runTurn({ deck, instruction: "shorten", onlyTypes: ["feature-grid"], chat });
  assert.ok(turn.ok, `the scoped shape validates: ${JSON.stringify(turn.errors)}`);
  assert.deepEqual(itemsOf(seen).items.required, ["title"], "the turn built a feature-grid grammar");
  assert.equal(turn.deck.slides[0].items[0].body, "A whole sentence.");
});

test("no scope still lets a turn write any type — chat must stay unrestricted", async () => {
  const deck = { title: "t", slides: [{ type: "bullets", headline: "h", bullets: ["a", "b", "c", "d"] }] };
  let seen = null;
  const chat = async ({ schema }) => {
    seen = schema;
    return { data: { ops: [] } };
  };
  await runTurn({ deck, instruction: "nothing", chat });
  const type = seen.properties.ops.items.properties.slide.properties.type;
  assert.ok(!type?.enum || type.enum.length > 20, "every type stays available to an unscoped turn");
});

/**
 * The critic names its slides and so gets `onlyTypes`. Chat has the same
 * knowledge and was not using it: the panel's selection reaches `runTurn` as
 * `onlySlides`, which was only ever applied AFTER the model answered, to
 * filter the ops it produced. The grammar it answered against was still the
 * flat merge of every type.
 */

test("a selection narrows the patch grammar to the selected slides' own types", async () => {
  const deck = {
    title: "t",
    slides: [
      { type: "bullets", headline: "h", bullets: ["a", "b", "c"] },
      { type: "feature-grid", headline: "h", items: [{ title: "a" }, { title: "b" }] },
    ],
  };
  let seen = null;
  const chat = async ({ schema }) => { seen = schema; return { data: { ops: [] } }; };

  await runTurn({ deck, instruction: "shorten this", onlySlides: [1], chat });
  assert.deepEqual(
    itemsOf(seen).items.required, ["title"],
    "the selected slide is a feature-grid, so `items` should be its shape",
  );
});

test("a selection does not stop the turn adding a slide of another type", async () => {
  // scopeOpsToSelection lets append and insert through on purpose, so
  // narrowing the full-slide grammar with the patch grammar would trade one
  // silent failure for another.
  const deck = {
    title: "t",
    slides: [{ type: "feature-grid", headline: "h", items: [{ title: "a" }, { title: "b" }] }],
  };
  let seen = null;
  const chat = async ({ schema }) => { seen = schema; return { data: { ops: [] } }; };

  await runTurn({ deck, instruction: "add a chart after this", onlySlides: [0], chat });
  const type = seen.properties.ops.items.properties.slide.properties.type;
  assert.ok(!type?.enum || type.enum.length > 20, "every type stays appendable under a selection");
});

test("an empty or out-of-range selection falls back to the unscoped grammar", async () => {
  const deck = { title: "t", slides: [{ type: "bullets", headline: "h", bullets: ["a", "b", "c"] }] };
  for (const onlySlides of [null, [], [99]]) {
    let seen = null;
    const chat = async ({ schema }) => { seen = schema; return { data: { ops: [] } }; };
    await runTurn({ deck, instruction: "x", onlySlides, chat });
    assert.ok(
      itemsOf(seen),
      `a selection of ${JSON.stringify(onlySlides)} should leave the full patch grammar in place`,
    );
  }
});

test("an explicit onlyTypes still wins over the selection", async () => {
  // The critic passes both: it names slides AND the types its findings concern.
  const deck = {
    title: "t",
    slides: [{ type: "bullets", headline: "h", bullets: ["a", "b", "c"] }],
  };
  let seen = null;
  const chat = async ({ schema }) => { seen = schema; return { data: { ops: [] } }; };

  await runTurn({ deck, instruction: "x", onlySlides: [0], onlyTypes: ["feature-grid"], chat });
  const type = seen.properties.ops.items.properties.slide.properties.type;
  assert.deepEqual(type, { enum: ["feature-grid"] });
  assert.deepEqual(itemsOf(seen).items.required, ["title"]);
});
