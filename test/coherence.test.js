import { test } from "node:test";
import assert from "node:assert/strict";
import { coherenceReview, coherencePass, digestSlide, buildFixInstruction, nearDuplicateHeadlines, repetitionFindings, coherenceFindings } from "../src/ai/coherence.js";

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

/* -------------------------------------------------- repetition, computed */

/**
 * The coherence pass asked a model about topical drift and about data with no
 * point, and never about repetition — so three slides of the V2G deck each
 * saying a version of "Scaling V2G Requires Cross-Sector Collaboration" went
 * through untouched.
 *
 * It is also the one of the three a reviewer model is worst at: deciding
 * whether slide 21 restates slide 18 means holding the whole deck in view, and
 * the reviewer sees a digest. So it is computed.
 */

const slide = (type, headline) => ({ type, headline });

test("a content slide restating its own section divider is caught", async () => {
  // The real case: slide 18 is the section, slide 21 repeats it verbatim.
  const deck = { slides: [
    slide("title", "Vehicle-to-Grid"),
    slide("section", "Scaling V2G Requires Cross-Sector Collaboration"),
    slide("flow", "Scale Isolated Tests Into A Nationwide Network"),
    slide("framework", "Scaling V2G Requires Cross-Sector Collaboration"),
  ] };
  const found = repetitionFindings(deck);
  assert.equal(found.length, 1);
  assert.equal(found[0].index, 3, "the CONTENT slide is the one at fault");
  assert.equal(found[0].kind, "repetition");
  assert.match(found[0].detail, /repeats slide 2/);
});

test("structure is compared but never rewritten", async () => {
  // A section and a chapter card echoing the part's name is them doing their
  // job. Excluding dividers from the comparison entirely would have hidden the
  // test above, so they are compared and then filtered out of the findings.
  const deck = { slides: [
    slide("section", "Scaling And Collaboration"),
    slide("chapter", "Scaling And Collaboration"),
    slide("closing", "Scaling And Collaboration"),
  ] };
  assert.deepEqual(repetitionFindings(deck), []);
});

test("it matches what two headlines say, not how they spell it", async () => {
  // Raw tokens share three of seven here — under any threshold worth setting.
  const deck = { slides: [
    slide("bullets", "Scaling V2G Requires Cross-Sector Collaboration"),
    slide("bullets", "Cross-Sector Collaboration Is Required To Scale V2G"),
  ] };
  assert.equal(repetitionFindings(deck).length, 1);
});

test("slides making different points are left alone", async () => {
  const deck = { slides: [
    slide("bullets", "Depot Revenue Is Measurable Today"),
    slide("chart", "Tariff Design Decides The Spread"),
    slide("bullets", "Battery Degradation Stays Inside Warranty"),
    slide("callout", "Commissioning Took Eleven Weeks"),
  ] };
  assert.deepEqual(nearDuplicateHeadlines(deck.slides), []);
});

test("the deck's own title is not a duplicate of its parts", async () => {
  const deck = { slides: [
    slide("title", "Vehicle-to-Grid Integration"),
    slide("agenda", "Vehicle-to-Grid Integration"),
    slide("bullets", "Vehicle-to-Grid Integration In Practice"),
  ] };
  assert.deepEqual(repetitionFindings(deck), []);
});

test("only the first of a run survives; the rest are rewritten", async () => {
  const deck = { slides: [
    slide("bullets", "Scaling Requires Cross-Sector Collaboration"),
    slide("bullets", "Cross-Sector Collaboration Is Required For Scaling"),
    slide("bullets", "Scaling Requires Collaboration Across Sectors"),
  ] };
  const found = repetitionFindings(deck);
  assert.deepEqual(found.map((f) => f.index), [1, 2], "the first states the point and stays");
});

test("the fix instruction tells a repeat to make a different point", async () => {
  const msg = buildFixInstruction(
    [{ index: 4, kind: "repetition", detail: "x repeats slide 2", fix: "Advance the argument." }],
    [],
  );
  assert.match(msg, /Slide 5/);
  assert.match(msg, /repeats another slide/);
  assert.match(msg, /DIFFERENT point, not the same one/);
});

test("computed repetition does not double up on a slide the reviewer flagged", async () => {
  // One instruction per slide, or the rewrite is told two different things
  // about the same slide in the same breath.
  const deck = { slides: [
    slide("bullets", "Scaling Requires Cross-Sector Collaboration"),
    slide("bullets", "Cross-Sector Collaboration Enables Scaling"),
  ] };
  const chat = async () => ({ data: { findings: [{ index: 1, kind: "topic", detail: "off topic" }] } });
  const found = await coherenceFindings({ deck, chat });
  assert.equal(found.filter((f) => f.index === 1).length, 1);
  assert.equal(found[0].kind, "topic", "the reviewer's own finding wins");
});
