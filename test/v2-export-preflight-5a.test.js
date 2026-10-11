// V2-5A: fail-closed native export preflight. Direct scenes that
// would silently lose authored data are refused with slide- and
// element-identified errors before any byte is generated; valid
// scenes render exactly as before. The multi-series pie/doughnut
// rejections fail on the V2-4 baseline `5beba39` (silent first-
// series-only output) and pass after.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { renderPptx, preflightScenes, ExportUnsafeError } from "../packages/renderer-pptx/render.ts";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";

function scene(id, elements) {
  return {
    id, width: 13.333, height: 7.5, background: { fill: "FFFFFF" },
    elements, layoutState: "managed",
  };
}

function textEl(id, text) {
  return {
    id, kind: "text", x: 0.5, y: 0.5, w: 5, h: 1, z: 1, provenance: "compiler",
    paragraphs: [{ runs: [{ text, size: 18, color: "111111" }] }],
  };
}

function chartEl(id, chart) {
  return { id, kind: "chart", x: 0.5, y: 0.5, w: 8, h: 4, z: 2, provenance: "compiler", chart };
}

function labels() {
  return { family: "Inter", size: 10, color: "5C5C59" };
}

function pieSeries(names, valuess) {
  return { chartKind: "pie", categories: ["A", "B"], series: names.map((name, i) => ({ name, values: valuess[i] })), labels: labels() };
}

async function chartXml(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  assert.ok(names.length >= 1, "a native chart part exists");
  return { zip, xml: await zip.files[names[0]].async("string") };
}

describe("v2-5a export preflight", () => {
  it("valid single-series pie and doughnut render with exact values", async () => {
    for (const kind of ["pie", "doughnut"]) {
      const scenes = [scene("s", [
        textEl("s:t", "Shares"),
        chartEl("s:ch", { chartKind: kind, categories: ["A", "B"], series: [{ name: "Mix", values: [60, 40] }], labels: labels() }),
      ])];
      const frozen = JSON.stringify(scenes);
      const { xml } = await chartXml(await renderPptx(scenes));
      assert.equal((xml.match(/<c:ser>/g) || []).length, 1, `${kind}: one series`);
      assert.match(xml, /60/, `${kind}: value survives`);
      assert.equal(JSON.stringify(scenes), frozen, "input untouched by success");
    }
  });

  it("direct multi-series pie is refused with slide and element identity", async () => {
    const scenes = [scene("s1", [chartEl("s1:pie", pieSeries(["S1", "S2"], [[1, 2], [30, 40]]))])];
    const frozen = JSON.stringify(scenes);
    await assert.rejects(renderPptx(scenes), (err) => {
      assert.equal(err.code, "export-unsafe");
      assert.match(err.message, /s1/);
      assert.match(err.message, /s1:pie/);
      assert.match(err.message, /only the first/);
      assert.equal(err.issues[0].slideId, "s1");
      assert.equal(err.issues[0].elementId, "s1:pie");
      return true;
    });
    assert.equal(JSON.stringify(scenes), frozen, "rejection never mutates input");
  });

  it("direct multi-series doughnut is refused the same way", async () => {
    const donut = pieSeries(["S1", "S2"], [[1, 2], [30, 40]]);
    donut.chartKind = "doughnut";
    const scenes = [scene("s1", [chartEl("s1:donut", donut)])];
    await assert.rejects(renderPptx(scenes), /doughnut with 2 series would keep only the first/);
  });

  it("multi-series cartesian charts stay valid with exact values", async () => {
    for (const kind of ["bar", "line"]) {
      const scenes = [scene("s", [chartEl("s:ch", {
        chartKind: kind, categories: ["A", "B"],
        series: [{ name: "X", values: [1.2, 12.5] }, { name: "Y", values: [3, 4] }],
        labels: labels(),
      })])];
      const { xml } = await chartXml(await renderPptx(scenes));
      assert.equal((xml.match(/<c:ser>/g) || []).length, 2, `${kind}: both series`);
      assert.match(xml, /12\.5/, `${kind}: values exact`);
    }
  });

  it("malformed scenes and bad chart payloads are refused as contract failures", async () => {
    const noProv = [scene("s", [{ ...textEl("s:t", "x"), provenance: undefined }])];
    await assert.rejects(renderPptx(noProv), /scene contract invalid/);
    const noPayload = [scene("s", [{ ...chartEl("s:ch", pieSeries(["S"], [[1, 2]])), chart: undefined }])];
    await assert.rejects(renderPptx(noPayload), /no chart payload/);
    const badKind = [scene("s", [chartEl("s:ch", { chartKind: "radar", categories: ["A"], series: [{ name: "S", values: [1] }], labels: labels() })])];
    await assert.rejects(renderPptx(badKind), /scene contract invalid/);
    const noSeries = [scene("s", [chartEl("s:ch", { chartKind: "bar", categories: ["A"], series: [], labels: labels() })])];
    await assert.rejects(renderPptx(noSeries), /no series/);
  });

  it("empty tables are refused instead of rendering nothing", async () => {
    const empty = [scene("s", [{ id: "s:tbl", kind: "table", x: 1, y: 1, w: 6, h: 2, z: 1, provenance: "compiler", table: { rows: [], header: true } }])];
    await assert.rejects(renderPptx(empty), /no rows/);
    const missing = [scene("s", [{ id: "s:tbl", kind: "table", x: 1, y: 1, w: 6, h: 2, z: 1, provenance: "compiler" }])];
    await assert.rejects(renderPptx(missing), /no rows/);
  });

  it("a later unsafe slide fails the whole export with its own identity", async () => {
    const good = scene("s1", [textEl("s1:t", "Fine")]);
    const bad = scene("s3", [chartEl("s3:pie", pieSeries(["S1", "S2"], [[1, 2], [3, 4]]))]);
    await assert.rejects(renderPptx([good, scene("s2", [textEl("s2:t", "Also fine")]), bad]), (err) => {
      assert.match(err.message, /s3/);
      assert.match(err.message, /s3:pie/);
      assert.equal(err.issues.length, 1, "only the unsafe element reported");
      return true;
    });
  });

  it("rejection writes no file and preserves existing ones", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v25a-"));
    const bad = [scene("s1", [chartEl("s1:pie", pieSeries(["S1", "S2"], [[1, 2], [3, 4]]))])];
    const target = path.join(dir, "refused.pptx");
    await assert.rejects(renderPptxToFile(bad, target), /only the first/);
    assert.equal(existsSync(target), false, "no partially written file");
    const sentinel = path.join(dir, "kept.pptx");
    writeFileSync(sentinel, "sentinel");
    await assert.rejects(renderPptxToFile(bad, sentinel), /only the first/);
    assert.equal(readFileSync(sentinel, "utf8"), "sentinel", "existing file untouched");
  });

  it("valid exports stay native-editable and deterministic", async () => {
    const scenes = [scene("s1", [
      textEl("s1:t", "Authored headline"),
      chartEl("s1:ch", { chartKind: "bar", categories: ["Oxide", "Sulfide"], series: [{ name: "mS/cm", values: [1.2, 12.5] }], labels: labels() }),
    ])];
    const a = await renderPptx(scenes);
    const b = await renderPptx(scenes);
    // Zip envelopes carry write timestamps and pptxgenjs numbers
    // chart parts and workbooks from process-global counters, so
    // raw bytes and part names vary; every part's content must
    // match modulo those counters instead.
    const norm = (s) => s.replace(/chart\d+/g, "chartN").replace(/Worksheet\d+/g, "WorksheetN").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "TIME");
    async function parts(buf) {
      const zip = await JSZip.loadAsync(buf);
      const out = {};
      for (const n of Object.keys(zip.files)) {
        if (/\.xlsx$/.test(n)) {
          // Embedded workbooks are binary zips: compare their
          // decoded text parts, never lossy binary-as-string.
          const inner = await JSZip.loadAsync(await zip.files[n].async("uint8array"));
          const texts = [];
          for (const m of Object.keys(inner.files)) {
            texts.push(`${m}=${norm(await inner.files[m].async("string").catch(() => "bin"))}`);
          }
          out[norm(n)] = texts.sort().join("\n");
        } else {
          out[norm(n)] = norm(await zip.files[n].async("string").catch(() => "bin"));
        }
      }
      return out;
    }
    assert.deepEqual(await parts(a), await parts(b), "deterministic content");
    const zip = await JSZip.loadAsync(a);
    const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(slideXml, /Authored headline/, "text editable in slide XML");
    assert.ok((slideXml.match(/<a:t>/g) || []).length >= 1, "real text runs, never raster");
  });

  it("compiler-generated fallback scenes export with every value", async () => {
    const { loadThemeDocument } = await import("../src/theme-loader.js");
    const { normalizeDesign } = await import("../packages/core/design.ts");
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
    const intent = {
      id: "fb", title: "Fallback", slides: [{
        id: "s1", purpose: "shares", title: "Two mixes",
        blocks: [{ id: "c1", kind: "chart", chartKind: "pie", categories: ["A", "B"], series: [{ name: "Mix 1", values: [60, 40] }, { name: "Mix 2", values: [30, 70] }] }],
      }],
    };
    const design = normalizeDesign({ theme: await loadThemeDocument("warm-humanist"), mode: "light" });
    const { plan } = planDeckComposition(intent, design);
    void plan;
    const { scenes } = compileDeckDetailed(intent, design, null, null);
    const zip = await JSZip.loadAsync(await renderPptx(scenes));
    let xml = "";
    for (const n of Object.keys(zip.files).filter((x) => x.startsWith("ppt/slides/slide"))) {
      xml += await zip.files[n].async("string");
    }
    assert.ok(xml.includes("Mix 1") && xml.includes("Mix 2"), "fallback table carries both series");
    assert.ok(!Object.keys(zip.files).some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), "no fake chart part");
  });
});
