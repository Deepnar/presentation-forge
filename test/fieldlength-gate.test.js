import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fieldLengthPass } from "../src/ai/fieldlength.js";
import { errorsForSlide } from "../src/validate.js";

/**
 * The pass runs BECAUSE a deck has fields over their caps, and it leaves the
 * hard ones to the deterministic trim. So "is the whole deck clean afterwards"
 * is false on nearly every deck it is asked to repair — and it used to answer
 * that question, return the deck it was handed, and throw away every repair it
 * had just made, while still listing them in `repaired`.
 *
 * Observed on a real generated deck: four feature-grid card bodies cut mid-word
 * by the decoding grammar ("…in site selection criteri"), correctly rewritten
 * by this pass, and shipped cut anyway. The vision critic found them on the
 * rendered PNG, which is a long way round for a defect the pass had already
 * fixed in memory.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-fieldlen-"));

/** A card body cut at exactly its 53-char cap, the way the grammar cuts. */
const CUT = "Centers marginalized groups in site selection criteri";

function deckWith() {
  return {
    title: "field length gate",
    theme: "warm-humanist",
    slides: [
      {
        type: "feature-grid",
        section: 0,
        headline: "Equity-First Site Selection Indicators",
        items: [
          { title: "Student Poverty Rate", body: CUT },
          { title: "Household Median Income", body: "Prioritizes lower-income areas for early V2G deploy" },
        ],
      },
      // Untouched by the rewrite and over its cap: the deck is invalid as a
      // whole no matter how well the slide above is repaired. `headline` caps
      // at 80.
      {
        type: "bullets",
        section: 0,
        headline: "x".repeat(140),
        bullets: ["a", "b", "c", "d"],
      },
    ],
  };
}

/** Stands in for the rewrite: one update_slide op patching the cut bodies,
 *  which is the shape rewriteSlide asks the model for. */
const fixedChat = async () => ({
  data: {
    ops: [
      {
        op: "update_slide",
        index: 0,
        patch: {
          items: [
            { title: "Student Poverty Rate", body: "Free lunch data targets low-income routes." },
            { title: "Household Median Income", body: "Lower-income areas get priority." },
          ],
        },
      },
    ],
  },
});

test("a repair survives an unrelated slide being over its cap", async () => {
  const deck = deckWith();
  const res = await fieldLengthPass({ deck, deckDir: scratch, chat: fixedChat });

  // Whatever the rewrite managed, the pass must never hand back the deck it was
  // given while claiming in `repaired` that it changed something.
  assert.ok(res.repaired.length, "the rewrite produced repairs to judge");
  if (res.repaired.length) {
    const bodies = res.deck.slides[0].items.map((i) => i.body);
    assert.ok(!bodies.includes(CUT), "the repaired body is in the returned deck, not just in `repaired`");
  }

  // The over-cap slide is untouched and still reported, so the trim's remaining
  // work is visible rather than swallowed.
  assert.equal(res.deck.slides[1].headline.length, 140, "an unrelated slide is left for the trim");
  assert.ok(
    res.problems.some((p) => /too long/.test(String(p))),
    "and the deck's remaining length problems are reported",
  );
});

test("errorsForSlide attributes a missing required field, which has no pointer", () => {
  // `describe` writes the pointer only for keywords with a sub-path; `required`
  // renders as "slide N (type: T): missing required field …" and nothing else.
  const errors = [
    'slide 1 (type: feature-grid): missing required field "title"',
    "slide 2 (type: bullets) at /slides/1/headline: too long — 80 chars max, shorten it",
  ];
  assert.deepEqual(errorsForSlide(errors, 0), [errors[0]], "prose form, slide 1 is index 0");
  assert.deepEqual(errorsForSlide(errors, 1), [errors[1]], "pointer form");
});

test("errorsForSlide does not confuse slide 1 with slide 10", () => {
  const errors = [
    "slide 11 (type: bullets) at /slides/10/headline: too long — 80 chars max, shorten it",
    'slide 2 (type: cards): missing required field "cards"',
  ];
  assert.deepEqual(errorsForSlide(errors, 1), [errors[1]]);
  assert.deepEqual(errorsForSlide(errors, 10), [errors[0]]);
});

test.after(async () => {
  await rm(scratch, { recursive: true, force: true });
});
