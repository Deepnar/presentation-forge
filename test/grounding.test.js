import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClaims, claimGrounded, groundDeck, flattenSlide, deckFigures } from "../src/ai/grounding.js";

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

test("claimGrounded matches a decimal figure even when the notes spell the unit out", () => {
  // "18.84 GW" must trace to "18.84 gigawatts" — the normalized notes keep the
  // decimal point, so the bare-number match survives a unit abbreviation.
  assert.equal(claimGrounded("18.84 GW", "Cumulative rooftop capacity reached 18.84 gigawatts by March 2025."), true);
  assert.equal(claimGrounded("1.36", "The payout gap is 1.36 rupees per unit."), true);
});

test("claimGrounded matches a comma figure when the notes spell the unit out", () => {
  // "1,232 MW" must trace to "1,232 megawatts": the bare digits drop the comma
  // while the notes keep it as a space, so the spaced form is checked too.
  assert.equal(claimGrounded("1,232 MW", "336,000 installations totalling 1,232 megawatts."), true);
  assert.equal(claimGrounded("1,232", "The fleet totals 1,232 units."), true);
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

test("flattenSlide carries numbers as claims so chart and journey values are grounded", () => {
  const slide = {
    type: "chart",
    chart: { kind: "bar", categories: ["India", "China"], series: [{ name: "GW", values: [180, 120] }] },
  };
  const flat = flattenSlide(slide);
  assert.ok(flat.includes("180"), JSON.stringify(flat));
  assert.ok(flat.includes("120"));
  assert.ok(flat.includes("GW"));
});

test("a chart value missing from the research is flagged like any fabricated figure", () => {
  const deck = {
    title: "T",
    slides: [
      {
        type: "chart",
        headline: "Electrolyser capacity",
        chart: {
          kind: "bar",
          categories: ["2024", "2030"],
          series: [{ name: "GW", values: [180, 945] }],
        },
      },
    ],
  };
  const { findings, problems } = groundDeck(deck, RESEARCH);
  // 180 and 945 both check as bare numbers; 945 is not in the notes.
  const slide = findings.find((f) => f.slide === 0);
  assert.ok(slide, "a chart with an ungrounded value must produce a finding");
  assert.ok(slide.claims.includes("945"), JSON.stringify(slide.claims));
  assert.ok(!slide.claims.includes("180"), JSON.stringify(slide.claims));
  assert.ok(problems.some((p) => p.includes("945")));
});

test("a journey value missing from the research is flagged; structural depends_on indices are not", () => {
  const deck = {
    title: "T",
    slides: [
      {
        type: "journey",
        headline: "Solar cost per watt",
        stages: [
          { label: "2018", value: 64 },
          { label: "2020", value: 51 },
        ],
      },
      {
        type: "dependencies",
        headline: "Deployment order",
        nodes: [
          { title: "A", depends_on: [] },
          { title: "B", depends_on: [0] },
        ],
      },
    ],
  };
  const { findings } = groundDeck(deck, RESEARCH);
  const journey = findings.find((f) => f.slide === 0);
  assert.ok(journey, "a journey with an ungrounded value must produce a finding");
  assert.ok(journey.claims.includes("64"), JSON.stringify(journey.claims));
  const deps = findings.filter((f) => f.slide === 1);
  assert.equal(deps.length, 0, `dependencies indices must not be claims: ${JSON.stringify(deps)}`);
});

test("deckFigures lists the number-bearing claims the data slides draw", () => {
  const deck = {
    title: "T",
    slides: [
      { type: "chart", headline: "h", chart: { kind: "bar", categories: ["a"], series: [{ name: "GW", values: [180] }] } },
      { type: "journey", headline: "h2", stages: [{ label: "s", value: 29 }] },
      { type: "stats", headline: "h3", stats: [{ value: "900 MW", label: "x" }] },
      { type: "dependencies", headline: "h4", nodes: [{ title: "A", depends_on: [1] }] },
    ],
  };
  const figures = deckFigures(deck);
  assert.ok(figures.includes("180"), JSON.stringify(figures));
  assert.ok(figures.includes("29"));
  assert.ok(figures.includes("900 MW"));
  assert.ok(!figures.includes("1"), "depends_on indices must not leak into the figures list");
});

test("a relative %-of-baseline chart resolves its coordinates to the grounded deltas", () => {
  // The research states the percentages ("25% higher bandwidth, 45% lower
  // latency"); the chart's 125/55 are the 100-baseline normalisations of those
  // claims. Flagging the raw coordinates is a false positive — the extractor
  // resolves each to its delta-from-baseline and grounds the delta instead.
  const research = "DiOMP achieves 25% higher bandwidth and 45% lower latency than MPI+OpenMP.";
  const deck = {
    title: "T",
    slides: [
      {
        type: "chart",
        headline: "DIOMP: 25% HIGHER BANDWIDTH, 45% LOWER LATENCY",
        chart: {
          kind: "bar",
          unit: "% of MPI+OpenMP",
          categories: ["Bandwidth (relative)", "Latency (relative)"],
          series: [
            { name: "MPI+OpenMP", values: [100, 100] },
            { name: "DiOMP", values: [125, 55] },
          ],
        },
      },
    ],
  };
  const { findings, problems } = groundDeck(deck, research);
  assert.equal(findings.length, 0, `no ungrounded claims on a derived relative chart: ${JSON.stringify(findings)}`);
  assert.equal(problems.length, 0, JSON.stringify(problems));
});

test("a fabricated relative coordinate still flags when its delta is ungrounded", () => {
  // 175 on the relative axis resolves to "75" — the research never states 75%,
  // so the chart cannot ship the coordinate (the E1 rule, unchanged).
  const research = "DiOMP achieves 25% higher bandwidth than MPI+OpenMP.";
  const deck = {
    title: "T",
    slides: [
      {
        type: "chart",
        headline: "Throughput",
        chart: {
          kind: "bar",
          unit: "% of baseline",
          categories: ["Bandwidth (relative)"],
          series: [{ name: "X", values: [175] }],
        },
      },
    ],
  };
  const { findings } = groundDeck(deck, research);
  const slide = findings.find((f) => f.slide === 0);
  assert.ok(slide, "a relative coordinate whose delta is absent from the research must flag");
  assert.ok(slide.claims.includes("75"), JSON.stringify(slide.claims));
});
