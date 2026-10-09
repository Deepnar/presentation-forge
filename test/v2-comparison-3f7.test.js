// V2-3F-7: capacity-aware comparison layout. The comparison family
// measures side and support demand before dividing the region,
// replacing the fixed 1.2in supporting-content reservation. Sides
// are served first (the family is named for them); support shares
// the remainder. Fitting runs after final geometry and diagnoses
// genuine overflow honestly — nothing shrinks below its floor.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeck, compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { compilePlannedSlide } from "../packages/compiler/mechanisms.ts";
import { validateScene } from "../packages/model/scene.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { SCENE_H } from "../packages/model/scene-constants.ts";
import { CONTENT_FOOTER_RESERVE } from "../packages/core/chrome.ts";
import { benchmarkIntents, BENCHMARK_IDS } from "./v2-benchmark-intents.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";

async function warmDesign() {
  return normalizeDesign({ theme: await loadThemeDocument("warm-humanist"), mode: "light" });
}

function contentBottom(design) {
  return SCENE_H - design.grid.margins.bottom - CONTENT_FOOTER_RESERVE;
}

function side(id, label, text, extra = {}) {
  return { id, kind: "text", label, text, ...extra };
}

function cmpSlide(id, blocks, extra = {}) {
  return { id, purpose: `compare ${id}`, title: `Title ${id}`, relationship: "comparison", blocks, ...extra };
}

function deckWith(id, slides) {
  return { id, title: "Capacity", slides };
}

function sideBoxes(scene) {
  return scene.elements.filter((e) => e.kind === "shape" && /:frame$/.test(e.id));
}

function sideTexts(scene) {
  return scene.elements.filter((e) => e.kind === "text" && /:content$/.test(e.id) && e.semanticRef);
}

function allText(scene) {
  return scene.elements.filter((e) => e.kind === "text")
    .flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text))).join("\n");
}

function minRunSize(scene) {
  let min = Infinity;
  for (const e of scene.elements) {
    if (e.kind !== "text") continue;
    for (const p of e.paragraphs ?? []) {
      for (const r of p.runs ?? []) {
        if (typeof r.size === "number") min = Math.min(min, r.size);
      }
    }
  }
  return min;
}

// Hand-built comparison plan for treatments planning never selects
// on this family (annotation/headline takeaways, explicit tones).
function plannedComp(slideId, { takeawayTreatment = "none", variantKey = "comparison/balanced", outcomeTreatments = [] } = {}) {
  return {
    slideId, family: "comparison", variantKey, densityClass: "standard",
    emphasisTargets: [], mediaTreatment: "none", outcomeTreatments,
    caveatTargets: [], takeawayTreatment, breaks: { sectionOpen: false },
    selectionBasis: "fallback",
  };
}

function chromeNone(slides) {
  return {
    slides: slides.map((s, i) => ({
      slideId: s.id, surface: "content", branding: "none",
      crestOnContentSlides: false, presenterOnSlides: false, slideNumbers: true,
      suppressPresenter: true, index: i + 1, total: slides.length,
      background: "FFFFFF", mutedInk: "555555",
    })),
  };
}

describe("v2-3f-7 comparison capacity", () => {
  it("two medium sides with one support seat at nominal size", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c1", [
      side("a", "Alpha", "Mature supply chain with qualified vendors in three regions"),
      side("b", "Beta", "Novel chemistry with a single pilot line and limited yield data"),
      { id: "s", kind: "callout", text: "Alpha ships now; beta needs a year" },
    ], { takeaway: "Ship alpha first" });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap1", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no floor-hits");
    const [scene] = scenes;
    assert.equal((await validateScene(scene)).ok, true);
    const frames = sideBoxes(scene);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].h, frames[1].h, "peer cards align");
    assert.ok(frames[0].h > 0.83, `cards sized to demand, not the old 0.83 (${frames[0].h})`);
    for (const t of sideTexts(scene)) {
      assert.ok(t.paragraphs[0].runs.every((r) => r.size === 13 || r.size === 15), "nominal label/body sizes");
    }
    const support = scene.elements.find((e) => e.id === "c1:s:content");
    assert.ok(support.h < 1.2, `support hugs its line (${support.h}), not the old reserve`);
  });

  it("three uneven sides share one row at the maximum demand", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c2", [
      side("a", "A", "Short"),
      side("b", "B", "A considerably longer body that wraps across several lines at the column measure"),
      side("c", "C", "Medium length body here"),
    ]);
    const [scene] = compileDeck(deckWith("cap2", [slide]), design);
    const frames = sideBoxes(scene);
    assert.equal(frames.length, 3);
    assert.ok(frames.every((f) => f.h === frames[0].h), "one row aligns");
    const { fitDiagnostics } = compileDeckDetailed(deckWith("cap2", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "uneven demand still seats");
  });

  it("comparison without support uses the whole region", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c3", [
      side("a", "Alpha", "First option with enough copy to wrap a second line"),
      side("b", "Beta", "Second option with enough copy to wrap a second line"),
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap3", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    assert.equal(scenes[0].elements.filter((e) => /:frame$/.test(e.id)).length, 2);
  });

  it("multiple supporting blocks each hug their demand", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c4", [
      side("a", "Alpha", "Compact case for the first side"),
      side("b", "Beta", "Compact case for the second side"),
      { id: "s1", kind: "callout", text: "First supporting note" },
      { id: "s2", kind: "callout", text: "Second supporting note with a little more copy in it" },
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap4", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const s1 = scenes[0].elements.find((e) => e.id === "c4:s1:content");
    const s2 = scenes[0].elements.find((e) => e.id === "c4:s2:content");
    assert.ok(s1.h <= s2.h + 1e-9, "support heights follow demand");
    assert.ok(s1.h < 1.0 && s2.h < 1.0, "neither support hoards the region");
  });

  it("short labels with long bodies are driven by the bodies", async () => {
    const design = await warmDesign();
    const body = "A long body that definitely wraps past the first line and keeps going into a third";
    const slide = cmpSlide("c5", [side("a", "A", body), side("b", "B", body)]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap5", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "long bodies seat");
    assert.ok(sideBoxes(scenes[0])[0].h > 1.0, "cards grow for body demand");
  });

  it("one long side sets the row without starving peers", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c6", [
      side("a", "Brief", "Short"),
      side("b", "Verbose", "A much longer body that needs three lines at this measure and sets the row height for both cards"),
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap6", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const frames = sideBoxes(scenes[0]);
    assert.equal(frames[0].h, frames[1].h, "peers align to the longest demand");
  });

  it("verdict takeaway keeps its reserve and seats", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c7", [
      side("a", "Alpha", "Copy with enough substance to wrap lines"),
      side("b", "Beta", "Copy with enough substance to wrap lines"),
      { id: "s", kind: "callout", text: "Supporting line" },
    ], { takeaway: "Choose alpha" });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap7", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const verdict = scenes[0].elements.find((e) => /:takeaway:verdict$/.test(e.id));
    assert.ok(verdict, "verdict emitted");
    assert.ok(Math.abs(verdict.y + verdict.h - contentBottom(design)) < 1e-9, "verdict owns the bottom band");
  });

  it("annotation takeaway reserves its band", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c8", [
      side("a", "Alpha", "Substantial copy for the first side here"),
      side("b", "Beta", "Substantial copy for the second side here"),
    ], { takeaway: "Annotate this" });
    const scene = compilePlannedSlide(slide, plannedComp("c8", { takeawayTreatment: "annotation" }), design);
    const note = scene.elements.find((e) => /:takeaway:annotation$/.test(e.id));
    assert.ok(note, "annotation emitted");
    assert.ok(note.y + note.h <= contentBottom(design) + 1e-9, "annotation inside the region");
    for (const e of scene.elements) {
      if (e.id.endsWith(":content") && !e.id.includes("takeaway")) {
        assert.ok(e.y + e.h <= note.y + 1e-9, `${e.id} stays above the annotation band`);
      }
    }
  });

  it("headline takeaway keeps its band below the title", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c9", [
      side("a", "Alpha", "Substantial copy for the first side here"),
      side("b", "Beta", "Substantial copy for the second side here"),
    ], { takeaway: "Headline this" });
    const scene = compilePlannedSlide(slide, plannedComp("c9", { takeawayTreatment: "headline" }), design);
    const head = scene.elements.find((e) => /:takeaway:headline$/.test(e.id));
    assert.ok(head, "headline takeaway emitted");
    const title = scene.elements.find((e) => e.id === "c9:title:heading");
    assert.ok(head.y >= title.y + title.h - 1e-9, "headline below the title");
  });

  it("no takeaway leaves the full region to content", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c10", [
      side("a", "Alpha", "Copy for the first side"),
      side("b", "Beta", "Copy for the second side"),
      { id: "s", kind: "callout", text: "Support" },
    ]);
    const [scene] = compileDeck(deckWith("cap10", [slide]), design);
    assert.ok(!scene.elements.some((e) => e.id.includes("takeaway")), "no takeaway elements");
    const maxBottom = Math.max(...scene.elements.map((e) => e.y + e.h));
    assert.ok(maxBottom <= contentBottom(design) + 1e-9, "content inside the region");
  });

  it("uncertainty on a side keeps its caveat band and seats", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c11", [
      side("a", "Alpha", "Copy with enough substance to wrap a second line", { uncertainty: "qualified" }),
      side("b", "Beta", "Copy with enough substance to wrap a second line"),
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap11", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "caveated sides seat");
    const caveat = scenes[0].elements.find((e) => e.id === "c11:a:caveat");
    assert.ok(caveat, "caveat emitted");
    const frame = scenes[0].elements.find((e) => e.id === "c11:a:frame");
    assert.ok(caveat.y + caveat.h <= frame.y + frame.h + 1e-9, "caveat inside its card");
  });

  it("cautionary sides keep the rail with narrowed demand", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c12", [
      side("a", "Risky", "Copy with enough substance to wrap a second line", { outcome: "unfavorable" }),
      side("b", "Safe", "Copy with enough substance to wrap a second line"),
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap12", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "railed sides seat");
    const rail = scenes[0].elements.find((e) => e.id === "c12:a:tone");
    assert.ok(rail, "tone rail emitted");
    const carrier = scenes[0].elements.find((e) => e.id === "c12:a:content");
    assert.ok(Math.abs(rail.y - carrier.y) < 1e-9 && Math.abs(rail.h - carrier.h) < 1e-9, "rail tracks the carrier");
  });

  it("genuinely un-fittable density diagnoses without loss", async () => {
    const design = await warmDesign();
    const long = "A side body with far more copy than any honest card can carry at readable size. ".repeat(6).trim();
    const slide = cmpSlide("c13", [
      side("a", "Alpha", long),
      side("b", "Beta", long),
      { id: "s", kind: "callout", text: `Supporting evidence that also runs very long. `.repeat(8).trim() },
    ], { takeaway: "Choose anyway" });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap13", [slide]), design);
    const hits = fitDiagnostics.filter((d) => d.kind === "floor-hit");
    assert.ok(hits.length > 0, "insufficient capacity diagnosed honestly");
    const [scene] = scenes;
    assert.ok(allText(scene).includes("honest card can carry"), "no truncation");
    assert.ok(minRunSize(scene) >= 13, "nothing below the body floor");
    assert.deepEqual(checkSceneGeometry(scene), [], "footprints stay on canvas");
  });

  it("single-sided comparison falls back to one full-width card", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c14", [side("a", "Only", "The single credible option with some copy")]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap14", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const frames = sideBoxes(scenes[0]);
    assert.equal(frames.length, 1);
    assert.ok(Math.abs(frames[0].w - (13.333 - 0.7 - 0.7)) < 1e-9, "card spans the content width");
  });

  it("empty and near-empty sides compile valid minimum cards", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c15", [side("a", "A", ""), side("b", "B", "Something")]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("cap15", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    for (const f of sideBoxes(scenes[0])) {
      assert.ok(f.h >= 0.8 - 1e-9, "card minimum holds");
    }
    assert.equal((await validateScene(scenes[0])).ok, true);
  });

  it("same inputs compile byte-identical scenes", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c16", [
      side("a", "Alpha", "Copy with enough substance to wrap a second line"),
      side("b", "Beta", "Copy with enough substance to wrap a second line"),
      { id: "s", kind: "callout", text: "Support" },
    ], { takeaway: "Pick one" });
    const a = compileDeck(deckWith("cap16", [slide]), design);
    const b = compileDeck(deckWith("cap16", [slide]), design);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("authored text survives complete and native", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c17", [
      side("a", "Sulfide", "12.5 mS/cm; moisture-sensitive handling adds 15% facility cost"),
      side("b", "Oxide", "1.2 mS/cm; air-stable handling; 2000-cycle data"),
      { id: "s", kind: "callout", text: "Sulfide pilots; oxide stays the fallback" },
    ], { takeaway: "Sulfide pilots, oxide waits in reserve" });
    const [scene] = compileDeck(deckWith("cap17", [slide]), design);
    for (const needle of ["12.5 mS/cm", "moisture-sensitive", "15% facility cost", "2000-cycle data", "stays the fallback", "waits in reserve"]) {
      assert.ok(allText(scene).includes(needle), `kept: ${needle}`);
    }
    const bytes = await renderPptx([scene], {});
    assert.ok(bytes.length > 5000, "native PPTX has substance");
    const svg = sceneToSvg(scene);
    assert.ok(svg.includes("12.5 mS/cm"), "SVG carries values");
  });

  it("comparison scenes carry no duplicate ids", async () => {
    const design = await warmDesign();
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      for (const scene of compileDeck(intents[benchId], design)) {
        assert.deepEqual(checkElementIds(scene), [], `${benchId}/${scene.id}`);
      }
    }
  });

  it("dense comparison geometry stays on canvas", async () => {
    const design = await warmDesign();
    const long = "Dense side copy that strains the card. ".repeat(10).trim();
    const slide = cmpSlide("c19", [side("a", "A", long), side("b", "B", long), side("c", "C", long)]);
    const [scene] = compileDeck(deckWith("cap19", [slide]), design);
    assert.deepEqual(checkSceneGeometry(scene), [], "no off-canvas geometry");
  });

  it("content never intrudes into the footer chrome band", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c20", [
      side("a", "Alpha", "Copy with enough substance to wrap a second line"),
      side("b", "Beta", "Copy with enough substance to wrap a second line"),
      { id: "s", kind: "callout", text: "Supporting line with a little more copy" },
    ], { takeaway: "Pick one" });
    const intent = deckWith("cap20", [slide]);
    const analysis = await analyzeDeck(intent, design, chromeNone(intent.slides));
    assert.deepEqual(
      analysis.findings.filter((f) => f.code === "chrome-band-overlap"),
      [],
      "no footer intrusion",
    );
    const scene = analysis.scenes[0];
    for (const e of scene.elements) {
      if (e.provenance !== "compiler" || e.locked) continue;
      assert.ok(e.y + e.h <= contentBottom(design) + 1e-9, `${e.id} above the footer reserve`);
    }
  });

  it("human-customized geometry survives recompilation", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c21", [
      side("a", "Alpha", "Copy with enough substance to wrap a second line"),
      side("b", "Beta", "Copy with enough substance to wrap a second line"),
    ]);
    const intent = deckWith("cap21", [slide]);
    const { plan } = compileDeckDetailed(intent, design);
    const comp = plan.slides.find((s) => s.slideId === "c21");
    const [first] = compileDeck(intent, design);
    const customized = {
      ...first,
      layoutState: "customized",
      elements: first.elements.map((e) => (e.id === "c21:a:frame" ? { ...e, h: e.h + 0.5, customized: true, provenance: "human" } : e)),
    };
    const next = recompileSlide(slide, customized, design, comp, [], null);
    const frame = next.elements.find((e) => e.id === "c21:a:frame");
    assert.equal(frame.h, customized.elements.find((e) => e.id === "c21:a:frame").h, "human height survives");
  });

  it("detached scenes remain authoritative", async () => {
    const design = await warmDesign();
    const slide = cmpSlide("c22", [side("a", "A", "Copy"), side("b", "B", "Copy")]);
    const intent = deckWith("cap22", [slide]);
    const { plan } = compileDeckDetailed(intent, design);
    const [first] = compileDeck(intent, design);
    const detached = { ...first, layoutState: "detached", background: { fill: "123456" } };
    const next = recompileSlide(slide, detached, design, plan.slides.find((s) => s.slideId === "c22"), [], null);
    assert.deepEqual(next, detached);
  });

  it("comparison semantics are invariant across themes", async () => {
    const intents = benchmarkIntents();
    const themes = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
    const designs = [];
    for (const t of themes) {
      designs.push(normalizeDesign({ theme: await loadThemeDocument(t), mode: "light" }));
    }
    const ref = JSON.stringify(compileDeck(intents["decision-recommendation"], designs[0]).map(semanticProjection));
    for (const [i, design] of designs.entries()) {
      assert.equal(
        JSON.stringify(compileDeck(intents["decision-recommendation"], design).map(semanticProjection)),
        ref,
        `theme ${themes[i]} invariant`,
      );
    }
  });

  it("non-comparison families stay diagnostically clean", async () => {
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed(mechanismDeck(), design);
    assert.deepEqual(fitDiagnostics, [], "mechanism deck has no diagnostics");
    for (const scene of scenes) {
      assert.equal((await validateScene(scene)).ok, true, `${scene.id} validates`);
      assert.deepEqual(checkSceneGeometry(scene), [], `${scene.id} in bounds`);
    }
  });

  it("the benchmark floor-hits resolve at nominal size", async () => {
    // EVAL-1 recorded dr-compare-s at 8.1pt and dr-compare-o at 9.9pt
    // against the 13pt floor. Both now seat at nominal size.
    const design = await warmDesign();
    const intents = benchmarkIntents();
    const [scene] = compileDeck(intents["decision-recommendation"], design);
    const cmp = scene.id === "dr-compare" ? scene : compileDeck(intents["decision-recommendation"], design).find((s) => s.id === "dr-compare");
    for (const id of ["dr-compare:dr-compare-s:content", "dr-compare:dr-compare-o:content"]) {
      const el = cmp.elements.find((e) => e.id === id);
      assert.ok(el, `${id} emitted`);
      assert.ok(el.paragraphs.every((p) => p.runs.every((r) => r.size === 13 || r.size === 15)), `${id} at nominal size`);
    }
  });
});
