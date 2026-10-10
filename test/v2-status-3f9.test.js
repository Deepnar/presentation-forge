// V2-3F-9: implemented-vs-planned visual differentiation. Block
// status (`implemented`/`planned`/unspecified) emits a native badge
// — a filled or hollow square plus an eyebrow word — from the one
// shared placement path, so every family treats status identically.
// Words survive in monochrome, fill-vs-outline survives color loss,
// and unspecified blocks get nothing: no false claims.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { compileDeck, compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { compositionSceneProjection, analyzeDeck } from "../packages/compiler/quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { SCENE_H } from "../packages/model/scene-constants.ts";
import { CONTENT_FOOTER_RESERVE } from "../packages/core/chrome.ts";
import { benchmarkIntents } from "./v2-benchmark-intents.js";
import JSZip from "jszip";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name) {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
}

function contentBottom(design) {
  return SCENE_H - design.grid.margins.bottom - CONTENT_FOOTER_RESERVE;
}

function statusSlide(id, blocks, extra = {}) {
  return { id, purpose: `status ${id}`, title: `Status ${id}`, blocks, ...extra };
}

function deckWith(id, slides) {
  return { id, title: "Status", slides };
}

function badgesOf(scene, blockId) {
  return scene.elements.filter((e) => e.id === `${scene.id}:${blockId}:status` || e.id === `${scene.id}:${blockId}:status-mark`);
}

function allText(scene) {
  return scene.elements.filter((e) => e.kind === "text")
    .flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text))).join("\n");
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

describe("v2-3f-9 status contract", () => {
  it("implemented and planned validate; unknown values do not", async () => {
    for (const status of ["implemented", "planned"]) {
      const v = await validateDeckIntent(deckWith("v", [statusSlide("s", [{ id: "b", kind: "text", text: "x", status }])]));
      assert.equal(v.ok, true, `${status} validates`);
    }
    const bad = await validateDeckIntent(deckWith("v", [statusSlide("s", [{ id: "b", kind: "text", text: "x", status: "done" }])]));
    assert.equal(bad.ok, false, "invented status rejected");
  });

  it("status stays orthogonal to outcome, uncertainty, and emphasis", async () => {
    for (const status of ["implemented", "planned"]) {
      for (const outcome of ["favorable", "unfavorable", "mixed", "neutral"]) {
        for (const uncertainty of ["qualified", "mixed", "inconclusive", "contested"]) {
          for (const emphasis of ["primary", "supporting", "context"]) {
            const v = await validateDeckIntent(deckWith("v", [statusSlide("s", [{
              id: "b", kind: "text", text: "x", status, outcome, uncertainty, emphasis,
            }])]));
            assert.equal(v.ok, true, `${status}/${outcome}/${uncertainty}/${emphasis} validates`);
          }
        }
      }
    }
  });
});

describe("v2-3f-9 status counterfactuals", () => {
  function pairSlide(statusA, statusB) {
    const block = (status) => ({ id: "b1", kind: "text", label: "Item", text: "Same words either way", ...(status ? { status } : {}) });
    const deck = (id, status) => ({ id, title: "Status", slides: [statusSlide("s1", [block(status)])] });
    return [deck("pa", statusA), deck("pb", statusB)];
  }

  async function projections(a, b) {
    const design = await themeDesign("warm-humanist");
    return [a, b].map((deck) => JSON.stringify(compileDeck(deck, design).map(compositionSceneProjection)));
  }

  it("implemented versus planned differs visibly", async () => {
    const [pa, pb] = await projections(...pairSlide("implemented", "planned"));
    assert.ok(pa !== pb, "status change moves the scene");
  });

  it("implemented versus unspecified differs by presence", async () => {
    const [pa, pb] = await projections(...pairSlide("implemented", undefined));
    assert.ok(pa !== pb, "badge presence differs");
    const design = await themeDesign("warm-humanist");
    const [plain] = compileDeck(pairSlide(undefined, undefined)[1], design);
    assert.ok(!plain.elements.some((e) => /:status/.test(e.id)), "unspecified emits no badge");
  });

  it("planned versus unspecified differs by presence", async () => {
    const [pa, pb] = await projections(...pairSlide("planned", undefined));
    assert.ok(pa !== pb, "badge presence differs");
  });

  it("same status compiles deterministically", async () => {
    const design = await themeDesign("warm-humanist");
    const [deck] = pairSlide("planned", "planned");
    assert.equal(JSON.stringify(compileDeck(deck, design)), JSON.stringify(compileDeck(deck, design)));
  });

  it("theme change preserves status semantics", async () => {
    const [deck] = pairSlide("implemented", "implemented");
    const designs = [];
    for (const t of THEMES) designs.push(await themeDesign(t));
    // Semantics = badge presence, kinds, words, and solid-vs-hollow
    // nature — never the theme's own accent hex, which differs by
    // design across themes.
    const badgeOf = (design) => compileDeck(deck, design)[0].elements.filter((e) => /:status/.test(e.id))
      .map((e) => [e.id, e.kind, e.kind === "text" ? e.paragraphs[0].runs[0].text : (e.shape?.fillAlpha === 0 ? "hollow" : "solid")]);
    const ref = badgeOf(designs[0]);
    for (const [i, design] of designs.entries()) {
      assert.deepEqual(badgeOf(design), ref, `theme ${THEMES[i]} keeps status semantics`);
    }
  });

  it("free-text-only changes keep the status treatment", async () => {
    const design = await themeDesign("warm-humanist");
    const a = { id: "pa", title: "Status", slides: [{ id: "s1", purpose: "first wording", title: "T", blocks: [{ id: "b1", kind: "text", label: "Item", text: "Better wording here", status: "planned" }] }] };
    const b = { id: "pb", title: "Status", slides: [{ id: "s1", purpose: "second wording", title: "T", blocks: [{ id: "b1", kind: "text", label: "Item", text: "Worse wording here", status: "planned" }] }] };
    const badge = (scene) => scene.elements.filter((e) => /:status/.test(e.id));
    assert.deepEqual(badge(compileDeck(a, design)[0]), badge(compileDeck(b, design)[0]), "wording never moves the badge");
  });
});

describe("v2-3f-9 status robustness", () => {
  it("implemented blocks read filled mark plus word", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s1", [{ id: "b", kind: "text", label: "Done", text: "Shipped work", status: "implemented" }]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("d1", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const [scene] = scenes;
    const [mark, word] = badgesOf(scene, "b");
    assert.equal(mark?.kind, "shape", "mark emitted");
    assert.equal(mark.shape?.fill, design.palette.accent.hex, "implemented fill is the accent");
    assert.equal(word?.kind, "text", "word emitted");
    assert.equal(word.paragraphs[0].runs[0].text, "Implemented", "word is the vocabulary, not a synonym");
    assert.equal(word.paragraphs[0].runs[0].color, design.palette.ink.hex, "word in ink, not a verdict color");
  });

  it("planned blocks read hollow mark plus word", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s2", [{ id: "b", kind: "text", label: "Next", text: "Planned work", status: "planned" }]);
    const [scene] = compileDeck(deckWith("d2", [slide]), design);
    const [mark, word] = badgesOf(scene, "b");
    assert.equal(mark.shape?.fillAlpha, 0, "planned fill transparent");
    assert.equal(mark.shape?.stroke, design.palette.ink.hex, "planned outline in ink");
    assert.equal(word.paragraphs[0].runs[0].text, "Planned", "word is the vocabulary");
    assert.equal(word.paragraphs[0].runs[0].color, design.palette.ink.hex, "same ink as implemented: no value judgment");
  });

  it("unspecified blocks get no badge and no reservation", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s3", [{ id: "b", kind: "text", label: "Maybe", text: "Unspec work" }]);
    const [scene] = compileDeck(deckWith("d3", [slide]), design);
    assert.deepEqual(badgesOf(scene, "b"), [], "nothing emitted");
    assert.ok(!JSON.stringify(scene).includes(":status"), "no status keys anywhere");
  });

  it("mixed statuses differ on one slide", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s4", [
      { id: "a", kind: "text", label: "Done", text: "Shipped", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned", status: "planned" },
      { id: "c", kind: "text", label: "Maybe", text: "Unspec" },
    ]);
    const [scene] = compileDeck(deckWith("d4", [slide]), design);
    const [am] = badgesOf(scene, "a");
    const [bm] = badgesOf(scene, "b");
    assert.equal(am.shape?.fill, design.palette.accent.hex, "implemented solid");
    assert.equal(bm.shape?.fillAlpha, 0, "planned hollow");
    assert.deepEqual(badgesOf(scene, "c"), [], "unspecified bare");
  });

  it("implemented unfavorable keeps rail and badge", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s5", [
      { id: "b", kind: "text", label: "Risky", text: "Shipped with a known edge", status: "implemented", outcome: "unfavorable" },
    ]);
    const [scene] = compileDeck(deckWith("d5", [slide]), design);
    assert.ok(scene.elements.some((e) => e.id === "s5:b:tone"), "cautionary rail intact");
    assert.equal(badgesOf(scene, "b").length, 2, "badge intact beside the rail");
  });

  it("planned qualified keeps caveat and badge", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s6", [
      { id: "b", kind: "text", label: "Next", text: "Planned work with strings", status: "planned", uncertainty: "qualified" },
    ]);
    const [scene] = compileDeck(deckWith("d6", [slide]), design);
    assert.ok(scene.elements.some((e) => e.id === "s6:b:caveat"), "caveat intact");
    assert.equal(badgesOf(scene, "b").length, 2, "badge intact beside the caveat");
  });

  it("implemented primary emphasis keeps both treatments", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s7", [
      { id: "a", kind: "text", label: "Core", text: "The shipped core", emphasis: "primary", status: "implemented" },
      { id: "b", kind: "text", label: "Side", text: "A side note" },
    ]);
    const { plan } = compileDeckDetailed(deckWith("d7", [slide]), design);
    assert.ok(plan.slides[0].emphasisTargets.includes("a"), "emphasis planned");
    const [scene] = compileDeck(deckWith("d7", [slide]), design);
    assert.equal(badgesOf(scene, "a").length, 2, "badge intact under emphasis");
  });

  it("two comparison cards keep badges and alignment", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s8", [
      { id: "l", kind: "text", label: "Shipped", text: "What exists today in brief", status: "implemented" },
      { id: "r", kind: "text", label: "Roadmap", text: "What is proposed next in brief", status: "planned" },
    ], { relationship: "comparison" });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("d8", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const frames = scenes[0].elements.filter((e) => e.kind === "shape" && /:frame$/.test(e.id));
    assert.equal(frames.length, 2);
    assert.equal(frames[0].h, frames[1].h, "peer alignment holds with badges");
    assert.equal(badgesOf(scenes[0], "l").length, 2, "left badge");
    assert.equal(badgesOf(scenes[0], "r").length, 2, "right badge");
  });

  it("prose-list evidence blocks carry badges", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s9", [
      { id: "b", kind: "list", items: ["First shipped item", "Second shipped item"], status: "implemented" },
    ], { rhetoricalRole: "evidence" });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("d9", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    assert.equal(badgesOf(scenes[0], "b").length, 2, "list badge emitted");
  });

  it("benchmark shipped and planned slides read distinctly", async () => {
    const design = await themeDesign("warm-humanist");
    const intents = benchmarkIntents();
    const scenes = compileDeck(intents["source-of-truth-project"], design);
    const built = scenes.find((s) => s.id === "st-built");
    const planned = scenes.find((s) => s.id === "st-planned");
    const open = scenes.find((s) => s.id === "st-open");
    const limit = scenes.find((s) => s.id === "st-limit");
    const builtMark = built.elements.find((e) => e.id === "st-built:st-built-b1:status-mark");
    const plannedMark = planned.elements.find((e) => e.id === "st-planned:st-planned-b1:status-mark");
    assert.equal(builtMark.shape?.fill, design.palette.accent.hex, "shipped solid");
    assert.equal(plannedMark.shape?.fillAlpha, 0, "planned hollow");
    for (const s of [open, limit]) {
      assert.ok(!s.elements.some((e) => /:status/.test(e.id)), `${s.id} stays unspecified`);
    }
    const text = scenes.map(allText).join("\n");
    for (const needle of ["Six-recipe intent-to-scene compiler", "26/26", "877/878", "Full recipe families", "Agent runtime", "Byte-identical deterministic recompiles"]) {
      assert.ok(text.includes(needle), `words unchanged: ${needle}`);
    }
  });

  it("long status content seats or diagnoses honestly", async () => {
    const design = await themeDesign("warm-humanist");
    const body = "A long status-bearing body that wraps across several lines at the carrier measure. ".repeat(4).trim();
    const slide = statusSlide("s11", [{ id: "b", kind: "text", label: "Item", text: body, status: "planned" }]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("d11", [slide]), design);
    assert.ok(allText(scenes[0]).includes("wraps across several lines"), "no silent clipping");
    assert.ok(fitDiagnostics.every((d) => ["floor-hit", "word-floor-hit", "table-cell-overflow", "chart-label-overflow"].includes(d.kind)), "only known diagnostic kinds");
  });

  it("fitting status slides keep floors, ids, geometry, and chrome clear", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s12", [
      { id: "a", kind: "text", label: "Done", text: "Shipped work with enough copy to wrap a line", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned work with enough copy to wrap a line", status: "planned" },
    ]);
    const intent = deckWith("d12", [slide]);
    const analysis = await analyzeDeck(intent, design, chromeNone(intent.slides));
    assert.deepEqual(analysis.findings.filter((f) => f.code === "chrome-band-overlap"), [], "no chrome intrusion");
    const [scene] = analysis.scenes;
    assert.deepEqual(checkElementIds(scene), [], "ids unique");
    assert.deepEqual(checkSceneGeometry(scene), [], "in bounds");
    assert.equal((await validateScene(scene)).ok, true, "valid");
    for (const e of scene.elements) {
      if (e.kind !== "text") continue;
      for (const p of e.paragraphs ?? []) {
        for (const r of p.runs ?? []) {
          if (e.id.includes(":status")) {
            assert.ok(r.size >= 10, "badge text keeps eyebrow size");
          } else if (r.role === "body") {
            assert.ok(r.size >= 13, "body keeps its floor");
          }
        }
      }
    }
  });

  it("takeaway cardinality holds beside badges", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s16", [
      { id: "b", kind: "text", label: "Item", text: "Content", status: "implemented" },
    ], { takeaway: "The one thing to remember" });
    const [scene] = compileDeck(deckWith("d16", [slide]), design);
    const realized = scene.elements.filter((e) => /:takeaway:(headline|verdict|annotation)$/.test(e.id));
    assert.equal(realized.length, 1, "exactly one takeaway element");
    assert.equal(realized[0].paragraphs[0].runs[0].text, "The one thing to remember", "takeaway text exact");
  });

  it("caveat and rail associations survive badges", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s17", [
      { id: "b", kind: "text", label: "Risky next", text: "Planned work under qualification", status: "planned", outcome: "unfavorable", uncertainty: "qualified" },
    ]);
    const [scene] = compileDeck(deckWith("d17", [slide]), design);
    assert.ok(scene.elements.some((e) => e.id === "s17:b:caveat"), "caveat present");
    assert.ok(scene.elements.some((e) => e.id === "s17:b:tone"), "rail present");
    assert.equal(badgesOf(scene, "b").length, 2, "badge present");
    const caveat = scene.elements.find((e) => e.id === "s17:b:caveat");
    assert.equal(caveat.paragraphs[0].runs[0].text, "QUALIFIED", "caveat label intact");
  });

  it("status semantics hold across all five themes", async () => {
    const slide = statusSlide("s18", [
      { id: "a", kind: "text", label: "Done", text: "Shipped", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned", status: "planned" },
    ]);
    const intent = deckWith("d18", [slide]);
    const designs = [];
    for (const t of THEMES) designs.push(await themeDesign(t));
    const ref = JSON.stringify(compileDeck(intent, designs[0]).map(semanticProjection));
    for (const [i, design] of designs.entries()) {
      assert.equal(JSON.stringify(compileDeck(intent, design).map(semanticProjection)), ref, `theme ${THEMES[i]} invariant`);
    }
  });

  it("badges stay readable on a dark plate theme", async () => {
    const design = normalizeDesign({ theme: await loadThemeDocument("gradient-mesh-dark"), mode: "light" });
    const slide = statusSlide("s19", [
      { id: "a", kind: "text", label: "Done", text: "Shipped work", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned work", status: "planned" },
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed(deckWith("d19", [slide]), design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const [am, aw] = badgesOf(scenes[0], "a");
    const [bm, bw] = badgesOf(scenes[0], "b");
    assert.equal(aw.paragraphs[0].runs[0].color, design.palette.ink.hex, "words use theme ink on dark grounds");
    assert.equal(bw.paragraphs[0].runs[0].color, design.palette.ink.hex, "words use theme ink on dark grounds");
    assert.equal(am.shape?.fill, design.palette.accent.hex, "implemented fill resolves per theme");
    assert.equal(bm.shape?.stroke, design.palette.ink.hex, "planned outline resolves per theme");
  });

  it("status survives natively in PPTX and SVG alike", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s20", [
      { id: "a", kind: "text", label: "Done", text: "Shipped", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned", status: "planned" },
    ]);
    const [scene] = compileDeck(deckWith("d20", [slide]), design);
    const zip = await JSZip.loadAsync(await renderPptx([scene], {}));
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.ok(xml.includes("IMPLEMENTED") && xml.includes("PLANNED"), "badge words native in OOXML");
    assert.ok(xml.includes(`val="${design.palette.accent.hex}"`), "implemented fill native");
    assert.ok(!Object.keys(zip.files).some((n) => n.startsWith("ppt/media/") && !n.endsWith("/")), "nothing rasterized");
    const svg = sceneToSvg(scene);
    assert.ok(svg.includes("IMPLEMENTED") && svg.includes("PLANNED"), "SVG carries badge words");
    assert.ok(svg.includes(`stroke="#${design.palette.ink.hex}"`), "SVG carries the hollow outline");
  });

  it("customized geometry survives recompilation with badges", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s22", [{ id: "b", kind: "text", label: "Item", text: "Content with copy", status: "planned" }]);
    const intent = deckWith("d22", [slide]);
    const { plan } = compileDeckDetailed(intent, design);
    const [first] = compileDeck(intent, design);
    const target = first.elements.find((e) => e.id === "s22:b:content");
    const customized = {
      ...first,
      layoutState: "customized",
      elements: first.elements.map((e) => (e.id === target.id ? { ...e, y: e.y + 0.2, customized: true, provenance: "human" } : e)),
    };
    const next = recompileSlide(slide, customized, design, plan.slides[0], [], null);
    assert.equal(next.elements.find((e) => e.id === target.id).y, target.y + 0.2, "human geometry survives");
    assert.equal(badgesOf(next, "b").length, 2, "badge survives recompile");
  });

  it("detached scenes remain authoritative", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s23", [{ id: "b", kind: "text", label: "Item", text: "Content", status: "implemented" }]);
    const intent = deckWith("d23", [slide]);
    const { plan } = compileDeckDetailed(intent, design);
    const [first] = compileDeck(intent, design);
    const detached = { ...first, layoutState: "detached", background: { fill: "123456" } };
    assert.deepEqual(recompileSlide(slide, detached, design, plan.slides[0], [], null), detached);
  });

  it("blocks without status keep byte-identical elements", async () => {
    const design = await themeDesign("warm-humanist");
    const plain = statusSlide("s24", [
      { id: "a", kind: "text", label: "Done", text: "Shipped" },
      { id: "b", kind: "text", label: "Next", text: "Planned" },
    ]);
    const annotated = statusSlide("s24", [
      { id: "a", kind: "text", label: "Done", text: "Shipped", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned" },
    ]);
    const [plainScene] = compileDeck(deckWith("d24", [plain]), design);
    const [annotatedScene] = compileDeck(deckWith("d24", [annotated]), design);
    // A neighbor's badge shifts the shared draw-order counter, so z
    // is excluded: geometry, ids, typography, and refs must match
    // exactly, proving the sibling's content is untouched.
    const substance = (els) => els.map((e) => {
      const { z, ...rest } = e;
      return rest;
    });
    const plainB = substance(plainScene.elements.filter((e) => e.semanticRef === "b"));
    const annotatedB = substance(annotatedScene.elements.filter((e) => e.semanticRef === "b"));
    assert.deepEqual(annotatedB, plainB, "unspecified sibling untouched by a neighbor's status");
    assert.ok(annotatedScene.elements.some((e) => e.id === "s24:a:status"), "annotated block gains a badge");
  });

  it("compilation stays deterministic", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = statusSlide("s25", [
      { id: "a", kind: "text", label: "Done", text: "Shipped", status: "implemented" },
      { id: "b", kind: "text", label: "Next", text: "Planned", status: "planned" },
    ]);
    const intent = deckWith("d25", [slide]);
    assert.equal(JSON.stringify(compileDeck(intent, design)), JSON.stringify(compileDeck(intent, design)));
  });
});
