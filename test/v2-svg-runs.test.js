// Words styled inside a paragraph show in the browser as they will in the
// .pptx: each run is drawn in its own type, colour and decoration, wrapped
// with each word measured in its own run's type. Paragraphs whose runs all
// look alike draw exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneToSvg } from "../packages/editor/scene-svg.js";

const scene = (paragraphs, w = 8) => ({ id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "detached", elements: [
  { id: "h-000000000001", kind: "text", x: 1, y: 1, w, h: 3, z: 0, provenance: "human", paragraphs },
] });

test("styled words draw in their own style", () => {
  const svg = sceneToSvg(scene([{ runs: [
    { text: "Cells ", size: 20, color: "111111" },
    { text: "fail", size: 20, color: "C0392B", bold: true, underline: true },
    { text: " at the interface", size: 20, color: "111111" },
  ] }]));
  const tspans = [...svg.matchAll(/<tspan([^>]*)>([^<]*)<\/tspan>/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(tspans.map(([t]) => t), ["Cells ", "fail", " at the interface"]);
  assert.match(tspans[1][1], /font-weight="bold"/);
  assert.match(tspans[1][1], /fill="#C0392B"/);
  assert.match(tspans[1][1], /text-decoration="underline"/);
  assert.doesNotMatch(tspans[0][1], /bold|underline/);
});

test("runs that look alike draw as one text, as before", () => {
  const svg = sceneToSvg(scene([{ runs: [{ text: "Same ", size: 20, color: "111111" }, { text: "style", size: 20, color: "111111" }] }]));
  assert.doesNotMatch(svg, /<tspan/);
  assert.match(svg, />Same style</);
});

test("a mixed paragraph wraps inside its box, the bigger run setting the line", () => {
  const words = "word ".repeat(30).trim();
  const svg = sceneToSvg(scene([{ runs: [{ text: `${words} `, size: 14, color: "111111" }, { text: "BIG", size: 28, color: "111111" }] }], 3), { wrapText: true });
  const lines = [...svg.matchAll(/<text [^>]*y="([\d.]+)"[^>]*>(?:<tspan)/g)];
  assert.ok(lines.length > 3, `wrapped into ${lines.length} lines`);
  assert.match(svg, /<tspan[^>]*font-size="37\.3"[^>]*>BIG<\/tspan>/, "28pt in its own run");
});

test("the SVG is well-formed XML and keeps the spaces at style boundaries", () => {
  const svg = sceneToSvg(scene([{ runs: [{ text: "Cells ", size: 20, color: "111111" }, { text: "fail", size: 20, color: "C0392B", bold: true }] }]));
  // Hit areas carry a value: a bare attribute is HTML, not XML, and breaks
  // anything that reads the SVG as a file (images, rasterisers, exports).
  assert.doesNotMatch(svg, /\sdata-hit(?=[\s>\/])/);
  assert.match(svg, /<text [^>]*xml:space="preserve"[^>]*><tspan[^>]*>Cells <\/tspan>/);
});
