import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDeck } from "../src/ai/generate.js";

/**
 * The plan owns each slide's section index; the writer does not.
 *
 * The prompt states `section: N` and the model is free to leave it out of its
 * append_slide op — and when it does, nothing downstream can recover it. The
 * chrome eyebrow reads `slide.section` to print the part's name, so the slide
 * renders its rule with no label beside it. Four of fourteen slides on a real
 * generated deck lost their section exactly this way, and the deck rendered
 * four unlabelled eyebrows without a single check firing: the field is
 * optional, so validation passes and the fit sweeps have nothing to measure.
 *
 * The coherence sweep already re-asserts type, presenter and section for this
 * reason. The first write had no such guard.
 */

const PLAN = {
  title: "Sectioned deck",
  sections: ["Intro", "Middle", "End"],
  slides: [
    { type: "title", section: 0, purpose: "Open the deck." },
    { type: "bullets", section: 0, purpose: "The first point." },
    { type: "cards", section: 1, purpose: "Three ideas." },
    { type: "bullets", section: 2, purpose: "The last point." },
    { type: "closing", section: 2, purpose: "Close." },
  ],
};

/** Slides with NO `section` — what a model actually returns. */
const SLIDES = {
  title: { type: "title", headline: "Sectioned deck", subtitle: "s" },
  bullets: { type: "bullets", headline: "A point", bullets: ["a", "b", "c", "d"] },
  cards: {
    type: "cards",
    headline: "Ideas",
    cards: [{ title: "A", body: "b" }, { title: "B", body: "b" }, { title: "C", body: "b" }],
  },
  closing: { type: "closing", headline: "Thanks", quote: "q" },
};

const fakeChat = () => async ({ schema }) => {
  const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
  return { data: { ops: [{ op: "append_slide", slide: SLIDES[type] }] } };
};

test("every written slide carries the section its plan spec named", async () => {
  const res = await generateDeck({ brief: "b", plan: PLAN, model: "mock", chat: fakeChat() });
  const written = res.deck.slides;
  assert.equal(written.length, PLAN.slides.length, "one slide per spec");

  const missing = written
    .map((s, i) => ({ i, type: s.type, section: s.section }))
    .filter((s) => s.section == null);
  assert.deepEqual(missing, [], `slides lost their section: ${JSON.stringify(missing)}`);

  assert.deepEqual(
    written.map((s) => s.section),
    PLAN.slides.map((s) => s.section),
    "the written sections must match the plan's, in order",
  );
});
