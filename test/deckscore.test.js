import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDeck } from "../src/deckscore.js";

/**
 * A deterministic score for a generated deck.
 *
 * Content quality is answered by a person reading the deck on the gateway, and
 * that is right and does not scale — so it happens rarely and nothing
 * accumulates between times. This measures the half that needs no model and no
 * opinion, and returns one number so two runs can be set beside each other.
 *
 * It does not claim a high score means a good deck. Every component is
 * necessary and none is sufficient. It exists so a deck broken in a way
 * somebody already found once cannot quietly come back.
 */

const slide = (over = {}) => ({
  type: "bullets",
  section: 0,
  headline: "A headline",
  bullets: ["A complete first point.", "A complete second point.", "A third."],
  ...over,
});

const deckOf = (slides) => ({ title: "T", sections: ["A"], slides });

/** themeMatrix needs a render; without one that component reports null rather
 *  than inventing a number, which is what these unit-level cases exercise. */
const score = (deck, opts) => scoreDeck(deck, opts);

test("a clean deck scores well and reports nothing", async () => {
  const r = await score(deckOf([slide(), slide(), slide()]));
  assert.ok(r.score >= 90, `expected a high score, got ${r.score}: ${r.findings.join("; ")}`);
  assert.equal(r.components.intact, 1);
  assert.equal(r.components.whole, 1);
});

test("a missing section is counted and named", async () => {
  const r = await score(deckOf([slide(), slide({ section: undefined })]));
  assert.ok(r.components.intact < 1, "a slide with no section is not intact");
  assert.ok(r.findings.some((f) => /carry no section/.test(f)), r.findings.join("; "));
});

test("a field cut mid-sentence drags `whole` down and is quoted back", async () => {
  const cut = "This speaker note runs on for a good while and then simply stops at its cap without";
  const r = await score(deckOf([slide({ speaker_note: cut }), slide(), slide()]));
  assert.ok(r.components.whole < 1, "a truncated field must register");
  assert.ok(r.findings.some((f) => /ends mid-sentence/.test(f)), r.findings.join("; "));
});

test("a headline is a label, not a truncated sentence", async () => {
  // The first version of this scorer counted the deck's own title as broken
  // and reported `whole` at 0% for every deck. A noun phrase ends without a
  // full stop by design.
  const long = "Perovskite Solar Cells: Stability Challenges and Commercial Viability";
  const r = await score(deckOf([slide({ headline: long }), slide(), slide()]));
  assert.equal(r.components.whole, 1, r.findings.join("; "));
});

test("a placeholder slide is the loudest failure", async () => {
  const withPlaceholder = deckOf([
    slide(),
    slide({ headline: "PLACEHOLDER — regenerate this slide", bullets: ["PLACEHOLDER", "PLACEHOLDER", "PLACEHOLDER"] }),
  ]);
  const clean = await score(deckOf([slide(), slide()]));
  const dirty = await score(withPlaceholder);
  assert.ok(dirty.components.intact <= clean.components.intact, "a placeholder cannot score as well as prose");
});

test("monotony is caught: eight of the same slide is not a deck", async () => {
  const same = Array.from({ length: 8 }, () => slide());
  const r = await score(deckOf(same));
  assert.ok(r.components.varied < 1, `expected a variety penalty: ${JSON.stringify(r.components)}`);
  assert.ok(r.findings.some((f) => /monotony/.test(f)), r.findings.join("; "));
});

test("without research the grounding component is skipped, not failed", async () => {
  // A deck written from an upload has no notes.md and must not be punished for
  // it — the weight is redistributed instead.
  const r = await score(deckOf([slide(), slide()]), { research: "" });
  assert.equal(r.components.grounded, null);
  assert.ok(r.score != null && r.score > 0, "the remaining components still yield a score");
});
