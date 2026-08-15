import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepDeck } from "../src/ai/generate.js";

// A minimal deck exercising the sweep: a title divider (kept untouched), a
// bullets content slide (rewritten), a cards slide (rewritten).
const DECK = {
  title: "Test deck",
  sections: ["Intro", "Body"],
  slides: [
    { type: "title", headline: "Test deck", subtitle: "sub" },
    {
      type: "bullets",
      section: 0,
      presenter: "Alice",
      headline: "Key points",
      bullets: ["one short point", "another short point", "a third short point", "a fourth short point"],
    },
    {
      type: "cards",
      section: 1,
      presenter: "Bob",
      headline: "Facts",
      cards: [{ title: "A", body: "body" }, { title: "B", body: "more" }],
    },
  ],
};

/** A fake model client that returns the given ops, mirroring chatJSON's shape. */
function fakeChat(opsByType) {
  return async ({ schema, messages }) => {
    const slide = messages[1]?.content;
    const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    const ops = opsByType[type];
    return { data: { ops: ops ?? [] } };
  };
}

test("sweepDeck rejects an unknown density", async () => {
  await assert.rejects(sweepDeck({ deck: DECK, density: "huge" }), /sparse\|balanced\|dense/);
});

test("sweepDeck gives each slide only its own content — no neighbour leak", async () => {
  // Capture every prompt; each must name only its own slide's content and
  // must carry the explicit independence rule (which lives in the system
  // message, like the rest of the sweep contract).
  const seen = [];
  const chat = async ({ schema, messages }) => {
    seen.push({ user: messages[1]?.content ?? "", system: messages[0]?.content ?? "" });
    const type = schema.properties.ops.items.properties.slide.properties.type.enum[0];
    return { data: { ops: [{ op: "update_slide", index: seen.length - 1, patch: { headline: "H", bullets: ["a", "b", "c", "d"] } }] } };
  };
  await sweepDeck({ deck: DECK, density: "balanced", model: "mock", chat });
  assert.equal(seen.length, 2, "two content slides swept");
  const bullets = seen[0];
  const cards = seen[1];
  // The bullets slide's context carries its own headline but not the cards
  // slide's content, and vice versa.
  assert.ok(bullets.user.includes("Key points"));
  assert.ok(!bullets.user.includes("Facts"), "cards headline must not leak into the bullets context");
  assert.ok(cards.user.includes("Facts"));
  assert.ok(!cards.user.includes("Key points"), "bullets headline must not leak into the cards context");
  assert.ok(bullets.system.includes("Do not copy or carry"), "independence rule present");
  assert.ok(cards.system.includes("Do not copy or carry"), "independence rule present on every slide");
});

test("sweepDeck rewrites content slides and keeps dividers, types and presenters", async () => {
  const chat = fakeChat({
    bullets: [{ op: "update_slide", index: 1, patch: { headline: "Key points", bullets: ["a fuller point one", "a fuller point two", "a third point", "a fourth point"] } }],
    cards: [{ op: "update_slide", index: 2, patch: { headline: "Facts", cards: [{ title: "A", body: "a longer body" }, { title: "B", body: "another" }, { title: "C", body: "third" }] } }],
  });

  const r = await sweepDeck({ deck: DECK, density: "dense", model: "mock", chat });
  assert.deepEqual(r.problems, []);

  // Structure preserved: same types, same count, title divider untouched.
  assert.equal(r.deck.slides.length, 3);
  assert.equal(r.deck.slides[0].type, "title");
  assert.deepEqual(r.deck.slides[0].headline, "Test deck");
  assert.equal(r.deck.slides[1].type, "bullets");
  assert.equal(r.deck.slides[1].presenter, "Alice");
  assert.equal(r.deck.slides[1].section, 0);
  assert.equal(r.deck.slides[2].type, "cards");
  assert.equal(r.deck.slides[2].presenter, "Bob");

  // Content rewritten to dense.
  assert.equal(r.deck.slides[1].bullets.length, 4);
  assert.equal(r.deck.slides[2].cards.length, 3);
  assert.equal(r.swept.length, 2);
});

test("sweepDeck keeps the original slide when a rewrite fails validation", async () => {
  const chat = fakeChat({
    // Ops target the wrong index — the sweep only accepts update_slide at i.
    bullets: [{ op: "update_slide", index: 9, patch: { bullets: ["x"] } }],
    cards: [{ op: "delete_slide", index: 2 }],
  });
  const r = await sweepDeck({ deck: DECK, density: "sparse", model: "mock", chat });
  assert.ok(r.problems.length >= 1);
  // The deck is unchanged.
  assert.deepEqual(r.deck.slides[1].bullets, DECK.slides[1].bullets);
  assert.deepEqual(r.deck.slides[2].cards, DECK.slides[2].cards);
  assert.equal(r.deck.slides.length, 3);
});
test("sweepDeck re-asserts type and presenter even if the patch tries to change them", async () => {
  const chat = fakeChat({
    bullets: [{ op: "update_slide", index: 1, patch: { type: "stats", presenter: "Mallory", bullets: ["x", "y"] } }],
  });
  const r = await sweepDeck({ deck: DECK, density: "balanced", model: "mock", chat });
  assert.equal(r.deck.slides[1].type, "bullets");
  assert.equal(r.deck.slides[1].presenter, "Alice");
});
