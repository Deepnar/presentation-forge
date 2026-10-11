// V2-4C-2: multi-series pie/doughnut preservation. Native pie
// charts carry one series, so Layer B falls back to an editable
// table instead of silently dropping data in export. The key
// assertions (table emitted, every value present, diagnostic
// with the new code) fail on the accepted V2-4C-1 baseline
// `a1f2832` — there the same input compiles to a chart — and
// pass after. Single-series and cartesian behavior passes on
// both and pins what must not move.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { checkFitDiagnostics } from "../packages/compiler/quality.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { createViewer } from "../packages/editor/scene-dom.js";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";

let design;
before(async () => {
  design = normalizeDesign({ theme: await loadThemeDocument("warm-humanist"), mode: "light" });
});

function deckWith(id, chartKind, categories, series, extra = {}) {
  return {
    id: "d", title: "D",
    slides: [{
      id, purpose: "Show it", title: "T",
      blocks: [{ id: `${id}-c1`, kind: "chart", chartKind, categories, series, ...extra }],
    }],
  };
}

function primaryOf(scenes, blockId) {
  const els = scenes[0].elements.filter((e) =>
    e.provenance === "compiler" && e.semanticRef === blockId && (e.kind === "table" || e.kind === "chart"));
  assert.equal(els.length, 1, "exactly one primary element");
  return els[0];
}

describe("v2-4c2 fallback emission", () => {
  it("multi-series pie compiles to an editable table, not a chart", () => {
    const { scenes } = compileDeckDetailed(
      deckWith("s1", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    const el = primaryOf(scenes, "s1-c1");
    assert.equal(el.kind, "table", "fallback representation");
    assert.deepEqual(el.table.rows[0], ["", "A", "B"], "series order in the header");
    assert.deepEqual(el.table.rows.slice(1), [["x", "1", "30"], ["y", "2", "40"]], "every category and value preserved");
  });

  it("multi-series doughnut falls back identically", () => {
    const { scenes } = compileDeckDetailed(
      deckWith("s2", "doughnut", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    const el = primaryOf(scenes, "s2-c1");
    assert.equal(el.kind, "table");
    assert.deepEqual(el.table.rows[0], ["", "A", "B"]);
  });

  it("negatives, zeros, and units survive the fallback honestly", () => {
    const { scenes } = compileDeckDetailed(
      deckWith("s3", "pie", ["a", "b"], [{ name: "A", values: [-2, 0] }, { name: "B", values: [0.5, 3] }], { unit: "uV" }), design);
    const el = primaryOf(scenes, "s3-c1");
    assert.equal(el.kind, "table");
    assert.deepEqual(el.table.rows.slice(1), [["a", "-2", "0.5"], ["b", "0", "3"]], "authored strings, never normalized");
  });

  it("single-series pie and doughnut stay native charts", () => {
    for (const kind of ["pie", "doughnut"]) {
      const { scenes } = compileDeckDetailed(
        deckWith(`1s-${kind}`, kind, ["x", "y"], [{ name: "A", values: [1, 2] }]), design);
      assert.equal(primaryOf(scenes, `1s-${kind}-c1`).kind, "chart", `${kind} unchanged`);
    }
  });

  it("multi-series cartesian charts stay native charts", () => {
    for (const kind of ["bar", "hbar", "line", "area"]) {
      const { scenes } = compileDeckDetailed(
        deckWith(`mc-${kind}`, kind, ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
      assert.equal(primaryOf(scenes, `mc-${kind}-c1`).kind, "chart", `${kind} unchanged`);
    }
  });

  it("fallback identity is stable with no duplicate ids", () => {
    const { scenes } = compileDeckDetailed(
      deckWith("s4", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    const ids = scenes[0].elements.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
    const el = primaryOf(scenes, "s4-c1");
    assert.equal(el.id, "s4:s4-c1:content", "same id the chart would carry");
    assert.equal(el.semanticRef, "s4-c1", "same semantic ref");
    const again = compileDeckDetailed(
      deckWith("s4", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    assert.equal(JSON.stringify(scenes), JSON.stringify(again.scenes), "deterministic");
  });

  it("fallback emits an explainable quality diagnostic", () => {
    const built = compileDeckDetailed(
      deckWith("s5", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    const kinds = built.fitDiagnostics.map((d) => d.kind);
    assert.ok(kinds.includes("chart-fallback-table"), "diagnostic kind emitted");
    const findings = checkFitDiagnostics(built.scenes.length ? { slides: [{ id: "s5", blocks: [{ id: "s5-c1" }] }] } : null, built.fitDiagnostics);
    const hit = findings.find((f) => f.code === "chart-fallback-table");
    assert.ok(hit, "finding code survives QA mapping");
    assert.ok(hit.blockIds?.includes("s5-c1"), "finding links the block");
  });
});

describe("v2-4c2 export and browser consistency", () => {
  async function pptxTableValues(kind, series) {
    const { scenes } = compileDeckDetailed(deckWith("ex", kind, ["x", "y"], series), design);
    const dir = mkdtempSync(path.join(tmpdir(), "v24c2-"));
    const pptx = path.join(dir, "e.pptx");
    await renderPptxToFile(scenes, pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const names = Object.keys(zip.files);
    assert.ok(!names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), "no native chart part for the fallback");
    const tpart = names.find((n) => /^ppt\/slides\/slide1\.xml$/.test(n));
    return { xml: await zip.files[tpart].async("string"), scenes };
  }

  it("fallback values land in an editable native table", async () => {
    const { xml } = await pptxTableValues("pie", [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]);
    for (const t of ["A", "B", "x", "y", "1", "2", "30", "40"]) {
      assert.ok(xml.includes(`<a:t>${t}</a:t>`), `editable cell "${t}" in slide XML`);
    }
  });

  it("doughnut fallback exports identically", async () => {
    const { xml } = await pptxTableValues("doughnut", [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]);
    assert.ok(xml.includes("<a:t>30</a:t>") && xml.includes("<a:t>40</a:t>"), "doughnut values editable in PPTX");
  });

  it("browser projects the same authoritative table", () => {
    const { scenes } = compileDeckDetailed(
      deckWith("bx", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }]), design);
    const svg = sceneToSvg(scenes[0], { wrapText: true });
    assert.ok(!/<g data-el="bx:bx-c1:content"[^>]*>[\s\S]*?(<path |fill-rule)/.test(svg), "no pie geometry for the fallback");
    for (const t of ["A", "B", "30", "40"]) assert.ok(svg.includes(`>${t}<`), `browser shows "${t}"`);
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes);
    assert.equal(viewer.api.select("bx:bx-c1:content").selectedId, "bx:bx-c1:content", "fallback table selects as a unit");
    viewer.destroy();
  });

  it("single-series pie export still carries native chart values", async () => {
    const { scenes } = compileDeckDetailed(deckWith("1x", "pie", ["x", "y"], [{ name: "A", values: [1, 2] }]), design);
    const dir = mkdtempSync(path.join(tmpdir(), "v24c2-"));
    const pptx = path.join(dir, "s.pptx");
    await renderPptxToFile(scenes, pptx);
    const zip = await JSZip.loadAsync(readFileSync(pptx));
    const part = Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(part, "native chart part kept");
    const xml = await zip.files[part].async("string");
    assert.ok(xml.includes("<c:v>1</c:v>") && xml.includes("<c:v>2</c:v>"), "values intact");
  });
});
