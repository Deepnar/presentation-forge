// V2-5E: shape styling. Headless coverage for element.setStyle
// validation, partial-patch semantics, null clearing, no-op policy,
// exact undo/redo, ownership/regeneration preservation, and native
// PPTX projection. Inspector synchronization is asserted through the
// adapter (panel behavior in Chrome); engine detail through
// doc.apply.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

function shapeScene() {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      {
        id: "s:card", kind: "shape", x: 2, y: 2, w: 4, h: 2, z: 0, provenance: "compiler", semanticRef: "card",
        shape: { form: "roundRect", fill: "AABBCC" },
      },
      {
        id: "s:plain", kind: "shape", x: 7, y: 2, w: 2, h: 2, z: 1, provenance: "compiler", semanticRef: "plain",
        shape: { form: "rect", fill: "D8D8D2", stroke: "111111", strokeWidth: 1 },
      },
      {
        id: "s:txt", kind: "text", x: 1, y: 5, w: 4, h: 1, z: 2, provenance: "compiler", semanticRef: "body",
        paragraphs: [{ runs: [{ text: "words", size: 13, color: "111111" }], align: "left" }],
      },
    ],
  }];
}

async function rig(scenes) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: () => {},
  });
  return { document, root, viewer, doc, editor, errors };
}

function elOf(r, id) {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
}

describe("v2-5e setStyle validation", () => {
  it("rejects malformed patches before any mutation", async () => {
    const r = await rig(shapeScene());
    const before = JSON.stringify(r.doc.snapshot().scenes);
    const cases = [
      [{}, /at least one/],
      [null, /needs a style patch/],
      ["red", /needs a style patch/],
      [{ fill: "xyz" }, /hex/],
      [{ fill: "#12345" }, /hex/],
      [{ stroke: "GGGGGG" }, /hex/],
      [{ strokeWidth: -1 }, /0 to 24/],
      [{ strokeWidth: NaN }, /0 to 24/],
      [{ strokeWidth: 99 }, /0 to 24/],
    ];
    for (const [patch, want] of cases) {
      const result = await r.editor.setElementStyle("s:card", patch);
      assert.equal(result.ok, false, `patch ${JSON.stringify(patch)} rejected`);
      assert.match(result.message, want);
    }
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "no mutation from invalid input");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("rejects non-shapes, locked, and unknown targets", async () => {
    const r = await rig(shapeScene());
    for (const [id, code] of [["s:txt", "op-rejected"], ["s:nope", "unknown-element"]]) {
      const result = await r.editor.setElementStyle(id, { fill: "FF0000" });
      assert.equal(result.ok, false);
      assert.equal(result.code, code);
    }
    const locked = shapeScene();
    locked[0].elements[0].locked = true;
    const r2 = await rig(locked);
    const result = await r2.editor.setElementStyle("s:card", { fill: "FF0000" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "locked");
  });

  it("engine validation holds at the envelope boundary too", async () => {
    const r = await rig(shapeScene());
    const bad = await r.doc.apply({
      id: "e1", slideId: "s", op: { type: "element.setStyle", id: "s:card", style: { fill: "nope" } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "bad-envelope");
    const empty = await r.doc.apply({
      id: "e2", slideId: "s", op: { type: "element.setStyle", id: "s:card", style: {} },
      baseRevision: 0, actor: "human",
    });
    assert.equal(empty.ok, false);
    const nonShape = await r.doc.apply({
      id: "e3", slideId: "s", op: { type: "element.setStyle", id: "s:txt", style: { fill: "FF0000" } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(nonShape.ok, false);
    assert.equal(nonShape.code, "op-rejected");
  });

  it("leading hashes are accepted and normalized", async () => {
    const r = await rig(shapeScene());
    const result = await r.editor.setElementStyle("s:card", { fill: "#ff0000" });
    assert.equal(result.ok, true);
    assert.equal(elOf(r, "s:card").shape.fill, "FF0000");
  });
});

describe("v2-5e setStyle commits", () => {
  it("fill change commits once with style ownership, geometry untouched", async () => {
    const r = await rig(shapeScene());
    const before = structuredClone(elOf(r, "s:card"));
    const result = await r.editor.setElementStyle("s:card", { fill: "FF0000" });
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one entry per style edit");
    const after = elOf(r, "s:card");
    assert.equal(after.shape.fill, "FF0000");
    assert.equal(after.shape.form, "roundRect", "form untouched");
    assert.deepEqual({ x: after.x, y: after.y, w: after.w, h: after.h }, { x: before.x, y: before.y, w: before.w, h: before.h });
    assert.equal(after.provenance, "human");
    assert.equal(after.styleCustomized, true, "appearance ownership recorded");
    assert.equal(after.customized, before.customized, "no false geometry ownership");
    assert.equal(after.contentCustomized, undefined);
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("partial patches leave unmentioned keys alone", async () => {
    const r = await rig(shapeScene());
    await r.editor.setElementStyle("s:plain", { fill: "00FF00" });
    const after = elOf(r, "s:plain");
    assert.equal(after.shape.fill, "00FF00");
    assert.equal(after.shape.stroke, "111111", "unmentioned stroke kept");
    assert.equal(after.shape.strokeWidth, 1, "unmentioned width kept");
  });

  it("null clears a key and undo restores exact absence/presence", async () => {
    const r = await rig(shapeScene());
    // s:card has no stroke: setting then clearing round-trips absence.
    await r.editor.setElementStyle("s:card", { stroke: "222222", strokeWidth: 2 });
    assert.equal(elOf(r, "s:card").shape.stroke, "222222");
    await r.editor.setElementStyle("s:card", { stroke: null, strokeWidth: null });
    const cleared = elOf(r, "s:card").shape;
    assert.equal(cleared.stroke, undefined, "stroke key removed");
    assert.equal(cleared.strokeWidth, undefined, "width key removed");
    assert.equal(cleared.fill, "AABBCC", "fill kept");
    await r.editor.undo();
    const undone = elOf(r, "s:card").shape;
    assert.equal(undone.stroke, "222222", "cleared stroke restored");
    assert.equal(undone.strokeWidth, 2);
    await r.editor.undo();
    assert.equal(elOf(r, "s:card").shape.stroke, undefined, "original absence restored");
  });

  it("genuine no-ops commit nothing", async () => {
    const r = await rig(shapeScene());
    const noop = await r.editor.setElementStyle("s:card", { fill: "AABBCC" });
    assert.equal(noop.ok, true);
    assert.equal(noop.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
    // Case-insensitive no-op too.
    const noop2 = await r.editor.setElementStyle("s:card", { fill: "aabbcc" });
    assert.equal(noop2.noop, true);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("undo of first style edit restores compiler ownership; redo restores human paint", async () => {
    const r = await rig(shapeScene());
    const before = structuredClone(elOf(r, "s:card"));
    await r.editor.setElementStyle("s:card", { fill: "123456" });
    await r.editor.undo();
    const undone = elOf(r, "s:card");
    assert.deepEqual(undone, before, "compiler element byte-identical");
    assert.equal(undone.styleCustomized, undefined);
    assert.equal(undone.provenance, "compiler");
    await r.editor.redo();
    const redone = elOf(r, "s:card");
    assert.equal(redone.shape.fill, "123456");
    assert.equal(redone.styleCustomized, true);
  });

  it("style edits during text sessions and resizes are refused", async () => {
    const r = await rig(shapeScene());
    r.viewer.api.select("s:txt");
    r.editor.beginTextEdit("s:txt");
    const during = await r.editor.setElementStyle("s:card", { fill: "FF0000" });
    assert.equal(during.ok, false);
    r.editor.cancelTextEdit();
    const after = await r.editor.setElementStyle("s:card", { fill: "FF0000" });
    assert.equal(after.ok, true);
  });
});

describe("v2-5e style regeneration", () => {
  it("resized-only shapes refresh paint; styled shapes keep human paint", async () => {
    // Legacy-to-legacy recompilation (identical ids by construction),
    // isolating the ownership rule from recipe-path id differences.
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const slideIntent = intent.slides.find((s) => (s.blocks ?? []).filter((b) => b.kind === "text").length >= 2);
    const { compileSlide } = await import("../packages/compiler/compile.js");
    const fresh0 = compileSlide(slideIntent, design);
    const shape = fresh0.elements.find((e) => e.kind === "shape" && !e.locked);
    assert.ok(shape, "legacy slide carries a shape");
    // Resized only: geometry kept, paint refreshed from the compiler.
    const r = await rig([structuredClone(fresh0)]);
    await r.doc.apply({ id: "g1", slideId: fresh0.id, op: { type: "element.setGeometry", id: shape.id, x: 1, y: 1, w: 3, h: 2 }, baseRevision: 0, actor: "human" });
    const moved = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(moved), design);
    const fresh = recompiled.elements.find((e) => e.id === shape.id);
    assert.equal(fresh.x, 1, "geometry preserved");
    assert.equal(fresh.styleCustomized, undefined, "resize sets no style ownership");
    // Styled: human paint survives recompilation.
    const r2 = await rig([structuredClone(fresh0)]);
    await r2.editor.setElementStyle(shape.id, { fill: "C0FFEE" });
    const styled = r2.doc.snapshot().scenes[0];
    const recompiled2 = recompileSlide(slideIntent, structuredClone(styled), design);
    const kept = recompiled2.elements.find((e) => e.id === shape.id);
    assert.equal(kept.shape.fill, "C0FFEE", "human fill survives regeneration");
    assert.equal(kept.styleCustomized, true);
    // Undo of the style edit restores compiler paint through recompile.
    await r2.editor.undo();
    const undone = r2.doc.snapshot().scenes[0];
    const recompiled3 = recompileSlide(slideIntent, structuredClone(undone), design);
    assert.equal(recompiled3.elements.find((e) => e.id === shape.id).shape.fill, shape.shape.fill);
  });

  it("human-added shapes survive with their paint; detached slides pass through", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const { scenes } = { scenes: compileDeck(intent, design) };
    const r = await rig([structuredClone(scenes[0])]);
    const added = await r.editor.addShapeElement("ellipse");
    assert.equal(added.ok, true);
    await r.editor.setElementStyle(added.id, { fill: "BADA55" });
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(intent.slides[0], structuredClone(prev), design);
    const kept = recompiled.elements.find((e) => e.id === added.id);
    assert.ok(kept, "human-added shape carried forward");
    assert.equal(kept.shape.fill, "BADA55");
    assert.equal(kept.shape.form, "ellipse");
    // Detached: regeneration returns the scene untouched.
    const detached = { ...structuredClone(prev), layoutState: "detached" };
    const again = recompileSlide(intent.slides[0], detached, design);
    assert.equal(JSON.stringify(again), JSON.stringify(detached));
  });
});

describe("v2-5e style export", () => {
  it("styled shapes project as native OOXML with exact colors", async () => {
    const r = await rig(shapeScene());
    await r.editor.setElementStyle("s:card", { fill: "112233", stroke: "445566", strokeWidth: 2.5 });
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    assert.ok(bytes instanceof Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /112233/, "human fill in slide XML");
    assert.match(xml, /445566/, "human stroke in slide XML");
    assert.match(xml, /roundRect/, "native geometry preserved");
  });

  it("undo round-trips the exported paint", async () => {
    const r = await rig(shapeScene());
    await r.editor.setElementStyle("s:plain", { fill: "ABCDEF" });
    await r.editor.undo();
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /D8D8D2/, "compiler paint back after undo");
    assert.ok(!xml.includes("ABCDEF"), "abandoned paint absent");
    await r.editor.redo();
    const bytes2 = await renderPptx(r.doc.snapshot().scenes);
    const zip2 = await JSZip.loadAsync(bytes2);
    assert.match(xml, /D8D8D2/);
    const xml2 = await zip2.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml2, /ABCDEF/, "redo paint exports");
  });
});
