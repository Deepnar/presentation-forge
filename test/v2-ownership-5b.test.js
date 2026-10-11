// V2-5B §11: human geometry vs content ownership counterfactuals.
// A moved element refreshes compiler text; a rewritten element keeps
// human text across regeneration; both dimensions compose;
// human-added elements and detached slides behave. Cases B and C
// fail on the accepted `06a0211` baseline (text silently overwritten
// by id match) and pass after the contentCustomized policy.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { applyCommand } from "../packages/model/commands.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function bodyText(scene) {
  return scene.elements.find((e) => e.semanticRef === "s2b1");
}

function runText(scene) {
  return bodyText(scene).paragraphs[0].runs[0].text;
}

describe("v2-5b ownership counterfactuals", () => {
  it("Case A — moved compiler text refreshes wording, keeps position", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    const target = bodyText(scene);
    applyCommand(scene, { type: "element.move", id: target.id, x: target.x + 0.5, y: target.y });
    assert.equal(target.contentCustomized, undefined, "a move claims no content");
    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].items[0] = "Reworded first point";
    const out = recompileSlide(edited, scene, design);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, target.x, "human position retained");
    assert.match(runText(out), /Reworded first point/, "compiler wording flows into moved text");
  });

  it("Case B — rewritten compiler text survives regeneration", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    const target = bodyText(scene);
    const before = { x: target.x, y: target.y };
    applyCommand(scene, {
      type: "element.updateText", id: target.id,
      paragraphs: [{ runs: [{ text: "Human wording", size: 13, color: "111111" }] }],
    });
    assert.equal(target.contentCustomized, true, "a rewrite claims content");
    assert.equal(target.customized, undefined, "a rewrite claims no geometry");
    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].items[0] = "Compiler tries to overwrite";
    const out = recompileSlide(edited, scene, design);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.match(runText(out), /Human wording/, "human text not silently overwritten by id match");
    assert.deepEqual({ x: kept.x, y: kept.y }, before, "untouched geometry stays compiler-placed");
  });

  it("Case C — moved and rewritten text keeps both dimensions", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    const target = bodyText(scene);
    applyCommand(scene, { type: "element.move", id: target.id, x: target.x + 1, y: target.y });
    applyCommand(scene, {
      type: "element.updateText", id: target.id,
      paragraphs: [{ runs: [{ text: "Human wording, human place", size: 13, color: "111111" }] }],
    });
    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].items[0] = "Compiler tries both";
    const out = recompileSlide(edited, scene, design);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, target.x, "human position retained");
    assert.match(runText(out), /Human wording, human place/, "human text retained");
  });

  it("Case D — human-added element survives regeneration", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    const inverse = applyCommand(scene, {
      type: "element.add",
      element: { kind: "text", x: 1, y: 6, w: 4, h: 1, paragraphs: [{ runs: [{ text: "Margin note", size: 12, color: "111111" }] }] },
    });
    assert.equal(inverse.type, "element.delete", "add inverts to delete");
    const out = recompileSlide(JSON.parse(JSON.stringify(slide)), scene, design);
    assert.ok(out.elements.some((e) => e.paragraphs?.[0]?.runs?.[0]?.text === "Margin note"), "added element carried forward");
  });

  it("Case E — detached slide regenerates byte-identical", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    scene.layoutState = "detached";
    const edited = JSON.parse(JSON.stringify(slide));
    edited.title = "A completely different headline";
    const out = recompileSlide(edited, scene, design);
    assert.equal(out, scene, "detached returns untouched");
    assert.deepEqual(JSON.parse(JSON.stringify(out)), JSON.parse(JSON.stringify(scene)));
  });
});
