// The preservation invariant: a human move survives a later semantic edit,
// and a detached slide is never relaid out. This is architecture invariant 6.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { applyCommand } from "../packages/model/commands.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

describe("v2 preservation", () => {
  it("a moved diagram keeps its geometry after a text edit", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[2];
    let scene = compileSlide(slide, design);
    const target = scene.elements.find((e) => e.kind === "shape");
    const inverse = applyCommand(scene, { type: "element.move", id: target.id, x: 5.5, y: 4.0 });
    assert.equal(scene.layoutState, "customized");

    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks.find((b) => b.id === "s3v").text = "Shortened verdict";
    scene = recompileSlide(edited, scene, design);

    const kept = scene.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, 5.5);
    assert.equal(kept.y, 4.0);
    const verdict = scene.elements.find((e) => e.semanticRef === "s3v");
    assert.match(verdict.paragraphs[0].runs[0].text, /Shortened verdict/);
    assert.ok(inverse.x !== undefined);
  });

  it("resize inverts exactly (undo)", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[1], design);
    const el = scene.elements[1];
    const before = { w: el.w, h: el.h };
    const inverse = applyCommand(scene, { type: "element.resize", id: el.id, w: 9, h: 3 });
    assert.equal(inverse.w, before.w);
    applyCommand(scene, inverse);
    assert.equal(el.w, before.w);
    assert.equal(el.h, before.h);
  });

  it("a detached slide is authoritative: recompile returns it untouched", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    scene.layoutState = "detached";
    const edited = JSON.parse(JSON.stringify(slide));
    edited.title = "A completely different headline";
    const out = recompileSlide(edited, scene, design);
    assert.equal(out, scene);
  });

  it("detached scenes stay manually editable: move", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[1], design);
    scene.layoutState = "detached";
    const el = scene.elements[0];
    applyCommand(scene, { type: "element.move", id: el.id, x: 2.5, y: 3.5 });
    assert.equal(el.x, 2.5);
    assert.equal(el.y, 3.5);
    assert.equal(scene.layoutState, "detached");
  });

  it("detached scenes stay manually editable: resize", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[1], design);
    scene.layoutState = "detached";
    const el = scene.elements[1];
    applyCommand(scene, { type: "element.resize", id: el.id, w: 8, h: 2 });
    assert.equal(el.w, 8);
    assert.equal(el.h, 2);
    assert.equal(scene.layoutState, "detached");
  });

  it("detached scenes stay manually editable: text edit", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[1], design);
    scene.layoutState = "detached";
    const el = scene.elements[0];
    const paras = [{ runs: [{ text: "Hand-edited headline", size: 30 }] }];
    applyCommand(scene, { type: "element.updateText", id: el.id, paragraphs: paras });
    assert.equal(el.paragraphs[0].runs[0].text, "Hand-edited headline");
    assert.equal(scene.layoutState, "detached");
  });

  it("detached scenes stay manually editable: add and delete", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[0], design);
    scene.layoutState = "detached";
    const before = scene.elements.length;
    const inverse = applyCommand(scene, {
      type: "element.add",
      element: { kind: "text", x: 1, y: 6, w: 4, h: 0.6, paragraphs: [{ runs: [{ text: "Note" }] }] },
    });
    assert.equal(scene.elements.length, before + 1);
    applyCommand(scene, inverse);
    assert.equal(scene.elements.length, before);
    assert.equal(scene.layoutState, "detached");
  });

  it("locked elements still reject edits on detached scenes", async () => {
    const design = await warmDesign();
    const scene = compileSlide(sampleDeckIntent().slides[1], design);
    scene.layoutState = "detached";
    scene.elements[0].locked = true;
    assert.throws(
      () => applyCommand(scene, { type: "element.move", id: scene.elements[0].id, x: 1, y: 1 }),
      /locked/,
    );
  });

  it("human-added elements survive a recompile that drops nothing", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[0];
    let scene = compileSlide(slide, design);
    applyCommand(scene, {
      type: "element.add",
      element: { kind: "text", x: 1, y: 6, w: 4, h: 0.6, z: 20, provenance: "human", paragraphs: [{ runs: [{ text: "Marginalia", size: 10 }] }] },
    });
    const addedId = scene.elements.at(-1).id;
    scene = recompileSlide(slide, scene, design);
    assert.ok(scene.elements.some((e) => e.id === addedId));
  });
});
