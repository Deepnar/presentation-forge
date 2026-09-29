import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "../src/ai/turn.js";
import { coherencePass } from "../src/ai/coherence.js";
import { trimSlide } from "../src/ai/trim.js";

/**
 * Slice 3 of the canvas: per-pass preservation audits. Slice 1 proved the
 * unit contracts (scrub, carry-over, re-attach) with stub chats; this file
 * drives the whole passes end to end over decks carrying human `overrides`
 * blocks and asserts the blocks come out verbatim — or, where the model only
 * offers geometry, that the refusal is visible in the changes.
 *
 * Punch, chat, and the coherence/critic fix loops all ride `runTurn`, so one
 * turn-level audit covers every conversational path; coherence gets its own
 * pass-level audit because it adds a review call before the turn.
 */

const LAYOUT = {
  elements: [{ target: "body", x: 1, y: 2, w: 5, h: 3 }],
  paint: [{ target: "body", fill: "palette.accent" }],
  textboxes: [{ text: "aside", x: 10, y: 5, w: 2, h: 1 }],
};

const bulletsSlide = (headline, extra = {}) => ({
  type: "bullets",
  section: 0,
  headline,
  bullets: ["one", "two", "three", "four"],
  overrides: structuredClone(LAYOUT),
  ...extra,
});

const deckWithBlocks = () => ({
  title: "T",
  sections: ["S"],
  slides: [bulletsSlide("First point"), bulletsSlide("Second point")],
});

/* ------------------------------------------------------- the turn audit */

test("a turn scrubs model geometry, preserves both blocks, and says so", async () => {
  const deck = deckWithBlocks();
  const chat = async () => ({
    data: {
      ops: [
        {
          op: "update_slide",
          index: 0,
          patch: { headline: "First point, tightened", overrides: { elements: [{ target: "body", x: 9 }] } },
        },
        { op: "replace_slide", index: 1, slide: { type: "bullets", headline: "Second point, rewritten", bullets: ["a", "b", "c", "d"] } },
      ],
    },
  });
  const r = await runTurn({ deck, instruction: "tighten both slides", model: "mock", chat });
  assert.ok(r.ok, `turn failed: ${JSON.stringify(r.errors)}`);
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT, "patched slide keeps its block");
  assert.deepEqual(r.deck.slides[1].overrides, LAYOUT, "replaced slide keeps its block");
  assert.equal(r.deck.slides[0].headline, "First point, tightened", "content still lands");
  assert.ok(r.changes.some((c) => c.includes("human-only")), `scrub is visible: ${JSON.stringify(r.changes)}`);
});

test("a turn that only offers geometry refuses visibly and changes nothing", async () => {
  const deck = deckWithBlocks();
  const chat = async () => ({
    data: { ops: [{ op: "update_slide", index: 0, patch: { overrides: { elements: [{ target: "body", x: 9 }] } } }] },
  });
  const r = await runTurn({ deck, instruction: "move the body", model: "mock", chat });
  assert.deepEqual(r.deck.slides, deck.slides, "no content moves");
  assert.ok(r.changes.some((c) => c.includes("human-only")), `refusal is visible: ${JSON.stringify(r.changes)}`);
});

test("a scoped punch-style turn preserves the block on its slide", async () => {
  const deck = deckWithBlocks();
  const chat = async () => ({
    data: { ops: [{ op: "update_slide", index: 0, patch: { headline: "First point, punchier" } }] },
  });
  const r = await runTurn({ deck, instruction: "make it punchier", onlySlides: [0], model: "mock", chat });
  assert.ok(r.ok);
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT);
  assert.deepEqual(r.deck.slides[1].overrides, LAYOUT, "unselected slides are untouched");
});

/* ------------------------------------------------------- coherence audit */

test("coherencePass preserves blocks on fixed and unflagged slides", async () => {
  const deck = deckWithBlocks();
  let reviews = 0;
  const chat = async ({ schema }) => {
    if (schema?.properties?.findings) {
      reviews += 1;
      return reviews === 1
        ? { data: { findings: [{ index: 1, kind: "topic", detail: "drifts", fix: "tie it back" }] } }
        : { data: { findings: [] } };
    }
    return {
      data: { ops: [{ op: "update_slide", index: 1, patch: { headline: "Second point, reframed" } }] },
    };
  };
  const r = await coherencePass({ deck, sections: ["S"], model: "mock", chat });
  assert.equal(r.problems.length, 0, `problems: ${JSON.stringify(r.problems)}`);
  assert.deepEqual(r.deck.slides[1].overrides, LAYOUT, "fixed slide keeps its block");
  assert.deepEqual(r.deck.slides[0].overrides, LAYOUT, "unflagged slide keeps its block");
  assert.equal(r.deck.slides[1].headline, "Second point, reframed", "the fix lands");
});

/* ------------------------------------------------------- trim audit */

test("trimSlide shortens prose and leaves the block alone", async () => {
  const slide = bulletsSlide("Points", {
    bullets: ["one", "two", "three", "Revenue grew twelve percent this quarter. More detail follows in the appendix."],
  });
  const out = await trimSlide(slide);
  assert.ok(out, "expected a trim");
  assert.deepEqual(out.overrides, LAYOUT, "the block survives the trim");
  assert.ok(
    out.bullets[3].length < slide.bullets[3].length && out.bullets[3].includes("quarter"),
    `trimmed at the sentence boundary: ${out.bullets[3]}`,
  );
});
