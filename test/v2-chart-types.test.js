// Progress bars, sparklines and journeys become native, editable charts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { warmDesign } from "./v2-fixture.js";

const bars = [{ label: "Cell trials", value: 80, target: 100 }, { label: "Pack design", value: 55, target: 70 }];

async function compiled(slide) {
  const { intent } = await convertGeneratedDeck({ title: "C", slides: [slide] });
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok((await validateScene(scene)).ok);
  return { intent, scene };
}

test("progress bars become a percentage bar chart with targets as a second series", async () => {
  const { scene } = await compiled({ type: "progress-bars", headline: "Progress", bars });
  const chart = scene.elements.find(e => e.kind === "chart").chart;
  assert.equal(chart.chartKind, "hbar");
  assert.deepEqual(chart.categories, ["Cell trials", "Pack design"]);
  assert.deepEqual(chart.series, [{ name: "Progress", values: [80, 55] }, { name: "Target", values: [100, 70] }]);
  assert.ok(scene.elements.some(e => JSON.stringify(e.paragraphs ?? []).includes("Unit: %")));
  const untargeted = await compiled({ type: "progress-bars", headline: "Progress", bars: bars.map(({ target, ...b }) => b) });
  assert.equal(untargeted.scene.elements.find(e => e.kind === "chart").chart.series.length, 1);
  await assert.rejects(convertGeneratedDeck({ title: "C", slides: [{ type: "progress-bars", headline: "P", bars: [bars[0], { label: "X", value: 3 }] }] }),
    e => e.code === "unsupported-content");
});

test("sparklines become small multiples in a two-column grid, captioned with their value", async () => {
  const items = ["Capacity", "Resistance", "Cycles", "Faults"].map((label, i) => ({ label, values: [i, i + 1, i + 3], value: `${i}%` }));
  const { scene } = await compiled({ type: "sparklines", headline: "Fleet", items });
  const charts = scene.elements.filter(e => e.kind === "chart");
  assert.equal(charts.length, 4);
  assert.ok(charts.every(c => c.chart.chartKind === "line"));
  assert.equal(charts[0].y, charts[1].y, "two to a row");
  assert.ok(charts[2].y > charts[0].y + charts[0].h);
  assert.ok(charts[1].x > charts[0].x + charts[0].w);
  const captions = scene.elements.filter(e => e.id.endsWith(":caption")).map(e => e.paragraphs[0].runs[0].text);
  assert.deepEqual(captions, items.map(i => `${i.label} — ${i.value}`));
  assert.ok(scene.elements.every(e => e.y + e.h <= scene.height + 1e-9), "the grid stays on the slide");
});

test("a journey keeps its stages and sentiment, and draws its values only when every stage has one", async () => {
  const stages = [{ label: "Built", sentiment: "positive", value: 100 }, { label: "Fading", sentiment: "negative", value: 81 }, { label: "Reused", value: 78 }];
  const { intent, scene } = await compiled({ type: "journey", headline: "A cell's life", stages });
  assert.deepEqual(intent.slides[0].blocks.filter(b => b.kind === "text").map(b => b.outcome), ["favorable", "unfavorable", undefined]);
  assert.deepEqual(scene.elements.find(e => e.kind === "chart").chart.series[0].values, [100, 81, 78]);
  const partial = await compiled({ type: "journey", headline: "A cell's life", stages: stages.map((s, i) => (i ? s : { ...s, value: undefined })) });
  assert.ok(!partial.scene.elements.some(e => e.kind === "chart"), "a missing value means no line, as before");
});

test("chart label gutters are measured in pixels, so long categories are not clipped", async () => {
  const { scene } = await compiled({ type: "progress-bars", headline: "Progress", bars: [{ label: "A much longer workstream", value: 40 }, { label: "Short", value: 10 }] });
  const chart = scene.elements.find(e => e.kind === "chart");
  const svg = sceneToSvg(scene);
  const label = [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="end"[^>]*>A much longer workstream<\/text>/g)][0];
  assert.ok(label, "the category label is drawn");
  const rightEdge = Number(label[1]);
  assert.ok(rightEdge - 150 > chart.x * 96, "the label's end leaves room for the whole label inside the chart");
});
