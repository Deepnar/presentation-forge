// A diagram keeps its nodes and the links between them: depth layers along
// the links, labelled connectors, and labels that never sit on a node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { validateScene } from "../packages/model/scene.ts";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const nodes = [
  { id: "src", label: "Sensors", body: "Raw cell data" },
  { id: "bms", label: "BMS", body: "Limits and balancing" },
  { id: "edge", label: "Edge model", body: "State of health" },
  { id: "cloud", label: "Fleet cloud", body: "Ageing trends" },
  { id: "ops", label: "Operators", body: "Swap decisions" },
];
const edges = [
  { from: "src", to: "bms", label: "100 Hz" }, { from: "bms", to: "edge" },
  { from: "bms", to: "cloud", label: "hourly" }, { from: "edge", to: "ops" }, { from: "cloud", to: "ops" },
];
const diagram = (layout, extra = {}) => ({ type: "diagram", headline: "How data reaches a decision", nodes, edges, ...(layout ? { layout } : {}), ...extra });
const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

async function compiled(slide) {
  const { intent, dropped } = await convertGeneratedDeck({ title: "D", slides: [slide] });
  const [scene] = compileDeck(intent, await warmDesign());
  return { intent, dropped, scene, frame: id => scene.elements.find(e => e.id === `${scene.id}:${id}:frame`) };
}

test("nodes become blocks and edges become connections between them", async () => {
  const { intent, dropped } = await convertGeneratedDeck({ title: "D", slides: [diagram("horizontal", { edges: [...edges, { from: "src", to: "ghost" }] })] });
  assert.equal((await validateDeckIntent(intent)).ok, true);
  const slide = intent.slides[0];
  assert.deepEqual(slide.layoutHint, { arrangement: "graph", flowDirection: "across" });
  const blockOf = Object.fromEntries(nodes.map((n, i) => [n.id, slide.blocks[i].id]));
  assert.deepEqual(slide.connections, edges.map(e => ({ from: blockOf[e.from], to: blockOf[e.to], ...(e.label ? { label: e.label } : {}) })));
  assert.deepEqual(dropped.map(d => d.path), ["slides[0].edges[5]"], "a link to a missing node was never drawn");
  assert.deepEqual((await convertGeneratedDeck({ title: "D", slides: [diagram("radial")] })).intent.slides[0].layoutHint, { arrangement: "radial" });
});

test("a vertical graph puts each node one layer below its deepest source", async () => {
  const { intent, scene, frame } = await compiled(diagram());
  assert.ok((await validateScene(scene)).ok);
  const blocks = intent.slides[0].blocks;
  const y = id => frame(blocks[nodes.findIndex(n => n.id === id)].id).y;
  assert.ok(y("src") < y("bms") && y("bms") < y("edge") && y("edge") < y("ops"));
  assert.equal(y("edge"), y("cloud"), "siblings share a layer");
  const frames = blocks.map(b => frame(b.id));
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) assert.ok(!overlap(frames[i], frames[j]));
  for (const block of blocks) {
    const text = scene.elements.find(e => e.kind === "text" && e.semanticRef === block.id && e.id.endsWith(":content"));
    assert.ok(JSON.stringify(text.paragraphs).includes(block.label), block.label);
  }
  assert.equal(scene.elements.filter(e => /:link-\d+$/.test(e.id)).length, edges.length);
  const { findings } = planDeckComposition(intent, await warmDesign());
  assert.ok(!findings.some(f => f.code === "hierarchy-topology-unspecified"));
});

test("a horizontal graph runs its layers left to right", async () => {
  const { intent, frame } = await compiled(diagram("horizontal"));
  const blocks = intent.slides[0].blocks;
  const x = id => frame(blocks[nodes.findIndex(n => n.id === id)].id).x;
  assert.ok(x("src") < x("bms") && x("bms") < x("edge") && x("edge") < x("ops"));
});

for (const layout of [undefined, "horizontal", "radial"]) test(`${layout ?? "vertical"} link labels stay readable: off the nodes and off each other`, async () => {
  const { scene } = await compiled(diagram(layout));
  // Graph layouts leave room between layers for every label; a radial ring is
  // fixed, so there a label may touch a node's edge but never its text.
  const obstacles = layout === "radial"
    ? scene.elements.filter(e => e.kind === "text" && e.id.endsWith(":content"))
    : scene.elements.filter(e => e.id.endsWith(":frame"));
  const chips = scene.elements.filter(e => e.id.endsWith(":chip"));
  assert.equal(chips.length, 2);
  for (const chip of chips) for (const node of obstacles) assert.ok(!overlap(chip, node), `${chip.id} over ${node.id}`);
  assert.ok(!overlap(chips[0], chips[1]));
  const labels = scene.elements.filter(e => /:link-\d+:label$/.test(e.id)).map(e => e.paragraphs[0].runs[0].text).sort();
  assert.deepEqual(labels, ["100 Hz", "hourly"]);
});

test("a radial diagram draws its authored links instead of plain spokes", async () => {
  const { scene } = await compiled(diagram("radial"));
  assert.equal(scene.elements.filter(e => /:link-\d+$/.test(e.id)).length, edges.length);
  assert.equal(scene.elements.filter(e => e.id.endsWith(":link")).length, 0, "no default spokes");
});
