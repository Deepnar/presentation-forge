// The editor's font choices are the installed families, the theme's own
// first; an underlined run reaches the .pptx and the browser's SVG.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { fontChoices, installedFamilies } from "../src/fonts.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";

test("font choices lead with the theme's own families, then the rest sorted", async () => {
  const all = await installedFamilies();
  assert.ok(all.includes("Inter") && all.length >= 20);
  const c = await fontChoices("warm-humanist");
  assert.deepEqual(c.theme, ["Merriweather", "Inter"]);
  assert.deepEqual(c.families.slice(0, 2), ["Merriweather", "Inter"]);
  assert.equal(new Set(c.families).size, all.length, "every installed family once");
  assert.deepEqual((await fontChoices("no-such-theme")).theme, []);
});

test("an underlined run is underlined in the .pptx and the SVG", async () => {
  const scene = { id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "detached", elements: [
    { id: "h-000000000001", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 0, provenance: "human", paragraphs: [{ runs: [{ text: "Underlined", size: 20, color: "111111", underline: true }] }] },
  ] };
  const zip = await JSZip.loadAsync(await renderPptx([scene]));
  assert.match(await zip.file("ppt/slides/slide1.xml").async("string"), /u="sng"/);
  assert.match(sceneToSvg(scene), /text-decoration="underline"/);
});
