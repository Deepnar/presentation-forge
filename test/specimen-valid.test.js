import { test } from "node:test";
import assert from "node:assert/strict";
import { specimenDeck } from "../src/specimens.js";
import { validateDeck } from "../src/validate.js";
import { deckSchema } from "../src/ai/catalog.js";

/**
 * The specimen has to satisfy the schema it is the example of.
 *
 * It is the fixture behind `themematrix`, `textcheck`, `drawcheck`, `capfit`
 * and `capstress` — every sweep in the project renders it — and nothing
 * validated it. That went unnoticed until the caps were recalibrated against
 * what the layouts can actually seat: three `data-cards` bodies were left
 * eight characters over the corrected cap, the whole suite stayed green, and
 * the deck every check measures against was one no generation would have been
 * allowed to produce.
 *
 * A cap cut is exactly when this breaks, and a cap cut is a thing this project
 * expects to keep doing.
 */

test("the specimen deck satisfies the deck schema", async () => {
  const result = await validateDeck(await specimenDeck());
  const problems = result.errors ?? result.problems ?? [];
  assert.deepEqual(
    problems.map((p) => (typeof p === "string" ? p : JSON.stringify(p))),
    [],
    "the specimen is the example every sweep renders — it cannot be invalid",
  );
});

/**
 * And it has to exercise the caps it claims to. A specimen whose fields sit far
 * under their caps renders beautifully and proves nothing, which is the reason
 * `capstress` exists at all — this does not demand the specimen be AT its caps,
 * only that it carries the types.
 */
test("the specimen carries every slide type the schema declares", async () => {
  const deck = await specimenDeck();
  const schema = await deckSchema();
  const declared = new Set(schema.definitions.slide.properties.type.enum ?? []);
  const present = new Set(deck.slides.map((s) => s.type));
  const missing = [...declared].filter((t) => !present.has(t));
  assert.deepEqual(missing, [], "a type no specimen carries is a type no sweep renders");
});
