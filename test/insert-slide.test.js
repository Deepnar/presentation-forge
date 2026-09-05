import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseInsertType, insertPurpose, insertSlide } from "../src/ai/generate.js";
import { familyFor } from "../src/ai/catalog.js";

/**
 * Adding a slide to a finished deck.
 *
 * `insert_slide` has always been in the ops grammar and a chat turn can emit
 * it, which is why this looked like it already existed. What came back was
 * written by the CHAT path — the merged ops grammar of every type at once,
 * whatever research the turn happened to carry, and none of the post-passes —
 * so the slide arrived visibly unlike its neighbours. These tests hold the
 * three things that make it a sibling instead: a type chosen for variety, a
 * purpose derived from where it lands, and a write through the slide writer.
 */

const deckOf = (...types) => ({
  title: "Vehicle-to-Grid",
  slides: [
    { type: "title", headline: "Vehicle-to-Grid" },
    { type: "section", headline: "Economics", section: 0 },
    ...types.map((t, i) => ({ type: t, headline: `Point ${i + 1}`, section: 0 })),
  ],
});
const PLAN = { title: "Vehicle-to-Grid", sections: ["Economics", "Hardware"], slides: [] };

/* ------------------------------------------------------------ the type */

test("the inserted type is never one of its immediate neighbours", () => {
  const deck = deckOf("bullets", "chart", "bullets");
  for (let after = 2; after < deck.slides.length; after++) {
    const t = chooseInsertType(deck, after);
    assert.notEqual(t, deck.slides[after]?.type, `repeats the slide before (after ${after})`);
    assert.notEqual(t, deck.slides[after + 1]?.type, `repeats the slide after (after ${after})`);
  }
});

test("the inserted type is never structural — a divider is not content", () => {
  const deck = deckOf("bullets", "bullets");
  for (let after = 1; after < deck.slides.length; after++) {
    const t = chooseInsertType(deck, after);
    assert.ok(
      !["title", "section", "chapter", "closing", "agenda", "epigraph", "references", "contact"].includes(t),
      `chose the structural type "${t}"`,
    );
  }
});

test("repeated inserts do not all come out the same", () => {
  // The deck leans away from families it already uses, so five inserts in a
  // row give five different families rather than five of whatever sorts first.
  let deck = deckOf("bullets", "bullets");
  const families = [];
  for (let i = 0; i < 5; i++) {
    const t = chooseInsertType(deck, 2);
    families.push(familyFor(t));
    deck = { ...deck, slides: [...deck.slides.slice(0, 3), { type: t, section: 0 }, ...deck.slides.slice(3)] };
  }
  assert.equal(new Set(families).size, families.length, `families repeated: ${families.join(", ")}`);
});

test("an explicit type is honoured — the choice is a default, not a policy", async () => {
  const deck = deckOf("bullets", "bullets");
  let seen = null;
  const chat = async ({ schema }) => {
    seen = schema.properties.ops.items.properties.slide.properties.type;
    return { data: { ops: [{ op: "append_slide", slide: { type: "chart", headline: "H", chart: { kind: "bar", series: [{ label: "a", value: 1 }] } } }] } };
  };
  await insertSlide({ deck, plan: PLAN, after: 2, type: "chart", chat });
  assert.deepEqual(seen, { enum: ["chart"] }, "the grammar must be scoped to the chosen type");
});

/* --------------------------------------------------------- the purpose */

test("the purpose names the part and both neighbours", () => {
  const deck = deckOf("bullets", "bullets");
  deck.slides[2].headline = "Depot revenue is real";
  deck.slides[3].headline = "Tariffs decide the spread";
  const { section, purpose } = insertPurpose(deck, PLAN, 2);

  assert.equal(section, 0, "an inserted slide belongs to the part it lands in");
  assert.match(purpose, /Economics/, "the part's argument");
  assert.match(purpose, /Depot revenue is real/, "what it follows");
  assert.match(purpose, /Tariffs decide the spread/, "what it precedes");
  assert.match(purpose, /without restating either/);
});

test("a purpose at the end of a deck names only what it follows", () => {
  const deck = deckOf("bullets");
  deck.slides[2].headline = "The last point";
  const { purpose } = insertPurpose(deck, PLAN, 2);
  assert.match(purpose, /The last point/);
  assert.ok(!/is followed by/.test(purpose), purpose);
});

test("a deck with no plan still yields a usable purpose", () => {
  const { purpose, section } = insertPurpose(deckOf("bullets"), null, 2);
  assert.ok(purpose.trim().length > 0);
  assert.equal(section, 0);
});

/* ------------------------------------------------------------ the write */

const writeChat = (slide) => async () => ({ data: { ops: [{ op: "append_slide", slide }] } });

test("the new slide lands in the right place and keeps the deck intact", async () => {
  const deck = deckOf("bullets", "chart", "bullets");
  const before = deck.slides.length;
  const r = await insertSlide({
    deck, plan: PLAN, after: 2, type: "stats",
    chat: writeChat({ type: "stats", headline: "Measured", stats: [
      { value: "41", label: "EUR per bus" }, { value: "91%", label: "retention" },
      { value: "14", label: "months" }, { value: "32", label: "buses" },
    ] }),
  });
  assert.equal(r.index, 3);
  assert.equal(r.deck.slides.length, before + 1);
  assert.equal(r.deck.slides[3].type, "stats");
  // Everything either side is untouched and in order.
  assert.deepEqual(r.deck.slides.slice(0, 3).map((s) => s.type), deck.slides.slice(0, 3).map((s) => s.type));
  assert.deepEqual(r.deck.slides.slice(4).map((s) => s.type), deck.slides.slice(3).map((s) => s.type));
});

test("the new slide inherits the section it was inserted into", async () => {
  const deck = deckOf("bullets", "bullets");
  deck.slides[2].section = 1;
  deck.slides[3].section = 1;
  const r = await insertSlide({
    deck, plan: PLAN, after: 2, type: "bullets",
    chat: writeChat({ type: "bullets", headline: "H", bullets: ["a", "b", "c"] }),
  });
  assert.equal(r.deck.slides[3].section, 1, "or assignPresenters cannot give it an owner");
});

test("a presenter the model volunteered is dropped, as everywhere else", async () => {
  // Presenters are assigned centrally by distributePresenters after the fact.
  const r = await insertSlide({
    deck: deckOf("bullets"), plan: PLAN, after: 2, type: "bullets",
    chat: writeChat({ type: "bullets", headline: "H", bullets: ["a", "b", "c"], presenter: "Someone" }),
  });
  assert.equal(r.slide.presenter, undefined);
});

test("the writer is shown the deck UP TO the insertion point, not past it", async () => {
  // "SLIDES SO FAR" has to mean what precedes this slide, or the model writes
  // as though the later slides had already been said.
  const deck = deckOf("bullets", "chart", "timeline");
  let user = null;
  await insertSlide({
    deck, plan: PLAN, after: 2, type: "stats",
    chat: async ({ messages }) => {
      user = messages.at(-1).content;
      return { data: { ops: [{ op: "append_slide", slide: { type: "stats", headline: "H", stats: [
        { value: "1", label: "a" }, { value: "2", label: "b" }, { value: "3", label: "c" }, { value: "4", label: "d" },
      ] } }] } };
    },
  });
  assert.match(user, /Point 1/, "the slide it follows should be in context");
  assert.ok(!/Point 3/.test(user), "a slide that comes AFTER must not be listed as already written");
});

test("an out-of-range insertion point is refused, not clamped", async () => {
  const deck = deckOf("bullets");
  const chat = writeChat({ type: "bullets", headline: "H", bullets: ["a", "b", "c"] });
  await assert.rejects(() => insertSlide({ deck, plan: PLAN, after: 99, chat }), /cannot insert/);
  await assert.rejects(() => insertSlide({ deck, plan: PLAN, after: -5, chat }), /cannot insert/);
});

test("a model that produces nothing fails loudly rather than silently", async () => {
  await assert.rejects(
    () => insertSlide({ deck: deckOf("bullets"), plan: PLAN, after: 2, chat: async () => ({ data: { ops: [] } }) }),
    /no slide to insert/,
  );
});
