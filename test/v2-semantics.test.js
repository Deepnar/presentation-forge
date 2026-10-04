// V2-3B: semantic intent contracts. Schema shapes plus the semantic
// validator; compiler behavior must NOT change for any of these fields.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { validateIntentSemantics, collectBlockEvidenceRefs } from "../packages/model/semantics.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { warmDesign, sampleDeckIntent } from "./v2-fixture.js";

const slide = (blocks, extra = {}) => ({
  id: "s1", purpose: "p", title: "T", blocks, ...extra,
});
const deck = (slides) => ({ id: "d", title: "D", slides });

async function schemaOk(slides, extra = {}) {
  const { ok, errors } = await validateDeckIntent(deck(slides.map((s, i) => ({ ...s, ...extra }))));
  assert.equal(ok, true, errors.join("\n"));
}

describe("v2 rhetoricalRole", () => {
  it("all allowed values validate, unknown values fail", async () => {
    for (const rhetoricalRole of ["opening", "context", "problem", "method", "explanation", "evidence", "decision", "recommendation", "limitation", "conclusion", "transition"]) {
      await schemaOk([{ ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]), rhetoricalRole }]);
    }
    const { ok } = await validateDeckIntent(deck([{
      ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]),
      rhetoricalRole: "timeline",
    }]));
    assert.equal(ok, false);
  });
});

describe("v2 relationship", () => {
  it("all allowed values validate, unknown values fail", async () => {
    for (const relationship of ["comparison", "sequence", "cause-effect", "cycle", "hierarchy", "part-whole"]) {
      await schemaOk([{ ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]), relationship }]);
    }
    for (const relationship of ["none", "process", "timeline"]) {
      const { ok } = await validateDeckIntent(deck([{
        ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]),
        relationship,
      }]));
      assert.equal(ok, false, relationship);
    }
  });
});

describe("v2 emphasis", () => {
  it("primary, supporting, and context validate", async () => {
    await schemaOk([slide([
      { id: "b1", kind: "text", label: "A", text: "x", emphasis: "primary" },
      { id: "b2", kind: "text", label: "B", text: "y", emphasis: "supporting" },
      { id: "b3", kind: "text", label: "C", text: "z", emphasis: "context" },
    ])]);
  });
});

describe("v2 outcome and uncertainty are orthogonal", () => {
  it("primary/unfavorable/absent is valid", async () => {
    await schemaOk([slide([
      { id: "b1", kind: "text", label: "F", text: "x", emphasis: "primary", outcome: "unfavorable" },
    ])]);
  });

  it("primary/favorable/inconclusive is valid", async () => {
    await schemaOk([slide([
      { id: "b1", kind: "text", label: "F", text: "x", emphasis: "primary", outcome: "favorable", uncertainty: "inconclusive" },
    ])]);
  });

  it("all outcome and uncertainty values validate", async () => {
    for (const outcome of ["favorable", "unfavorable", "mixed", "neutral"]) {
      await schemaOk([slide([{ id: "b1", kind: "text", text: "x", outcome }])]);
    }
    for (const uncertainty of ["qualified", "mixed", "inconclusive", "contested"]) {
      await schemaOk([slide([{ id: "b1", kind: "text", text: "x", uncertainty }])]);
    }
  });
});

describe("v2 mediaRole", () => {
  it("passes on image blocks", async () => {
    for (const mediaRole of ["evidence", "explanatory", "decorative"]) {
      await schemaOk([slide([{ id: "b1", kind: "image", src: "", mediaRole }])]);
    }
  });

  it("fails semantic validation on non-image blocks", async () => {
    for (const kind of ["text", "chart", "list"]) {
      const blocks = kind === "chart"
        ? [{ id: "b1", kind, chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], mediaRole: "evidence" }]
        : kind === "list"
          ? [{ id: "b1", kind, items: ["a", "b", "c", "d"], mediaRole: "evidence" }]
          : [{ id: "b1", kind, text: "x", mediaRole: "evidence" }];
      const d = deck([slide(blocks)]);
      assert.equal((await validateDeckIntent(d)).ok, true, "schema stays permissive");
      const sem = validateIntentSemantics(d);
      assert.equal(sem.ok, false, kind);
      assert.match(sem.errors.join("\n"), /mediaRole is valid only on image/);
    }
  });
});

describe("v2 measure", () => {
  it("passes on chart blocks", async () => {
    for (const measure of ["comparison", "trend", "composition", "distribution", "association"]) {
      await schemaOk([slide([{ id: "b1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], measure }])]);
    }
  });

  it("fails semantic validation on non-chart blocks", async () => {
    const d = deck([slide([{ id: "b1", kind: "text", text: "x", measure: "trend" }])]);
    assert.equal(validateIntentSemantics(d).ok, false);
  });

  it("enforces the honesty matrix only when both exist", async () => {
    const chart = (measure, chartKind) => deck([slide([{
      id: "b1", kind: "chart", chartKind, categories: ["A"], series: [{ name: "v", values: [1] }], measure,
    }])]);
    assert.equal(validateIntentSemantics(chart("trend", "line")).ok, true);
    assert.equal(validateIntentSemantics(chart("composition", "pie")).ok, true);
    assert.equal(validateIntentSemantics(chart("trend", "pie")).ok, false);
    assert.equal(validateIntentSemantics(chart("distribution", "bar")).ok, false);
    const noKind = deck([slide([{
      id: "b1", kind: "chart", categories: ["A"], series: [{ name: "v", values: [1] }], measure: "distribution",
    }])]);
    assert.equal(noKind && validateIntentSemantics(noKind).ok, true);
    const noMeasure = deck([slide([{
      id: "b1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }],
    }])]);
    assert.equal(validateIntentSemantics(noMeasure).ok, true);
  });
});

describe("v2 evidenceRefs", () => {
  it("accepts valid unique ids and collects them deterministically", async () => {
    const s = slide([
      { id: "b1", kind: "text", text: "x", evidenceRefs: ["src_2", "src_1"] },
      { id: "b2", kind: "text", text: "y", evidenceRefs: ["src_1", "src_3"] },
    ]);
    await schemaOk([s]);
    assert.equal(validateIntentSemantics(deck([s])).ok, true);
    assert.deepEqual(collectBlockEvidenceRefs(s), ["src_2", "src_1", "src_3"]);
  });

  it("rejects duplicates and locator/excerpt copies", async () => {
    const dup = deck([slide([{ id: "b1", kind: "text", text: "x", evidenceRefs: ["s1", "s1"] }])]);
    assert.equal((await validateDeckIntent(dup)).ok, false);
    const copy = deck([slide([{ id: "b1", kind: "text", text: "x", locator: "p.1" }])]);
    assert.equal((await validateDeckIntent(copy)).ok, false);
  });

  it("slide sourceRefs alone remain valid without block duplication", async () => {
    const d = deck([{ ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]), sourceRefs: ["src_9"] }]);
    assert.equal((await validateDeckIntent(d)).ok, true);
    assert.equal(validateIntentSemantics(d).ok, true);
    assert.deepEqual(collectBlockEvidenceRefs(d.slides[0]), []);
  });
});

describe("v2 takeaway floor", () => {
  it("absent takeaway is valid, empty takeaway is rejected", async () => {
    await schemaOk([slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }])]);
    const { ok } = await validateDeckIntent(deck([
      { ...slide([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]), takeaway: "" },
    ]));
    assert.equal(ok, false);
  });
});

describe("v2 free text does not move the compiler", () => {
  it("planning-prose deltas leave scenes identical", async () => {
    const design = await warmDesign();
    const base = sampleDeckIntent();
    const varied = JSON.parse(JSON.stringify(base));
    varied.audience = "Totally different audience";
    varied.objective = "Another objective";
    varied.narrative = "Another narrative";
    varied.designDirection = "Another direction";
    varied.slides[1].visualDirection = "Something else entirely";
    const a = JSON.stringify(compileDeck(base, design));
    const b = JSON.stringify(compileDeck(varied, design));
    assert.equal(a, b);
  });

  it("structured fields move scenes while free text does not", async () => {
    // V2-3B recorded indifference as a temporary baseline; V2-3D realizes
    // the semantics, so enriched scenes must now differ (content preserved).
    const design = await warmDesign();
    const base = sampleDeckIntent();
    const enriched = JSON.parse(JSON.stringify(base));
    enriched.slides[1].rhetoricalRole = "evidence";
    enriched.slides[1].relationship = "sequence";
    enriched.slides[2].blocks[0].emphasis = "primary";
    enriched.slides[2].blocks[0].outcome = "unfavorable";
    enriched.slides[4].blocks[0].measure = "comparison";
    enriched.slides[4].blocks[0].evidenceRefs = ["src_1"];
    const { ok, errors } = await validateDeckIntent(enriched);
    assert.equal(ok, true, errors.join("\n"));
    assert.equal(validateIntentSemantics(enriched).ok, true);
    const a = compileDeck(base, design);
    const b = compileDeck(enriched, design);
    assert.notEqual(JSON.stringify(a), JSON.stringify(b));
    // Same factual content on both sides: titles, blocks, and chart data.
    const texts = (scenes) => JSON.stringify(scenes.map((s) => s.elements.map((e) => [
      e.kind,
      (e.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join("")),
      e.chart?.series,
    ])));
    assert.ok(texts(b).includes("Liquid electrolytes leak"));
    assert.ok(texts(b).includes("12.5"));
  });
});
