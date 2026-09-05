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

/* ------------------------------------------- the patch key space vs a selection */

/** Every property name declared by more than one slide type, with the distinct
 *  shapes hiding behind it. Derived, so it cannot drift from the schema. */
function collisions(schema) {
  const byName = new Map();
  for (const rule of schema.definitions.slide.allOf ?? []) {
    const t = rule.if?.properties?.type?.const;
    if (!t) continue;
    for (const [name, spec] of Object.entries(rule.then?.properties ?? {})) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ type: t, spec: JSON.stringify(spec) });
    }
  }
  return [...byName.entries()].filter(([, uses]) => new Set(uses.map((u) => u.spec)).size > 1);
}

const patchProps = (ops) => ops.properties.ops.items.properties.patch.properties;
const slideProps = (ops) => ops.properties.ops.items.properties.slide.properties;

test("the flat patch grammar really does collide — the reason patchTypes exists", async () => {
  const schema = await deckSchema();
  const clashing = collisions(schema);
  // Not asserting the exact count, which moves with the catalogue — asserting
  // that the problem is real and that `items` is the worst of it.
  assert.ok(clashing.length >= 10, `expected many colliding names, got ${clashing.length}`);
  const items = clashing.find(([name]) => name === "items");
  assert.ok(items, "`items` should be declared by several types");
  assert.ok(items[1].length >= 8, `items is declared by ${items[1].length} types`);
});

test("patchTypes gives a single-slide selection the exact shape, not the last one walked", async () => {
  const schema = await deckSchema();
  const own = new Map(
    (schema.definitions.slide.allOf ?? [])
      .filter((r) => r.if?.properties?.type?.const)
      .map((r) => [r.if.properties.type.const, r.then?.properties ?? {}]),
  );
  // Two types that both declare `items` with different element shapes.
  const [a, b] = ["feature-grid", "contact"];
  assert.notDeepEqual(own.get(a).items, own.get(b).items, "fixture types must actually collide");

  const flat = buildOpsSchema(schema, { slideCount: 4 });
  const scoped = buildOpsSchema(schema, { slideCount: 4, patchTypes: [a] });

  // The flat grammar hands every turn one arbitrary winner.
  assert.notDeepEqual(patchProps(flat).items, own.get(a).items);
  // The scoped one hands it the shape of the slide actually being patched.
  assert.deepEqual(patchProps(scoped).items, own.get(a).items);
});

test("patchTypes narrows the patch key space and leaves full slides alone", async () => {
  const schema = await deckSchema();
  const flat = buildOpsSchema(schema, { slideCount: 4 });
  const scoped = buildOpsSchema(schema, { slideCount: 4, patchTypes: ["feature-grid"] });

  assert.ok(
    Object.keys(patchProps(scoped)).length < Object.keys(patchProps(flat)).length,
    "a scoped patch should carry fewer keys",
  );
  // A turn scoped to one slide may still be asked to append a different type,
  // and scopeOpsToSelection lets append through — so the full-slide grammar
  // must not narrow with it.
  assert.deepEqual(Object.keys(slideProps(scoped)).sort(), Object.keys(slideProps(flat)).sort());
  assert.deepEqual(slideProps(scoped).type, slideProps(flat).type);
});

test("patchTypes over several selected slides covers all of their fields", async () => {
  const schema = await deckSchema();
  const types = ["feature-grid", "chronology", "data-table"];
  const ops = buildOpsSchema(schema, { slideCount: 8, patchTypes: types });
  const props = patchProps(ops);
  for (const rule of schema.definitions.slide.allOf ?? []) {
    const t = rule.if?.properties?.type?.const;
    if (!types.includes(t)) continue;
    for (const name of Object.keys(rule.then?.properties ?? {})) {
      assert.ok(props[name], `${t}.${name} missing from the patch grammar`);
    }
  }
});

test("onlyTypes still narrows both key spaces — the critic's path is unchanged", async () => {
  const schema = await deckSchema();
  const ops = buildOpsSchema(schema, { slideCount: 4, onlyTypes: ["feature-grid"] });
  assert.deepEqual(slideProps(ops).type, { enum: ["feature-grid"] });
  assert.deepEqual(
    Object.keys(patchProps(ops)).sort(),
    Object.keys(slideProps(ops)).sort(),
  );
});
