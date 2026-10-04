// V2-3C: deterministic composition planning. The planner decides WHAT
// strategy each slide uses; no geometry is produced here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  planDeckComposition,
  compositionProjection,
  comparePlanSensitivity,
} from "../packages/compiler/composition.ts";
import { warmDesign, sampleDeckIntent } from "./v2-fixture.js";
import { listThemeNames, loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

const slide = (blocks, extra = {}) => ({ id: "s1", purpose: "p", title: "T", blocks, ...extra });
const deck = (slides) => ({ id: "d", title: "D", slides });
const chartBlock = (id, extra = {}) => ({
  id, kind: "chart", chartKind: "bar", categories: ["A", "B"],
  series: [{ name: "v", values: [1, 2] }], ...extra,
});
const textBlock = (id, extra = {}) => ({ id, kind: "text", label: "L", text: "Some words here", ...extra });

describe("v2 composition determinism", () => {
  it("same intent and design give byte-identical plans", async () => {
    const design = await warmDesign();
    const a = JSON.stringify(planDeckComposition(sampleDeckIntent(), design));
    const b = JSON.stringify(planDeckComposition(JSON.parse(JSON.stringify(sampleDeckIntent())), design));
    assert.equal(a, b);
  });

  it("does not mutate intent or design", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const before = JSON.stringify({ intent, design });
    planDeckComposition(intent, design);
    assert.equal(JSON.stringify({ intent, design }), before);
  });
});

describe("v2 composition free-text invariance", () => {
  it("planning-prose deltas leave the projection identical", async () => {
    const design = await warmDesign();
    const base = sampleDeckIntent();
    const varied = JSON.parse(JSON.stringify(base));
    varied.audience = "Different room";
    varied.objective = "Different goal";
    varied.narrative = "Different story";
    varied.designDirection = "Different direction";
    for (const s of varied.slides) {
      s.visualDirection = "Different direction";
      s.purpose = "Different purpose";
      delete s.speakerNotes;
      s.speakerNotes = "Different notes";
    }
    const a = compositionProjection(planDeckComposition(base, design).plan);
    const b = compositionProjection(planDeckComposition(varied, design).plan);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("contains no prose-derived decisions", async () => {
    const { readFile: rf } = await import("node:fs/promises");
    const src = await rf(new URL("../packages/compiler/composition.ts", import.meta.url), "utf8");
    for (const pattern of ["includes(", ".match(", "RegExp(", "toLowerCase()", "toUpperCase()"]) {
      assert.ok(!src.includes(pattern), `prose parsing pattern present: ${pattern}`);
    }
  });
});

describe("v2 family selection", () => {
  it("maps relationships to families", async () => {
    const design = await warmDesign();
    const rel = (relationship) => planDeckComposition(deck([{
      ...slide([textBlock("b1"), textBlock("b2")]), relationship,
    }]), design).plan.slides[0];
    assert.equal(rel("comparison").family, "comparison");
    assert.equal(rel("sequence").family, "sequence");
    assert.equal(rel("cause-effect").family, "sequence");
    assert.equal(rel("cause-effect").variantKey, "sequence/cause-effect");
    assert.equal(rel("cycle").family, "sequence");
    assert.equal(rel("cycle").variantKey, "sequence/cycle");
    assert.equal(rel("hierarchy").family, "hierarchy");
    assert.equal(rel("part-whole").family, "card-grid");
  });

  it("keeps quantitative part-whole charts as chart", async () => {
    const design = await warmDesign();
    const plan = planDeckComposition(deck([{
      ...slide([{ ...chartBlock("b1"), measure: "composition" }]), relationship: "part-whole",
    }]), design).plan.slides[0];
    assert.equal(plan.family, "chart");
  });

  it("prefers primary carriers without relationships", async () => {
    const design = await warmDesign();
    const carrier = (block) => planDeckComposition(deck([slide([block])]), design).plan.slides[0];
    assert.equal(carrier({ ...chartBlock("b1"), emphasis: "primary" }).family, "chart");
    assert.equal(carrier({ ...chartBlock("b1"), emphasis: "primary" }).selectionBasis, "primary-carrier");
    assert.equal(carrier({ id: "b1", kind: "table", rows: [["a"]], header: true, emphasis: "primary" }).family, "data-table");
    assert.equal(carrier({ id: "b1", kind: "stat", value: "1", label: "l", emphasis: "primary" }).family, "metric");
    assert.equal(carrier({ id: "b1", kind: "image", src: "", emphasis: "primary" }).family, "media-led");
  });

  it("uses rhetorical role without overriding truthful carriers", async () => {
    const design = await warmDesign();
    const role = (extra, blocks) => planDeckComposition(deck([{ ...slide(blocks), ...extra }]), design).plan.slides[0];
    assert.equal(role({ rhetoricalRole: "opening" }, [textBlock("b1")]).family, "divider");
    assert.equal(role({ rhetoricalRole: "transition" }, [textBlock("b1")]).family, "divider");
    assert.equal(role({ rhetoricalRole: "limitation" }, [{ ...textBlock("b1"), label: "Risk" }]).family, "framed-prose");
    assert.equal(
      role({ rhetoricalRole: "evidence" }, [{ ...chartBlock("b1") }]).family, "chart",
      "evidence prefers its carrier over a styled list",
    );
  });

  it("falls back on content shape", async () => {
    const design = await warmDesign();
    const shape = (blocks) => planDeckComposition(deck([slide(blocks)]), design).plan.slides[0];
    assert.equal(shape([{ ...chartBlock("b1") }]).family, "chart");
    assert.equal(shape([{ id: "b1", kind: "table", rows: [["a"]], header: true }]).family, "data-table");
    assert.equal(shape([{ id: "b1", kind: "stat", value: "1", label: "l" }]).family, "metric");
    assert.equal(shape([{ id: "b1", kind: "image", src: "" }]).family, "media-led");
    assert.equal(shape([{ id: "b1", kind: "quote", text: "q" }]).family, "framed-prose");
    assert.equal(shape([{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }]).family, "prose-list");
    assert.equal(shape([textBlock("b1"), textBlock("b2")]).family, "card-grid");
    assert.equal(shape([textBlock("b1")]).family, "prose-list");
  });
});

describe("v2 media treatment", () => {
  it("distinguishes evidence, explanatory, and decorative", async () => {
    const design = await warmDesign();
    const media = (extra) => planDeckComposition(deck([slide([
      { id: "b1", kind: "image", src: "", ...extra },
      { id: "b2", kind: "list", items: ["a", "b", "c", "d"] },
    ], { layoutHint: { recipe: "media" } })]), design).plan.slides[0];
    assert.equal(media({ mediaRole: "evidence" }).mediaTreatment, "dominant");
    assert.equal(media({ mediaRole: "explanatory" }).mediaTreatment, "balanced");
    assert.equal(media({ mediaRole: "decorative" }).mediaTreatment, "subordinate");
  });

  it("primary image dominates regardless of role", async () => {
    const design = await warmDesign();
    const plan = planDeckComposition(deck([slide([
      { id: "b1", kind: "image", src: "", emphasis: "primary", mediaRole: "decorative" },
    ])]), design).plan.slides[0];
    assert.equal(plan.mediaTreatment, "dominant");
  });

  it("no image means no media treatment", async () => {
    const design = await warmDesign();
    const plan = planDeckComposition(deck([slide([textBlock("b1")])]), design).plan.slides[0];
    assert.equal(plan.mediaTreatment, "none");
  });
});

describe("v2 outcome and caveats", () => {
  it("primary plus unfavorable stays primary and cautionary", async () => {
    const design = await warmDesign();
    const plan = planDeckComposition(deck([slide([
      { ...textBlock("b1"), emphasis: "primary", outcome: "unfavorable" },
    ])]), design).plan.slides[0];
    assert.deepEqual(plan.emphasisTargets, ["b1"]);
    assert.deepEqual(plan.outcomeTreatments, [{ blockId: "b1", tone: "cautionary" }]);
  });

  it("inconclusive creates caveats without lowering emphasis", async () => {
    const design = await warmDesign();
    const plan = planDeckComposition(deck([slide([
      { ...textBlock("b1"), emphasis: "primary", outcome: "favorable", uncertainty: "inconclusive" },
    ])]), design).plan.slides[0];
    assert.deepEqual(plan.emphasisTargets, ["b1"]);
    assert.deepEqual(plan.outcomeTreatments, [{ blockId: "b1", tone: "affirming" }]);
    assert.deepEqual(plan.caveatTargets, [{ blockId: "b1", uncertainty: "inconclusive" }]);
  });
});

describe("v2 takeaway planning", () => {
  it("treats takeaway by family and role, none without takeaway", async () => {
    const design = await warmDesign();
    const planFor = (s) => planDeckComposition(deck([s]), design).plan.slides[0].takeawayTreatment;
    assert.equal(planFor({ ...slide([textBlock("b1")]), takeaway: "T" }), "headline");
    assert.equal(
      planFor({ ...slide([textBlock("b1"), textBlock("b2")]), relationship: "comparison", takeaway: "T" }),
      "verdict",
    );
    assert.equal(
      planFor({ ...slide([{ ...chartBlock("b1") }]), takeaway: "T" }),
      "annotation",
    );
    assert.equal(planFor(slide([textBlock("b1")])), "none");
  });
});

describe("v2 density planning", () => {
  it("classifies sparse, standard, and dense structurally", async () => {
    const design = await warmDesign();
    const density = (blocks) => planDeckComposition(deck([slide(blocks)]), design).plan.slides[0].densityClass;
    assert.equal(density([textBlock("b1")]), "sparse");
    assert.equal(
      density([{ id: "b1", kind: "list", items: ["a", "b", "c", "d", "e"] }]),
      "standard",
    );
    assert.equal(
      density([
        { id: "b1", kind: "list", items: ["a", "b", "c", "d", "e", "f"] },
        { id: "b2", kind: "chart", chartKind: "bar", categories: ["A", "B", "C", "D", "E", "F", "G", "H", "I"], series: [{ name: "v", values: [1, 2, 3, 4, 5, 6, 7, 8, 9] }] },
      ]),
      "dense",
    );
  });

  it("holds thresholds at 3/4 and 7/8 units", async () => {
    const design = await warmDesign();
    const three = [{ id: "b1", kind: "list", items: ["a", "b", "c"] }];
    const four = [{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }];
    const seven = [
      { id: "b1", kind: "list", items: ["a", "b", "c", "d", "e", "f"] },
      { id: "b2", kind: "stat", value: "1", label: "l" },
    ];
    const eight = [
      { id: "b1", kind: "list", items: ["a", "b", "c", "d", "e", "f", "g"] },
      { id: "b2", kind: "stat", value: "1", label: "l" },
    ];
    const density = (blocks) => planDeckComposition(deck([slide(blocks)]), design).plan.slides[0].densityClass;
    assert.equal(density(three), "sparse");
    assert.equal(density(four), "standard");
    assert.equal(density(seven), "standard");
    assert.equal(density(eight), "dense");
  });
});

describe("v2 rhythm planning", () => {
  const genericList = (id, n = 4) => ({
    id, purpose: "p", title: "T",
    blocks: [{ id: `${id}b`, kind: "list", items: Array.from({ length: n }, (_, i) => `item ${i}`) }],
  });

  it("breaks weak generic streaks with truthful alternatives", async () => {
    const design = await warmDesign();
    const intent = deck([genericList("s1"), genericList("s2"), genericList("s3")]);
    const families = planDeckComposition(intent, design).plan.slides.map((s) => s.family);
    assert.deepEqual(families, ["prose-list", "prose-list", "card-grid"]);
    const plans = planDeckComposition(intent, design).plan.slides;
    assert.equal(plans[2].selectionBasis, "rhythm");
  });

  it("preserves forced chart streaks", async () => {
    const design = await warmDesign();
    const chartSlide = (id) => ({
      id, purpose: "p", title: "T",
      blocks: [{ ...chartBlock(`${id}c`), emphasis: "primary" }],
    });
    const families = planDeckComposition(
      deck([chartSlide("s1"), chartSlide("s2"), chartSlide("s3")]), design,
    ).plan.slides.map((s) => s.family);
    assert.deepEqual(families, ["chart", "chart", "chart"]);
  });
});

describe("v2 legacy override planning", () => {
  it("maps all six compatibility values", async () => {
    const design = await warmDesign();
    const override = (recipe) => planDeckComposition(deck([{
      ...slide([textBlock("b1")]), layoutHint: { recipe },
    }]), design).plan.slides[0];
    assert.equal(override("title").family, "divider");
    assert.equal(override("content").family, "prose-list");
    assert.equal(override("comparison").family, "comparison");
    assert.equal(override("media").family, "media-led");
    assert.equal(override("chart").family, "chart");
    assert.equal(override("process").family, "sequence");
    assert.equal(override("title").selectionBasis, "legacy-override");
  });

  it("honesty refuses an impossible chart override", async () => {
    const design = await warmDesign();
    const over = planDeckComposition(deck([{
      ...slide([{ ...chartBlock("b1"), measure: "distribution" }]),
      layoutHint: { recipe: "chart" },
    }]), design);
    assert.equal(over.plan.slides[0].family, "data-table");
    assert.ok(over.findings.some((f) => f.code === "measure-encoding-unavailable"));
  });
});

describe("v2 capability gap planning", () => {
  it("distribution and association fall back honestly with findings", async () => {
    const design = await warmDesign();
    for (const measure of ["distribution", "association"]) {
      const { plan, findings } = planDeckComposition(deck([slide([{
        ...chartBlock("b1"), measure,
      }])]), design);
      assert.equal(plan.slides[0].family, "data-table");
      const finding = findings.find((f) => f.code === "measure-encoding-unavailable");
      assert.ok(finding, measure);
      assert.equal(finding.blockIds[0], "b1");
      assert.equal(finding.evidence.measure, measure);
      assert.equal(finding.evidence.fallback, "data-table");
    }
  });
});

describe("v2 structured plan sensitivity", () => {
  it("all six structured pairs are plan-sensitive", async () => {
    const design = await warmDesign();
    const { readFile: rf } = await import("node:fs/promises");
    const pairs = JSON.parse(
      await rf(new URL("./fixtures/v2-quality/counterfactual-structured.json", import.meta.url), "utf8"),
    ).pairs;
    const expected = JSON.parse(
      await readFile(new URL("./fixtures/v2-quality/baseline-structured.json", import.meta.url), "utf8"),
    );
    assert.ok(!Object.values(expected).some((r) => r.sensitive), "history stays indifferent");
    const { comparePlanSensitivity } = await import("../packages/compiler/composition.ts");
    for (const pair of pairs) {
      const r = comparePlanSensitivity(pair.id, pair.a, pair.b, design);
      assert.equal(r.sensitive, true, `${pair.id} must differ at plan level`);
    }
  });

  it("records the new plan baseline without touching scene history", async () => {
    const design = await warmDesign();
    const { readFile: rf } = await import("node:fs/promises");
    const pairs = JSON.parse(
      await rf(new URL("./fixtures/v2-quality/counterfactual-structured.json", import.meta.url), "utf8"),
    ).pairs;
    const { comparePlanSensitivity } = await import("../packages/compiler/composition.ts");
    const results = {};
    for (const pair of pairs) results[pair.id] = comparePlanSensitivity(pair.id, pair.a, pair.b, design);
    const expected = JSON.parse(
      await readFile(new URL("./fixtures/v2-quality/composition-plan-baseline.json", import.meta.url), "utf8"),
    );
    assert.deepEqual(results, expected);
  });
});

describe("v2 theme plan invariance", () => {
  it("semantic projection is identical across representative themes", async () => {
    const intent = sampleDeckIntent();
    const required = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
    const available = new Set(await listThemeNames());
    for (const name of required) assert.ok(available.has(name), `representative theme missing: ${name}`);
    let first = null;
    for (const name of required) {
      const design = normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
      const projection = compositionProjection(planDeckComposition(intent, design).plan);
      if (!first) first = projection;
      else assert.equal(JSON.stringify(projection), JSON.stringify(first), `theme ${name} changed plan semantics`);
    }
    assert.ok(first);
  });
});
