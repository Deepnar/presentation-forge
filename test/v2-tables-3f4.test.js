// V2-3F-4: table density and header hierarchy. Short tables get
// compact nominal rows; dense tables keep the full region; headers
// are bold on a theme fill. One Layer-C table contract feeds both
// PPTX and SVG; neither renderer recomputes layout.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { compileDeckDetailed, compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { validateScene } from "../packages/model/scene.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { applyCommand } from "../packages/model/commands.ts";
import { warmDesign, sampleDeckIntent } from "./v2-fixture.js";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name) {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
}

function tableDeck(rows, header = true, extraBlocks = []) {
  return {
    id: "d", title: "D",
    slides: [{
      id: "s1", purpose: "grid", title: "Grid",
      blocks: [{ id: "t1", kind: "table", rows, header }, ...extraBlocks],
    }],
  };
}

function tableOf(scene) {
  const el = scene.elements.find((e) => e.kind === "table");
  assert.ok(el, "table element exists");
  return el;
}

describe("v2-3f-4 table layout contract", () => {
  it("a small table uses compact geometry summing to its rows", async () => {
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed(
      tableDeck([["Chemistry", "mS/cm"], ["Oxide", "1.2"], ["Sulfide", "12.5"]]), design);
    const el = tableOf(scenes[0]);
    const layout = el.table.layout;
    assert.ok(layout, "compiler resolves a layout contract");
    assert.equal(layout.rowHeights.length, 3);
    const sum = layout.rowHeights.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - el.h) < 1e-9, `row heights sum to element height (${sum} vs ${el.h})`);
    assert.ok(el.h < 2, `short table compacts instead of stretching (h=${el.h})`);
    assert.ok(el.y + el.h <= 6.92, "compact table stays above the footer band");
    assert.deepEqual(fitDiagnostics, [], "no fit diagnostics from layout");
    const v = await validateScene(scenes[0]);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("a dense table keeps the full region with even rows", async () => {
    const design = await warmDesign();
    const rows = Array.from({ length: 14 }, (_, i) => [`Row ${i + 1} with enough words to be a real line`, `v${i + 1}`]);
    const { scenes } = compileDeckDetailed(tableDeck(rows, false), design);
    const el = tableOf(scenes[0]);
    // Region for a lone table block on warm-humanist: title ends 1.62,
    // below at 1.77; box bottom is 7.5 - 0.55 (margin) - 0.62 = 6.33;
    // dataTableScene holds a 0.1 inter-block gap, so h = 4.46.
    assert.ok(Math.abs(el.y - 1.77) < 1e-9, `dense table keeps region origin, y=${el.y}`);
    assert.ok(Math.abs(el.y + el.h - 6.23) < 1e-9, `dense table keeps region bottom, bottom=${el.y + el.h}`);
    const hs = el.table.layout.rowHeights;
    assert.equal(hs.length, 14);
    const spread = Math.max(...hs) - Math.min(...hs);
    assert.ok(spread < 1e-6, `even split, spread=${spread}`);
    assert.deepEqual(checkSceneGeometry(scenes[0]), []);
  });

  it("header row is distinguishable without touching values", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      tableDeck([["Chemistry", "mS/cm"], ["Oxide", "1.2"]]), design);
    const layout = tableOf(scenes[0]).table.layout;
    assert.equal(layout.headerBold, true);
    assert.ok(layout.headerFill, "header has a fill");
    assert.equal(layout.headerSize, layout.bodySize, "same size, bold + fill carry the distinction");
    assert.equal(layout.fontFamily, design.roles.body.family);
    assert.equal(layout.bodySize, design.roles.body.size);
    assert.equal(layout.bodyColor, design.palette.ink.hex);
    assert.equal(layout.gridColor, design.palette.rule.hex);
    assert.equal(layout.padding, 0.05);
  });

  it("header-disabled tables invent no header", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      tableDeck([["a", "b"], ["c", "d"]], false), design);
    const el = tableOf(scenes[0]);
    assert.equal(el.table.header, false);
    const bytes = await renderPptx(scenes, {});
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    const fills = (xml.match(/<a:solidFill><a:srgbClr val="FFFFFF"\/><\/a:solidFill>/g) || []).length;
    assert.ok(!xml.slice(xml.indexOf("<a:tbl>"), xml.indexOf("</a:tbl>") + 8).includes('val="FFFFFF"'),
      "no header fill without header");
    void fills;
    const svg = sceneToSvg(scenes[0]);
    const tableSvg = svg.slice(svg.indexOf(`data-el="${el.id}"`));
    assert.ok(!tableSvg.includes('font-weight="bold"'), "no bold header in table SVG without header");
  });

  it("unicode, units, and decimals survive exactly", async () => {
    const design = await warmDesign();
    const rows = [["Chemistry", "mS/cm", "Error", "n"], ["Oxide", "1.2", "±0.2", "5"], ["Sulfide", "12.5", "±1.1", "5"], ["Polymer", "0.4", "±0.1", "3"]];
    const { scenes } = compileDeckDetailed(tableDeck(rows), design);
    const el = tableOf(scenes[0]);
    assert.deepEqual(el.table.rows, rows, "scene rows byte-exact");
    const bytes = await renderPptx(scenes, {});
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    for (const token of ["±0.2", "±1.1", "±0.1", "12.5", "0.4", "Chemistry"]) {
      assert.ok(xml.includes(`<a:t>${token}</a:t>`), `PPTX keeps ${token}`);
    }
    const svg = sceneToSvg(scenes[0]);
    for (const token of ["±0.2", "n", "Sulfide"]) {
      assert.ok(svg.includes(token), `SVG keeps ${token}`);
    }
  });

  it("chart-to-table fallback preserves categories, series, and units", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [{
          id: "ch", kind: "chart", categories: ["A", "B"], series: [{ name: "n", values: [12.5, 3.25] }],
          measure: "distribution", unit: "ms",
        }],
      }],
    }, design);
    const el = tableOf(scenes[0]);
    assert.deepEqual(el.table.rows, [["", "n"], ["A", "12.5"], ["B", "3.25"]]);
    assert.equal(el.table.header, true);
    assert.ok(el.table.layout, "fallback shares the layout contract");
    assert.equal(el.table.layout.rowHeights.length, 3);
    const texts = JSON.stringify(scenes[0].elements);
    assert.ok(texts.includes("Unit: ms"), "unit caption survives");
  });

  it("empty first header cell remains empty", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "p", title: "T",
        blocks: [{ id: "ch", kind: "chart", categories: ["A"], series: [{ name: "n", values: [1] }], measure: "distribution" }],
      }],
    }, design);
    const el = tableOf(scenes[0]);
    assert.equal(el.table.rows[0][0], "");
  });
});

describe("v2-3f-4 native projections", () => {
  it("PPTX keeps a native table with contract row heights", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      tableDeck([["Chemistry", "mS/cm"], ["Oxide", "1.2"], ["Sulfide", "12.5"]]), design);
    const el = tableOf(scenes[0]);
    const bytes = await renderPptx(scenes, {});
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    const tbl = xml.slice(xml.indexOf("<a:tbl>"), xml.indexOf("</a:tbl>") + 8);
    assert.ok(tbl.length > 100, "native table part present");
    const heights = [...tbl.matchAll(/<a:tr h="(\d+)"/g)].map((m) => Number(m[1]));
    assert.equal(heights.length, 3, "three native rows");
    const expected = el.table.layout.rowHeights.map((h) => Math.round(h * 914400));
    heights.forEach((h, i) => assert.ok(Math.abs(h - expected[i]) <= 1, `row ${i} height matches Layer C (${h} vs ${expected[i]})`));
    assert.match(tbl, /<a:rPr lang="en-US" sz="1300" b="1"/, "header run is bold at body size");
    assert.match(tbl, /typeface="Inter"/, "contract family projects");
  });

  it("SVG boundaries and styles match the contract", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      tableDeck([["Chemistry", "mS/cm"], ["Oxide", "1.2"]]), design);
    const el = tableOf(scenes[0]);
    const svg = sceneToSvg(scenes[0]);
    assert.match(svg, new RegExp(`data-el="${el.id}"`), "stable identity");
    const hs = el.table.layout.rowHeights;
    let cy = el.y * 96;
    for (const h of hs) {
      assert.ok(svg.includes(`y="${cy.toFixed(1)}"`), `row boundary at ${cy.toFixed(1)}`);
      cy += h * 96;
    }
    assert.match(svg, /font-weight="bold"/, "header bold in SVG");
    assert.match(svg, new RegExp(`fill="#${el.table.layout.headerFill}"`), "header fill in SVG");
    assert.match(svg, /font-family="Inter"/, "contract family in SVG");
  });

  it("layout-less scenes keep legacy rendering on both projections", async () => {
    const scene = {
      id: "t1", width: 13.333, height: 7.5,
      background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "t1:table", kind: "table", x: 1, y: 1, w: 6, h: 2, z: 1,
        provenance: "compiler", table: { rows: [["a", "b"], ["c", "d"]], header: true },
      }],
    };
    const bytes = await renderPptx([scene], {});
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.ok(xml.includes("<a:tbl>"), "legacy scene still renders a native table");
    assert.ok(xml.includes("fontSize") || xml.includes('sz="1000"'), "legacy 10pt sizing preserved");
    const svg = sceneToSvg(scene);
    assert.ok(svg.includes('font-size="12"'), "legacy SVG sizing preserved");
    assert.ok(svg.includes('stroke="#999"'), "legacy SVG grid preserved");
  });
});

describe("v2-3f-4 invariants", () => {
  it("no off-canvas, no duplicates, carriers intact, takeaways kept", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "grid with a point", title: "Grid",
        blocks: [{ id: "t1", kind: "table", header: true, rows: [["A", "B"], ["1", "2"], ["3", "4"]] }],
        takeaway: "Three rows read at a glance",
      }],
    };
    const { scenes, findings } = await analyzeDeck(intent, design);
    const el = tableOf(scenes[0]);
    assert.equal(el.semanticRef, "t1", "semantic carrier intact");
    assert.ok(scenes[0].elements.some((e) => e.id === "s1:takeaway:annotation"), "takeaway kept");
    assert.deepEqual(checkSceneGeometry(scenes[0]), []);
    assert.deepEqual(checkElementIds(scenes[0]), []);
    assert.deepEqual(findings.filter((f) => f.layer === "L1"), []);
  });

  it("recompilation is deterministic and preservation holds", async () => {
    const design = await warmDesign();
    const intent = tableDeck([["A", "B"], ["1", "2"]]);
    const a = compileDeckDetailed(intent, design);
    const b = compileDeckDetailed(intent, design);
    assert.equal(JSON.stringify(a.scenes), JSON.stringify(b.scenes), "deterministic");
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const planned = planDeckComposition(intent, design).plan.slides[0];
    const scene = a.scenes[0];
    const target = tableOf(scene);
    const moved = applyCommand(scene, { type: "element.move", id: target.id, x: 2, y: 2 });
    assert.ok(moved, "table accepts commands");
    // Tables only exist on the canonical planned path; the legacy
    // six-recipe fallback has no table recipe.
    const out = recompileSlide(intent.slides[0], scene, design, planned);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, 2);
    assert.equal(kept.y, 2);
    assert.deepEqual(kept.table.rows, [["A", "B"], ["1", "2"]], "data survives recompile");
    const detached = compileDeckDetailed(intent, design).scenes[0];
    detached.layoutState = "detached";
    assert.equal(recompileSlide(intent.slides[0], detached, design), detached, "detached untouched");
  });

  it("theme semantic invariance holds across all five themes", async () => {
    const { semanticProjection } = await import("../packages/core/scene-quality.ts");
    const { compileDeck } = await import("../packages/compiler/compile.js");
    const intent = tableDeck([["Chemistry", "mS/cm"], ["Oxide", "1.2"]]);
    let first = null;
    for (const name of THEMES) {
      const design = await themeDesign(name);
      const proj = JSON.stringify(compileDeck(intent, design).map(semanticProjection));
      if (first === null) first = proj;
      else assert.equal(proj, first, `${name} changed table semantics`);
    }
    assert.ok(first);
  });

  it("non-table slide geometry stays unchanged", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(sampleDeckIntent(), design);
    const s2 = scenes.find((s) => s.id === "s2");
    const list = s2.elements.find((e) => e.semanticRef === "s2b1");
    // 3F-3 centered values (see regenerated 3E-1 baseline): this slice
    // must not move text geometry at all.
    assert.ok(Math.abs(list.y - 3.29) < 0.01 && Math.abs(list.h - 1.37) < 0.01, "prose geometry untouched by table work");
  });
});
