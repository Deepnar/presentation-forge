// A layered architecture stays a stack of full-width layers, top layer first,
// each with its label, description and component pills.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { validateScene } from "../packages/model/scene.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const layers = [
  { label: "Application", body: "Solver and physics", items: ["CFD", "FEM"] },
  { label: "Task runtime", body: "Schedules work", items: ["OpenMP", "TBB"] },
  { label: "Communication", body: "Moves data", items: ["MPI", "NCCL", "UCX"] },
  { label: "Hardware" },
];
const slide = { type: "layered-architecture", headline: "How a hybrid code is layered", layers };
const inside = (a, b) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const textOf = e => (e.paragraphs ?? []).map(p => p.runs.map(r => r.text).join("")).join("\n");

test("layers convert to a layered hierarchy in authored order", async () => {
  const { intent } = await convertGeneratedDeck({ title: "L", slides: [slide] });
  const s = intent.slides[0];
  assert.equal(s.relationship, "hierarchy");
  assert.deepEqual(s.layoutHint, { arrangement: "layers" });
  assert.deepEqual(s.blocks.map(b => [b.label, b.text, b.items]), layers.map(l => [l.label, l.body ?? "", l.items]));
});

test("each layer is a full-width band with its label, text and pills inside it", async () => {
  const design = await warmDesign();
  const { intent } = await convertGeneratedDeck({ title: "L", slides: [slide] });
  const [scene] = compileDeck(intent, design);
  assert.ok((await validateScene(scene)).ok);
  const blocks = intent.slides[0].blocks;
  const bands = blocks.map(b => scene.elements.find(e => e.id === `${scene.id}:${b.id}:frame`));
  assert.ok(bands.every(b => b.w === bands[0].w && b.x === bands[0].x), "bands span one width");
  for (let i = 1; i < bands.length; i++) assert.ok(bands[i].y >= bands[i - 1].y + bands[i - 1].h, "top layer first, no overlap");
  blocks.forEach((block, i) => {
    const mine = scene.elements.filter(e => e.semanticRef === block.id && e !== bands[i]);
    assert.ok(mine.every(e => inside(e, bands[i])), `${block.label}: everything stays in its band`);
    assert.equal(textOf(mine.find(e => e.id.endsWith(":label"))), block.label);
    if (block.text) assert.ok(mine.some(e => textOf(e) === block.text), `${block.label}: description drawn`);
    const pills = mine.filter(e => /:pill-\d+-text$/.test(e.id)).map(textOf);
    assert.deepEqual(pills, [...(block.items ?? [])].reverse(), `${block.label}: every component pill drawn`);
  });
  const { findings } = planDeckComposition(intent, design);
  assert.ok(!findings.some(f => f.code === "hierarchy-topology-unspecified"));
});

test("an across flow's cards fit their content in one centred row", async () => {
  const design = await warmDesign();
  const steps = ["Collect", "Clean", "Model", "Report"].map(title => ({ title, body: "Gather readings from every cell in the rig" }));
  const { intent } = await convertGeneratedDeck({ title: "F", slides: [{ type: "flow", headline: "Pipeline", steps }] });
  const [scene] = compileDeck(intent, design);
  const frames = scene.elements.filter(e => e.id.endsWith(":frame"));
  assert.ok(frames.every(f => f.y === frames[0].y && f.h === frames[0].h), "one row, one height");
  for (const frame of frames) {
    const text = scene.elements.find(e => e.kind === "text" && e.semanticRef === frame.semanticRef && !e.id.endsWith(":badge"));
    assert.ok(inside(text, frame), "the step's text sits inside its card");
  }
  const title = scene.elements.find(e => e.id.endsWith(":title:heading"));
  const above = frames[0].y - (title.y + title.h), below = scene.height - (frames[0].y + frames[0].h);
  assert.ok(above > 0.3 && below > 0.3, "a short row is not pinned under the title");
});

test("a funnel narrows band by band, centred, keeping each stage's value", async () => {
  const stages = ["Made", "Screened", "Packed", "In service"].map((label, i) => ({ label, value: String(1000 - i * 100), body: "Detail" }));
  const { intent } = await convertGeneratedDeck({ title: "F", slides: [{ type: "funnel", headline: "Yield", stages }] });
  assert.deepEqual(intent.slides[0].layoutHint, { arrangement: "funnel" });
  const [scene] = compileDeck(intent, await warmDesign());
  const bands = intent.slides[0].blocks.map(b => scene.elements.find(e => e.id === `${scene.id}:${b.id}:frame`));
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i].w < bands[i - 1].w, "each band narrower than the one above");
    assert.ok(Math.abs(bands[i].x + bands[i].w / 2 - (bands[0].x + bands[0].w / 2)) < 1e-6, "centred");
  }
  intent.slides[0].blocks.forEach((block, i) => {
    const mine = scene.elements.filter(e => e.semanticRef === block.id && e !== bands[i]);
    assert.ok(mine.every(e => inside(e, bands[i])), `${block.label} stays in its band`);
    assert.ok(mine.some(e => textOf(e) === stages[i].value), `${block.label} keeps its value`);
  });
});

test("a legacy pyramid keeps its top-widest shape and level order", async () => {
  const { intent } = await convertGeneratedDeck({ title: "P", slides: [{ type: "pyramid", headline: "Needs", levels: [{ label: "Base" }, { label: "Middle" }, { label: "Top" }] }] });
  assert.deepEqual(intent.slides[0].layoutHint, { arrangement: "funnel" });
  assert.deepEqual(intent.slides[0].blocks.map(b => b.label), ["Base", "Middle", "Top"]);
});
