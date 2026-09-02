import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldsForType, stripForeignFields } from "../src/ai/ops.js";
import { deckSchema } from "../src/ai/catalog.js";

/**
 * Fields written onto a slide whose type does not own them.
 *
 * A conversational turn's ops grammar is not narrowed to the slide being
 * edited — the user may name any slide — so the model can write one type's
 * fields onto another's. A real chat turn asking for shorter bullets put a
 * `bullets` array on a `before-after` slide, which owns before/after and has
 * nowhere to draw them.
 *
 * `additionalProperties` cannot be set on the slide definition, because the
 * per-type rules compose through allOf and would each reject the others'
 * fields. So the deck validated, the turn reported "applied 1 change", and the
 * rendered slide was byte-identical. A field nothing draws is silent loss.
 */

test("a type's fields are its own plus the shared ones", async () => {
  const schema = await deckSchema();
  const fields = fieldsForType(schema, "before-after");
  for (const own of ["before", "after"]) assert.ok(fields.has(own), `owns ${own}`);
  for (const shared of ["type", "section", "headline", "speaker_note"]) {
    assert.ok(fields.has(shared), `shared ${shared}`);
  }
  assert.ok(!fields.has("bullets"), "before-after has no bullets");
  assert.ok(fieldsForType(schema, "bullets").has("bullets"), "bullets does");
});

test("a foreign field is dropped and reported, and the slide survives", async () => {
  const schema = await deckSchema();
  const deck = {
    title: "T",
    slides: [
      {
        type: "before-after",
        section: 0,
        before: { title: "Old", body: "b" },
        after: { title: "New", body: "b" },
        bullets: ["written by a chat turn that meant a different slide"],
      },
    ],
  };
  const { deck: out, dropped } = stripForeignFields(deck, schema);
  assert.equal(out.slides[0].bullets, undefined, "the foreign field goes");
  assert.deepEqual(out.slides[0].before, deck.slides[0].before, "the real content stays");
  assert.equal(out.slides[0].section, 0);
  assert.deepEqual(dropped, [{ index: 0, type: "before-after", field: "bullets" }]);
});

test("a clean deck is returned untouched", async () => {
  const schema = await deckSchema();
  const deck = {
    title: "T",
    slides: [{ type: "bullets", section: 0, headline: "H", bullets: ["a", "b", "c"] }],
  };
  const { dropped } = stripForeignFields(deck, schema);
  assert.deepEqual(dropped, []);
});
