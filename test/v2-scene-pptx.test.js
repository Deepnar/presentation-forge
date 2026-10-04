// Scene -> PPTX: text, charts, and tables survive as editable OOXML.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { compileDeck } from "../packages/compiler/compile.js";
import { renderPptxToFile } from "../packages/renderer-pptx/node.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

describe("v2 scene pptx", () => {
  let dir;
  let pptxPath;
  let slideXml = "";
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "v2slice-"));
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    // Empty image src must not kill the deck: placeholder, still editable.
    pptxPath = path.join(dir, "slice.pptx");
    await renderPptxToFile(scenes, pptxPath);
    const buf = readFileSync(pptxPath);
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => n.startsWith("ppt/slides/slide"));
    assert.equal(names.length, 6);
    for (const n of names) slideXml += await zip.files[n].async("string");
  });

  it("writes six slides", () => assert.ok(pptxPath.endsWith("slice.pptx")));

  it("headline text survives in slide XML", () => {
    assert.match(slideXml, /Liquid electrolytes leak/);
    assert.match(slideXml, /Solid-state batteries/);
  });

  it("list items survive in slide XML", () => {
    assert.match(slideXml, /Dendrites pierce separators/);
  });

  it("chart data survives as a chart part", async () => {
    const zip = await JSZip.loadAsync(readFileSync(pptxPath));
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(charts.length >= 1);
    const xml = await zip.files[charts[0]].async("string");
    assert.match(xml, /12\.5/);
  });

  it("the same scene renders to browser SVG with stable element ids", async () => {
    const design = await warmDesign();
    const [scene] = compileDeck(sampleDeckIntent(), design);
    const svg = sceneToSvg(scene);
    assert.match(svg, /<svg/);
    assert.match(svg, new RegExp(`data-el="${scene.elements[0].id}"`));
    assert.match(svg, /Solid-state batteries/);
  });
});
