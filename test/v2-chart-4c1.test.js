// V2-4C-1: micro-scale tick truthfulness and the multi-series
// pie/doughnut boundary. The tick cases fail on the accepted V2-4C
// baseline `5d00a3b` (labels collapsed to "0"); the pie-boundary
// case fails there too (extra series wore a solid slice swatch).
// Contract cases (2.5/7.5 labels, single-series legends,
// determinism, identity) pass on both and pin what must not move.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { fmtTick, niceTicks, chartDomain } from "../packages/editor/scene-chart.js";
import { createViewer } from "../packages/editor/scene-dom.js";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";

const LABELS = { family: "Inter", size: 10, color: "5C5C59" };

function chartScene(kind, categories, series) {
  return {
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [{
      id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler",
      chart: { chartKind: kind, categories, series, labels: LABELS },
    }],
  };
}

function tickTexts(svg) {
  const g = svg.match(/<g data-el="s:c"[^>]*>([\s\S]*?)<\/g>/);
  assert.ok(g, "chart group present");
  return g[1];
}

describe("v2-4c1 tick truthfulness", () => {
  it("micro-scale steps keep every decimal (was: all zeros)", () => {
    assert.equal(fmtTick(0.000001, 0.000003), "0.000003");
    assert.equal(fmtTick(0.000001, -0.000002), "-0.000002");
    assert.equal(fmtTick(1e-7, 3e-7), "0.0000003");
    assert.equal(fmtTick(2.5e-6, 7.5e-6), "0.0000075");
  });

  it("existing fractional labels unchanged", () => {
    assert.equal(fmtTick(2.5, 2.5), "2.5");
    assert.equal(fmtTick(2.5, 7.5), "7.5");
    assert.equal(fmtTick(2, 4), "4");
    assert.equal(fmtTick(1, 0), "0");
    assert.equal(fmtTick(10, -0), "0", "negative zero stays zero");
  });

  it("large magnitudes stay exact without abbreviation", () => {
    assert.equal(fmtTick(500000, 2500000), "2500000");
    assert.equal(fmtTick(2500000, 5000000), "5000000");
  });

  it("scientific fallback past ten step decimals", () => {
    assert.equal(fmtTick(1e-11, 3e-11), "3.00e-11");
    assert.equal(fmtTick(1e-11, -2e-11), "-2.00e-11");
  });

  it("micro domains produce distinct adjacent labels", () => {
    for (const [lo, hi] of [[0, 3e-6], [-2e-6, 2e-6], [1e-7, 5e-7]]) {
      const { ticks, step } = niceTicks(lo, hi, 5);
      const labels = ticks.map((v) => fmtTick(step, v));
      assert.ok(ticks.length >= 2, `ticks exist for [${lo}, ${hi}]`);
      assert.equal(new Set(labels).size, labels.length, `labels distinct for [${lo}, ${hi}]: ${labels.join("|")}`);
      assert.ok(!labels.includes("0") || ticks.includes(0), "zero only where the lattice has it");
      assert.ok(labels.some((l) => l !== "0"), "nonzero data never collapses to all-zero labels");
    }
  });

  it("micro bar charts label their axes truthfully", () => {
    const inner = tickTexts(sceneToSvg(chartScene("bar", ["a", "b"], [{ name: "v", values: [1e-6, 3e-6] }])));
    assert.ok(inner.includes("0.000003"), "max tick names its value");
    assert.ok(!/NaN|Infinity/.test(inner), "finite geometry");
    const hinner = tickTexts(sceneToSvg(chartScene("hbar", ["a", "b"], [{ name: "v", values: [-2e-6, 3e-6] }])));
    assert.ok(hinner.includes("-0.000002") && hinner.includes("0.000002"), "signed micro ticks both named");
    assert.ok(!/NaN|Infinity/.test(hinner), "finite hbar geometry");
  });

  it("extreme domains stay finite and deterministic", () => {
    const inner = tickTexts(sceneToSvg(chartScene("bar", ["a", "b"], [{ name: "v", values: [-1e308, 1e308] }])));
    assert.ok(!/NaN|Infinity/.test(inner), "no non-finite coordinates");
    const again = tickTexts(sceneToSvg(chartScene("bar", ["a", "b"], [{ name: "v", values: [-1e308, 1e308] }])));
    assert.equal(inner, again, "deterministic at extremes");
    assert.ok(chartDomain([{ values: [-1e308, 1e308] }]).hi > 0, "domain spans zero");
  });
});

describe("v2-4c1 multi-series pie boundary", () => {
  function pieInner(series) {
    return tickTexts(sceneToSvg(chartScene("pie", ["x", "y"], series)));
  }

  it("extra series are explicitly marked not shown", () => {
    const inner = pieInner([{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]);
    assert.ok(inner.includes("B (not shown)"), "B explicitly marked unplotted");
    assert.ok(!inner.includes(">B<"), "B never reads as a plotted slice");
    assert.ok(inner.includes(">x<") && inner.includes(">y<"), "plotted categories kept");
    assert.ok(!/NaN|Infinity/.test(inner), "finite geometry");
  });

  it("wedges come only from series[0], matching native behavior", () => {
    const inner = pieInner([{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]);
    const wedges = [...inner.matchAll(/fill-rule="evenodd"/g)].length;
    assert.equal(wedges, 2, "two wedges for the two plotted shares, none for B's 30/40");
  });

  it("single-series pies are unchanged (no spurious marks)", () => {
    const inner = pieInner([{ name: "S", values: [1, 2] }]);
    assert.ok(!inner.includes("(not shown)"), "no unsupported-data marks when all data plots");
    assert.ok(inner.includes(">S<") && inner.includes(">x<"), "series and categories kept");
    const ring = tickTexts(sceneToSvg(chartScene("doughnut", ["x", "y"], [{ name: "S", values: [1, 2] }])));
    assert.ok(!ring.includes("(not shown)"), "doughnut likewise clean");
  });

  it("native cartesian PPTX preserves every series", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v24c1-"));
    const pptx = path.join(dir, "p.pptx");
    await renderPptxToFile([{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler",
        chart: { chartKind: "bar", categories: ["x", "y"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }], labels: LABELS },
      }],
    }], pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const part = Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(part, "native chart part preserved");
    const xml = await zip.files[part].async("string");
    assert.ok(xml.includes("<c:v>30</c:v>") && xml.includes("<c:v>40</c:v>"), "both series intact in OOXML");
  });

  it("native pie keeps series[0], so the browser note is the only trace of the rest", async () => {
    // pptxgenjs collapses multi-series pies to a single <c:ser>:
    // the file drops series B without a trace. The scene still
    // carries it, and the browser legend marks it explicitly.
    const dir = mkdtempSync(path.join(tmpdir(), "v24c1-"));
    const pptx = path.join(dir, "p.pptx");
    await renderPptxToFile([{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:c", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 10, provenance: "compiler",
        chart: { chartKind: "pie", categories: ["x", "y"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }], labels: LABELS },
      }],
    }], pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const part = Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    const xml = await zip.files[part].async("string");
    assert.equal([...xml.matchAll(/<c:ser>/g)].length, 1, "native pie carries one series");
    assert.ok(!xml.includes("<c:v>30</c:v>"), "dropped series absent from the file");
  });

  it("chart stays one selectable unit with the new legend", () => {
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, [chartScene("pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [3, 4] }])]);
    assert.equal(viewer.api.select("s:c").selectedId, "s:c", "chart selects as a unit");
    assert.ok(!root.querySelector('[data-el="s:c"] [data-el]'), "no nested editor identities");
    viewer.destroy();
  });
});
