import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, applyOp, buildOpsSchema, diffDecks } from "../src/ai/ops.js";
import { deckSchema } from "../src/ai/catalog.js";
import { DIVIDER_TYPES } from "../src/ai/team.js";

const S = (type, i) => ({ type, headline: `slide ${i}`, notes: `n${i}` });
const deck = { title: "t", slides: [S("bullets", 1), S("cards", 2), S("quote", 3)] };

test("applyOps applies structural ops transactionally", () => {
  const { ok, deck: out, changes } = applyOps(deck, [
    { op: "duplicate_slide", index: 0 },
    { op: "delete_slide", index: 2 },
  ]);
  assert.equal(ok, true);
  assert.deepEqual(out.slides.map((s) => s.headline), ["slide 1", "slide 1", "slide 3"]);
  assert.equal(changes.length, 2);
});

test("applyOps refuses to empty the deck via delete", () => {
  const only = { slides: [S("title", 1)] };
  const r = applyOps(only, [{ op: "delete_slide", index: 0 }]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("refuses")));
});

test("duplicate_slide out of range fails and leaves the deck untouched", () => {
  const before = JSON.stringify(deck.slides);
  const r = applyOps(deck, [{ op: "duplicate_slide", index: 99 }]);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(deck.slides), before);
});

test("applyOp refuses an unknown op", () => {
  assert.throws(() => applyOp({ slides: [] }, { op: "nope" }), /Unknown op/);
});

test("buildOpsSchema includes duplicate_slide once a deck has slides", async () => {
  const schema = await deckSchema();
  const forEmpty = buildOpsSchema(schema, { slideCount: 0 });
  const forDeck = buildOpsSchema(schema, { slideCount: 4 });
  const opEnums = (s) => s.properties.ops.items.properties.op.enum;
  assert.ok(!opEnums(forEmpty).includes("duplicate_slide"));
  assert.ok(opEnums(forDeck).includes("duplicate_slide"));
});

test("buildOpsSchema can remove a shared field — dividers lose presenter", async () => {
  const schema = await deckSchema();
  const slideProps = (s) => s.properties.ops.items.properties.slide.properties;
  assert.ok(slideProps(buildOpsSchema(schema, { slideCount: 0, onlyTypes: ["bullets"] })).presenter);
  assert.equal(
    slideProps(buildOpsSchema(schema, { slideCount: 0, onlyTypes: ["section"], excludeProps: ["presenter"] })).presenter,
    undefined,
  );
});

test("the divider set covers the non-content types, and nothing else", () => {
  assert.deepEqual([...DIVIDER_TYPES].sort(), ["chapter", "closing", "epigraph", "section", "title"]);
});

test("diffDecks reads a new slide as added", () => {
  const after = { slides: [...deck.slides, S("stats", 4)] };
  const d = diffDecks(deck, after);
  assert.ok(d.some((c) => c.kind === "added"));
});
