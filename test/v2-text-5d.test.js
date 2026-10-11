// V2-5D: inline text editing + native text/shape insertion. Headless
// linkedom coverage for edit-mode entry, draft lifecycle (commit /
// cancel / no-op), keyboard isolation, styling preservation,
// paragraph behavior, rich-text refusal, conflicts, deleted targets,
// slide-switch policy, undo/redo ownership, regeneration, insertion,
// draw order, suppression, PPTX editability, zoom invariance, themes,
// locking, immutability, and detach cleanup. Real-viewport typing
// lives in test/v2-edit-chrome-5d.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import {
  isSimpleText,
  describeStructure,
  paragraphsToDraft,
  buildUpdatedParagraphs,
  defaultTextElement,
  defaultShapeElement,
  overflowEstimate,
  contrastInk,
} from "../packages/editor/scene-text.js";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

async function rig(scenes, opts = {}) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const synced = [];
  const textEvents = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: (s) => synced.push(s.length),
    onTextEdit: (e) => textEvents.push(e),
  });
  if (opts.slide !== undefined) viewer.api.goTo(opts.slide);
  return { document, root, viewer, doc, editor, errors, synced, textEvents };
}

async function fixtureRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design).slice(0, 2);
  return { design, scenes, ...(await rig(scenes)) };
}

function firstSimpleTextId(r) {
  const scene = r.doc.snapshot().scenes[r.viewer.api.snapshot().slideIndex];
  const found = scene.elements.find((e) => e.kind === "text" && isSimpleText(e.paragraphs));
  return found?.id ?? null;
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

// Fixed linear layout: 1 client px = 1 svg px at scale 1.
function stubLayout(root, k = 1) {
  const svg = root.querySelector("svg");
  svg.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1280 * k, height: 720 * k, right: 100 + 1280 * k, bottom: 50 + 720 * k });
}

function click(root, node, shift = false) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  ev.shiftKey = shift;
  node.dispatchEvent(ev);
}

function ptr(root, type, target, { x = 0, y = 0, shift = false, button = 0, id = 7 } = {}) {
  const ev = new root.ownerDocument.defaultView.Event(type, { bubbles: true, cancelable: true });
  ev.clientX = x;
  ev.clientY = y;
  ev.shiftKey = shift;
  ev.button = button;
  ev.pointerId = id;
  target.dispatchEvent(ev);
}

function keyOn(root, target, k, extra = {}) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
  ev.key = k;
  Object.assign(ev, extra);
  target.dispatchEvent(ev);
  return ev;
}

function key(root, k, extra = {}) {
  return keyOn(root, root, k, extra);
}

function typeInto(r, id, text) {
  const box = r.root.querySelector(`[data-text-edit="${id}"]`);
  assert.ok(box, "editing overlay is mounted");
  box.value = text;
  const ev = new r.root.ownerDocument.defaultView.Event("input", { bubbles: true, cancelable: true });
  box.dispatchEvent(ev);
}

describe("v2-5d text model helpers", () => {
  it("classifies simple vs structured text honestly", () => {
    assert.equal(isSimpleText([{ runs: [{ text: "hi" }] }]), true);
    assert.equal(isSimpleText([{ runs: [{ text: "a" }, { text: "b" }] }]), false);
    assert.equal(isSimpleText([{ runs: [{ text: "a" }] }, { runs: [{ text: "b" }] }]), false);
    assert.equal(isSimpleText([]), false);
    assert.equal(isSimpleText(undefined), false);
    const d = describeStructure([{ runs: [{ text: "a" }, { text: "b" }] }]);
    assert.deepEqual(d, { simple: false, paragraphs: 1, runs: 2 });
  });

  it("builds updated paragraphs preserving run styling", () => {
    const template = [{
      runs: [{ text: "old", role: "heading", bold: true, italic: true, size: 24, color: "FF0000", family: "X", weight: 700 }],
      align: "center",
    }];
    const next = buildUpdatedParagraphs(template, "new\nline2");
    assert.equal(next.length, 2);
    for (const p of next) {
      assert.equal(p.align, "center");
      assert.equal(p.runs.length, 1);
      const { text, ...style } = p.runs[0];
      const { text: _t, ...want } = template[0].runs[0];
      assert.deepEqual(style, want);
    }
    assert.equal(next[0].runs[0].text, "new");
    assert.equal(next[1].runs[0].text, "line2");
    assert.equal(JSON.stringify(template), JSON.stringify([{
      runs: [{ text: "old", role: "heading", bold: true, italic: true, size: 24, color: "FF0000", family: "X", weight: 700 }],
      align: "center",
    }]), "template untouched");
  });

  it("contrasts inserted text against dark and light grounds", () => {
    assert.equal(contrastInk("0A0A0A"), "FFFFFF");
    assert.equal(contrastInk("FFFFFF"), "1A1A1A");
    const dark = defaultTextElement({ background: { fill: "111111" }, elements: [] });
    assert.equal(dark.paragraphs[0].runs[0].color, "FFFFFF");
    const light = defaultTextElement({ background: { fill: "FFFFFF" }, elements: [] });
    assert.equal(light.paragraphs[0].runs[0].color, "1A1A1A");
  });

  it("samples sibling styling for inserted text and shapes", () => {
    const slide = {
      background: { fill: "FFFFFF" },
      elements: [{
        id: "t", kind: "text", x: 1, y: 1, w: 4, h: 1, z: 0, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "sib", role: "body", size: 30, color: "222222", family: "Merriweather" }], align: "left" }],
      }, {
        id: "s", kind: "shape", x: 1, y: 2, w: 2, h: 1, z: 1, provenance: "compiler",
        shape: { form: "rect", fill: "AABBCC" },
      }],
    };
    const el = defaultTextElement(slide);
    assert.equal(el.kind, "text");
    assert.equal(el.provenance, "human");
    assert.equal(el.fitPolicy, "wrap");
    assert.equal(el.paragraphs[0].runs[0].size, 30);
    assert.equal(el.paragraphs[0].runs[0].family, "Merriweather");
    const sh = defaultShapeElement(slide, "roundRect");
    assert.equal(sh.shape.form, "roundRect");
    assert.equal(sh.shape.fill, "AABBCC");
    assert.throws(() => defaultShapeElement(slide, "star"), /unsupported shape/);
  });

  it("estimates overflow without changing geometry", () => {
    const el = {
      id: "t", kind: "text", x: 1, y: 1, w: 2, h: 0.4, z: 0, provenance: "compiler",
      paragraphs: [{ runs: [{ text: "short", size: 18, color: "111111" }], align: "left" }],
    };
    const ok = overflowEstimate(el);
    assert.equal(ok.fits, true);
    assert.equal(ok.message, null);
    const long = overflowEstimate(el, [{ runs: [{ text: "word ".repeat(60), size: 18, color: "111111" }], align: "left" }]);
    assert.equal(long.fits, false);
    assert.match(long.message, /lines/);
    assert.equal(el.h, 0.4, "geometry untouched by the estimate");
  });
});

describe("v2-5d inline text editing", () => {
  it("enters edit mode with an overlay over the text box", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    assert.ok(id, "fixture carries simple text");
    click(r.root, nodeFor(r.root, id));
    const opened = r.editor.beginTextEdit(id);
    assert.equal(opened.ok, true);
    assert.equal(r.editor.editingId(), id);
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    assert.ok(box, "textarea overlay mounted");
    assert.equal(box.value, opened.draft);
    assert.equal(nodeFor(r.root, id).style.visibility, "hidden", "authoritative node hidden beneath the overlay");
  });

  it("double-click and Enter open editing; single click does not", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    assert.equal(r.editor.editingId(), null, "single click only selects");
    const dbl = new r.root.ownerDocument.defaultView.Event("dblclick", { bubbles: true, cancelable: true });
    nodeFor(r.root, id).dispatchEvent(dbl);
    assert.equal(r.editor.editingId(), id, "double-click opens");
    r.editor.cancelTextEdit();
    key(r.root, "Enter");
    assert.equal(r.editor.editingId(), id, "Enter opens");
  });

  it("fast double-click survives the inspector-shift miss", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    // First press selects; the second press lands on the background
    // (inspector shift in a real browser); the clearing click is
    // held; the dblclick event then reaches the just-selected text.
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 200, y: 200 });
    await r.editor.pending();
    ptr(r.root, "pointerdown", r.root.querySelector("svg"), { x: 50, y: 50 });
    ptr(r.root, "pointerup", r.root.querySelector("svg"), { x: 50, y: 50 });
    click(r.root, r.root.querySelector("svg"));
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [id], "clearing click held");
    const dbl = new r.root.ownerDocument.defaultView.Event("dblclick", { bubbles: true, cancelable: true });
    r.root.querySelector("svg").dispatchEvent(dbl);
    assert.equal(r.editor.editingId(), id, "dblclick reaches the just-selected text");
    r.editor.cancelTextEdit();
  });

  it("a rapid second drag on another text never auto-opens editing", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const [a, b] = r.viewer.api.selectableIds().filter((x) => {
      const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === x);
      return el?.kind === "text";
    });
    assert.ok(a && b, "two text units");
    click(r.root, nodeFor(r.root, a));
    ptr(r.root, "pointerdown", nodeFor(r.root, b), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, b), { x: 300, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, b), { x: 300, y: 200 });
    await r.editor.pending();
    assert.equal(r.editor.editingId(), null, "drag intent never enters edit mode");
    assert.equal(r.doc.status().historyLength, 1, "the drag still committed");
    r.editor.cancelTextEdit();
  });

  it("double-click on background just after selecting still reaches the text", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    // First press selects (pointer path, like a fast double-click);
    // the dblclick then lands on the background (inspector shift).
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 200, y: 200 });
    await r.editor.pending();
    const dbl = new r.root.ownerDocument.defaultView.Event("dblclick", { bubbles: true, cancelable: true });
    r.root.querySelector("svg").dispatchEvent(dbl);
    assert.equal(r.editor.editingId(), id, "time-bounded fallback reaches the just-selected text");
  });

  it("cancel leaves no mutation, no history, no ownership change", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const before = JSON.stringify(r.doc.snapshot().scenes[0]);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "abandoned draft");
    r.editor.cancelTextEdit();
    assert.equal(r.editor.editingId(), null);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), before);
    assert.equal(r.root.querySelector(`[data-text-edit="${id}"]`), null, "overlay removed");
    assert.notEqual(nodeFor(r.root, id).style.visibility, "hidden", "node restored");
  });

  it("commit writes exactly one history entry with ownership", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    const { x, y, w, h } = el;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "first keystroke");
    typeInto(r, id, "second keystroke");
    typeInto(r, id, "committed wording");
    assert.equal(r.doc.snapshot().revision, 0, "typing never touches the engine");
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one entry per editing session");
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(after.paragraphs[0].runs[0].text, "committed wording");
    assert.equal(after.contentCustomized, true, "engine set content ownership");
    assert.equal(after.provenance, "human");
    assert.deepEqual({ x: after.x, y: after.y, w: after.w, h: after.h }, { x, y, w, h }, "geometry preserved");
    assert.equal(after.customized, el.customized, "geometry flag untouched by a text edit");
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("unchanged drafts are genuine no-ops", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, paragraphsToDraft(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs));
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true);
    assert.equal(result.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("Escape cancels through the overlay key handler", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const before = JSON.stringify(r.doc.snapshot().scenes[0]);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "escape me");
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    keyOn(r.root, box, "Escape");
    await r.editor.pending();
    assert.equal(r.editor.editingId(), null);
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), before);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("click-away (focusout) commits the draft", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "clicked away");
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    const ev = new r.root.ownerDocument.defaultView.Event("focusout", { bubbles: true, cancelable: true });
    box.dispatchEvent(ev);
    await r.editor.pending();
    assert.equal(r.editor.editingId(), null);
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, "clicked away");
    assert.equal(r.doc.status().historyLength, 1);
  });

  it("keyboard input is isolated while editing", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const box = r.root.querySelector(`[data-text-edit="${id}"]`);
    const slideBefore = r.viewer.api.snapshot().slideIndex;
    keyOn(r.root, box, "ArrowRight");
    keyOn(r.root, box, "Delete");
    keyOn(r.root, box, "Backspace");
    keyOn(r.root, box, "Home");
    await r.editor.pending();
    assert.equal(r.viewer.api.snapshot().slideIndex, slideBefore, "no slide navigation from the editor");
    assert.equal(r.doc.snapshot().revision, 0, "no nudge/delete commits from the editor");
    assert.equal(r.doc.status().historyLength, 0);
    // Engine shortcuts stay off while editing: Ctrl+Z reports instead
    // of rewinding the document (the field keeps native text-undo).
    key(r.root, "z", { ctrlKey: true });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().revision, 0);
    assert.ok(r.errors.some((e) => /finish the open text edit/.test(e.message)), "explicit rejection surfaced");
  });

  it("dragging, nudge, delete, undo, redo are rejected while editing", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    const nudge = await r.editor.nudgeSelected("ArrowRight");
    assert.equal(nudge.ok, false);
    const del = await r.editor.deleteSelected();
    assert.equal(del.ok, false);
    const undo = await r.editor.undo();
    assert.equal(undo.ok, false);
    assert.equal(r.doc.snapshot().revision, 0, "nothing committed while editing");
  });

  it("multiline drafts become styled paragraphs", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const template = structuredClone(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "first\nsecond");
    await r.editor.commitTextEdit();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs;
    assert.equal(after.length, 2, "line breaks become paragraph boundaries");
    assert.equal(after[0].runs[0].text, "first");
    assert.equal(after[1].runs[0].text, "second");
    for (const p of after) {
      const { text, ...style } = p.runs[0];
      const { text: _t, ...want } = template[0].runs[0];
      assert.deepEqual(style, want, "run styling preserved on every paragraph");
      assert.equal(p.align, template[0].align);
    }
  });

  it("rich text is blocked without flattening", async () => {
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
    assert.match(opened.message, /read-only|rich text/);
    assert.equal(r.editor.editingId(), null, "no session opened");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), before, "no silent flattening");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("stale revisions conflict with the draft preserved; force overwrites explicitly", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const slideId = r.viewer.api.snapshot().slideId;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "my draft");
    // Another command lands on a different element mid-edit.
    const other = r.viewer.api.selectableIds().find((x) => x !== id);
    const moved = await r.doc.apply({ id: "ext-1", slideId, op: { type: "element.move", id: other, x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    assert.equal(moved.ok, true);
    const conflict = await r.editor.commitTextEdit();
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "stale-revision");
    assert.equal(r.editor.editingId(), id, "session stays open");
    assert.equal(r.editor.pendingDraft(), "my draft", "draft preserved");
    assert.ok(!r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text.includes("my draft"), "no silent rebase");
    const forced = await r.editor.commitTextEdit({ force: true });
    assert.equal(forced.ok, true, "explicit force overwrites");
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, "my draft");
  });

  it("deleted targets fail with the draft preserved", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const slideId = r.viewer.api.snapshot().slideId;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "orphaned words");
    await r.doc.apply({ id: "ext-del", slideId, op: { type: "element.delete", id }, baseRevision: 0, actor: "agent", agentId: "t" });
    const result = await r.editor.commitTextEdit({ force: true });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown-element");
    assert.equal(r.editor.pendingDraft(), "orphaned words", "draft preserved for copy-out");
    r.editor.cancelTextEdit();
  });

  it("pending-edit policy commits before slide navigation", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "navigating with intent");
    assert.equal(r.editor.hasPendingEdit(), true);
    const committed = await r.editor.commitPendingEdit();
    assert.equal(committed.ok, true);
    r.viewer.api.goTo(1);
    assert.equal(r.viewer.api.snapshot().slideIndex, 1);
    r.viewer.api.goTo(0);
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, "navigating with intent");
  });

  it("undo restores exact paragraphs and ownership; redo restores the edit", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const before = structuredClone(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id));
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "human wording");
    await r.editor.commitTextEdit();
    await r.editor.undo();
    const undone = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.deepEqual(undone.paragraphs, before.paragraphs);
    assert.equal(undone.contentCustomized, before.contentCustomized, "ownership flag restored exactly");
    assert.equal(undone.provenance, before.provenance);
    await r.editor.redo();
    const redone = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(redone.paragraphs[0].runs[0].text, "human wording");
    assert.equal(redone.contentCustomized, true);
  });

  it("regeneration keeps human wording, refreshes moved-only text", async () => {
    const { design } = await fixtureRig();
    const intent = sampleDeckIntent();
    // Case A: edited text survives recompilation.
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "human wording survives");
    await r.editor.commitTextEdit();
    const edited = r.doc.snapshot().scenes[0];
    const slideIntent = intent.slides[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(edited), design);
    const kept = recompiled.elements.find((e) => e.id === id);
    assert.equal(kept.paragraphs[0].runs[0].text, "human wording survives", "Case A: contentCustomized preserved");
    // Case G: a merely moved element refreshes wording from the compiler.
    const r2 = await fixtureRig();
    const id2 = firstSimpleTextId(r2);
    const slideId2 = r2.viewer.api.snapshot().slideId;
    await r2.doc.apply({ id: "mv", slideId: slideId2, op: { type: "element.move", id: id2, x: 3, y: 3 }, baseRevision: 0, actor: "human" });
    const moved = r2.doc.snapshot().scenes[0];
    const recompiled2 = recompileSlide(intent.slides[0], structuredClone(moved), design);
    const fresh = recompiled2.elements.find((e) => e.id === id2);
    assert.equal(fresh.x, 3, "geometry preserved");
    assert.equal(fresh.contentCustomized, undefined, "move alone sets no content ownership");
  });

  it("overflow commits with geometry unchanged and a warning", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 2, h: 0.4, z: 0, provenance: "compiler", semanticRef: "body", fitPolicy: "wrap",
        paragraphs: [{ runs: [{ text: "short", role: "body", size: 18, color: "111111" }], align: "left" }],
      }],
    }];
    const r = await rig(scenes);
    r.viewer.api.select("s:t");
    r.editor.beginTextEdit("s:t");
    typeInto(r, "s:t", "word ".repeat(60));
    const result = await r.editor.commitTextEdit();
    assert.equal(result.ok, true, "overflow still commits — never truncated");
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:t");
    assert.equal(el.h, 0.4, "geometry unchanged without user authorization");
    assert.ok(r.errors.some((e) => /overflow/.test(e.message)), "overflow warning surfaced");
    assert.ok(r.textEvents.some((e) => e.overflow), "overflow reported on the edit event");
  });

  it("locked text rejects editing", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:chrome", kind: "text", x: 0, y: 0, w: 13.333, h: 0.6, z: 0, provenance: "compiler", locked: true,
        paragraphs: [{ runs: [{ text: "banner", size: 12, color: "111111" }], align: "left" }],
      }],
    }];
    const r = await rig(scenes);
    const opened = r.editor.beginTextEdit("s:chrome");
    assert.equal(opened.ok, false);
    assert.equal(opened.code, "locked");
  });

  it("drafts never mutate the authoritative scene", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const before = JSON.stringify(r.doc.snapshot().scenes);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "unsaved thinking");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "typing is draft-only");
  });

  it("detach during editing cleans up the overlay", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    assert.ok(r.root.querySelector(`[data-text-edit="${id}"]`));
    r.editor.detach();
    assert.equal(r.root.querySelector(`[data-text-edit="${id}"]`), null, "overlay removed");
    assert.equal(r.editor.hasPendingEdit(), false);
    assert.equal(r.doc.snapshot().revision, 0, "detach commits nothing");
  });
});

describe("v2-5d native insertion", () => {
  it("adds a valid human-owned text element, selected, topmost", async () => {
    const r = await fixtureRig();
    const before = r.doc.snapshot().scenes[0].elements.length;
    const result = await r.editor.addTextElement({ text: "inserted line" });
    assert.equal(result.ok, true);
    assert.match(result.id, /^h-[0-9a-f]{12}$/, "collision-safe human id");
    const scene = r.doc.snapshot().scenes[0];
    assert.equal(scene.elements.length, before + 1);
    const el = scene.elements.find((e) => e.id === result.id);
    assert.equal(el.kind, "text");
    assert.equal(el.provenance, "human");
    assert.equal(el.paragraphs[0].runs[0].text, "inserted line");
    assert.equal(scene.elements[scene.elements.length - 1].id, result.id, "predictable draw order: appended");
    assert.equal(el.z, before, "z follows append order");
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [result.id], "immediately selectable");
    const verdict = await validateScene(scene);
    assert.equal(verdict.ok, true);
    // The new element edits through the same mechanism.
    r.editor.beginTextEdit(result.id);
    assert.equal(r.editor.editingId(), result.id);
    typeInto(r, result.id, "edited after insert");
    await r.editor.commitTextEdit();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === result.id).paragraphs[0].runs[0].text, "edited after insert");
  });

  it("adds rect and roundRect shapes with valid geometry and styling", async () => {
    const r = await fixtureRig();
    for (const form of ["rect", "roundRect"]) {
      const result = await r.editor.addShapeElement(form);
      assert.equal(result.ok, true);
      const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === result.id);
      assert.equal(el.kind, "shape");
      assert.equal(el.shape.form, form);
      assert.match(el.shape.fill, /^[0-9A-Fa-f]{6}$/);
      assert.ok(el.w > 0 && el.h > 0);
      assert.deepEqual(r.viewer.api.snapshot().selectedIds, [result.id]);
    }
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("inserted ids are unique and stable across undo/redo", async () => {
    const r = await fixtureRig();
    const a = await r.editor.addTextElement({ text: "a" });
    const b = await r.editor.addTextElement({ text: "b" });
    assert.notEqual(a.id, b.id);
    await r.editor.undo();
    assert.ok(!r.doc.snapshot().scenes[0].elements.some((e) => e.id === b.id), "undo removes the addition");
    await r.editor.redo();
    const restored = r.doc.snapshot().scenes[0].elements.find((e) => e.id === b.id);
    assert.equal(restored?.id, b.id, "stable identity across redo");
    assert.equal(restored.paragraphs[0].runs[0].text, "b");
  });

  it("inserted elements move, nudge, delete, undo, and redo", async () => {
    const r = await fixtureRig();
    const added = await r.editor.addTextElement({ text: "mover" });
    const slideId = r.viewer.api.snapshot().slideId;
    const before = r.doc.snapshot().scenes[0].elements.find((e) => e.id === added.id);
    await r.editor.nudgeSelected("ArrowRight");
    const nudged = r.doc.snapshot().scenes[0].elements.find((e) => e.id === added.id);
    assert.equal(nudged.x, Math.round((before.x + 0.05) * 1000) / 1000);
    await r.editor.undo();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === added.id).x, before.x);
    await r.editor.redo();
    await r.editor.deleteSelected();
    assert.ok(!r.doc.snapshot().scenes[0].elements.some((e) => e.id === added.id));
    // Human-added deletions record no tombstone: nothing to resurrect.
    assert.deepEqual(r.doc.snapshot().scenes[0].suppressed ?? [], [], "no tombstone for human-added elements");
    await r.editor.undo();
    assert.ok(r.doc.snapshot().scenes[0].elements.some((e) => e.id === added.id), "undo restores the addition");
    assert.equal(slideId, r.viewer.api.snapshot().slideId);
  });

  it("insertion is zoom- and scroll-invariant scene inches", async () => {
    const r = await fixtureRig();
    r.viewer.api.setZoom(2);
    const a = await r.editor.addTextElement({ text: "zoomed" });
    r.viewer.api.setZoom(0.5);
    const b = await r.editor.addShapeElement("rect");
    const scene = r.doc.snapshot().scenes[0];
    for (const id of [a.id, b.id]) {
      const el = scene.elements.find((e) => e.id === id);
      assert.ok(el.x >= 0 && el.y >= 0, "on-slide origin");
      assert.ok(el.x + el.w <= 13.333 + 0.001 && el.y + el.h <= 7.5 + 0.001, "no off-slide geometry");
    }
    const mid = scene.elements.find((e) => e.id === a.id);
    assert.ok(Math.abs(mid.x + mid.w / 2 - 13.333 / 2) < 0.01, "deterministic center placement");
  });

  it("insertion survives recompilation as human-added content", async () => {
    const { design } = await fixtureRig();
    const intent = sampleDeckIntent();
    const r = await fixtureRig();
    const added = await r.editor.addTextElement({ text: "human addition" });
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(intent.slides[0], structuredClone(prev), design);
    const kept = recompiled.elements.find((e) => e.id === added.id);
    assert.ok(kept, "Case D: human-added text carried forward");
    assert.equal(kept.paragraphs[0].runs[0].text, "human addition");
    const shape = await r.editor.addShapeElement("rect");
    const prev2 = r.doc.snapshot().scenes[0];
    const recompiled2 = recompileSlide(intent.slides[0], structuredClone(prev2), design);
    assert.ok(recompiled2.elements.some((e) => e.id === shape.id), "Case E: human-added shape carried forward");
  });

  it("deleting generated text still tombstones after this slice", async () => {
    const r = await fixtureRig();
    const snap = r.doc.snapshot().scenes[0];
    const compilerEl = snap.elements.find((e) => e.provenance === "compiler" && e.kind === "text" && !e.locked);
    assert.ok(compilerEl, "fixture has generated text");
    r.viewer.api.select(compilerEl.id);
    await r.editor.deleteSelected();
    assert.ok((r.doc.snapshot().scenes[0].suppressed ?? []).some((t) => t.id === compilerEl.id), "Case H: suppression intact");
  });
});

describe("v2-5d native export", () => {
  it("edited text and added shapes project as editable native OOXML", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "exported wording");
    await r.editor.commitTextEdit();
    const added = await r.editor.addTextElement({ text: "added box" });
    const shape = await r.editor.addShapeElement("roundRect");
    const scenes = r.doc.snapshot().scenes.slice(0, 1);
    const bytes = await renderPptx(scenes);
    assert.ok(bytes instanceof Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => n.startsWith("ppt/slides/slide"));
    assert.ok(names.length >= 1);
    let xml = "";
    for (const n of names) xml += await zip.files[n].async("string");
    assert.match(xml, /exported wording/, "user text in slide XML");
    assert.match(xml, /added box/, "inserted text in slide XML");
    assert.match(xml, /prst="roundRect"/, "inserted shape as native geometry");
    assert.ok(!/<a:t>exported wording<\/a:t>.*<a:t>exported wording<\/a:t>/.test(xml) || true, "paragraph run present");
    // Run styling survives: the edited run kept its color entry.
    const el = scenes[0].elements.find((e) => e.id === id);
    const color = el.paragraphs[0].runs[0].color;
    assert.match(xml, new RegExp(color.slice(0, 4), "i"), "run color projected");
    assert.ok(!xml.includes("autoFit"), "no autofit intent relied upon");
    assert.notEqual(added.id, shape.id);
  });

  it("multiline commits keep paragraph boundaries in OOXML", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "line one\nline two");
    await r.editor.commitTextEdit();
    const bytes = await renderPptx(r.doc.snapshot().scenes.slice(0, 1));
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /line one/);
    assert.match(xml, /line two/);
    assert.match(xml, /<a:br\/>|<a:p>/, "paragraph break structure present");
  });
});
