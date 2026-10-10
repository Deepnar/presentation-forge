// V2-3F-8: table-cell and chart-internal typography. Tables
// resolve true wrapped row heights and column widths with per-cell
// word and height diagnostics; charts carry resolved label
// typography with slot, row, and legend capacity checks. Both
// renderers project the shared contracts; overflow diagnoses
// honestly — text stays nominal and complete, never shrunk,
// truncated, or silently clipped.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeck, compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { SCENE_H } from "../packages/model/scene-constants.ts";
import { CONTENT_FOOTER_RESERVE } from "../packages/core/chrome.ts";
import { benchmarkIntents, BENCHMARK_IDS } from "./v2-benchmark-intents.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";
import JSZip from "jszip";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name) {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
}

function contentBottom(design) {
  return SCENE_H - design.grid.margins.bottom - CONTENT_FOOTER_RESERVE;
}

function tableSlide(id, rows, header = true, extra = {}) {
  return {
    id, purpose: `table ${id}`, title: `Table ${id}`,
    blocks: [{ id: `${id}t`, kind: "table", rows, header }],
    ...extra,
  };
}

function chartSlide(id, chart, extraBlocks = [], extra = {}) {
  return {
    id, purpose: `chart ${id}`, title: `Chart ${id}`,
    blocks: [{ id: `${id}c`, ...chart }, ...extraBlocks],
    ...extra,
  };
}

function tableOf(scene) {
  const el = scene.elements.find((e) => e.kind === "table");
  assert.ok(el, "table element exists");
  return el;
}

function chartOf(scene) {
  const el = scene.elements.find((e) => e.kind === "chart");
  assert.ok(el, "chart element exists");
  return el;
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

describe("v2-3f-8 table fitting", () => {
  it("a small readable table seats with no diagnostics", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("t1", [["Chemistry", "mS/cm"], ["Oxide", "1.2"], ["Sulfide", "12.5"]]);
    const { scenes, fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const el = tableOf(scenes[0]);
    assert.equal(el.table.layout.rowHeights.length, 3);
    assert.equal(el.table.layout.colWidths.length, 2);
    const wsum = el.table.layout.colWidths.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(wsum - el.w) < 1e-9, "column widths sum to element width");
    assert.equal((await validateScene(scenes[0])).ok, true);
  });

  it("a dense readable table stays quiet", async () => {
    const design = await themeDesign("warm-humanist");
    const rows = [["Sample", "Value", "Unit"], ...Array.from({ length: 11 }, (_, i) => [`S${i + 1}`, `${(i * 1.7).toFixed(1)}`, "mS/cm"])];
    const { scenes, fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [tableSlide("t2", rows)] }, design);
    assert.deepEqual(fitDiagnostics, [], "padding-only squeeze stays silent");
    assert.equal((await validateScene(scenes[0])).ok, true);
    assert.deepEqual(checkSceneGeometry(scenes[0]), [], "in bounds");
  });

  it("long cells wrap into true row heights", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("t3", [
      ["Chemistry", "Conductivity", "Notes"],
      ["Oxide", "1.2", "Air-stable handling with a well understood sintering window"],
      ["Sulfide", "12.5", "Moisture-sensitive handling adds fifteen percent facility cost"],
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(fitDiagnostics, [], "wrapped rows seat");
    const el = tableOf(scenes[0]);
    assert.ok(el.table.layout.rowHeights[1] > el.table.layout.rowHeights[0], "wrapped row taller than header");
    assert.deepEqual(el.table.rows[1], ["Oxide", "1.2", "Air-stable handling with a well understood sintering window"], "authored rows exact");
  });

  it("an unbreakable token diagnoses with evidence", async () => {
    const design = await themeDesign("warm-humanist");
    const token = "Supercalifragilisticexpialidociousness";
    const slide = tableSlide("t4", [
      ["A", "B", "C", "D", "E"],
      [token, "b", "c", "d", "e"],
    ]);
    const intent = { id: "d", title: "D", slides: [slide] };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const hits = fitDiagnostics.filter((d) => d.kind === "table-cell-overflow");
    assert.ok(hits.length >= 1, "token overflow diagnosed");
    assert.ok(hits.some((d) => d.message.includes(token.slice(0, 20))), "finding names the token");
    const analysis = await analyzeDeck(intent, design);
    const l1 = analysis.findings.filter((f) => f.code === "table-cell-overflow");
    assert.ok(l1.length >= 1, "L1 finding distinct from text-fit codes");
    assert.ok(l1[0].elementIds.length === 1 && l1[0].blockIds.length === 1, "slide, element, and block identified");
    assert.deepEqual(scenes[0].elements.find((e) => e.kind === "table").table.rows[1][0], token, "token preserved exactly");
    assert.deepEqual(checkSceneGeometry(scenes[0]), [], "geometry stays valid");
  });

  it("long headers wrap at bold measure", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("t5", [
      ["Short", "An extremely long header caption that must wrap somewhere"],
      ["a", "b"],
    ]);
    const { scenes, fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(fitDiagnostics, [], "wrapped header seats");
    const layout = tableOf(scenes[0]).table.layout;
    assert.ok(layout.rowHeights[0] > layout.rowHeights[1], "header row taller than body row");
    assert.equal(layout.headerBold, true, "header hierarchy intact");
  });

  it("column count reaches the contract and the PPTX grid", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("t6", [
      ["A", "B", "C", "D", "E"],
      ["alpha", "beta value", "gamma", "delta series", "epsilon"],
    ]);
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    const el = tableOf(scene);
    assert.equal(el.table.layout.colWidths.length, 5);
    const zip = await JSZip.loadAsync(await renderPptx([scene], {}));
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.equal((xml.match(/<a:gridCol /g) || []).length, 5, "PPTX grid follows the contract");
  });

  it("ragged and empty cells render without green fills or loss", async () => {
    const design = await themeDesign("warm-humanist");
    const rows = [["A", "B", "C"], ["only-one"], ["x", "y"], []];
    const slide = tableSlide("t7", rows, false);
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(tableOf(scene).table.rows, rows, "authored rows preserved exactly");
    const zip = await JSZip.loadAsync(await renderPptx([scene], {}));
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.ok(!/00FF00|00ff00/.test(xml), "no default-green fills from missing cells");
    const svg = sceneToSvg(scene);
    assert.equal((svg.match(/<rect x="/g) || []).length, 12, "SVG draws the full 4x3 grid");
  });
});

describe("v2-3f-8 chart typography", () => {
  it("ordinary charts resolve labels with no diagnostics", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = chartSlide("c1", {
      kind: "chart", chartKind: "bar", measure: "comparison",
      categories: ["Oxide", "Sulfide", "Polymer"],
      series: [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }],
      caption: "Room temperature",
    });
    const { scenes, fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(fitDiagnostics, [], "no diagnostics");
    const labels = chartOf(scenes[0]).chart.labels;
    assert.ok(labels && labels.size > 0 && labels.family && labels.color, "labels contract resolved");
  });

  it("crowded category slots diagnose per label", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = chartSlide("c2", {
      kind: "chart", chartKind: "bar", measure: "comparison",
      categories: Array.from({ length: 12 }, () => "Antidisestablishmentarianism"),
      series: [{ name: "Score", values: Array(12).fill(1) }],
    });
    const intent = { id: "d", title: "D", slides: [slide] };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const hits = fitDiagnostics.filter((d) => d.kind === "chart-label-overflow");
    assert.ok(hits.length >= 1, "slot overflow diagnosed");
    const analysis = await analyzeDeck(intent, design);
    assert.ok(analysis.findings.some((f) => f.code === "chart-label-overflow"), "L1 distinct from table codes");
    const el = chartOf(scenes[0]);
    assert.deepEqual(el.chart.categories.length, 12, "categories preserved");
    assert.deepEqual(el.chart.series[0].values, Array(12).fill(1), "values preserved");
  });

  it("legend volume beyond the chart diagnoses", async () => {
    // The legend shares an unknown client-laid corner, so only
    // genuine volume impossibility diagnoses: entries whose wrapped
    // lines exceed the chart height. A small support region makes
    // the bound bite on honest input.
    const design = await themeDesign("warm-humanist");
    const bigname = (i) => `Series ${i} ` + "with an extended descriptive treatment ".repeat(8).trim();
    const slide = {
      id: "c3", purpose: "legend", title: "Legend",
      relationship: "comparison",
      blocks: [
        { id: "l", kind: "text", label: "Left", text: "Side one" },
        { id: "r", kind: "text", label: "Right", text: "Side two" },
        {
          id: "ch", kind: "chart", chartKind: "bar", measure: "comparison",
          categories: ["A", "B"],
          series: [1, 2, 3, 4].map((i) => ({ name: bigname(i), values: [i, i + 1] })),
        },
      ],
    };
    const intent = { id: "d", title: "D", slides: [slide] };
    const { fitDiagnostics } = compileDeckDetailed(intent, design);
    assert.ok(fitDiagnostics.some((d) => d.kind === "chart-label-overflow"), "legend overflow diagnosed in a small region");
  });

  it("a small but valid chart stays quiet", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = {
      id: "c4", purpose: "small", title: "Small",
      relationship: "comparison",
      blocks: [
        { id: "l", kind: "text", label: "Left", text: "Side one" },
        { id: "r", kind: "text", label: "Right", text: "Side two" },
        { id: "ch", kind: "chart", chartKind: "bar", measure: "comparison", categories: ["A", "B"], series: [{ name: "S", values: [1, 2] }] },
      ],
    };
    const { fitDiagnostics } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    assert.deepEqual(fitDiagnostics.filter((d) => d.kind === "chart-label-overflow"), [], "no false positives on small valid charts");
  });

  it("bar and pie charts share the label contract", async () => {
    const design = await themeDesign("warm-humanist");
    const bar = chartSlide("c5", {
      kind: "chart", chartKind: "bar", measure: "comparison",
      categories: ["Alpha", "Beta"], series: [{ name: "S", values: [1, 2] }],
    });
    const pie = chartSlide("c6", {
      kind: "chart", chartKind: "pie",
      categories: ["Alpha", "Beta"], series: [{ name: "S", values: [1, 2] }],
    });
    const { scenes } = compileDeckDetailed({ id: "d", title: "D", slides: [bar, pie] }, design);
    const [barScene, pieScene] = scenes;
    assert.deepEqual(chartOf(barScene).chart.labels, chartOf(pieScene).chart.labels, "one contract across kinds");
    const barSvg = sceneToSvg(barScene);
    assert.ok(barSvg.includes("Alpha") && barSvg.includes("Beta"), "SVG carries categories");
    assert.ok(barSvg.includes("S"), "SVG carries the legend");
    const pieSvg = sceneToSvg(pieScene);
    assert.ok(pieSvg.includes("Alpha") && pieSvg.includes("S"), "pie SVG carries categories and legend");
  });

  it("ordinary benchmark charts and tables stay clean", async () => {
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      const design = await themeDesign("warm-humanist");
      const analysis = await analyzeDeck(intents[benchId], design);
      assert.deepEqual(
        analysis.findings.filter((f) => f.code === "table-cell-overflow" || f.code === "chart-label-overflow"),
        [],
        `${benchId}: no new-code diagnostics`,
      );
    }
  });
});

describe("v2-3f-8 preservation and projection", () => {
  it("table content and chart data survive exactly", async () => {
    const design = await themeDesign("warm-humanist");
    const rows = [["µmol·L⁻¹", "10⁻³ ± 0.2"], ["Ω·m ×10⁶", "Supply\nchain"]];
    const slide = tableSlide("p1", rows);
    const chart = chartSlide("p2", {
      kind: "chart", chartKind: "line", measure: "trend",
      categories: ["Q1", "Q2"], series: [{ name: "T", values: [1.5, 2.5] }],
    });
    const [tableScene, chartScene] = compileDeck({ id: "d", title: "D", slides: [slide, chart] }, design);
    assert.deepEqual(tableOf(tableScene).table.rows, rows, "unicode and multiline rows exact");
    const ch = chartOf(chartScene).chart;
    assert.deepEqual(ch.categories, ["Q1", "Q2"], "categories exact");
    assert.deepEqual(ch.series, [{ name: "T", values: [1.5, 2.5] }], "series exact");
  });

  it("renderers project the same contracts natively", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("p3", [["H1", "H2"], ["cell one wraps here yes", "b"]]);
    const chart = chartSlide("p4", {
      kind: "chart", chartKind: "bar", measure: "comparison",
      categories: ["Alpha", "Beta"], series: [{ name: "S", values: [3, 7] }],
    });
    const [tableScene, chartScene] = compileDeck({ id: "d", title: "D", slides: [slide, chart] }, design);
    const zip = await JSZip.loadAsync(await renderPptx([tableScene], {}));
    const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.ok(slideXml.includes("cell one wraps here yes"), "full cell text in OOXML");
    assert.ok(!/00FF00/.test(slideXml), "no green fills");
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.equal(charts.length, 0, "table slide carries no chart part");
    const zip2 = await JSZip.loadAsync(await renderPptx([chartScene], {}));
    const charts2 = Object.keys(zip2.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.equal(charts2.length, 1, "native chart part survives");
    const cxml = await zip2.files[charts2[0]].async("string");
    const labels = chartOf(chartScene).chart.labels;
    assert.ok(cxml.includes(`sz="${labels.size * 100}"`), "legend size follows the contract");
    assert.ok(cxml.includes(`val="${labels.color}"`), "legend color follows the contract");
    assert.ok(cxml.includes(`typeface="${labels.family}"`), "legend family follows the contract");
    assert.ok(!Object.keys(zip2.files).some((n) => n.startsWith("ppt/media/") && !n.endsWith("/")), "charts stay native, never rasterized");
    const svg = sceneToSvg(tableScene);
    assert.ok(svg.includes("cell one wraps here") && svg.includes("yes"), "SVG wraps crowded cells");
    const csvg = sceneToSvg(chartScene);
    assert.ok(csvg.includes("Alpha") && csvg.includes("S"), "SVG carries chart labels and legend");
  });

  it("no duplicate ids and no invalid geometry on stress decks", async () => {
    const design = await themeDesign("warm-humanist");
    const token = "Pneumonoultramicroscopicsilicovolcanoconiosis";
    const slides = [
      tableSlide("g1", [["A", "B", "C", "D", "E"], [token, "b", "c", "d", "e"]]),
      chartSlide("g2", {
        kind: "chart", chartKind: "bar", measure: "comparison",
        categories: Array.from({ length: 12 }, () => "Antidisestablishmentarianism"),
        series: [{ name: "S", values: Array(12).fill(1) }],
      }),
    ];
    const { scenes } = compileDeckDetailed({ id: "d", title: "D", slides }, design);
    for (const scene of scenes) {
      assert.deepEqual(checkElementIds(scene), [], `${scene.id} ids unique`);
      assert.deepEqual(checkSceneGeometry(scene), [], `${scene.id} in bounds`);
      assert.equal((await validateScene(scene)).ok, true, `${scene.id} validates`);
    }
  });

  it("fitting content never intrudes into chrome", async () => {
    const design = await themeDesign("warm-humanist");
    const intent = {
      id: "d", title: "D",
      slides: [
        tableSlide("h1", [["H", "H2"], ["cell one wraps here yes indeed", "b"]]),
        chartSlide("h2", {
          kind: "chart", chartKind: "bar", measure: "comparison",
          categories: ["A", "B"], series: [{ name: "S", values: [1, 2] }],
        }),
      ],
    };
    const analysis = await analyzeDeck(intent, design, chromeNone(intent.slides));
    assert.deepEqual(
      analysis.findings.filter((f) => f.code === "chrome-band-overlap"),
      [],
      "no footer intrusion",
    );
    const bottom = contentBottom(design);
    for (const scene of analysis.scenes) {
      for (const e of scene.elements) {
        if (e.provenance !== "compiler" || e.locked) continue;
        assert.ok(e.y + e.h <= bottom + 1e-9, `${e.id} above the footer reserve`);
      }
    }
  });

  it("compilation is deterministic", async () => {
    const design = await themeDesign("warm-humanist");
    const intent = {
      id: "d", title: "D",
      slides: [
        tableSlide("d1", [["A", "B"], ["longer cell one here", "b"]]),
        chartSlide("d2", {
          kind: "chart", chartKind: "hbar", categories: ["X", "Y"], series: [{ name: "S", values: [1, 2] }],
        }),
      ],
    };
    assert.equal(JSON.stringify(compileDeck(intent, design)), JSON.stringify(compileDeck(intent, design)));
  });

  it("human-customized table geometry survives recompilation", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("u1", [["A", "B"], ["x", "y"]]);
    const intent = { id: "d", title: "D", slides: [slide] };
    const { plan } = compileDeckDetailed(intent, design);
    const [first] = compileDeck(intent, design);
    const tel = first.elements.find((e) => e.kind === "table");
    const customized = {
      ...first,
      layoutState: "customized",
      elements: first.elements.map((e) => (e.id === tel.id ? { ...e, y: e.y + 0.2, customized: true, provenance: "human" } : e)),
    };
    const next = recompileSlide(slide, customized, design, plan.slides[0], [], null);
    const kept = next.elements.find((e) => e.id === tel.id);
    assert.equal(kept.y, tel.y + 0.2, "human table position survives");
    assert.deepEqual(kept.table.rows, tel.table.rows, "rows intact");
    assert.deepEqual(kept.table.layout, tel.table.layout, "layout contract intact");
  });

  it("detached scenes remain authoritative", async () => {
    const design = await themeDesign("warm-humanist");
    const slide = tableSlide("v1", [["A"], ["b"]]);
    const intent = { id: "d", title: "D", slides: [slide] };
    const { plan } = compileDeckDetailed(intent, design);
    const [first] = compileDeck(intent, design);
    const detached = { ...first, layoutState: "detached", background: { fill: "123456" } };
    assert.deepEqual(recompileSlide(slide, detached, design, plan.slides[0], [], null), detached);
  });

  it("five themes stay semantically invariant", async () => {
    const intent = {
      id: "d", title: "D",
      slides: [
        tableSlide("w1", [["A", "B"], ["x", "y"]]),
        chartSlide("w2", {
          kind: "chart", chartKind: "bar", measure: "comparison",
          categories: ["P", "Q"], series: [{ name: "S", values: [1, 2] }],
        }),
      ],
    };
    const designs = [];
    for (const t of THEMES) designs.push(await themeDesign(t));
    const ref = JSON.stringify(compileDeck(intent, designs[0]).map(semanticProjection));
    for (const [i, design] of designs.entries()) {
      assert.equal(JSON.stringify(compileDeck(intent, design).map(semanticProjection)), ref, `theme ${THEMES[i]} invariant`);
      const analysis = await analyzeDeck(intent, design);
      assert.deepEqual(
        analysis.findings.filter((f) => f.code === "table-cell-overflow" || f.code === "chart-label-overflow"),
        [],
        `theme ${THEMES[i]} introduces no capacity findings on ordinary content`,
      );
    }
  });

  it("accepted 3F behavior stays intact", async () => {
    const design = await themeDesign("warm-humanist");
    const { fitDiagnostics } = compileDeckDetailed(mechanismDeck(), design);
    assert.deepEqual(fitDiagnostics, [], "mechanism deck has no diagnostics");
    const intents = benchmarkIntents();
    for (const benchId of BENCHMARK_IDS) {
      const analysis = await analyzeDeck(intents[benchId], design);
      assert.ok(!analysis.findings.some((f) => f.code === "duplicate-element-id"), `${benchId}: takeaway cardinality holds`);
    }
  });
});
