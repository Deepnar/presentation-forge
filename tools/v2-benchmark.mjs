// V2-3F benchmark evaluation runner (measurement only).
//
// Runs hand-authored benchmark DeckIntents through the completed V2-3
// compiler on every representative theme, with and without chrome,
// and records machine-readable results: plan, L1/L2 findings, fit
// diagnostics, block representation, takeaway realization, chart
// fidelity, PPTX bytes, and rasterized contact sheets. It changes no
// compiler, schema, renderer, or theme behavior.
//
//   node tools/v2-benchmark.mjs [--out out/v2-3f] [--raster all|key|none]
//
// Outputs (all reproducible from a clean checkout):
//   <out>/results.json        machine-readable evaluation record
//   <out>/svg/<bench>/<theme>-<slide>.svg
//   <out>/png/<bench>/<theme>-<slide>.png   (LibreOffice raster)
//   <out>/contact-<bench>-<theme>.png       tiled contact sheets
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { surfaceForPlan } from "../packages/compiler/background.ts";
import { resolvePlateBackgrounds, slideBackgrounds } from "../src/v2-plates.js";
import { compileDeckDetailed, compileDeck } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { analyzeDeck, compositionSceneProjection } from "../packages/compiler/quality.ts";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { preview } from "../src/preview.js";
import { benchmarkIntents, BENCHMARK_IDS } from "../test/v2-benchmark-intents.js";

export const BENCHMARK_THEMES = [
  "warm-humanist",
  "swiss-international",
  "editorial-magazine",
  "high-contrast-mono",
  "sci-fi-hud",
];

const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PRESENTERS = ["Asha Rao", "Bruno Dias"];

// Adapter-resolved chrome, mirroring the 3E-3 test seam: first slide
// is the title surface, the rest are content surfaces (emission
// mapping unchanged). The contrast background is the resolved plate
// corner for the slide's planned surface when a plate replaces the
// flat ground, else palette.bg — the ground V2 actually renders on
// every family. Chrome policy itself is untouched.
export function benchmarkChrome(intent, design, { backgrounds = null, plan = null } = {}) {
  const surfaceById = new Map(
    (plan?.slides ?? []).map((s) => [s.slideId, surfaceForPlan(s)]),
  );
  return {
    slides: intent.slides.map((s, i) => {
      const surface = surfaceById.get(s.id) ?? (i === 0 ? "title" : "content");
      return {
        slideId: s.id,
        surface: i === 0 ? "title" : "content",
        branding: "full",
        banner: { src: PNG_1X1, ratio: 4 },
        selectedCrest: { src: PNG_1X1, ratio: 0.8 },
        primaryCrestRatio: 0.8,
        crestOnContentSlides: true,
        presenterOnSlides: true,
        slideNumbers: true,
        suppressPresenter: false,
        presenterText: PRESENTERS[i % PRESENTERS.length],
        index: i + 1,
        total: intent.slides.length,
        background: backgrounds?.assets?.[surface]?.contrastBg ?? design.palette.bg.hex,
        mutedInk: design.palette.inkMuted.hex,
        captionFamily: design.roles.caption?.family,
      };
    }),
  };
}

function walkElements(elements, fn) {
  for (const el of elements ?? []) {
    fn(el);
    walkElements(el.group?.children ?? [], fn);
  }
}

function representation(intent, scenes) {
  // Every authored block must surface as some element's semanticRef.
  const missing = [];
  const byId = new Map(scenes.map((s) => [s.id, s]));
  for (const slide of intent.slides) {
    const scene = byId.get(slide.id);
    const refs = new Set();
    walkElements(scene?.elements, (el) => { if (el.semanticRef) refs.add(el.semanticRef); });
    for (const b of slide.blocks) {
      if (!refs.has(b.id)) missing.push(`${slide.id}/${b.id}`);
    }
  }
  return { missing };
}

function chartFidelity(intent, scenes) {
  // Exact categories/series survival per chart block.
  const mismatches = [];
  const byId = new Map(scenes.map((s) => [s.id, s]));
  for (const slide of intent.slides) {
    const scene = byId.get(slide.id);
    for (const b of slide.blocks) {
      if (b.kind !== "chart") continue;
      let found = null;
      walkElements(scene?.elements, (el) => {
        if (el.kind === "chart" && el.semanticRef === b.id) found = el;
      });
      if (!found) { mismatches.push(`${slide.id}/${b.id}:absent`); continue; }
      if (JSON.stringify(found.chart?.categories ?? null) !== JSON.stringify(b.categories ?? null)) {
        mismatches.push(`${slide.id}/${b.id}:categories`);
      }
      if (JSON.stringify(found.chart?.series ?? null) !== JSON.stringify(b.series ?? null)) {
        mismatches.push(`${slide.id}/${b.id}:series`);
      }
    }
  }
  return { mismatches };
}

function minFittedSize(scenes) {
  let min = Infinity;
  walkElements(scenes.flatMap((s) => s.elements), (el) => {
    for (const p of el.paragraphs ?? []) {
      for (const r of p.runs ?? []) {
        if (typeof r.size === "number") min = Math.min(min, r.size);
      }
    }
  });
  return min === Infinity ? null : min;
}

async function rasterize(pptxBytes, outDir, stem) {
  const src = path.join(outDir, `${stem}.pptx`);
  await writeFile(src, pptxBytes);
  const { pages } = await preview(src, { outDir: path.join(outDir, stem) });
  return pages;
}

async function contactSheet(pngs, outFile) {
  const { default: sharp } = await import("sharp");
  const metas = await Promise.all(pngs.map((f) => sharp(f).metadata()));
  const w = Math.max(...metas.map((m) => m.width));
  const h = Math.max(...metas.map((m) => m.height));
  const cols = Math.ceil(Math.sqrt(pngs.length));
  const rows = Math.ceil(pngs.length / cols);
  const composites = await Promise.all(pngs.map(async (f, i) => {
    const buf = await sharp(f).resize(w, h, { fit: "contain", background: "#888888" }).toBuffer();
    return { input: buf, left: (i % cols) * w, top: Math.floor(i / cols) * h };
  }));
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: "#888888" } })
    .composite(composites).png().toFile(outFile);
  return outFile;
}

export async function evaluateBenchmarks({ outDir = "out/v2-3f", raster = "key", themes = BENCHMARK_THEMES } = {}) {
  const t0 = Date.now();
  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  await mkdir(outDir, { recursive: true });
  await mkdir(path.join(outDir, "svg"), { recursive: true });
  const intents = benchmarkIntents();
  const results = { commit, generatedAt: new Date().toISOString(), cells: {}, counterfactuals: {}, invariance: {} };

  for (const benchId of BENCHMARK_IDS) {
    const intent = intents[benchId];
    for (const themeName of themes) {
      const design = normalizeDesign({ theme: await loadThemeDocument(themeName), mode: "light" });
      // Plate assets resolve once per theme in the adapter; the
      // compiler copies them opaquely and chrome plans contrast
      // against the sampled corner. Native themes resolve nothing.
      const backgrounds = await resolvePlateBackgrounds({ themeName, mode: "light", design });
      const seam = slideBackgrounds(backgrounds);
      for (const variant of ["plain", "chromed"]) {
        const { plan } = planDeckComposition(intent, design);
        const chrome = variant === "chromed" ? benchmarkChrome(intent, design, { backgrounds, plan }) : null;
        const detailed = compileDeckDetailed(intent, design, chrome, seam);
        const analysis = await analyzeDeck(intent, design, chrome);
        const key = `${benchId}/${themeName}/${variant}`;
        const scenes = detailed.scenes;
        const bytes = await renderPptx(scenes, {});
        const cell = {
          slides: scenes.length,
          plan: detailed.plan.slides.map((s) => ({
            slide: s.slideId, family: s.family, variant: s.variantKey,
            density: s.densityClass, takeaway: s.takeawayTreatment, basis: s.selectionBasis,
          })),
          l1: analysis.findings.filter((f) => f.layer === "L1").map((f) => f.code),
          l2: analysis.findings.filter((f) => f.layer === "L2").map((f) => f.code),
          fitDiagnostics: detailed.fitDiagnostics.map((d) => `${d.kind}:${d.elementId}`),
          representation: representation(intent, scenes),
          takeawayFindings: analysis.findings.filter((f) => f.code.startsWith("takeaway-")).map((f) => f.code),
          charts: chartFidelity(intent, scenes),
          minFittedSize: minFittedSize(scenes),
          pptxBytes: bytes.length,
        };
        results.cells[key] = cell;
        // SVG per slide (fast, deterministic inspection surface).
        const svgDir = path.join(outDir, "svg", benchId);
        await mkdir(svgDir, { recursive: true });
        for (const scene of scenes) {
          await writeFile(path.join(svgDir, `${themeName}-${variant}-${scene.id}.svg`), sceneToSvg(scene));
        }
        // Raster subset: key deck on every theme + every deck on reference.
        const doRaster = raster === "all" ||
          (raster === "key" && (benchId === "research-defense" || themeName === "warm-humanist"));
        if (doRaster) {
          const pngDir = path.join(outDir, "png", benchId);
          await mkdir(pngDir, { recursive: true });
          const pages = await rasterize(bytes, pngDir, `${themeName}-${variant}`);
          cell.pngs = pages;
          cell.contact = await contactSheet(pages, path.join(outDir, `contact-${benchId}-${themeName}-${variant}.png`));
        }
      }
    }
  }

  // Counterfactual sensitivity at the scene-composition layer.
  const pairs = {};
  for (const name of ["counterfactual-pairs.json", "counterfactual-structured.json"]) {
    const { pairs: list } = JSON.parse(await readFile(new URL(`../test/fixtures/v2-quality/${name}`, import.meta.url), "utf8"));
    const design = normalizeDesign({ theme: await loadThemeDocument("warm-humanist"), mode: "light" });
    for (const p of list) {
      const proj = (deck) => JSON.stringify(compileDeck(deck, design).map(compositionSceneProjection));
      pairs[p.id] = { sensitive: proj(p.a) !== proj(p.b), note: p.note ?? null };
    }
  }
  results.counterfactuals = pairs;

  // Semantic theme invariance per benchmark (plain variant).
  const refDesign = async (t) => normalizeDesign({ theme: await loadThemeDocument(t), mode: "light" });
  for (const benchId of BENCHMARK_IDS) {
    const intent = intents[benchId];
    const first = JSON.stringify(compileDeck(intent, await refDesign(themes[0])).map(semanticProjection));
    results.invariance[benchId] = {
      agree: (await Promise.all(themes.slice(1).map(async (t) =>
        JSON.stringify(compileDeck(intent, await refDesign(t)).map(semanticProjection)) === first))).every(Boolean),
    };
  }

  results.ms = Date.now() - t0;
  await writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
  return results;
}

const run = process.argv[1] ? import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "") : false;
if (run || process.argv.includes("--run")) {
  const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "out/v2-3f";
  const raster = process.argv.includes("--raster") ? process.argv[process.argv.indexOf("--raster") + 1] : "key";
  const results = await evaluateBenchmarks({ outDir: out, raster });
  const l1total = Object.values(results.cells).flatMap((c) => c.l1).length;
  console.log(`benchmarks: ${BENCHMARK_IDS.length} decks x ${BENCHMARK_THEMES.length} themes x 2 variants`);
  console.log(`cells: ${Object.keys(results.cells).length}, total L1: ${l1total}, ms: ${results.ms}`);
  console.log(`wrote ${out}/results.json`);
}
