// V2-2D: the canonical renderer is SlideScene[] -> Uint8Array.
// Structural OOXML assertions (no huge snapshots, no byte-identity).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

describe("v2 renderer pptx bytes", () => {
  let scenes;
  let bytes;
  before(async () => {
    const design = await warmDesign();
    scenes = compileDeck(sampleDeckIntent(), design);
    bytes = await renderPptx(scenes, {
      title: "Solid-state batteries",
      author: "Forge",
      subject: "Materials",
      company: "TCET",
      revision: "3",
    });
  });

  it("returns a non-empty Uint8Array with a ZIP signature", () => {
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 0);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it("rejects empty scene input loudly", async () => {
    await assert.rejects(renderPptx([]), /at least one scene/);
  });

  it("contains the expected slide parts", async () => {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    assert.ok(names.includes("[Content_Types].xml"));
    assert.ok(names.includes("ppt/presentation.xml"));
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    assert.equal(slides.length, scenes.length);
  });

  it("keeps text, shape, chart, table, and line native", async () => {
    const zip = await JSZip.loadAsync(bytes);
    let xml = "";
    for (const n of Object.keys(zip.files).filter((s) => /^ppt\/slides\/slide\d+\.xml$/.test(s))) {
      xml += await zip.files[n].async("string");
    }
    assert.match(xml, /Liquid electrolytes leak/);
    assert.ok(xml.includes("<p:sp>"), "text/shapes persist as native shapes");
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(charts.length >= 1, "chart persists as a chart part");

    const tableBytes = await renderPptx([{
      id: "t1", width: 13.333, height: 7.5,
      background: { fill: "FFFFFF" }, elements: [
        {
          id: "t1:table", kind: "table", x: 1, y: 1, w: 6, h: 2, z: 1,
          provenance: "compiler",
          table: { rows: [["a", "b"], ["c", "d"]], header: true },
        },
        {
          id: "t1:line", kind: "line", x: 1, y: 4, w: 1, h: 1, z: 2,
          provenance: "compiler",
          line: { x2: 5, y2: 4, stroke: "888888", strokeWidth: 1.5 },
        },
      ],
      layoutState: "managed",
    }]);
    const tableZip = await JSZip.loadAsync(tableBytes);
    const tableXml = await tableZip.files["ppt/slides/slide1.xml"].async("string");
    assert.ok(tableXml.includes("<a:tbl>"), "table persists as a native table");
    assert.ok(tableXml.includes('prst="line"'), "line persists as a native line shape");
  });

  it("writes document metadata into OOXML properties", async () => {
    const zip = await JSZip.loadAsync(bytes);
    const core = await zip.files["docProps/core.xml"].async("string");
    const app = await zip.files["docProps/app.xml"].async("string");
    assert.match(core, /Solid-state batteries/);
    assert.match(core, /Forge/);
    assert.match(core, /<dc:subject>Materials<\/dc:subject>/);
    assert.match(core, /<cp:revision>3<\/cp:revision>/);
    assert.match(app, /TCET/);
  });

  it("renders fresh presentations per call", async () => {
    const a = await renderPptx(scenes);
    const b = await renderPptx(scenes);
    assert.ok(a instanceof Uint8Array && b instanceof Uint8Array);
    assert.notEqual(a, b);
    assert.equal((await JSZip.loadAsync(a)).file(/ppt\/slides\/slide\d+\.xml/).length, scenes.length);
  });
});

describe("v2 renderer node adapter", () => {
  it("writes its rendered bytes to a path", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v2render-"));
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const outPath = path.join(dir, "deck.pptx");
    const returned = await renderPptxToFile(scenes, outPath, { title: "T" });
    assert.equal(returned, outPath);
    assert.ok(existsSync(outPath));
    const zip = await JSZip.loadAsync(readFileSync(outPath));
    assert.equal(zip.file(/ppt\/slides\/slide\d+\.xml/).length, scenes.length);
  });
});
