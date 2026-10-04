// V2-3E-2: deterministic QA completion. Proves the quality harness
// consumes compiler evidence (FitDiagnostics, composition plan) and
// never re-measures text, never mutates input, and adds no generic
// overlap/contrast/chrome/aesthetic checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeDeck,
  checkFitDiagnostics,
  checkTakeawayRealization,
} from "../packages/compiler/quality.ts";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { floorOf } from "../packages/core/fit.ts";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name, mode = "light") {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode });
}

function l1(findings) {
  return findings.filter((f) => f.layer === "L1");
}

function sceneText(scene) {
  return scene.elements
    .filter((e) => e.kind === "text")
    .flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text)))
    .join("\n");
}

describe("v2-3e2 fit QA", () => {
  it("an ordinary fitting deck stays L1-clean", async () => {
    const design = await warmDesign();
    const { findings } = await analyzeDeck(sampleDeckIntent(), design);
    assert.deepEqual(l1(findings), []);
  });

  it("a floor hit surfaces as L1 text-fit-floor-hit with evidence", async () => {
    const design = await warmDesign();
    const longText = `This body runs far too long for its assigned box ${(("and keeps going ").repeat(12)).trim()}`;
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "overflow", title: "Tight boxes",
        blocks: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, kind: "text", label: `L${i}`, text: longText })),
      }],
    };
    const { scenes, findings } = await analyzeDeck(intent, design);
    const hit = l1(findings).find((f) => f.code === "text-fit-floor-hit" && f.elementIds?.[0] === "s1:b1:content");
    assert.ok(hit, `expected a floor-hit finding, got ${JSON.stringify(l1(findings))}`);
    assert.equal(hit.slideId, "s1");
    assert.ok(hit.elementIds?.length === 1, "exactly one element blamed");
    assert.equal(hit.evidence?.role, "body");
    assert.equal(hit.evidence?.diagnostic, "floor-hit");
    assert.deepEqual(hit.blockIds, ["b1"], "real block IDs attach; nothing invented");
    assert.ok(sceneText(scenes[0]).includes(longText), "authored text remains complete");
    assert.ok(!sceneText(scenes[0]).includes("…"), "no ellipsis fabricated");
  });

  it("an unbreakable word surfaces as L1 text-word-floor-hit", async () => {
    const design = await warmDesign();
    const word = `Pneumonoultramicroscopicsilicovolcanoconiosis${"x".repeat(160)}`;
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "long word", title: "Token",
        blocks: [{ id: "b1", kind: "text", label: "T", text: `Prefix ${word} suffix` }],
      }],
    };
    const { scenes, findings } = await analyzeDeck(intent, design);
    const hit = l1(findings).find((f) => f.code === "text-word-floor-hit");
    assert.ok(hit, `expected a word floor-hit, got ${JSON.stringify(l1(findings))}`);
    assert.equal(hit.slideId, "s1");
    assert.ok(sceneText(scenes[0]).includes(word), "the word survives whole, untruncated");
    for (const scene of scenes) {
      for (const el of scene.elements) {
        if (el.kind !== "text") continue;
        for (const p of el.paragraphs ?? []) {
          for (const r of p.runs) {
            if (!r.role) continue;
            const nominal = design.roles[r.role]?.size ?? r.size;
            const roleFloor = floorOf({ size: nominal, _role: r.role });
            const eff = roleFloor == null ? Infinity : Math.min(roleFloor, nominal);
            assert.ok((r.size ?? 0) >= eff - 1e-9, "no run shrinks below its floor");
          }
        }
      }
    }
  });

  it("legal shrinking above the floor stays clean", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "snug fit", title: "A heading long enough to need shrinking but not that long",
        blocks: [{ id: "b1", kind: "text", text: "Short body." }],
      }],
    };
    const { findings } = await analyzeDeck(intent, design);
    assert.deepEqual(findings.filter((f) => f.code.startsWith("text-")), []);
  });

  it("duplicate diagnostics collapse but distinct elements stay distinct", async () => {
    const intent = sampleDeckIntent();
    const diag = {
      slideId: "s1", elementId: "s1:e1:content", semanticRef: "b1",
      role: "body", kind: "floor-hit", message: "body would need 8pt — floor 13pt",
    };
    const dupes = checkFitDiagnostics(intent, [diag, { ...diag }]);
    assert.equal(dupes.length, 1, "identical duplicates collapse");
    const other = { ...diag, elementId: "s1:e2:content", semanticRef: "b2" };
    const distinct = checkFitDiagnostics(intent, [diag, other]);
    assert.equal(distinct.length, 2, "same message on two elements stays two findings");
    assert.deepEqual(distinct.map((f) => f.elementIds), [["s1:e1:content"], ["s1:e2:content"]]);
  });

  it("a non-block semanticRef never becomes a block ID", async () => {
    const intent = sampleDeckIntent();
    const diag = {
      slideId: "s1", elementId: "s1:title:heading", semanticRef: "title",
      role: "heading", kind: "floor-hit", message: "heading would need 9pt — floor 22pt",
    };
    const [finding] = checkFitDiagnostics(intent, [diag]);
    assert.ok(finding, "finding still emitted");
    assert.equal(finding.blockIds, undefined, '"title" is not an authored block');
    assert.equal(finding.evidence?.semanticRef, "title", "evidence retained anyway");
  });
});

describe("v2-3e2 takeaway realization", () => {
  async function realized(treatment) {
    const design = await warmDesign();
    const takeaway = "Adopt the ceramic separator for every high-rate cell.";
    let slide;
    if (treatment === "verdict") {
      slide = {
        id: "s1", purpose: "decide", title: "Choice", rhetoricalRole: "decision",
        blocks: [
          { id: "l", kind: "text", label: "Liquid", text: "Mature and cheap" },
          { id: "r", kind: "text", label: "Solid", text: "Safe and dense" },
        ],
        takeaway,
      };
    } else if (treatment === "annotation") {
      slide = {
        id: "s1", purpose: "report", title: "Figure", rhetoricalRole: "evidence",
        blocks: [{ id: "st", kind: "stat", value: "12.5", label: "mS/cm", emphasis: "primary" }],
        takeaway,
      };
    } else {
      slide = {
        id: "s1", purpose: "close", title: "Closing",
        blocks: [{ id: "b1", kind: "text", text: "We covered the stack." }],
        takeaway,
      };
    }
    const intent = { id: "d", title: "D", slides: [slide] };
    const detailed = compileDeckDetailed(intent, design);
    const comp = detailed.plan.slides.find((s) => s.slideId === "s1");
    assert.equal(comp.takeawayTreatment, treatment, `fixture really plans ${treatment}`);
    return { design, intent, slide, takeaway, detailed, comp };
  }

  for (const treatment of ["headline", "verdict", "annotation"]) {
    it(`${treatment} passes when correctly realized`, async () => {
      const { intent, slide, comp, detailed } = await realized(treatment);
      const scene = detailed.scenes.find((s) => s.id === "s1");
      assert.deepEqual(checkTakeawayRealization(slide, comp, scene), []);
      const { findings } = await analyzeDeck(intent, await warmDesign());
      assert.deepEqual(findings.filter((f) => f.code.startsWith("takeaway-")), []);
    });

    it(`${treatment} fails when its element is removed`, async () => {
      const { slide, comp, detailed } = await realized(treatment);
      const scene = JSON.parse(JSON.stringify(detailed.scenes.find((s) => s.id === "s1")));
      const id = `s1:takeaway:${treatment}`;
      scene.elements = scene.elements.filter((e) => e.id !== id);
      const [finding] = checkTakeawayRealization(slide, comp, scene);
      assert.ok(finding, "missing takeaway is reported");
      assert.equal(finding.layer, "L1");
      assert.equal(finding.code, "takeaway-not-realized");
      assert.equal(finding.slideId, "s1");
    });

    it(`${treatment} fails when its text is altered`, async () => {
      const { slide, comp, detailed } = await realized(treatment);
      const scene = JSON.parse(JSON.stringify(detailed.scenes.find((s) => s.id === "s1")));
      const el = scene.elements.find((e) => e.id === `s1:takeaway:${treatment}`);
      assert.ok(el && el.kind === "text", "expected element exists before corruption");
      el.paragraphs[0].runs[0].text = "Something the author never wrote.";
      const [finding] = checkTakeawayRealization(slide, comp, scene);
      assert.ok(finding, "altered takeaway text is reported");
      assert.equal(finding.code, "takeaway-not-realized");
    });
  }

  it("a wrong treatment fails even with identical text", async () => {
    const { slide, comp, detailed } = await realized("verdict");
    const scene = JSON.parse(JSON.stringify(detailed.scenes.find((s) => s.id === "s1")));
    const verdict = scene.elements.find((e) => e.id === "s1:takeaway:verdict");
    assert.ok(verdict, "verdict element exists before the swap");
    verdict.id = "s1:takeaway:headline";
    const [finding] = checkTakeawayRealization(slide, comp, scene);
    assert.ok(finding, "treatment substitution is reported");
    assert.equal(finding.code, "takeaway-treatment-mismatch");
  });

  it("slides without takeaways stay clean", async () => {
    const design = await warmDesign();
    const { findings } = await analyzeDeck(sampleDeckIntent(), design);
    assert.deepEqual(findings.filter((f) => f.code.startsWith("takeaway-")), []);
  });
});

describe("v2-3e2 existing findings survive", () => {
  it("plan L2 capability findings still surface", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [
        {
          id: "s1", purpose: "distribute", title: "Spread",
          blocks: [{
            id: "ch", kind: "chart", chartKind: "bar", measure: "distribution",
            categories: ["A", "B"], series: [{ name: "v", values: [1, 2] }],
          }],
        },
        {
          id: "s2", purpose: "rank", title: "Ranks", relationship: "hierarchy",
          blocks: [
            { id: "h1", kind: "text", label: "Top", text: "Parent" },
            { id: "h2", kind: "text", label: "Left", text: "Child one" },
            { id: "h3", kind: "text", label: "Right", text: "Child two" },
          ],
        },
      ],
    };
    const { findings } = await analyzeDeck(intent, design);
    assert.ok(findings.some((f) => f.code === "measure-encoding-unavailable"), "honesty-gap L2 survives");
    assert.ok(findings.some((f) => f.code === "hierarchy-topology-unspecified"), "topology L2 survives");
  });

  it("historical L1 codes still fire", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "diverge", title: "Data",
        blocks: [{ id: "c1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }],
      }],
    };
    const detailed = compileDeckDetailed(intent, design);
    const scene = JSON.parse(JSON.stringify(detailed.scenes[0]));
    scene.elements.push({ ...scene.elements[0] });
    const { checkSceneGeometry, checkElementIds } = await import("../packages/core/scene-quality.ts");
    assert.ok(checkElementIds(scene).some((f) => f.code === "duplicate-element-id"));
    const moved = JSON.parse(JSON.stringify(detailed.scenes[0]));
    moved.elements[0].x = 99;
    assert.ok(checkSceneGeometry(moved).some((f) => f.code === "off-canvas"));
  });
});

describe("v2-3e2 boundaries", () => {
  it("intentional overlap is not a finding", async () => {
    // Card frames sit behind their text by design; tone rails share
    // edges; badges sit inside frames. Content-content overlap is
    // semantically ambiguous, so no generic collision check may exist.
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "compare", title: "Sides", relationship: "comparison",
        blocks: [
          { id: "l", kind: "text", label: "Left", text: "Mature", outcome: "unfavorable" },
          { id: "r", kind: "text", label: "Right", text: "Novel" },
        ],
      }],
    };
    const { findings } = await analyzeDeck(intent, design);
    assert.deepEqual(findings.filter((f) => /overlap|collision/i.test(f.code)), []);
  });

  it("QA never mutates its inputs", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const beforeIntent = JSON.stringify(intent);
    const beforeDesign = JSON.stringify(design);
    await analyzeDeck(intent, design);
    assert.equal(JSON.stringify(intent), beforeIntent, "intent untouched");
    assert.equal(JSON.stringify(design), beforeDesign, "design untouched");
    const detailed = compileDeckDetailed(intent, design);
    const scene = detailed.scenes.find((s) => s.id === "s1");
    const comp = detailed.plan.slides.find((s) => s.slideId === "s1");
    const slide = intent.slides.find((s) => s.id === "s1");
    const beforeScene = JSON.stringify(scene);
    checkTakeawayRealization(slide, comp, scene);
    checkFitDiagnostics(intent, detailed.fitDiagnostics);
    assert.equal(JSON.stringify(scene), beforeScene, "scene untouched by checks");
  });

  it("a safe fixture stays L1-clean on all five themes", async () => {
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "greet", title: "Hello",
        blocks: [{ id: "b1", kind: "text", text: "A short, comfortable line." }],
      }],
    };
    for (const name of THEMES) {
      const design = await themeDesign(name);
      const { findings } = await analyzeDeck(intent, design);
      assert.deepEqual(findings.filter((f) => f.layer === "L1"), [], `${name} stays L1-clean`);
    }
  });
});
