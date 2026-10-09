// V2-3F-1: headline takeaways emit exactly once per slide.
// Regression: nine families emitted the headline below the title AND
// again from an unguarded trailing takeawayEls() call — duplicate
// scene IDs, and on chromed slides a copy inside the footer band.
// The emitter itself is fixed (trailing calls fire only for verdict
// or annotation); these tests prove cardinality, placement, and text
// per treatment across all twelve families.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { compilePlannedSlide } from "../packages/compiler/mechanisms.ts";
import { checkElementIds } from "../packages/core/scene-quality.ts";
import { warmDesign } from "./v2-fixture.js";
import { benchmarkIntents } from "./v2-benchmark-intents.js";
import { benchmarkChrome } from "../tools/v2-benchmark.mjs";
import { analyzeDeck } from "../packages/compiler/quality.ts";

const TAKEAWAY_TEXT = "The Fund keeps watching the fade";

function planFor(slideId, family, treatment) {
  return {
    slideId, family, variantKey: `${family}/standard`, densityClass: "standard",
    emphasisTargets: [], mediaTreatment: "none", outcomeTreatments: [], caveatTargets: [],
    takeawayTreatment: treatment, breaks: { sectionOpen: false }, selectionBasis: "content-shape",
  };
}

// Minimal valid slide per family: enough structure for the mechanism
// to run its normal path, nothing more.
function slideFor(family, withTakeaway) {
  const base = { id: "t1", purpose: "prove cardinality", title: "Cardinality" };
  if (withTakeaway) base.takeaway = TAKEAWAY_TEXT;
  switch (family) {
    case "divider": return { ...base, blocks: [{ id: "b1", kind: "text", text: "Body." }] };
    case "prose-list": return { ...base, blocks: [{ id: "b1", kind: "list", items: ["Alpha", "Beta"] }] };
    case "card-grid":
      return { ...base, blocks: [{ id: "b1", kind: "text", label: "One", text: "First" }, { id: "b2", kind: "text", label: "Two", text: "Second" }] };
    case "comparison":
      return { ...base, blocks: [{ id: "b1", kind: "text", label: "Left", text: "Mature" }, { id: "b2", kind: "text", label: "Right", text: "Novel" }] };
    case "data-table": return { ...base, blocks: [{ id: "b1", kind: "table", rows: [["a", "b"]], header: true }] };
    case "metric": return { ...base, blocks: [{ id: "b1", kind: "stat", value: "12.5", label: "mS/cm" }] };
    case "chart":
      return { ...base, blocks: [{ id: "b1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }] };
    case "sequence":
      return { ...base, blocks: [{ id: "b1", kind: "text", label: "One", text: "First" }, { id: "b2", kind: "text", label: "Two", text: "Second" }] };
    case "hierarchy":
      return { ...base, blocks: [{ id: "b1", kind: "text", label: "Top", text: "Parent" }, { id: "b2", kind: "text", label: "Low", text: "Child" }] };
    case "media-led":
      return { ...base, blocks: [{ id: "b1", kind: "image", src: "", alt: "alt" }, { id: "b2", kind: "text", text: "Caption text" }] };
    case "framed-prose": return { ...base, blocks: [{ id: "b1", kind: "text", label: "Risk", text: "Handle with care" }] };
    case "escape": return { ...base, blocks: [{ id: "b1", kind: "text", text: "Lone line" }] };
    default: throw new Error(`unknown family ${family}`);
  }
}

function takeawayEls(scene) {
  return scene.elements.filter((e) => /:takeaway:(headline|verdict|annotation)$/.test(e.id));
}

function elementText(el) {
  return (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
}

const FAMILIES = ["divider", "prose-list", "card-grid", "comparison", "data-table", "metric",
  "chart", "sequence", "hierarchy", "media-led", "framed-prose", "escape"];

describe("v2-3f-1 takeaway cardinality", () => {
  it("headline-treatment comparison emits exactly one headline", async () => {
    // The original defect shape: comparison + headline takeaway
    // produced two elements with the same ID on 9745f5c.
    const design = await warmDesign();
    const slide = slideFor("comparison", true);
    const scene = compilePlannedSlide(slide, planFor("t1", "comparison", "headline"), design);
    const found = scene.elements.filter((e) => e.id === "t1:takeaway:headline");
    assert.equal(found.length, 1, "exactly one headline element");
    assert.deepEqual(checkElementIds(scene), [], "no duplicate IDs");
    assert.equal(elementText(found[0]), TAKEAWAY_TEXT, "authored text exact");
    assert.ok(!scene.elements.some((e) => /:takeaway:(verdict|annotation)$/.test(e.id)), "no accidental verdict/annotation");
  });

  for (const family of FAMILIES) {
    it(`${family}: headline once on top, verdict/annotation/none exact`, async () => {
      const design = await warmDesign();
      for (const treatment of ["headline", "verdict", "annotation"]) {
        const slide = slideFor(family, true);
        const scene = compilePlannedSlide(slide, planFor("t1", family, treatment), design);
        const expected = `t1:takeaway:${treatment}`;
        const found = scene.elements.filter((e) => e.id === expected);
        assert.equal(found.length, 1, `${family}/${treatment}: exactly one ${expected}`);
        assert.equal(elementText(found[0]), TAKEAWAY_TEXT, `${family}/${treatment}: exact text`);
        for (const other of ["headline", "verdict", "annotation"].filter((t) => t !== treatment)) {
          assert.ok(!scene.elements.some((e) => e.id === `t1:takeaway:${other}`),
            `${family}/${treatment}: no accidental ${other}`);
        }
        if (treatment === "headline") {
          assert.ok(found[0].y < 4.0, `${family}/headline placed below the title, y=${found[0].y}`);
        } else {
          assert.ok(found[0].y > 4.5, `${family}/${treatment} placed in the reserved region, y=${found[0].y}`);
        }
        assert.deepEqual(checkElementIds(scene), [], `${family}/${treatment}: unique IDs`);
      }
      const plain = compilePlannedSlide(slideFor(family, false), planFor("t1", family, "none"), design);
      assert.deepEqual(takeawayEls(plain), [], `${family}/none: no takeaway element`);
      assert.ok(!plain.elements.some((e) => /:takeaway:/.test(e.id)), `${family}/none: no takeaway IDs at all`);
    });
  }

  it("planner-driven headline cases emit once with clean IDs", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [
        { id: "s1", purpose: "open", title: "Opening", rhetoricalRole: "opening", blocks: [{ id: "b1", kind: "text", text: "Body." }], takeaway: TAKEAWAY_TEXT },
        { id: "s2", purpose: "warn", title: "Caution", rhetoricalRole: "limitation", blocks: [{ id: "b2", kind: "text", label: "Risk", text: "Careful." }], takeaway: TAKEAWAY_TEXT },
      ],
    };
    const { scenes, plan } = compileDeckDetailed(intent, design);
    assert.ok(plan.slides.every((s) => s.takeawayTreatment === "headline" || s.takeawayTreatment === "none"));
    for (const scene of scenes) {
      const slide = intent.slides.find((s) => s.id === scene.id);
      const comp = plan.slides.find((s) => s.slideId === scene.id);
      if (!slide.takeaway || comp.takeawayTreatment === "none") continue;
      const found = scene.elements.filter((e) => e.id === `${scene.id}:takeaway:headline`);
      assert.equal(found.length, 1, `${scene.id}: single headline`);
      assert.deepEqual(checkElementIds(scene), [], `${scene.id}: unique IDs`);
    }
  });
});

describe("v2-3f-1 root-cause proof on benchmarks", () => {
  it("fixed decks carry no duplicate IDs and no footer-band intrusion", async () => {
    const intents = benchmarkIntents();
    const design = await warmDesign();
    for (const benchId of Object.keys(intents)) {
      const intent = intents[benchId];
      for (const chrome of [null, benchmarkChrome(intent, design)]) {
        const { scenes, findings } = await analyzeDeck(intent, design, chrome);
        assert.deepEqual(findings.filter((f) => f.code === "duplicate-element-id"), [], `${benchId}: no duplicate IDs`);
        assert.deepEqual(findings.filter((f) => f.code === "chrome-band-overlap"), [], `${benchId}: no footer intrusion`);
        for (const scene of scenes) {
          assert.deepEqual(checkElementIds(scene), [], `${benchId}/${scene.id}: unique IDs`);
        }
      }
    }
  });

  it("decision-deck floor hits survive the correction untouched", async () => {
    const intents = benchmarkIntents();
    const design = await warmDesign();
    const { findings } = await analyzeDeck(intents["decision-recommendation"], design);
    const hits = findings.filter((f) => f.code === "text-fit-floor-hit");
    assert.equal(hits.length, 2, "both genuine capacity failures still reported");
  });

  it("surviving contract: blocks, titles, takeaways, charts, caveats intact", async () => {
    const intents = benchmarkIntents();
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(intents["research-defense"], design);
    const close = scenes.find((s) => s.id === "rd-close");
    assert.ok(close.elements.some((e) => e.semanticRef === "rd-close-b1"), "authored block present");
    assert.ok(close.elements.find((e) => e.id === "rd-close:title:heading"), "title present");
    const takeaway = close.elements.find((e) => e.id === "rd-close:takeaway:headline");
    assert.equal(elementText(takeaway), "Fund the pilot; keep watching the fade", "takeaway text exact");
    const ev = scenes.find((s) => s.id === "rd-evidence");
    const chart = ev.elements.find((e) => e.kind === "chart" && e.semanticRef === "rd-evidence-c1");
    assert.deepEqual(chart.chart.series, [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }], "chart data exact");
    assert.deepEqual(chart.chart.categories, ["Oxide", "Sulfide", "Polymer"]);
    const neg = scenes.find((s) => s.id === "rd-negative");
    assert.ok(neg.elements.some((e) => e.id === "rd-negative:rd-negative-s1:caveat"), "caveat survives");
    assert.ok(neg.elements.some((e) => e.id === "rd-negative:rd-negative-s1:tone"), "outcome treatment survives");
  });
});
