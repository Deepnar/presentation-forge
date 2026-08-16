import { test } from "node:test";
import assert from "node:assert/strict";
import { runTurn } from "../src/ai/turn.js";

const deck = {
  title: "t",
  sections: ["Intro"],
  slides: [{ type: "bullets", section: 0, presenter: "P", headline: "Points", bullets: ["a", "b", "c", "d"] }],
};

test("runTurn drops a stray op missing the `op` field and still applies the valid ones", async () => {
  const chat = async () => ({
    data: {
      ops: [
        { index: 0, patch: { headline: "should be ignored" } }, // malformed — no op
        { op: "update_slide", index: 0, patch: { headline: "Rewritten", bullets: ["a", "b", "c", "d"] } },
      ],
    },
  });
  const r = await runTurn({ deck, instruction: "rewrite slide 1", model: "mock", chat });
  assert.equal(r.ok, true);
  assert.equal(r.deck.slides[0].headline, "Rewritten", "the valid op applied despite the stray item");
  assert.equal(r.deck.slides[0].bullets.length, 4);
});

test("runTurn reports all-malformed ops and repairs before giving up", async () => {
  // First call returns ops with no `op` field at all; the repair call returns a
  // valid rewrite.
  let calls = 0;
  const chat = async () => {
    calls++;
    if (calls === 1) return { data: { ops: [{ index: 0, patch: { headline: "x" } }, {}] } };
    return { data: { ops: [{ op: "update_slide", index: 0, patch: { headline: "Fixed", bullets: ["a", "b", "c", "d"] } }] } };
  };
  const r = await runTurn({ deck, instruction: "rewrite slide 1", model: "mock", chat });
  assert.equal(r.ok, true, "the repair pass recovered it");
  assert.equal(r.deck.slides[0].headline, "Fixed");
  assert.ok(calls >= 2, "the malformed response was fed back, not just failed");
});

test("runTurn keeps the deck untouched when a repair never produces a valid op", async () => {
  const chat = async () => ({ data: { ops: [{ index: 0 }, {}] } });
  const r = await runTurn({ deck, instruction: "rewrite slide 1", model: "mock", chat });
  assert.equal(r.ok, false);
  assert.deepEqual(r.deck, deck, "the deck is unchanged on total failure");
  assert.ok(r.errors.some((e) => e.includes("malformed") || e.includes("op")), "the error names the malformed ops");
});
