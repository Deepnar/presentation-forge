// V2-5F: text formatting commands. Headless coverage for
// element.setTextStyle validation, whole-element and per-paragraph
// targeting, partial patches, null clearing, no-op policy, exact
// undo/redo, appearance/wording ownership combinations,
// regeneration, detached slides, and native PPTX projection.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

function textScene() {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      {
        id: "s:list", kind: "text", x: 1, y: 1, w: 6, h: 3, z: 0, provenance: "compiler", semanticRef: "body",
        paragraphs: [
          { runs: [{ text: "Alpha", role: "body", size: 13, color: "111111" }], align: "left", bullet: true },
          { runs: [{ text: "Beta", role: "body", size: 13, color: "111111" }], align: "left", bullet: true },
          { runs: [{ text: "Gamma", role: "body", size: 13, color: "111111" }], align: "left", bullet: true },
        ],
      },
      {
        id: "s:mixed", kind: "text", x: 1, y: 4.5, w: 6, h: 2, z: 1, provenance: "compiler", semanticRef: "mixed",
        paragraphs: [
          { runs: [{ text: "Head", role: "subhead", size: 20, color: "222222", bold: true }], align: "left" },
          { runs: [{ text: "Body words", role: "body", size: 13, color: "333333" }], align: "left" },
        ],
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

describe("v2-5f setTextStyle validation", () => {
  it("rejects malformed patches before any mutation", async () => {
    const r = await rig(textScene());
    const before = JSON.stringify(r.doc.snapshot().scenes);
    const cases = [
      [null, /needs a style patch/],
      ["red", /needs a style patch/],
      [{}, /at least one/],
      [{ color: "xyz" }, /hex/],
      [{ color: "#12345" }, /hex/],
      [{ size: 0 }, /6 to 144/],
      [{ size: -4 }, /6 to 144/],
      [{ size: NaN }, /6 to 144/],
      [{ size: 200 }, /6 to 144/],
      [{ bold: "yes" }, /boolean/],
      [{ italic: 1 }, /boolean/],
    ];
    for (const [patch, want] of cases) {
      const result = await r.editor.setTextStyle("s:list", null, patch);
      assert.equal(result.ok, false, `patch ${JSON.stringify(patch)} rejected`);
      assert.match(result.message, want);
    }
    assert.equal((await r.editor.setTextStyle("s:list", 9, { color: "FF0000" })).ok, false, "paragraph index range checked");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "no mutation from invalid input");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("rejects non-text, locked, unknown, and multi-run targets", async () => {
    const scenes = textScene();
    scenes[0].elements.push({
      id: "s:box", kind: "shape", x: 8, y: 1, w: 2, h: 2, z: 2, provenance: "compiler",
      shape: { form: "rect", fill: "AABBCC" },
    });
    const r = await rig(scenes);
    assert.equal((await r.editor.setTextStyle("s:box", null, { color: "FF0000" })).code, "op-rejected");
    assert.equal((await r.editor.setTextStyle("s:nope", null, { color: "FF0000" })).code, "unknown-element");
    const locked = textScene();
    locked[0].elements[0].locked = true;
    const r2 = await rig(locked);
    assert.equal((await r2.editor.setTextStyle("s:list", null, { color: "FF0000" })).code, "locked");
    // Multi-run paragraphs refuse formatting (whole runs only).
    const rich = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:rich", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 0, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "a", size: 13 }, { text: "b", size: 13, bold: true }], align: "left" }],
      }],
    }];
    const r3 = await rig(rich);
    const refused = await r3.editor.setTextStyle("s:rich", null, { color: "FF0000" });
    assert.equal(refused.ok, false);
    assert.match(refused.message, /not a single run/);
  });

  it("engine validation holds at the envelope boundary", async () => {
    const r = await rig(textScene());
    const bad = await r.doc.apply({
      id: "e1", slideId: "s", op: { type: "element.setTextStyle", id: "s:list", style: { color: "nope" } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "bad-envelope");
    const empty = await r.doc.apply({
      id: "e2", slideId: "s", op: { type: "element.setTextStyle", id: "s:list", style: {} },
      baseRevision: 0, actor: "human",
    });
    assert.equal(empty.ok, false);
    const range = await r.doc.apply({
      id: "e3", slideId: "s", op: { type: "element.setTextStyle", id: "s:list", paragraphIndex: -1, style: { color: "FF0000" } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(range.ok, false);
    assert.equal(range.code, "bad-envelope");
  });

  it("leading hashes normalize to upper hex", async () => {
    const r = await rig(textScene());
    const result = await r.editor.setTextStyle("s:list", 0, { color: "#ff0000" });
    assert.equal(result.ok, true);
    assert.equal(elOf(r, "s:list").paragraphs[0].runs[0].color, "FF0000");
  });
});

describe("v2-5f setTextStyle commits", () => {
  it("whole-element recolor keeps bullets, alignment, and other keys", async () => {
    const r = await rig(textScene());
    const result = await r.editor.setTextStyle("s:list", null, { color: "C00000" });
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one entry per format edit");
    const after = elOf(r, "s:list");
    assert.ok(after.paragraphs.every((p) => p.runs[0].color === "C00000"), "all three paragraphs recolored");
    assert.ok(after.paragraphs.every((p) => p.bullet === true && p.align === "left"), "bullets and alignment kept");
    assert.ok(after.paragraphs.every((p) => p.runs[0].size === 13), "sizes kept");
    assert.equal(after.provenance, "human");
    assert.equal(after.formatCustomized, true, "appearance ownership recorded");
    assert.equal(after.contentCustomized, undefined, "no false wording ownership");
    assert.equal(after.customized, undefined, "no false geometry ownership");
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("per-paragraph targeting leaves siblings alone", async () => {
    const r = await rig(textScene());
    const result = await r.editor.setTextStyle("s:mixed", 1, { color: "00AA00", size: 15, italic: true });
    assert.equal(result.ok, true);
    const after = elOf(r, "s:mixed");
    const [head, body] = after.paragraphs;
    assert.equal(head.runs[0].color, "222222", "untargeted paragraph untouched");
    assert.equal(head.runs[0].size, 20);
    assert.equal(body.runs[0].color, "00AA00");
    assert.equal(body.runs[0].size, 15);
    assert.equal(body.runs[0].italic, true);
    assert.equal(body.runs[0].bold, undefined, "unmentioned keys ride along");
  });

  it("null clears back to absence; explicit false differs from absence", async () => {
    const r = await rig(textScene());
    // s:mixed head is bold:true; clear it to absence.
    await r.editor.setTextStyle("s:mixed", 0, { bold: null });
    assert.equal(elOf(r, "s:mixed").paragraphs[0].runs[0].bold, undefined, "bold key removed");
    await r.editor.undo();
    assert.equal(elOf(r, "s:mixed").paragraphs[0].runs[0].bold, true, "prior presence restored");
    // A weight-heavy run with absent bold derives true; explicit
    // false overrides the derivation instead of vanishing into it.
    const heavy = textScene();
    heavy[0].elements[0].paragraphs[0].runs[0].weight = 700;
    delete heavy[0].elements[0].paragraphs[0].runs[0].bold;
    const r2 = await rig(heavy);
    await r2.editor.setTextStyle("s:list", 0, { bold: false });
    assert.equal(elOf(r2, "s:list").paragraphs[0].runs[0].bold, false);
  });

  it("genuine no-ops commit nothing", async () => {
    const r = await rig(textScene());
    const noop = await r.editor.setTextStyle("s:list", null, { color: "111111" });
    assert.equal(noop.ok, true);
    assert.equal(noop.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
    const noop2 = await r.editor.setTextStyle("s:mixed", 0, { bold: true });
    assert.equal(noop2.noop, true, "matching explicit flag is a no-op");
  });

  it("undo restores compiler ownership; redo restores human paint", async () => {
    const r = await rig(textScene());
    const before = structuredClone(elOf(r, "s:list"));
    await r.editor.setTextStyle("s:list", 1, { color: "123456" });
    await r.editor.undo();
    const undone = elOf(r, "s:list");
    assert.deepEqual(undone, before, "compiler element byte-identical");
    assert.equal(undone.formatCustomized, undefined);
    assert.equal(undone.provenance, "compiler");
    await r.editor.redo();
    const redone = elOf(r, "s:list");
    assert.equal(redone.paragraphs[1].runs[0].color, "123456");
    assert.equal(redone.formatCustomized, true);
  });

  it("format edits during text sessions and resizes are refused", async () => {
    const r = await rig(textScene());
    r.viewer.api.select("s:list");
    r.editor.beginTextEdit("s:list");
    assert.equal((await r.editor.setTextStyle("s:list", null, { color: "FF0000" })).ok, false);
    r.editor.cancelTextEdit();
    assert.equal((await r.editor.setTextStyle("s:list", null, { color: "FF0000" })).ok, true);
  });
});

describe("v2-5f appearance and wording ownership", () => {
  async function legacyRig() {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const slideIntent = intent.slides[1];
    const legacy = [compileSlide(slideIntent, design)];
    const els = legacy[0].elements.filter((e) => e.kind === "text" && !e.locked);
    const id = (els.find((e) => (e.paragraphs ?? []).length > 1) ?? els[0])?.id;
    const r = await rig(structuredClone(legacy));
    return { design, slideIntent, slideId: legacy[0].id, id, r };
  }

  it("moved then recolored: geometry and paint kept, wording refreshed", async () => {
    const { design, slideIntent, slideId, id, r } = await legacyRig();
    await r.doc.apply({ id: "mv", slideId, op: { type: "element.move", id, x: 3, y: 3 }, baseRevision: 0, actor: "human" });
    await r.editor.setTextStyle(id, null, { color: "C0FFEE" });
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(prev), design);
    const el = recompiled.elements.find((e) => e.id === id);
    assert.equal(el.x, 3, "human geometry kept");
    assert.equal(el.paragraphs[0].runs[0].color, "C0FFEE", "human paint kept");
    assert.equal(el.formatCustomized, true);
  });

  it("rewritten then recolored: both human wording and paint kept", async () => {
    const { design, slideIntent, id, r } = await legacyRig();
    r.viewer.api.select(id);
    r.editor.beginTextEdit(id);
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    box.value = "human words here";
    box.dispatchEvent(new r.root.ownerDocument.defaultView.Event("input", { bubbles: true }));
    await r.editor.commitTextEdit();
    await r.editor.setTextStyle(id, null, { color: "BADA55" });
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(prev), design);
    const el = recompiled.elements.find((e) => e.id === id);
    assert.equal(el.paragraphs[0].runs[0].text, "human words here");
    assert.equal(el.paragraphs[0].runs[0].color, "BADA55");
    assert.equal(el.contentCustomized, true);
    assert.equal(el.formatCustomized, true);
  });

  it("recolored without wording changes: paint kept, wording refreshed", async () => {
    const { design, slideIntent, id, r } = await legacyRig();
    await r.editor.setTextStyle(id, null, { color: "F00F00" });
    const prev = r.doc.snapshot().scenes[0];
    // Simulate a new compiler wording: rewrite the list items in the
    // intent so the fresh compile carries different words.
    const changed = structuredClone(slideIntent);
    const list = changed.blocks.find((b) => b.kind === "list");
    assert.ok(list, "content slide carries a list block");
    list.items = list.items.map((t) => `${t} (v2)`);
    const recompiled = recompileSlide(changed, structuredClone(prev), design);
    const el = recompiled.elements.find((e) => e.id === id);
    assert.equal(el.paragraphs[0].runs[0].color, "F00F00", "human paint survives compiler reflow");
    assert.equal(el.contentCustomized, undefined, "wording still compiler-owned");
    assert.ok(el.paragraphs.every((p) => p.runs[0].text.endsWith("(v2)")), "fresh compiler wording flows through");
  });

  it("resized then formatted: geometry, paint, and wording compose", async () => {
    const { design, slideIntent, slideId, id, r } = await legacyRig();
    const origin = { ...elOfRaw(r, id) };
    await r.doc.apply({ id: "g", slideId, op: { type: "element.setGeometry", id, x: origin.x, y: origin.y, w: origin.w + 1, h: origin.h }, baseRevision: 0, actor: "human" });
    await r.editor.setTextStyle(id, null, { size: 20 });
    const prev = r.doc.snapshot().scenes[0];
    assert.equal(elOfRaw(r, id).customized, true);
    assert.equal(elOfRaw(r, id).formatCustomized, true);
    assert.equal(elOfRaw(r, id).contentCustomized, undefined);
    const recompiled = recompileSlide(slideIntent, structuredClone(prev), design);
    const el = recompiled.elements.find((e) => e.id === id);
    assert.equal(el.w, origin.w + 1);
    assert.equal(el.paragraphs[0].runs[0].size, 20);
  });

  it("undo of format restores compiler paint through regeneration", async () => {
    const { design, slideIntent, id, r } = await legacyRig();
    const compilerColor = elOfRaw(r, id).paragraphs[0].runs[0].color;
    await r.editor.setTextStyle(id, null, { color: "ABCDEF" });
    await r.editor.undo();
    const recompiled = recompileSlide(slideIntent, structuredClone(r.doc.snapshot().scenes[0]), design);
    assert.equal(recompiled.elements.find((e) => e.id === id).paragraphs[0].runs[0].color, compilerColor);
  });

  it("detached slides pass through untouched", async () => {
    const { slideIntent, r } = await legacyRig();
    const design = await warmDesign();
    await r.editor.setTextStyle((await idOf(r)), null, { color: "ABCDEF" });
    const prev = { ...structuredClone(r.doc.snapshot().scenes[0]), layoutState: "detached" };
    const again = recompileSlide(slideIntent, prev, design);
    assert.equal(JSON.stringify(again), JSON.stringify(prev));
  });

  function elOfRaw(r, id) {
    return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
  }

  async function idOf(r) {
    return r.doc.snapshot().scenes[0].elements.find((e) => e.kind === "text" && !e.locked).id;
  }
});

describe("v2-5f text format export", () => {
  it("multi-paragraph styling exports as native editable OOXML", async () => {
    const r = await rig(textScene());
    await r.editor.setTextStyle("s:list", 0, { color: "C00000", size: 16, bold: true });
    await r.editor.setTextStyle("s:mixed", 1, { italic: true });
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    assert.ok(bytes instanceof Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /Alpha/, "wording survives");
    assert.match(xml, /C00000/, "paragraph color native");
    assert.match(xml, /<a:br\/>|<a:p>/, "paragraph boundaries native");
    assert.match(xml, /2022/, "bullet metadata native");
    assert.ok(!xml.includes("autoFit"), "no autofit reliance");
  });

  it("undo round-trips exported formatting", async () => {
    const r = await rig(textScene());
    await r.editor.setTextStyle("s:list", 2, { color: "ABCDEF" });
    await r.editor.undo();
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /111111/, "compiler color back after undo");
    assert.ok(!xml.includes("ABCDEF"), "abandoned paint absent");
    await r.editor.redo();
    const bytes2 = await renderPptx(r.doc.snapshot().scenes);
    const zip2 = await JSZip.loadAsync(bytes2);
    assert.match(await zip2.files["ppt/slides/slide1.xml"].async("string"), /ABCDEF/);
  });
});
