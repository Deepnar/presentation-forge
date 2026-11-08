// Feature-grid icons head their cards; image requests the supply step never
// filled stay as empty slots; card images the layout never drew are dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDeck } from "../packages/compiler/compile.js";
import { validateScene } from "../packages/model/scene.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { warmDesign } from "./v2-fixture.js";

const grid = {
  type: "feature-grid", headline: "What changes",
  items: [
    { icon: "⚡", title: "Faster charge", body: "Ten minutes to 80 percent" },
    { icon: " 🛡️ ", title: "Safer packs", body: "No flammable solvent" },
    { title: "Lighter", body: "Less cooling hardware" },
  ],
};

test("feature-grid icons convert onto their blocks", async () => {
  const { intent } = await convertGeneratedDeck({ title: "Icons", slides: [grid] });
  assert.deepEqual(intent.slides[0].blocks.map(b => b.icon), ["⚡", "🛡️", undefined]);
});

test("an icon heads its card, above the title and body", async () => {
  const { intent } = await convertGeneratedDeck({ title: "Icons", slides: [grid] });
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok((await validateScene(scene)).ok);
  const icons = scene.elements.filter(e => e.id.endsWith(":icon"));
  assert.deepEqual(icons.map(e => e.paragraphs[0].runs[0].text), ["⚡", "🛡️"]);
  for (const icon of icons) {
    const frame = scene.elements.find(e => e.id === icon.id.replace(/:icon$/, ":frame"));
    const content = scene.elements.find(e => e.semanticRef === icon.semanticRef && e.kind === "text" && e !== icon);
    assert.ok(icon.x >= frame.x && icon.x + icon.w <= frame.x + frame.w + 1e-9, "inside its card");
    assert.ok(content.y >= icon.y + icon.h - 1e-9, "title and body start below the icon");
  }
});

test("pending image requests become empty slots carrying their description", async () => {
  const { intent } = await convertGeneratedDeck({ title: "Pending", slides: [
    { type: "image", headline: "Nyquist plot", image: "[image] a standard Nyquist plot for a Li-ion cell" },
  ] });
  const block = intent.slides[0].blocks.find(b => b.kind === "image");
  assert.equal(block.src, "");
  assert.equal(block.alt, "a standard Nyquist plot for a Li-ion cell");
});

test("card images the layout never drew are dropped and reported", async () => {
  const { intent, dropped } = await convertGeneratedDeck({ title: "Cards", slides: [{
    type: "cards", headline: "Regions",
    cards: [{ title: "High", body: "Ohmic", image: "[image] close-up" }, { title: "Low", body: "Diffusion" }],
  }] });
  assert.deepEqual(dropped.map(d => d.path), ["slides[0].cards[0].image"]);
  assert.ok(!JSON.stringify(intent).includes("close-up"));
});
