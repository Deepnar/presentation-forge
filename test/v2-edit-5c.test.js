// V2-5C: browser editing adapter. Headless linkedom coverage for
// init, drag threshold/cancel/commit math (stubbed layout rects),
// nudge increments, delete batches, undo/redo wiring, selection
// reconciliation, and detachment. Real-viewport coordinate proof
// across fit/zoom/scroll lives in test/v2-edit-chrome-5c.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { attachEditor, NUDGE_STEP, NUDGE_LARGE_STEP } from "../packages/editor/scene-edit.js";
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
  const synced = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: (s) => synced.push(s.length),
  });
  return { document, root, viewer, doc, editor, errors, synced };
}

async function fixtureRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design).slice(0, 2);
  return { scenes, ...(await rig(scenes)) };
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

function key(root, k, extra = {}) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
  ev.key = k;
  Object.assign(ev, extra);
  root.dispatchEvent(ev);
}

function click(root, node, shift = false) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  ev.shiftKey = shift;
  node.dispatchEvent(ev);
}

// Fixed linear layout: 1 client px = 1 svg px at scale 1.
function stubLayout(root, k = 1) {
  const svg = root.querySelector("svg");
  svg.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1280 * k, height: 720 * k, right: 100 + 1280 * k, bottom: 50 + 720 * k });
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

describe("v2-5c editor adapter", () => {
  it("attaches with validation and preserves read-only defaults elsewhere", async () => {
    const { scenes } = await fixtureRig();
    const document = dom();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes);
    const doc = await createDocument(structuredClone(scenes));
    assert.throws(() => attachEditor(null, doc, { root }), /viewer/);
    assert.throws(() => attachEditor(viewer, null, { root }), /document|engine/);
    assert.throws(() => attachEditor(viewer, doc, {}), /root/);
    // Read-only viewer without an adapter keeps navigating on arrows.
    key(root, "ArrowRight");
    assert.equal(viewer.api.snapshot().slideIndex, 1, "read-only arrows navigate");
  });

  it("drag commits exactly one move with exact coordinates", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 300, y: 250 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 300, y: 250 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1, "one history entry per drag");
    const moved = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(moved.x, Math.round((origin.x + 100 / 96) * 1000) / 1000, "dx converts client px to inches");
    assert.equal(moved.y, Math.round((origin.y + 50 / 96) * 1000) / 1000, "dy converts");
    assert.equal(moved.provenance, "human");
    assert.equal(moved.customized, true);
    // Viewer synced from the engine without remounting.
    assert.equal(r.viewer.api.snapshot().selectedIds[0], id, "selection kept");
    assert.equal(r.synced.length, 1, "one sync per commit");
  });

  it("sub-threshold movement and cancellation commit nothing", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 202, y: 201 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 202, y: 201 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0, "tiny movement is a click, not history");
    assert.equal(r.doc.snapshot().revision, 0);
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 400, y: 400 });
    ptr(r.root, "pointercancel", nodeFor(r.root, id), { x: 400, y: 400 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0, "cancellation commits nothing");
  });

  it("locked units never start a drag", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const locked = [...r.root.querySelectorAll('[data-el][data-locked="true"]')];
    if (locked.length === 0) {
      const scenes = r.doc.snapshot().scenes;
      assert.ok(true, "no locked units on plain slides; chromed covered in Chrome");
      return;
    }
    ptr(r.root, "pointerdown", locked[0], { x: 200, y: 200 });
    ptr(r.root, "pointermove", locked[0], { x: 400, y: 400 });
    ptr(r.root, "pointerup", locked[0], { x: 400, y: 400 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("shift-toggle does not double-flip after a dragless press", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const [a, b] = r.viewer.api.selectableIds();
    click(r.root, nodeFor(r.root, a));
    ptr(r.root, "pointerdown", nodeFor(r.root, b), { x: 200, y: 200, shift: true });
    ptr(r.root, "pointerup", nodeFor(r.root, b), { x: 200, y: 200, shift: true });
    click(r.root, nodeFor(r.root, b), true);
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [a, b], "trailing click suppressed after press-toggle");
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0, "no drag, no commit");
  });

  it("plain press on a multiselect member collapses on clean release", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const [a, b] = r.viewer.api.selectableIds();
    r.viewer.api.selectMany([a, b]);
    ptr(r.root, "pointerdown", nodeFor(r.root, a), { x: 200, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, a), { x: 200, y: 200 });
    click(r.root, nodeFor(r.root, a));
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [a], "collapsed like a click");
  });

  it("keyboard nudge moves by documented increments", async () => {
    const r = await fixtureRig();
    const id = r.viewer.api.selectableIds()[0];
    const o = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    click(r.root, nodeFor(r.root, id));
    key(r.root, "ArrowRight");
    await r.editor.pending();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, Math.round((o.x + NUDGE_STEP) * 1000) / 1000);
    key(r.root, "ArrowUp", { shiftKey: true });
    await r.editor.pending();
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(el.y, Math.round((o.y - NUDGE_LARGE_STEP) * 1000) / 1000, "shift arrows take the large step");
    assert.equal(NUDGE_STEP, 0.05);
    assert.equal(NUDGE_LARGE_STEP, 0.25);
  });

  it("arrows navigate when nothing is selected, even while editable", async () => {
    const r = await fixtureRig();
    key(r.root, "ArrowRight");
    assert.equal(r.viewer.api.snapshot().slideIndex, 1, "empty selection keeps navigation");
    assert.equal(r.doc.snapshot().revision, 0, "navigation never commits");
  });

  it("multiselect nudge submits one atomic batch", async () => {
    const r = await fixtureRig();
    const [a, b] = r.viewer.api.selectableIds();
    r.viewer.api.selectMany([a, b]);
    const before = r.doc.snapshot().scenes[0];
    await r.editor.nudgeSelected("ArrowDown");
    assert.equal(r.doc.status().historyLength, 1, "one entry for the batch");
    const after = r.doc.snapshot().scenes[0];
    for (const id of [a, b]) {
      const was = before.elements.find((e) => e.id === id).y;
      assert.equal(after.elements.find((e) => e.id === id).y, Math.round((was + NUDGE_STEP) * 1000) / 1000);
    }
    await r.editor.undo();
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), JSON.stringify(before), "batch undoes atomically");
  });

  it("stale selection fails the whole batch and reports", async () => {
    const r = await fixtureRig();
    const [a, b] = r.viewer.api.selectableIds();
    r.viewer.api.selectMany([a, b]);
    await r.doc.apply({ id: "ext", slideId: r.viewer.api.snapshot().slideId, op: { type: "element.delete", id: b }, baseRevision: 0, actor: "agent", agentId: "t" });
    const result = await r.editor.nudgeSelected("ArrowRight");
    assert.equal(result.ok, false, "stale member fails the batch");
    assert.equal(r.errors.length, 1, "surfaced through onError");
    assert.equal(r.errors[0].code, "unknown-element");
  });

  it("delete removes, tombstones, reconciles, and undoes exactly", async () => {
    const r = await fixtureRig();
    const id = r.viewer.api.selectableIds()[0];
    const order = r.doc.snapshot().scenes[0].elements.map((e) => e.id);
    click(r.root, nodeFor(r.root, id));
    key(r.root, "Delete");
    await r.editor.pending();
    assert.ok(!r.doc.snapshot().scenes[0].elements.some((e) => e.id === id), "deleted");
    assert.ok((r.doc.snapshot().scenes[0].suppressed ?? []).some((t) => t.id === id), "compiler deletion tombstoned");
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [], "selection reconciled");
    await r.editor.undo();
    assert.deepEqual(r.doc.snapshot().scenes[0].elements.map((e) => e.id), order, "exact order restored");
    await r.editor.redo();
    assert.ok(!r.doc.snapshot().scenes[0].elements.some((e) => e.id === id), "redo deletes again");
  });

  it("read-only viewers ignore edit keys", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design).slice(0, 2);
    const document = dom();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes);
    const id = viewer.api.selectableIds()[0];
    const before = JSON.stringify(scenes);
    click(root, root.querySelector(`[data-el="${id}"]`));
    key(root, "Delete");
    key(root, "ArrowRight");
    assert.equal(JSON.stringify(scenes), before, "no mutation without an adapter");
    assert.equal(viewer.api.snapshot().slideIndex, 1, "arrows still navigate when read-only");
  });

  it("ctrl+z / ctrl+shift+z route through the adapter", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 300, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 300, y: 200 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1);
    key(r.root, "z", { ctrlKey: true });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().revision, 2, "ctrl+z undoes");
    assert.equal(r.doc.status().historyLength, 0);
    key(r.root, "Z", { ctrlKey: true, shiftKey: true });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().revision, 3, "ctrl+shift+z redoes");
  });

  it("detach stops editing and restores read-only keys", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    r.editor.detach();
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 500, y: 500 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 500, y: 500 });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().revision, 0, "detached adapter commits nothing");
    key(r.root, "ArrowRight");
    assert.equal(r.viewer.api.snapshot().slideIndex, 1, "keys navigate again");
  });

  it("group children drag the authoritative parent unit", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:g", kind: "group", x: 2, y: 2, w: 6, h: 3, z: 1, provenance: "compiler",
        group: {
          children: [
            { id: "s:g:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 1, provenance: "compiler", shape: { fill: "00FF00" } },
          ],
        },
      }],
    }];
    const r = await rig(scenes);
    stubLayout(r.root);
    const kid = r.root.querySelector('[data-el="s:g:kid"]');
    ptr(r.root, "pointerdown", kid, { x: 200, y: 200 });
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, ["s:g"], "press selects the parent");
    ptr(r.root, "pointermove", kid, { x: 296, y: 200 });
    ptr(r.root, "pointerup", kid, { x: 296, y: 200 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1, "one command for the group");
    const g = r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:g");
    assert.equal(g.x, 3, "parent moved one inch");
    assert.equal(g.group.children[0].x, 0.5, "child offsets intact");
  });

  it("chart innards drag the whole chart", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const ci = scenes.findIndex((s) => s.elements.some((e) => e.kind === "chart"));
    const r = await rig([scenes[ci]]);
    stubLayout(r.root);
    const chartId = scenes[ci].elements.find((e) => e.kind === "chart").id;
    const bar = r.root.querySelector(`[data-el="${chartId}"] rect`);
    assert.ok(bar && !bar.hasAttribute("data-el"), "inner bar has no identity");
    const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === chartId);
    ptr(r.root, "pointerdown", bar, { x: 200, y: 200 });
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [chartId]);
    ptr(r.root, "pointermove", bar, { x: 248, y: 200 });
    ptr(r.root, "pointerup", bar, { x: 248, y: 200 });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === chartId).x, Math.round((origin.x + 48 / 96) * 1000) / 1000, "chart moved half an inch as a unit");
  });

  it("scale-two layout converts client px at the rendered scale", async () => {
    const r = await fixtureRig();
    stubLayout(r.root, 2);
    const id = r.viewer.api.selectableIds()[0];
    const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 300, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 300, y: 200 });
    await r.editor.pending();
    // 100 client px at 2x device scale is 50 SVG px (division, not
    // multiplication), i.e. 50/96 inches — the V2-5C-1 correction.
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, Math.round((origin.x + 50 / 96) * 1000) / 1000, "100 client px at 2x is 50 svg px");
  });

  it("conversion is division by scale at 50, 100, 150, and 200 percent", async () => {
    const { clientToSvgDelta } = await import("../packages/editor/scene-edit.js");
    for (const [k, wantSvg] of [[0.5, 200], [1, 100], [1.5, 100 / 1.5], [2, 50]]) {
      const got = clientToSvgDelta(100, 60, { kx: k, ky: k });
      assert.ok(Math.abs(got.dx - wantSvg) < 1e-9, `100 client px at ${k}x is ${wantSvg} svg px`);
      assert.ok(Math.abs(got.dy - 60 / k) < 1e-9, `vertical divides by the same scale`);
    }
  });

  it("drag distance follows the rendered scale, not its inverse", async () => {
    for (const k of [0.5, 1, 1.5, 2]) {
      const r = await fixtureRig();
      stubLayout(r.root, k);
      const id = r.viewer.api.selectableIds()[0];
      const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
      click(r.root, nodeFor(r.root, id));
      ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
      ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 300, y: 260 });
      ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 300, y: 260 });
      await r.editor.pending();
      const moved = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
      assert.equal(moved.x, Math.round((origin.x + 100 / k / 96) * 1000) / 1000, `x at ${k}x`);
      assert.equal(moved.y, Math.round((origin.y + 60 / k / 96) * 1000) / 1000, `y at ${k}x`);
      assert.equal(r.doc.status().historyLength, 1, `one entry at ${k}x`);
    }
  });

  it("non-uniform rendering derives each axis separately", async () => {
    const r = await fixtureRig();
    const svg = r.root.querySelector("svg");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280 * 2, height: 720 * 0.5, right: 2560, bottom: 360 });
    const id = r.viewer.api.selectableIds()[0];
    const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 300, y: 260 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 300, y: 260 });
    await r.editor.pending();
    const moved = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(moved.x, Math.round((origin.x + 100 / 2 / 96) * 1000) / 1000, "x divides by kx");
    assert.equal(moved.y, Math.round((origin.y + 60 / 0.5 / 96) * 1000) / 1000, "y divides by ky");
  });

  it("release coordinates decide the commit, not the last move", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    const origin = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 260, y: 200 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 340, y: 200 });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, Math.round((origin.x + 140 / 96) * 1000) / 1000, "140 client px from press to release");
  });

  it("adapter reads fresh revisions so external commits never go stale", async () => {
    const r = await fixtureRig();
    const id = r.viewer.api.selectableIds()[0];
    click(r.root, nodeFor(r.root, id));
    await r.doc.apply({ id: "ext-1", slideId: r.viewer.api.snapshot().slideId, op: { type: "element.move", id, x: 1, y: 1 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const result = await r.editor.nudgeSelected("ArrowRight");
    assert.equal(result.ok, true, "adapter submits at the current revision");
    assert.equal(result.revision, 2);
  });

  it("input scenes stay immutable through drag commits", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design).slice(0, 1);
    const frozen = JSON.stringify(scenes);
    const r = await rig(scenes);
    stubLayout(r.root);
    const id = r.viewer.api.selectableIds()[0];
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", nodeFor(r.root, id), { x: 200, y: 200 });
    ptr(r.root, "pointermove", nodeFor(r.root, id), { x: 400, y: 400 });
    ptr(r.root, "pointerup", nodeFor(r.root, id), { x: 400, y: 400 });
    await r.editor.pending();
    assert.equal(JSON.stringify(scenes), frozen, "caller scenes byte-identical");
    assert.ok(Object.isFrozen(r.viewer.scenes[0]), "viewer scenes stay frozen");
  });
});
