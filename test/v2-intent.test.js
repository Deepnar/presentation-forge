// Phase 1: intent contracts hold — valid decks pass, layout smuggling fails.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDeckIntent, normalizeIntent } from "../packages/model/intent.js";
import { sampleDeckIntent } from "./v2-fixture.js";

describe("v2 intent", () => {
  it("accepts the six-recipe sample deck", async () => {
    const { ok, errors } = await validateDeckIntent(sampleDeckIntent());
    assert.equal(ok, true, errors.join("\n"));
  });

  it("rejects slides with no blocks", async () => {
    const deck = sampleDeckIntent();
    deck.slides[0].blocks = [];
    const { ok } = await validateDeckIntent(deck);
    assert.equal(ok, false);
  });

  it("rejects coordinates smuggled into intent", async () => {
    const deck = sampleDeckIntent();
    deck.slides[1].blocks[0].x = 2.5;
    const { ok, errors } = await validateDeckIntent(deck);
    assert.equal(ok, false);
    assert.match(errors.join(" "), /additional/);
  });

  it("rejects hex colours smuggled into intent", async () => {
    const deck = sampleDeckIntent();
    deck.slides[1].color = "#C05D4E";
    const { ok } = await validateDeckIntent(deck);
    assert.equal(ok, false);
  });

  it("normalizeIntent fills missing ids deterministically", async () => {
    const deck = { id: "d", title: "T", slides: [{ purpose: "p", blocks: [{ kind: "text", text: "hi" }] }] };
    const out = normalizeIntent(deck);
    assert.equal(out.slides[0].id, "s1");
    assert.match(out.slides[0].blocks[0].id, /^s1b1-/);
    const { ok } = await validateDeckIntent(out);
    assert.equal(ok, true);
  });
});
