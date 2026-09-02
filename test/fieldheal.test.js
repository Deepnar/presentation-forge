import { test } from "node:test";
import assert from "node:assert/strict";
import { healCutField } from "../src/ai/fieldlength.js";

/**
 * Fields the decoding grammar cut at their cap.
 *
 * Constrained decoding masks any token that would exceed a maxLength, so a
 * model still mid-sentence at the cap just stops. The field is exactly AT its
 * cap, not over it, and carries no ellipsis — so the length pass (which looks
 * for over-cap) and the trim (which looks for an ellipsis) both walked past it.
 * Six of nine speaker notes on one freshly generated deck ended that way.
 */

const CAP = 200;
const atCap = (s) => s.padEnd(CAP, "x").slice(0, CAP);

test("a note cut mid-word falls back to its last complete sentence", () => {
  // Exactly at the cap and stopped mid-number — the shape the grammar produces.
  const text =
    "These numbers show that while we have achieved remarkable efficiency, our stability is still " +
    "far short of what is needed for commercial viability. The 25.8% efficiency vs 10-year need is a 30";
  // The cap IS where it stopped — that is what a grammar cut looks like.
  const healed = healCutField(text, text.length);
  assert.ok(healed, "a mid-sentence cut at the cap must be healed");
  assert.ok(healed.endsWith("."), `must end on a sentence: ${JSON.stringify(healed)}`);
  assert.ok(!healed.includes("need is a 30"), "the broken tail must be gone");
});

test("a field that ends deliberately is left alone", () => {
  // At the cap but properly terminated — the writer finished exactly there.
  const done = atCap("A complete thought that happens to end right at the cap.").slice(0, CAP - 1) + ".";
  assert.equal(healCutField(done, CAP), null);
  // Other legitimate terminators.
  for (const end of ["!", "?", "…", '"', ")"]) {
    const s = "Something that ends properly" + end;
    assert.equal(healCutField(s.padEnd(CAP, " ").slice(0, CAP - 1) + end, CAP), null, `ends with ${end}`);
  }
});

test("a field short of its cap is never touched", () => {
  // A label or heading with no full stop is not a truncation — it is a label.
  assert.equal(healCutField("Key Degradation Factors", CAP), null);
  assert.equal(healCutField("Stability Issues", 60), null);
});

test("salvaging is refused when it would leave a stub", () => {
  // One short sentence then a long cut clause: keeping four words and throwing
  // away 170 characters loses more than the broken tail costs.
  const text = atCap("Yes. " + "and then a long clause that runs on and on without ever terminating properly ");
  assert.equal(healCutField(text, CAP), null);
});

test("no sentence boundary at all is left for the rewrite", () => {
  const text = atCap("a single run-on clause with no terminator anywhere in it at all which simply keeps going ");
  assert.equal(healCutField(text, CAP), null);
});

test("an uncapped field is out of scope", () => {
  assert.equal(healCutField("Anything at all with no cap", null), null);
  assert.equal(healCutField(null, CAP), null);
});
