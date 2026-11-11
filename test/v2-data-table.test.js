// A data table keeps what the legacy table drew: one cell per column, its
// column alignment, and highlighted rows marked with an accent bar.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { compileDeck } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const slide = {
  type: "data-table", headline: "What scaling costs",
  columns: [{ label: "Parameter" }, { label: "Reality", align: "right" }],
  rows: [{ text: ["Machines", "40%"], highlight: true }, { text: ["Pilot plant"] }, { text: ["Ramp", "3 years", "never drawn"] }],
};

test("rows keep one cell per column, alignment and highlights carry over", async () => {
  const { intent, dropped } = await convertGeneratedDeck({ title: "T", slides: [slide] });
  const table = intent.slides[0].blocks.find(b => b.kind === "table");
  assert.deepEqual(table.rows, [["Parameter", "Reality"], ["Machines", "40%"], ["Pilot plant", ""], ["Ramp", "3 years"]]);
  assert.deepEqual(table.columnAlign, ["left", "right"]);
  assert.deepEqual(table.emphasisRows, [1]);
  assert.deepEqual(dropped.map(d => d.path), ["slides[0].rows[2].text"]);
});

test("both renderers align cells and draw the emphasis bar", async () => {
  const { intent } = await convertGeneratedDeck({ title: "T", slides: [slide] });
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok((await validateScene(scene)).ok);
  const table = scene.elements.find(e => e.kind === "table");
  assert.deepEqual(table.table.columnAlign, ["left", "right"]);
  assert.ok(table.table.layout.emphasisColor);

  const svg = sceneToSvg(scene);
  assert.match(svg, /text-anchor="end"[^>]*>40%</);
  assert.ok(svg.includes(`fill="#${table.table.layout.emphasisColor}"`));

  const zip = await JSZip.loadAsync(await renderPptx([scene]));
  const xml = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(xml, /<a:pPr[^>]*algn="r"[^>]*\/?>(?:(?!<\/a:p>).)*40%/s, "the right column is right-aligned natively");
  const bars = [...xml.matchAll(/<a:srgbClr val="([0-9A-F]{6})"/gi)].filter(m => m[1].toUpperCase() === table.table.layout.emphasisColor.toUpperCase());
  assert.ok(bars.length >= 1, "the emphasis bar is a native shape in the accent colour");
});
