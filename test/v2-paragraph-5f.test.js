// V2-5F: multi-paragraph text editing. Headless linkedom coverage
// for the uniform-paragraph contract (every paragraph exactly one
// run): entry, slot-attached styling, structural edits (append,
// insert, delete, join, split, empty, trailing), bullet/align
// preservation, multi-run refusal, lifecycle, conflicts, undo/redo,
// regeneration, and single-paragraph compatibility. Real-pointer
// proof lives in test/v2-edit-chrome-5f.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import {
  isSimpleText,
  isEditableText,
  describeStructure,
  paragraphsToDraft,
  buildUpdatedParagraphs,
} from "../packages/editor/scene-text.js";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

async function rig(scenes) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const textEvents = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: () => {},
    onTextEdit: (e) => textEvents.push(e),
  });
  return { document, root, viewer, doc, editor, errors, textEvents };
}

async function fixtureRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design);
  return { design, scenes, ...(await rig(scenes)) };
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

function click(root, node) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
}

function keyOn(root, target, k, extra = {}) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
  ev.key = k;
  Object.assign(ev, extra);
  target.dispatchEvent(ev);
}

function typeInto(r, id, text) {
  const box = r.root.querySelector(`[data-text-edit="${id}"]`);
  assert.ok(box, "editing overlay is mounted");
  box.value = text;
  box.dispatchEvent(new r.root.ownerDocument.defaultView.Event("input", { bubbles: true, cancelable: true }));
}

// First multi-paragraph single-run element on the current slide.
function multiId(r, slideIdx = 0) {
  r.viewer.api.goTo(slideIdx);
  const scene = r.doc.snapshot().scenes[slideIdx];
  return scene.elements.find((e) => e.kind === "text" && isEditableText(e.paragraphs) && e.paragraphs.length > 1)?.id ?? null;
}

function styleOf(p) {
  const { text: _t, ...style } = p.runs[0];
  return { style, align: p.align, bullet: p.bullet };
}

describe("v2-5f paragraph contract helpers", () => {
  it("classifies editable vs refused structures", () => {
    assert.equal(isEditableText([{ runs: [{ text: "a" }] }]), true);
    assert.equal(isEditableText([{ runs: [{ text: "a" }] }, { runs: [{ text: "b" }] }]), true);
    assert.equal(isEditableText([{ runs: [{ text: "a" }, { text: "b" }] }]), false);
    assert.equal(isEditableText([{ runs: [] }]), false);
    assert.equal(isEditableText([]), false);
    assert.equal(isEditableText(undefined), false);
    assert.equal(isSimpleText([{ runs: [{ text: "a" }] }, { runs: [{ text: "b" }] }]), false);
    const d = describeStructure([{ runs: [{ text: "a" }] }, { runs: [{ text: "b" }] }]);
    assert.deepEqual(d, { simple: false, editable: true, paragraphs: 2, runs: 2, multiRun: false });
    const m = describeStructure([{ runs: [{ text: "a" }, { text: "b" }] }]);
    assert.equal(m.editable, false);
    assert.equal(m.multiRun, true);
  });

  it("maps draft lines to template slots deterministically", () => {
    const template = [
      { runs: [{ text: "H", size: 30, color: "111111" }], align: "left" },
      { runs: [{ text: "B", size: 13, color: "222222" }], align: "left", bullet: true },
    ];
    // Same count: wording-only, styles stay per index.
    const same = buildUpdatedParagraphs(template, "H2\nB2");
    assert.equal(same[0].runs[0].text, "H2");
    assert.equal(same[0].runs[0].size, 30);
    assert.equal(same[1].runs[0].text, "B2");
    assert.equal(same[1].runs[0].size, 13);
    assert.equal(same[1].bullet, true);
    assert.equal(same[0].bullet, undefined);
    // Append: extra line clones the last slot.
    const appended = buildUpdatedParagraphs(template, "H\nB\nB3");
    assert.equal(appended.length, 3);
    assert.equal(appended[2].runs[0].size, 13);
    assert.equal(appended[2].bullet, true);
    // Middle insert: lines keep slots by index.
    const inserted = buildUpdatedParagraphs(template, "H\nNEW\nB");
    assert.equal(inserted[1].runs[0].text, "NEW");
    assert.equal(inserted[1].runs[0].size, 13, "new line takes the pushed-down slot's style");
    // Delete: remaining lines keep their slots.
    const deleted = buildUpdatedParagraphs(template, "H");
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].runs[0].size, 30);
    // Empty and trailing lines round-trip.
    const trailing = buildUpdatedParagraphs(template, "H\n");
    assert.equal(trailing.length, 2);
    assert.equal(trailing[1].runs[0].text, "");
    assert.equal(trailing[1].runs[0].size, 13);
    assert.equal(paragraphsToDraft(trailing), "H\n");
    // Single-paragraph templates behave exactly as V2-5D.
    const single = buildUpdatedParagraphs([{ runs: [{ text: "a", size: 9 }], align: "center" }], "x\ny");
    assert.equal(single[1].runs[0].size, 9);
    assert.equal(single[1].align, "center");
    assert.equal(JSON.stringify(template[0].runs[0].text), '"H"', "template untouched");
  });
});

describe("v2-5f multi-paragraph editing", () => {
  it("opens multi-paragraph bodies with a per-line draft", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    assert.ok(id, "content slide carries a multi-paragraph list");
    click(r.root, nodeFor(r.root, id));
    const opened = r.editor.beginTextEdit(id);
    assert.equal(opened.ok, true);
    assert.equal(opened.paragraphs, 4, "four bullet drafts lines reported");
    assert.equal(r.editor.editingId(), id);
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    assert.ok(box.value.includes("\n"), "draft joins paragraphs with newlines");
    assert.ok(r.textEvents.some((e) => e.paragraphs === 4), "viewer notified of paragraph count");
  });

  it("wording-only edits keep every paragraph's style, align, and bullets", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 2);
    assert.ok(id, "comparison slide carries a two-style body");
    const before = r.doc.snapshot().scenes[2].elements.find((e) => e.id === id).paragraphs.map(styleOf);
    assert.equal(before.length, 2);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const draft = paragraphsToDraft(r.doc.snapshot().scenes[2].elements.find((e) => e.id === id).paragraphs);
    typeInto(r, id, draft.split("\n").map((ln) => `${ln} (edited)`).join("\n"));
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one entry per session");
    const after = r.doc.snapshot().scenes[2].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 2);
    after.forEach((p, i) => assert.deepEqual(styleOf(p), before[i], `paragraph ${i} style/align/bullet intact`));
    assert.ok(after.every((p) => p.runs[0].text.endsWith("(edited)")), "wording updated everywhere");
    const el = r.doc.snapshot().scenes[2].elements.find((e) => e.id === id);
    assert.equal(el.contentCustomized, true);
    const verdict = await validateScene(r.doc.snapshot().scenes[2]);
    assert.equal(verdict.ok, true);
  });

  it("appended bullets clone the last slot's style", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const draft = paragraphsToDraft(r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs);
    typeInto(r, id, `${draft}\nFifth point`);
    await r.editor.commitTextEdit();
    const after = r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 5);
    assert.equal(after[4].runs[0].text, "Fifth point");
    assert.deepEqual(styleOf(after[4]), styleOf(after[3]), "new bullet matches its siblings");
  });

  it("deleted and joined lines behave positionally", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    const paras = r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs;
    // Delete the second bullet: survivors keep slots 0, 2, 3.
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const lines = paragraphsToDraft(paras).split("\n");
    typeInto(r, id, [lines[0], lines[2], lines[3]].join("\n"));
    await r.editor.commitTextEdit();
    let after = r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 3);
    assert.deepEqual(styleOf(after[1]), styleOf(paras[2]));
    // Join two bullets: words merge into the first slot.
    r.editor.beginTextEdit(id);
    const cur = paragraphsToDraft(after).split("\n");
    typeInto(r, id, [`${cur[0]} ${cur[1]}`, cur[2]].join("\n"));
    await r.editor.commitTextEdit();
    after = r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 2);
    assert.ok(after[0].runs[0].text.includes(cur[0]) && after[0].runs[0].text.includes(cur[1]));
  });

  it("empty lines and trailing newlines are schema-valid", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "first\n\nthird\n");
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true);
    const after = r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 4, "first, empty, third, trailing empty");
    assert.equal(after[1].runs[0].text, "");
    assert.equal(after[3].runs[0].text, "");
    const verdict = await validateScene(r.doc.snapshot().scenes[1]);
    assert.equal(verdict.ok, true);
  });

  it("multi-run paragraphs stay refused with zero mutation", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:rich", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 0, provenance: "compiler", semanticRef: "body",
        paragraphs: [{ runs: [{ text: "plain ", size: 13, color: "111111" }, { text: "bold", size: 13, color: "111111", bold: true }], align: "left" }],
      }],
    }];
    const r = await rig(scenes);
    r.viewer.api.select("s:rich");
    const before = JSON.stringify(r.doc.snapshot().scenes[0]);
    const opened = r.editor.beginTextEdit("s:rich");
    assert.equal(opened.ok, false);
    assert.match(opened.message, /rich runs are read-only/);
    assert.equal(r.editor.editingId(), null);
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), before, "no silent flattening");
    assert.equal(r.doc.status().historyLength, 0);
    // Formatting a multi-run paragraph is refused too.
    const styled = await r.editor.setTextStyle("s:rich", 0, { color: "FF0000" });
    assert.equal(styled.ok, false);
    assert.match(styled.message, /not a single run/);
  });

  it("empty paragraph lists stay refused", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:empty", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 0, provenance: "compiler",
        paragraphs: [],
      }],
    }];
    const r = await rig(scenes);
    r.viewer.api.select("s:empty");
    const opened = r.editor.beginTextEdit("s:empty");
    assert.equal(opened.ok, false);
  });

  it("unchanged multi drafts are no-ops; cancel restores nothing", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    const before = JSON.stringify(r.doc.snapshot().scenes[1]);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const draft = paragraphsToDraft(r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs);
    typeInto(r, id, draft);
    const noop = await r.editor.commitTextEdit();
    assert.equal(noop.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    r.editor.beginTextEdit(id);
    typeInto(r, id, "abandoned\nlines");
    r.editor.cancelTextEdit();
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[1]), before);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("conflicts, deletion, and force behave on multi sessions", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    const slideId = r.viewer.api.snapshot().slideId;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "draft\nlines");
    const other = r.viewer.api.selectableIds().find((x) => x !== id);
    await r.doc.apply({ id: "ext", slideId, op: { type: "element.move", id: other, x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const conflict = await r.editor.commitTextEdit();
    assert.equal(conflict.code, "stale-revision");
    assert.equal(r.editor.pendingDraft(), "draft\nlines");
    const forced = await r.editor.commitTextEdit({ force: true });
    assert.equal(forced.ok, true);
    assert.equal(r.doc.snapshot().scenes[1].elements.find((e) => e.id === id).paragraphs.length, 2);
  });

  it("undo and redo restore exact multi structure and ownership", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 2);
    const before = structuredClone(r.doc.snapshot().scenes[2].elements.find((e) => e.id === id));
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "label edit\nbody edit\nappended");
    await r.editor.commitTextEdit();
    assert.equal(r.doc.snapshot().scenes[2].elements.find((e) => e.id === id).paragraphs.length, 3);
    await r.editor.undo();
    const undone = r.doc.snapshot().scenes[2].elements.find((e) => e.id === id);
    assert.deepEqual(undone, before, "structure, styles, and flags byte-identical");
    await r.editor.redo();
    const redone = r.doc.snapshot().scenes[2].elements.find((e) => e.id === id);
    assert.equal(redone.paragraphs.length, 3);
    assert.equal(redone.contentCustomized, true);
  });

  it("keyboard stays isolated during multi sessions", async () => {
    const r = await fixtureRig();
    const id = multiId(r, 1);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    const slideBefore = r.viewer.api.snapshot().slideIndex;
    keyOn(r.root, box, "ArrowDown");
    keyOn(r.root, box, "Delete");
    await r.editor.pending();
    assert.equal(r.viewer.api.snapshot().slideIndex, slideBefore);
    assert.equal(r.doc.status().historyLength, 0);
    r.editor.cancelTextEdit();
  });

  it("overflow recalculates for longer multi text", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 3, h: 0.8, z: 0, provenance: "compiler", semanticRef: "body", fitPolicy: "wrap",
        paragraphs: [
          { runs: [{ text: "one", role: "body", size: 18, color: "111111" }], align: "left", bullet: true },
          { runs: [{ text: "two", role: "body", size: 18, color: "111111" }], align: "left", bullet: true },
        ],
      }],
    }];
    const r = await rig(scenes);
    r.viewer.api.select("s:t");
    r.editor.beginTextEdit("s:t");
    typeInto(r, "s:t", `one\ntwo\n${"word ".repeat(40)}`);
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true, "overflow still commits whole");
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:t");
    assert.equal(el.h, 0.8, "geometry unchanged");
    assert.equal(el.paragraphs.length, 3, "paragraphs intact, never flattened");
    assert.ok(r.errors.some((e) => /overflow/.test(e.message)), "warning surfaced");
  });

  it("edited multi text survives regeneration; moved-only refreshes", async () => {
    // Legacy-to-legacy recompilation (identical ids by construction),
    // isolating the ownership rule from recipe-path id differences.
    const { design } = await fixtureRig();
    const intent = sampleDeckIntent();
    const slideIntent = intent.slides[1];
    const { compileSlide } = await import("../packages/compiler/compile.js");
    const legacy = [compileSlide(slideIntent, design)];
    const id = legacy[0].elements.find((e) => e.kind === "text" && isEditableText(e.paragraphs) && e.paragraphs.length > 1)?.id;
    assert.ok(id, "legacy slide carries multi-paragraph text");
    const r = await rig(structuredClone(legacy));
    r.viewer.api.select(id);
    r.editor.beginTextEdit(id);
    const draft = paragraphsToDraft(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs);
    typeInto(r, id, `${draft}\nhuman bullet`);
    await r.editor.commitTextEdit();
    const edited = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(edited), design);
    const kept = recompiled.elements.find((e) => e.id === id);
    assert.ok(kept.paragraphs.some((p) => p.runs[0].text === "human bullet"), "human wording survives");
    const r2 = await rig(structuredClone(legacy));
    await r2.doc.apply({ id: "mv", slideId: legacy[0].id, op: { type: "element.move", id, x: 3, y: 3 }, baseRevision: 0, actor: "human" });
    const recompiled2 = recompileSlide(slideIntent, structuredClone(r2.doc.snapshot().scenes[0]), design);
    assert.equal(recompiled2.elements.find((e) => e.id === id).contentCustomized, undefined);
  });
});
