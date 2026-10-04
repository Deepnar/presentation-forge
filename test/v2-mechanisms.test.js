// V2-3D: plan-driven composition mechanisms produce editable scenes.
// Every authored block survives; geometry is finite, positive, in-bounds.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeck, compileDeckDetailed } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { validateScene } from "../packages/model/scene.ts";
import { checkSceneGeometry, checkElementIds } from "../packages/core/scene-quality.ts";
import { warmDesign } from "./v2-fixture.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";

describe("v2 mechanisms", () => {
  it("all twelve families compile to valid in-bounds scenes", async () => {
    const design = await warmDesign();
    const { scenes, plan } = compileDeckDetailed(mechanismDeck(), design);
    assert.equal(scenes.length, 12);
    const families = plan.slides.map((s) => s.family);
    for (const expected of ["divider", "prose-list", "card-grid", "comparison", "data-table", "metric", "chart", "sequence", "hierarchy", "media-led", "framed-prose"]) {
      assert.ok(families.includes(expected), `missing family ${expected}`);
    }
    // Escape is unreachable through current selection policy by design
    // (every known kind has a truthful family); it is exercised directly.
    const { compilePlannedSlide } = await import("../packages/compiler/mechanisms.ts");
    const escaped = compilePlannedSlide(
      {
        id: "x1", purpose: "carry", title: "Carry",
        blocks: [
          { id: "e1", kind: "text", text: "Lone line" },
          { id: "e2", kind: "stat", value: "7", label: "seven" },
          { id: "e3", kind: "table", rows: [["a"]], header: false },
        ],
      },
      {
        slideId: "x1", family: "escape", variantKey: "escape/standard", densityClass: "standard",
        emphasisTargets: [], mediaTreatment: "none", outcomeTreatments: [], caveatTargets: [],
        takeawayTreatment: "none", breaks: { sectionOpen: false }, selectionBasis: "fallback",
      },
      design,
    );
    for (const scene of [...scenes, escaped]) {
      const v = await validateScene(scene);
      assert.equal(v.ok, true, `${scene.id}: ${v.errors.join("; ")}`);
      assert.deepEqual(checkSceneGeometry(scene), [], scene.id);
      assert.deepEqual(checkElementIds(scene), [], scene.id);
      assert.equal(scene.layoutState, "managed");
    }
    const escapeRefs = new Set(escaped.elements.map((e) => e.semanticRef).filter(Boolean));
    assert.ok(["e1", "e2", "e3"].every((id) => escapeRefs.has(id)), "escape keeps every block");
  });

  it("sequence variants are structurally distinct", async () => {
    const design = await warmDesign();
    const { plan } = compileDeckDetailed(mechanismDeck(), design);
    const variants = Object.fromEntries(plan.slides.map((s) => [s.slideId, s]));
    assert.ok(variants["m-seq"].variantKey.startsWith("sequence/"));
    assert.equal(variants["m-cycle"].variantKey, "sequence/cycle");
    assert.notEqual(variants["m-seq"].variantKey, variants["m-cycle"].variantKey);
  });

  it("hierarchy renders tiers and reports ambiguous topology", async () => {
    const design = await warmDesign();
    const { scenes, findings } = compileDeckDetailed(mechanismDeck(), design);
    const hier = scenes.find((s) => s.id === "m-hier");
    assert.ok(hier.elements.some((e) => e.semanticRef === "h1"));
    assert.ok(hier.elements.some((e) => e.semanticRef === "h2"));
    const finding = findings.find((f) => f.code === "hierarchy-topology-unspecified");
    assert.ok(finding, "ambiguous hierarchy must be reported");
    assert.deepEqual([...finding.blockIds].sort(), ["h1", "h2", "h3"]);
  });

  it("two-block hierarchy renders without a finding", async () => {
    const design = await warmDesign();
    const { findings } = compileDeckDetailed({
      id: "h", title: "H",
      slides: [{
        id: "s1", purpose: "rank", title: "R", relationship: "hierarchy",
        blocks: [
          { id: "a", kind: "text", label: "Top", text: "Parent" },
          { id: "b", kind: "text", label: "Low", text: "Child" },
        ],
      }],
    }, design);
    assert.ok(!findings.some((f) => f.code === "hierarchy-topology-unspecified"));
  });

  it("unfavorable primary metrics stay dominant with cautionary frames", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "m", title: "M",
      slides: [{
        id: "s1", purpose: "headline", title: "Fall",
        blocks: [
          { id: "bad", kind: "stat", value: "-18%", label: "recall", emphasis: "primary", outcome: "unfavorable" },
          { id: "ok", kind: "stat", value: "91%", label: "precision" },
        ],
      }],
    }, design);
    const [scene] = scenes;
    assert.equal(scene.recipeId, "metric");
    const primary = scene.elements.find((e) => e.id === "s1:bad:content");
    const other = scene.elements.find((e) => e.id === "s1:ok:content");
    assert.ok(primary.w >= other.w, "primary keeps dominant area");
    assert.ok(scene.elements.some((e) => e.id === "s1:bad:frame"), "cautionary frame present");
  });

  it("chart measure selects honest encodings and preserves data", async () => {
    const design = await warmDesign();
    const kinds = [];
    for (const measure of ["comparison", "trend", "composition"]) {
      const { scenes } = compileDeckDetailed({
        id: "c", title: "C",
        slides: [{
          id: "s1", purpose: "p", title: "T",
          blocks: [{ id: "ch", kind: "chart", categories: ["A", "B"], series: [{ name: "v", values: [3, 4] }], measure }],
        }],
      }, design);
      kinds.push(scenes[0].elements.find((e) => e.kind === "chart").chart.chartKind);
    }
    assert.deepEqual(kinds, ["bar", "line", "doughnut"]);
  });

  it("distribution falls back to an exact table, never a fake chart", async () => {
    const design = await warmDesign();
    const { scenes, findings } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [{
          id: "ch", kind: "chart", categories: ["A", "B", "C"],
          series: [{ name: "n", values: [12.5, 3.25, 0.4] }], measure: "distribution", unit: "ms",
        }],
      }],
    }, design);
    const [scene] = scenes;
    assert.equal(scene.recipeId, "data-table");
    assert.ok(!scene.elements.some((e) => e.kind === "chart"), "no fake chart");
    const table = scene.elements.find((e) => e.kind === "table");
    assert.deepEqual(table.table.rows, [["", "n"], ["A", "12.5"], ["B", "3.25"], ["C", "0.4"]]);
    const text = JSON.stringify(scene.elements);
    assert.match(text, /Unit: ms/);
    assert.ok(findings.some((f) => f.code === "measure-encoding-unavailable"));
  });

  it("takeaway headline, verdict, and annotation all realize", async () => {
    const design = await warmDesign();
    const headlined = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p", title: "T", takeaway: "The point",
        blocks: [{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }],
      }],
    }, design).scenes[0];
    assert.ok(headlined.elements.some((e) => e.id === "s1:takeaway:headline"));
    const decided = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p", title: "T", takeaway: "Go left", rhetoricalRole: "decision",
        blocks: [
          { id: "l", kind: "text", label: "L", text: "x" },
          { id: "r", kind: "text", label: "R", text: "y" },
        ],
      }],
    }, design).scenes[0];
    assert.ok(decided.elements.some((e) => e.id === "s1:takeaway:verdict"));
    const evidenced = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p", title: "T", takeaway: "Note this",
        blocks: [{ id: "c1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }],
      }],
    }, design).scenes[0];
    assert.ok(evidenced.elements.some((e) => e.id === "s1:takeaway:annotation"));
  });

  it("inconclusive blocks carry visible caveats without losing importance", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "u", title: "U",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [{ id: "b1", kind: "text", label: "F", text: "8% fade", emphasis: "primary", outcome: "favorable", uncertainty: "inconclusive" }],
      }],
    }, design);
    const [scene] = scenes;
    const caveat = scene.elements.find((e) => e.id === "s1:b1:caveat");
    assert.ok(caveat);
    assert.match(JSON.stringify(caveat), /INCONCLUSIVE/);
  });

  it("media allocation follows treatment", async () => {
    const design = await warmDesign();
    const widths = {};
    for (const [key, mediaRole] of [["evidence", "evidence"], ["decorative", "decorative"]]) {
      const { scenes } = compileDeckDetailed({
        id: "m", title: "M",
        slides: [{
          id: "s1", purpose: "p", title: "T",
          blocks: [
            { id: "im", kind: "image", src: "", alt: "x", mediaRole },
            { id: "tx", kind: "list", items: ["a", "b", "c", "d"] },
          ],
        }],
      }, design);
      widths[key] = scenes[0].elements.find((e) => e.id === "s1:im:content").w;
    }
    assert.ok(widths.evidence > widths.decorative, "evidence image dominates decorative");
  });

  it("framed variants are structurally distinct", async () => {
    const design = await warmDesign();
    const frame = async (role) => compileDeckDetailed({
      id: "f", title: "F",
      slides: [{
        id: "s1", purpose: "p", title: "T", rhetoricalRole: role,
        blocks: [{ id: "b1", kind: "text", label: "R", text: "words" }],
      }],
    }, design).scenes[0];
    const lim = await frame("limitation");
    const rec = await frame("recommendation");
    const kinds = (s) => s.elements.map((e) => e.kind).join(",");
    assert.notEqual(kinds(lim), kinds(rec));
    assert.ok(lim.elements.some((e) => e.id === "s1:b1:frame"));
  });

  it("customized geometry survives a legitimate family change", async () => {
    const design = await warmDesign();
    const { applyCommand } = await import("../packages/model/commands.ts");
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const intent = {
      id: "r", title: "R",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [
          { id: "b1", kind: "text", label: "A", text: "alpha" },
          { id: "b2", kind: "text", label: "B", text: "beta" },
        ],
      }],
    };
    let scene = compileDeckDetailed(intent, design).scenes[0];
    assert.equal(scene.recipeId, "card-grid");
    const target = scene.elements.find((e) => e.id === "s1:b1:content");
    applyCommand(scene, { type: "element.move", id: target.id, x: 4.2, y: 3.1 });
    assert.equal(scene.layoutState, "customized");
    // Semantic edit changes the family: comparison of the same blocks.
    const edited = JSON.parse(JSON.stringify(intent));
    edited.slides[0].relationship = "comparison";
    const { plan } = planDeckComposition(edited, design);
    assert.equal(plan.slides[0].family, "comparison");
    scene = recompileSlide(edited.slides[0], scene, design, plan.slides[0]);
    const kept = scene.elements.find((e) => e.semanticRef === "b1" && e.kind === "text");
    assert.ok(kept, "semantic block survives the family change");
    assert.equal(kept.x, 4.2);
    assert.equal(kept.y, 3.1);
    assert.equal(scene.layoutState, "customized");
    assert.ok(scene.elements.some((e) => e.semanticRef === "b2"), "sibling block survives");
  });

  it("detached scenes stay untouched under the new compiler", async () => {
    const design = await warmDesign();
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const intent = {
      id: "r", title: "R",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }],
      }],
    };
    const scene = compileDeckDetailed(intent, design).scenes[0];
    scene.layoutState = "detached";
    const edited = JSON.parse(JSON.stringify(intent));
    edited.slides[0].relationship = "sequence";
    const { plan } = planDeckComposition(edited, design);
    assert.equal(recompileSlide(edited.slides[0], scene, design, plan.slides[0]), scene);
  });
});
