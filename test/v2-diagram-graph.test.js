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

test("a child sits under its parent and siblings spread about it", async () => {
  const { intent, scene } = await compiled({ type: "hierarchy", headline: "Team", root: { label: "Lead" },
    children: [{ label: "Cells", children: [{ label: "Chemistry" }, { label: "Testing" }] }, { label: "Packs" }, { label: "Software" }] });
  const byLabel = Object.fromEntries(intent.slides[0].blocks.map(b => [b.label, scene.elements.find(e => e.id === `${scene.id}:${b.id}:frame`)]));
  const mid = f => f.x + f.w / 2;
  assert.ok(Math.abs(mid(byLabel.Lead) - mid(byLabel.Packs)) < 1e-6, "the middle child is under the root");
  assert.ok(Math.abs((mid(byLabel.Chemistry) + mid(byLabel.Testing)) / 2 - mid(byLabel.Cells)) < 1e-6, "siblings centre on their parent");
  assert.equal(intent.slides[0].connections.length, 5);
});

test("dependencies link each prerequisite to what needs it, dropping links to nothing", async () => {
  const { intent, dropped } = await convertGeneratedDeck({ title: "D", slides: [{ type: "dependencies", headline: "Order of work", nodes: [
    { title: "Cell spec" }, { title: "Pack design", depends_on: [0] }, { title: "Pilot line", depends_on: [0, 1, 7] },
  ] }] });
  const ids = intent.slides[0].blocks.map(b => b.id);
  assert.deepEqual(intent.slides[0].connections, [{ from: ids[0], to: ids[1] }, { from: ids[0], to: ids[2] }, { from: ids[1], to: ids[2] }]);
  assert.deepEqual(dropped.map(d => d.path), ["slides[0].nodes[2].depends_on[2]"]);
});

test("a branching flow chains its lead-in to the decision and each branch out of it, labelled", async () => {
  const { intent, scene } = await compiled({ type: "branching-flow", headline: "Screening", steps: [{ title: "Screen cell" }], decision: "Pass?",
    branches: [{ label: "Yes", steps: [{ title: "Build pack" }, { title: "Ship" }] }, { label: "No", steps: [{ title: "Second life" }] }] });
  const id = Object.fromEntries(intent.slides[0].blocks.map(b => [b.label, b.id]));
  assert.deepEqual(intent.slides[0].connections, [
    { from: id["Screen cell"], to: id["Pass?"] },
    { from: id["Pass?"], to: id["Build pack"], label: "Yes" }, { from: id["Build pack"], to: id.Ship },
    { from: id["Pass?"], to: id["Second life"], label: "No" },
  ]);
  const frame = l => scene.elements.find(e => e.id === `${scene.id}:${id[l]}:frame`);
  assert.equal(frame("Ship").x, frame("Build pack").x, "a branch's steps line up under each other");
});
