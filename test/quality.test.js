import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuality } from "../src/ai/quality.js";

function deckOf(types) {
  return {
    title: "Test",
    sections: ["A", "B", "C"],
    slides: [
      { type: "title", headline: "T" },
      ...types.map((type, i) => ({ type, headline: `H${i}`, section: Math.floor(i / 3) })),
      { type: "closing", headline: "C" },
    ],
  };
}

test("flags 5+ consecutive same type as monotony", () => {
  const deck = deckOf(["bullets", "bullets", "bullets", "bullets", "bullets", "bullets"]);
  const findings = analyzeQuality(deck, "");
  assert.ok(findings.some((f) => f.kind === "monotony" && f.detail.includes("bullets")));
});

test("flags family streak and dominance", () => {
  const deck = deckOf(["bullets", "numbered-list", "checklist", "feature-grid", "icon-list", "stacked-list"]);
  // All are List & Grid family — 6 consecutive
  const findings = analyzeQuality(deck, "");
  assert.ok(findings.some((f) => f.kind === "monotony" && f.detail.includes("List & Grid")));
});

test("does not flag varied deck", () => {
  const deck = deckOf(["bullets", "chart", "compare", "flow", "quote", "table"]);
  const findings = analyzeQuality(deck, "");
  assert.equal(findings.filter((f) => f.kind === "monotony").length, 0);
});

test("flags data-blind when research has >=5 facts but deck has no data slides", () => {
  const deck = deckOf(["bullets", "bullets", "bullets", "bullets", "bullets"]);
  const research = "18 Rs/unit, 4.2 Rs/unit, 42,000 crore, 7.5 kW, 30.8 lakh, 60% capex";
  const findings = analyzeQuality(deck, research);
  assert.ok(findings.some((f) => f.kind === "data_unused"));
});

test("does not flag data-blind when deck has a chart", () => {
  const deck = deckOf(["bullets", "chart", "bullets", "compare", "bullets"]);
  const research = "18 Rs/unit, 4.2 Rs/unit, 42,000 crore, 7.5 kW, 30.8 lakh, 60% capex";
  const findings = analyzeQuality(deck, research);
  assert.ok(!findings.some((f) => f.kind === "data_unused"));
});

test("ignores dividers for monotony", () => {
  const deck = {
    title: "Test",
    sections: ["A", "B"],
    slides: [
      { type: "title" },
      { type: "section", headline: "S1" },
      { type: "bullets", headline: "H1", section: 0 },
      { type: "bullets", headline: "H2", section: 0 },
      { type: "section", headline: "S2" },
      { type: "bullets", headline: "H3", section: 1 },
      { type: "bullets", headline: "H4", section: 1 },
      { type: "closing" },
    ],
  };
  const findings = analyzeQuality(deck, "");
  // 4 bullets but split by section dividers in flat list they are 2+2, not 5 consecutive content, so no flag
  assert.equal(findings.filter((f) => f.kind === "monotony").length, 0);
});
