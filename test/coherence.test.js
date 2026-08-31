import { test } from "node:test";
import assert from "node:assert/strict";
import { coherenceReview, coherencePass, digestSlide, buildFixInstruction } from "../src/ai/coherence.js";

const DECK = {
  title: "First Impressions and Networking Behaviour Among College Students",
  sections: ["Bias, Face & Blind Spots"],
  slides: [
    { type: "title", headline: "First Impressions and Networking" },
    {
      type: "chart",
      section: 0,
      headline: "The Young Flight Attendant Is a Stereotype the Data No Longer Supports",
      standfirst: "Nearly half of U.S. flight attendants are 45 or older.",
      chart: { kind: "bar", categories: ["16-24", "45+"], series: [{ name: "Share", values: [4.9, 21.4] }], unit: "%" },
    },
    {
      type: "bullets",
      section: 0,
      headline: "Stereotypes shape your first impression before you speak",
      bullets: ["Bias arrives before the handshake.", "What you expect changes how you read the other person.", "A warm read of a stranger is a skill.", "Stereotypes close the door before it opens."],
    },
  ],
};

/** A fake model: the review call flags slide 2 (index 1), the fix turn
 *  rewrites it to tie the stereotype data to first impressions. Distinguishes
 *  the review prompt (asks to review coherence) from the ops prompt (carries
 *  the current deck state). */
function fakeChat(round) {
  return async ({ schema, messages }) => {
    const joined = messages.map((m) => m.content).join("\n");
    if (joined.includes("Review the deck's coherence")) {
      return round === 0
        ? {
            data: {
              findings: [{
                index: 1,
                kind: "topic",
                detail: "flight attendant demographics do not serve a first-impressions deck",
                fix: "re-frame the stereotype data as how expectations bias a first impression",
              }],
            },
          }
        : { data: { findings: [] } };
    }
    // The fix turn — rewrite slide 2 (index 1) to serve the deck's topic.
    return {
      data: {
        ops: [{
          op: "replace_slide",
          index: 1,
          slide: {
            type: "chart",
            section: 0,
            headline: "Stereotypes bias a first impression before you speak",
            standfirst: "A stereotype is a shortcut the mind applies in the first seconds of contact.",
            chart: { kind: "bar", categories: ["16-24", "45+"], series: [{ name: "Share", values: [4.9, 21.4] }], unit: "%" },
            aside: ["Age skews older; expectation, not evidence, shapes the first read."],
          },
        }],
      },
    };
  };
}

test("digestSlide renders a compact per-slide digest", () => {
  const s = DECK.slides[1];
  const d = digestSlide(s, 1);
  assert.ok(d.includes('[1] chart "The Young Flight Attendant'));
});

test("coherenceReview returns findings for a topically drifting slide", async () => {
  const findings = await coherenceReview({ deck: DECK, sections: DECK.sections, model: "mock", chat: fakeChat(0) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].index, 1);
  assert.equal(findings[0].kind, "topic");
});

test("buildFixInstruction names the slide and the required reframe", () => {
  const instr = buildFixInstruction([{ index: 1, kind: "topic", detail: "drift", fix: "tie it to first impressions" }], DECK.sections);
  assert.ok(instr.includes("Slide 2"));
  assert.ok(instr.includes("topically disconnected"));
  assert.ok(instr.includes("tie it to first impressions"));
});

test("coherencePass rewrites a flagged slide and converges on round two", async () => {
  const r = await coherencePass({ deck: DECK, sections: DECK.sections, model: "mock", chat: fakeChat(0) });
  assert.ok(r.findings.length >= 1, "found the drift");
  // The fix turn replaced slide 2's headline to serve the deck's topic.
  const fixed = r.deck.slides.find((s) => s.type === "chart");
  assert.ok(fixed.headline.includes("Stereotypes bias a first impression"), "headline re-framed to the deck's topic");
  assert.equal(r.problems.length, 0);
});

test("coherencePass leaves a coherent deck untouched", async () => {
  const clean = { ...DECK, slides: [DECK.slides[0], DECK.slides[2]] };
  const chat = async ({ messages }) => {
    const isReview = messages[1]?.content?.includes("Review the deck's coherence");
    return isReview ? { data: { findings: [] } } : { data: { ops: [] } };
  };
  const r = await coherencePass({ deck: clean, sections: DECK.sections, model: "mock", chat });
  assert.equal(r.findings.length, 0);
  assert.equal(r.deck.slides.length, 2);
});
