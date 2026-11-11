// A matrix stays a 2x2 between its axes; a roadmap stays one lane per phase
// under its time labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const textOf = e => (e.paragraphs ?? []).map(p => p.runs.map(r => r.text).join("")).join("\n");
const inside = (a, b) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

const matrix = {
  type: "matrix", headline: "Where each chemistry sits",
  axes: { x: { label: "Energy density", low: "Lower", high: "Higher" }, y: { label: "Safety", low: "Riskier", high: "Safer" } },
  quadrants: [{ title: "Sodium-ion", body: "Safe, heavy" }, { title: "Solid-state", body: "Safe, dense" }, { title: "Lead-acid", body: "Neither" }, { title: "NMC", body: "Dense, risky" }],
};
const roadmap = {
  type: "roadmap", headline: "From pilot to fleet", time_labels: ["2026", "2027", "2028"],
  phases: [
    { label: "Pilot", items: [{ title: "Cell trials", body: "500 cycles" }, { title: "Safety cert" }] },
    { label: "Scale" },
    { label: "Fleet", items: [{ title: "Bus depots", body: "Three cities" }] },
  ],
};

async function compiled(slide) {
  const { intent } = await convertGeneratedDeck({ title: "M", slides: [slide] });
  assert.equal((await validateDeckIntent(intent)).ok, true);
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok((await validateScene(scene)).ok);
  return { intent, scene };
}

test("a matrix keeps its axes and puts quadrants in reading order", async () => {
  const { intent, scene } = await compiled(matrix);
  assert.deepEqual(intent.slides[0].axes, matrix.axes);
  const frames = intent.slides[0].blocks.map(b => scene.elements.find(e => e.id === `${scene.id}:${b.id}:frame`));
  const [tl, tr, bl, br] = frames;
  assert.ok(tl.x < tr.x && tl.y === tr.y && bl.x === tl.x && bl.y > tl.y && br.x === tr.x && br.y === bl.y);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(!overlap(frames[i], frames[j]));
  const text = scene.elements.map(textOf).join("\n");
  for (const value of ["Energy density", "Lower", "Higher", "Safety", "Riskier", "Safer", ...matrix.quadrants.map(q => q.title)]) assert.ok(text.includes(value), value);
  const safer = scene.elements.find(e => textOf(e) === "Safer"), riskier = scene.elements.find(e => textOf(e) === "Riskier");
  assert.ok(safer.y < riskier.y, "high end of y at the top");
  assert.ok(scene.elements.find(e => textOf(e) === "Lower").x < scene.elements.find(e => textOf(e) === "Higher").x);
});

test("a roadmap is one lane per phase, each phase's items in its own row", async () => {
  const { intent, scene } = await compiled(roadmap);
  const slide = intent.slides[0];
  assert.deepEqual(slide.axes, { x: { ticks: ["2026", "2027", "2028"] } });
  assert.deepEqual(slide.blocks.map(b => b.group), ["Pilot", "Pilot", "Scale", "Fleet"]);
  const lanes = ["Pilot", "Scale", "Fleet"].map(name => scene.elements.find(e => /:lane-\d+:label$/.test(e.id) && textOf(e) === name));
  assert.ok(lanes.every(Boolean) && lanes[0].y < lanes[1].y && lanes[1].y < lanes[2].y, "lanes in phase order");
  for (const block of slide.blocks.filter(b => b.label)) {
    const card = scene.elements.find(e => e.id === `${scene.id}:${block.id}:frame`);
    const lane = lanes[["Pilot", "Scale", "Fleet"].indexOf(block.group)];
    assert.ok(card.y >= lane.y - 0.1 && card.y + card.h <= lane.y + lane.h + 0.1, `${block.label} sits in the ${block.group} lane`);
    const text = scene.elements.find(e => e.kind === "text" && e.semanticRef === block.id && e.id.endsWith(":content"));
    assert.ok(inside(text, card) && textOf(text).includes(block.label));
  }
  const ticks = scene.elements.filter(e => /:axis-x:tick-\d+$/.test(e.id)).map(textOf);
  assert.deepEqual(ticks, ["2026", "2027", "2028"]);
});

test("a roadmap whose phases share a label refuses rather than merging lanes", async () => {
  await assert.rejects(convertGeneratedDeck({ title: "M", slides: [{ ...roadmap, phases: [roadmap.phases[0], roadmap.phases[0], roadmap.phases[2]] }] }),
    e => e.code === "unsupported-content" && e.details.some(d => d.path.endsWith("phases[1].label")));
});
