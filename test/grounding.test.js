import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClaims, claimGrounded, groundDeck } from "../src/ai/grounding.js";

const RESEARCH = `
## Green hydrogen
The EU targets 10 Mt of green hydrogen by 2030. Projects total 180 GW of
electrolyser capacity. Standard cell potential is 1.23 V. The Inflation
Reduction Act unlocked project finance in 2022. Scale-up began in 2019.
`;

test("extractClaims finds numbers, units, years and names, deduped", () => {
  const claims = extractClaims("Reach 180 GW by 2030. 180 GW is a lot, and 1.23 V too.");
  assert.ok(claims.includes("180 GW"));
  assert.ok(claims.includes("2030"));
  assert.ok(claims.includes("1.23 V"));
  // Dedup: "180 GW" appears twice but once in the set.
  assert.equal(claims.filter((c) => c === "180 GW").length, 1);
});

test("extractClaims skips noun phrases in headlines by default", () => {
  const claims = extractClaims("Global hydrogen capacity grew", { names: false });
  assert.ok(!claims.some((c) => c.includes("Global hydrogen")), JSON.stringify(claims));
  const withNames = extractClaims("The Inflation Reduction Act funded it");
  assert.ok(withNames.includes("Inflation Reduction Act"));
});

test("claimGrounded matches a figure present in the research", () => {
  assert.equal(claimGrounded("180 GW", RESEARCH), true);
  assert.equal(claimGrounded("1.23 V", RESEARCH), true);
  assert.equal(claimGrounded("2022", RESEARCH), true);
  assert.equal(claimGrounded("Inflation Reduction Act", RESEARCH), true);
});

test("claimGrounded accepts a glued unit (180GW) and rejects an absent number", () => {
  assert.equal(claimGrounded("180 GW", "By 2030 the fleet totals 180GW."), true);
  assert.equal(claimGrounded("900 MW", RESEARCH), false);
  assert.equal(claimGrounded("3.7 V", RESEARCH), false);
});

test("claimGrounded rejects a name the research never mentions", () => {
  assert.equal(claimGrounded("European Hydrogen Bank", RESEARCH), false);
});

test("groundDeck flags ungrounded claims into notes and problems", () => {
  const deck = {
    title: "T",
    slides: [
      { type: "title" },
      {
        type: "stats",
        headline: "Capacity",
        stats: [
          { value: "180 GW", label: "committed" },
          { value: "900 MW", label: "wrong" },
        ],
        notes: "existing note",
      },
    ],
  };
  const { findings, problems, notes } = groundDeck(deck, RESEARCH);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].slide, 1);
  assert.ok(findings[0].claims.includes("900 MW"));
  assert.ok(!findings[0].claims.includes("180 GW"));
  assert.ok(problems.some((p) => p.includes("slide 2") && p.includes("900 MW")));
  assert.ok(notes.slides[1].notes.includes("existing note"));
  assert.ok(notes.slides[1].notes.includes("[grounding]"));
  // The input deck is untouched — grounding works on a clone.
  assert.ok(!deck.slides[1].notes.includes("[grounding]"));
});

test("groundDeck stays silent without research", () => {
  const deck = { title: "T", slides: [{ type: "stats", headline: "h", stats: [{ value: "900 MW", label: "x" }] }] };
  const { findings, problems } = groundDeck(deck, "");
  assert.deepEqual(findings, []);
  assert.deepEqual(problems, []);
});
