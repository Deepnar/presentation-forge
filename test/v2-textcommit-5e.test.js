// V2-5E: text-commit lifecycle hardening (§10.1). Headless coverage
// for the per-session in-flight commit guard: blur+Commit,
// Ctrl+Enter+blur, repeated Commit presses, failed-first retry,
// stale conflicts, navigation during a commit, and cancellation
// while a commit is pending. Real-key proof lives in
// test/v2-edit-chrome-5e.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { compileDeck } from "../packages/compiler/compile.js";
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
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: () => {},
  });
  return { document, root, viewer, doc, editor, errors };
}

async function fixtureRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design).slice(0, 2);
  return { ...(await rig(scenes)) };
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

function click(root, node) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
}

function firstSimpleTextId(r) {
  const scene = r.doc.snapshot().scenes[r.viewer.api.snapshot().slideIndex];
  const found = scene.elements.find(
    (e) => e.kind === "text" && e.paragraphs?.length === 1 && e.paragraphs[0]?.runs?.length === 1,
  );
  return found?.id ?? null;
}

function typeInto(r, id, text) {
  const box = r.root.querySelector(`[data-text-edit="${id}"]`);
  assert.ok(box, "editing overlay is mounted");
  box.value = text;
  box.dispatchEvent(new r.root.ownerDocument.defaultView.Event("input", { bubbles: true, cancelable: true }));
}

function blurOut(r, id) {
  const box = r.root.querySelector(`[data-text-edit="${id}"]`);
  const ev = new r.root.ownerDocument.defaultView.Event("focusout", { bubbles: true, cancelable: true });
  box.dispatchEvent(ev);
}

describe("v2-5e text commit guard", () => {
  it("blur plus Commit submits exactly one envelope", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "single submission");
    blurOut(r, id);
    const viaButton = await r.editor.commitTextEdit();
    assert.equal(viaButton.ok, true, "late trigger joins the in-flight commit");
    assert.equal(r.doc.status().historyLength, 1, "no second undo entry");
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, "single submission");
  });

  it("repeated Commit presses share one submission", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "pressed thrice");
    const [a, b, c] = await Promise.all([
      r.editor.commitTextEdit(),
      r.editor.commitTextEdit(),
      r.editor.commitTextEdit(),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true, "late triggers join, all resolve with the one outcome");
    assert.equal(c.ok, true);
    assert.equal(r.doc.status().historyLength, 1);
    assert.equal(r.editor.editingId(), null, "session closed once");
  });

  it("a failed first commit keeps the draft and allows retry", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const slideId = r.viewer.api.snapshot().slideId;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "retry me");
    const other = r.viewer.api.selectableIds().find((x) => x !== id);
    await r.doc.apply({ id: "ext", slideId, op: { type: "element.move", id: other, x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const conflict = await r.editor.commitTextEdit();
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "stale-revision");
    assert.equal(r.editor.pendingDraft(), "retry me", "draft never discarded before resolution");
    // A trigger DURING the failed commit's resolution is benign.
    const forced = await r.editor.commitTextEdit({ force: true });
    assert.equal(forced.ok, true);
    assert.equal(r.doc.status().historyLength, 2, "external move plus one text commit");
  });

  it("navigation during a commit waits instead of duplicating", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "navigating commit");
    const first = r.editor.commitTextEdit();
    const nav = await r.editor.commitPendingEdit();
    const result = await first;
    assert.equal(result.ok, true);
    assert.equal(nav.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "navigation shared the in-flight submission");
  });

  it("cancellation while a commit is pending resolves safely", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "cancel race");
    const flight = r.editor.commitTextEdit();
    const cancelled = r.editor.cancelTextEdit();
    assert.equal(cancelled.ok, true);
    const result = await flight;
    assert.equal(result.ok, true, "the submitted engine op still lands");
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1);
    assert.equal(r.editor.editingId(), null);
    assert.equal(r.root.querySelector(`[data-text-edit="${id}"]`), null, "overlay gone");
    // The landed text is visible even though the UI closed first.
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, "cancel race");
  });

  it("stale conflicts still report per trigger without masking", async () => {
    const r = await fixtureRig();
    const id = firstSimpleTextId(r);
    const slideId = r.viewer.api.snapshot().slideId;
    click(r.root, nodeFor(r.root, id));
    r.editor.beginTextEdit(id);
    typeInto(r, id, "conflicted");
    const other = r.viewer.api.selectableIds().find((x) => x !== id);
    await r.doc.apply({ id: "ext2", slideId, op: { type: "element.move", id: other, x: 4, y: 4 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const first = await r.editor.commitTextEdit();
    assert.equal(first.code, "stale-revision");
    // Guard reset after failure: the next trigger reports honestly too.
    const second = await r.editor.commitTextEdit();
    assert.equal(second.code, "stale-revision", "no masking by the guard");
    assert.equal(r.editor.editingId(), id, "session still open with draft");
    r.editor.cancelTextEdit();
  });
});
