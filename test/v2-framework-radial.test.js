// A framework keeps its concept at the centre of its parts; an icon list
// keeps every icon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { validateScene } from "../packages/model/scene.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const parts = ["Stack pressure", "Coatings", "Temperature", "Current density", "Cathode mix", "Electrolyte"];
const framework = n => ({
  type: "framework", headline: "What decides cell lifetime",
  concept: { title: "Interface stability", body: "Where lithium meets the solid electrolyte" },
  elements: parts.slice(0, n).map(title => ({ title, body: "Short reason" })),
});
const inside = (a, b) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("a framework converts to a radial hierarchy led by its concept", async () => {
  const { intent } = await convertGeneratedDeck({ title: "F", slides: [framework(4)] });
  const slide = intent.slides[0];
  assert.equal(slide.relationship, "hierarchy");
  assert.deepEqual(slide.layoutHint, { arrangement: "radial" });
  assert.deepEqual(slide.blocks.map(b => b.label), ["Interface stability", ...parts.slice(0, 4)]);
  assert.equal(slide.blocks[0].emphasis, "primary");
});

for (const n of [2, 3, 4, 5, 6]) test(`${n} parts ring the concept without touching it or each other`, async () => {
  const { intent } = await convertGeneratedDeck({ title: "F", slides: [framework(n)] });
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok((await validateScene(scene)).ok);
  const [hubBlock, ...partBlocks] = intent.slides[0].blocks;
  const frame = id => scene.elements.find(e => e.id === `${scene.id}:${id}:frame`);
  const hub = frame(hubBlock.id);
  assert.equal(hub.shape.form, "ellipse", "the concept is the hub");
  const cards = partBlocks.map(b => frame(b.id));
  assert.ok(cards.every(c => c.shape.form === "roundRect"));
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]), `cards ${i} and ${j}`);
  const hubCentre = { x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 };
  for (const card of cards) {
    const nx = Math.min(Math.max(hubCentre.x, card.x), card.x + card.w) - hubCentre.x;
    const ny = Math.min(Math.max(hubCentre.y, card.y), card.y + card.h) - hubCentre.y;
    assert.ok((nx / (hub.w / 2)) ** 2 + (ny / (hub.h / 2)) ** 2 >= 1, "a card never cuts into the hub");
  }
  const spokes = scene.elements.filter(e => e.id.endsWith(":link"));
  assert.equal(spokes.length, n);
  assert.ok(spokes.every(s => Math.abs(s.x - hubCentre.x) < 1e-9 && Math.abs(s.y - hubCentre.y) < 1e-9), "spokes start at the hub");
  for (const block of partBlocks) {
    const text = scene.elements.find(e => e.kind === "text" && e.semanticRef === block.id);
    assert.ok(inside(text, frame(block.id)), "each part's text stays in its card");
  }
  assert.ok(scene.elements.every(e => e.x >= 0 && e.y >= 0 && e.x + e.w <= scene.width + 1e-9 && e.y + e.h <= scene.height + 1e-9));
  const { findings } = planDeckComposition(intent, await warmDesign());
  assert.ok(!findings.some(f => f.code === "hierarchy-topology-unspecified"), "a radial framework states its topology");
});

test("an icon list becomes icon-headed cards, one per item", async () => {
  const items = [["👀", "Eye contact"], ["🤝", "Handshake"], ["", "Smile"], ["🗣️", "Say their name"]];
  const { intent } = await convertGeneratedDeck({ title: "I", slides: [{ type: "icon-list", headline: "First impressions", items: items.map(([icon, text]) => ({ icon, text })) }] });
  assert.deepEqual(intent.slides[0].blocks.map(b => [b.icon, b.text]), items.map(([icon, text]) => [icon || undefined, text]));
  const [scene] = compileDeck(intent, await warmDesign());
  assert.deepEqual(scene.elements.filter(e => e.id.endsWith(":icon")).map(e => e.paragraphs[0].runs[0].text), ["👀", "🤝", "🗣️"]);
});
