// V2-3F benchmark evaluation, first slice (measurement only).
// Exercises hand-authored benchmark DeckIntents through the completed
// V2-3 compiler on every representative theme. Asserts structural
// truth (representation, chart fidelity, takeaway realization,
// determinism, invariance, sensitivity) and pins harness DETECTION
// of known defects — never the defects themselves. Qualitative
// judgment lives in docs/V2-3F-EVAL-1.md, not here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeckDetailed, compileDeck } from "../packages/compiler/compile.js";
import { analyzeDeck, compositionSceneProjection } from "../packages/compiler/quality.ts";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { validateScene } from "../packages/model/scene.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { benchmarkIntents, BENCHMARK_IDS } from "./v2-benchmark-intents.js";
import { benchmarkChrome, BENCHMARK_THEMES } from "../tools/v2-benchmark.mjs";
import { readFile } from "node:fs/promises";

async function themeDesign(name, mode = "light") {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode });
}

function walkElements(elements, fn) {
  for (const el of elements ?? []) {
    fn(el);
    walkElements(el.group?.children ?? [], fn);
  }
}

describe("v2-3f benchmark matrix", () => {
  it("all benchmarks compile valid scenes on all themes, deterministically", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      for (const themeName of BENCHMARK_THEMES) {
        const design = await themeDesign(themeName);
        const a = compileDeckDetailed(intents[benchId], design);
        const b = compileDeckDetailed(intents[benchId], design);
        assert.equal(JSON.stringify(a.scenes), JSON.stringify(b.scenes), `${benchId}/${themeName} deterministic`);
        for (const scene of a.scenes) {
          const v = await validateScene(scene);
          assert.ok(v.ok, `${benchId}/${themeName}/${scene.id} validates: ${v.errors.join("; ")}`);
        }
        assert.ok(a.scenes.length >= 4, `${benchId} has real slide count`);
      }
    }
  });

  it("every authored block is represented on every cell", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      for (const themeName of BENCHMARK_THEMES) {
        const design = await themeDesign(themeName);
        const { scenes } = compileDeckDetailed(intents[benchId], design);
        const byId = new Map(scenes.map((s) => [s.id, s]));
        for (const slide of intents[benchId].slides) {
          const refs = new Set();
          walkElements(byId.get(slide.id)?.elements, (el) => { if (el.semanticRef) refs.add(el.semanticRef); });
          for (const b of slide.blocks) {
            assert.ok(refs.has(b.id), `${benchId}/${themeName}: block ${slide.id}/${b.id} represented`);
          }
        }
      }
    }
  });

  it("chart data survives exactly on every cell", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      for (const themeName of BENCHMARK_THEMES) {
        const design = await themeDesign(themeName);
        const { scenes } = compileDeckDetailed(intents[benchId], design);
        const byId = new Map(scenes.map((s) => [s.id, s]));
        for (const slide of intents[benchId].slides) {
          for (const b of slide.blocks) {
            if (b.kind !== "chart") continue;
            let found = null;
            walkElements(byId.get(slide.id)?.elements, (el) => {
              if (el.kind === "chart" && el.semanticRef === b.id) found = el;
            });
            assert.ok(found, `${benchId}/${themeName}: chart ${b.id} present`);
            assert.deepEqual(found.chart.categories, b.categories);
            assert.deepEqual(found.chart.series, b.series);
          }
        }
      }
    }
  });

  it("takeaway realization is clean on benchmark decks", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      const design = await themeDesign("warm-humanist");
      const { findings } = await analyzeDeck(intents[benchId], design);
      assert.deepEqual(
        findings.filter((f) => f.code.startsWith("takeaway-")),
        [],
        `${benchId} takeaways realized`,
      );
    }
  });

  it("headline duplication is gone on every benchmark deck", async () => {
    // V2-3F-1 fixed the defect this test used to detect (trailing
    // takeawayEls calls duplicated headline takeaways in unguarded
    // families). The historical failure is preserved in
    // docs/V2-3F-EVAL-1.md; the live expectation is now L1-clean.
    const intents = benchmarkIntents();
    const design = await themeDesign("warm-humanist");
    for (const benchId of BENCHMARK_IDS) {
      const { findings } = await analyzeDeck(intents[benchId], design);
      assert.ok(
        !findings.some((f) => f.code === "duplicate-element-id"),
        `${benchId}: no duplicated takeaway`,
      );
    }
  });

  it("decision overflow is reported with evidence, text kept whole", async () => {
    const intents = benchmarkIntents();
    const design = await themeDesign("warm-humanist");
    const { scenes, findings } = await analyzeDeck(intents["decision-recommendation"], design);
    const hits = findings.filter((f) => f.code === "text-fit-floor-hit");
    assert.ok(hits.length > 0, "overflow diagnosed, not silently shrunk");
    const text = scenes.flatMap((s) =>
      s.elements.filter((e) => e.kind === "text")
        .flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text)))).join("\n");
    assert.ok(text.includes("moisture-sensitive handling"), "overflowing text kept complete");
  });

  it("PPTX and SVG render for every benchmark", async () => {
    const intents = benchmarkIntents();
    const design = await themeDesign("warm-humanist");
    for (const benchId of BENCHMARK_IDS) {
      const { scenes } = compileDeckDetailed(intents[benchId], design);
      const bytes = await renderPptx(scenes, {});
      assert.ok(bytes.length > 10000, `${benchId} PPTX has substance`);
      for (const scene of scenes) {
        const svg = sceneToSvg(scene);
        assert.ok(svg.includes("<svg") && svg.includes(`data-el="${scene.elements[0].id}"`));
      }
    }
  });
});

describe("v2-3f counterfactual sensitivity", () => {
  it("structured pairs are all composition-sensitive", async () => {
    const design = await themeDesign("warm-humanist");
    const { pairs } = JSON.parse(await readFile(
      new URL("./fixtures/v2-quality/counterfactual-structured.json", import.meta.url), "utf8"));
    assert.equal(pairs.length, 6);
    for (const p of pairs) {
      const proj = (deck) => JSON.stringify(compileDeck(deck, design).map(compositionSceneProjection));
      assert.ok(proj(p.a) !== proj(p.b), `${p.id}: structured change alters composition`);
    }
  });

  it("legacy pairs respond to meaning, ignore free text", async () => {
    const design = await themeDesign("warm-humanist");
    const { pairs } = JSON.parse(await readFile(
      new URL("./fixtures/v2-quality/counterfactual-pairs.json", import.meta.url), "utf8"));
    const proj = (deck) => JSON.stringify(compileDeck(deck, design).map(compositionSceneProjection));
    const sensitive = Object.fromEntries(pairs.map((p) => [p.id, proj(p.a) !== proj(p.b)]));
    // Takeaway/emphasis deltas change composition; purpose-only,
    // visualDirection-only, and audience-only deltas correctly do
    // not — the compiler must not parse free text.
    assert.equal(sensitive["strong-vs-misses-target"], true);
    assert.equal(sensitive["primary-vs-minor"], true);
    assert.equal(sensitive["compare-vs-sequence"], false, "purpose-only delta is compiler-invisible by design");
    assert.equal(sensitive["evidence-vs-illustration"], false, "visualDirection-only delta is compiler-invisible by design");
    assert.equal(sensitive["novice-vs-expert"], false, "audience-only delta is compiler-invisible by design");
  });
});

describe("v2-3f theme and chrome matrix", () => {
  it("semantic projection is invariant across themes per benchmark", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      let first = null;
      for (const themeName of BENCHMARK_THEMES) {
        const design = await themeDesign(themeName);
        const proj = JSON.stringify(compileDeck(intents[benchId], design).map(semanticProjection));
        if (first === null) first = proj;
        else assert.equal(proj, first, `${benchId}: theme ${themeName} changed semantics`);
      }
    }
  });

  it("chromed benchmarks realize chrome with no chrome findings on clean decks", async () => {
    const intents = benchmarkIntents();
    const design = await themeDesign("warm-humanist");
    for (const benchId of ["source-of-truth-project", "data-heavy-analytical"]) {
      const intent = intents[benchId];
      const { findings } = await analyzeDeck(intent, design, benchmarkChrome(intent, design));
      assert.deepEqual(findings.filter((f) => f.code.startsWith("chrome-")), [], `${benchId} chrome clean`);
      assert.deepEqual(findings.filter((f) => f.layer === "L1"), [], `${benchId} fully L1-clean with chrome`);
    }
  });

  it("dark chrome keeps the presenter/number opacity split", async () => {
    const intents = benchmarkIntents();
    const design = await themeDesign("sci-fi-hud");
    assert.ok(design.palette.bg.hex.toLowerCase() === "0a0f14", "sci-fi-hud is the dark surface");
    const intent = intents["source-of-truth-project"];
    const { scenes } = compileDeckDetailed(intent, design, benchmarkChrome(intent, design));
    const banner = scenes[0].elements.find((e) => e.id === `${scenes[0].id}:chrome:title-banner`);
    assert.ok(banner, "title surface gets the banner, not footer chrome");
    for (const scene of scenes.slice(1)) {
      const presenter = scene.elements.find((e) => e.id === `${scene.id}:chrome:presenter`);
      const number = scene.elements.find((e) => e.id === `${scene.id}:chrome:slide-number`);
      assert.ok(presenter && number, `${scene.id} has footer chrome`);
      assert.equal(presenter.opacity, 0.45);
      assert.equal(presenter.paragraphs[0].runs[0].color, "FFFFFF");
      assert.equal(number.opacity, 1);
    }
  });
});
