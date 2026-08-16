import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDeck } from "../src/ai/generate.js";

const PLAN = {
  title: "Resumable deck",
  sections: ["Intro"],
  slides: [
    { type: "title", section: 0, purpose: "Open the deck." },
    { type: "bullets", section: 0, purpose: "The key point." },
    { type: "cards", section: 0, purpose: "Three ideas." },
    { type: "closing", section: 0, purpose: "Close." },
  ],
};

const SLIDES = {
  title: { type: "title", headline: "Resumable deck", subtitle: "s" },
  bullets: { type: "bullets", headline: "Key point", bullets: ["a", "b", "c", "d"] },
  cards: { type: "cards", headline: "Ideas", cards: [{ title: "A", body: "b" }, { title: "B", body: "b" }, { title: "C", body: "b" }] },
  closing: { type: "closing", headline: "Thanks", quote: "q" },
};

/** A fake chat that appends the given slide per type, throwing the named error
 *  when the requested slide's type matches `throwOn`. */
function fakeChat({ throwOn } = {}) {
  return async ({ schema }) => {
    const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    if (type === throwOn) {
      const err = new Error("stopped");
      err.name = "AbortError";
      throw err;
    }
    return { data: { ops: [{ op: "append_slide", slide: SLIDES[type] }] } };
  };
}

test("an aborted write leaves a checkpoint of the slides written so far", async () => {
  const checkpoints = [];
  await assert.rejects(
    generateDeck({
      brief: "b", plan: PLAN, model: "mock", chat: fakeChat({ throwOn: "cards" }),
      onSlide: (deck, written, total) => checkpoints.push({ deck, written, total }),
    }),
    (err) => err.name === "AbortError",
  );
  // The abort happened writing the third slide; two slides had been checkpointed.
  assert.equal(checkpoints.length, 2);
  assert.equal(checkpoints[1].written, 2);
  assert.equal(checkpoints[1].total, 4);
  assert.equal(checkpoints[1].deck.slides.length, 2);
  assert.equal(checkpoints[1].deck.slides[0].type, "title");
  assert.equal(checkpoints[1].deck.slides[1].type, "bullets");
});

test("a resume continues from the checkpoint and completes the deck", async () => {
  // First run writes slide 0 and aborts on slide 1.
  const checkpoints = [];
  await assert.rejects(
    generateDeck({
      brief: "b", plan: PLAN, model: "mock", chat: fakeChat({ throwOn: "bullets" }),
      onSlide: (deck, written) => checkpoints.push({ deck, written }),
    }),
    (err) => err.name === "AbortError",
  );
  const partial = checkpoints[0].deck;

  // Resume with the checkpoint as baseDeck, continuing from index 1.
  const res = await generateDeck({
    brief: "b", plan: PLAN, model: "mock", chat: fakeChat(),
    baseDeck: partial, fromIndex: 1,
    onSlide: () => {},
  });

  assert.equal(res.deck.slides.length, 4);
  assert.deepEqual(res.deck.slides.map((s) => s.type), ["title", "bullets", "cards", "closing"]);
  assert.deepEqual(res.deck.slides[0].headline, partial.slides[0].headline, "checkpointed slide preserved");
});

test("a resumed run re-runs the writer only for the remaining slides", async () => {
  const partial = {
    title: PLAN.title,
    sections: PLAN.sections,
    slides: [SLIDES.title],
  };
  const calls = [];
  const chat = async ({ schema }) => {
    const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    calls.push(type);
    return { data: { ops: [{ op: "append_slide", slide: SLIDES[type] }] } };
  };
  await generateDeck({
    brief: "b", plan: PLAN, model: "mock", chat,
    baseDeck: partial, fromIndex: 1, onSlide: () => {},
  });
  assert.deepEqual(calls, ["bullets", "cards", "closing"], "only the unwritten slides hit the writer");
});
