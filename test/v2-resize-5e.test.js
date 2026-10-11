// V2-5E: resize handles and geometry. Headless linkedom coverage
// for handle visibility/exclusion, eight-handle math, zoom fidelity,
// cancellation, preview/commit parity, single-entry history,
// undo/redo exactness, refusal paths, text preservation, cascade
// placement, and cleanup. Real-pointer proof lives in
// test/v2-edit-chrome-5e.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import {
  attachEditor,
  RESIZE_HANDLES,
  HANDLE_CURSORS,
  MIN_RESIZE_IN,
} from "../packages/editor/scene-edit.js";
import { resizeGeometry } from "../packages/editor/scene-edit.js";
import { cascadeBox, cascadeIndex } from "../packages/editor/scene-text.js";
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
  return { design, scenes, ...(await rig(scenes)) };
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

function click(root, node, shift = false) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  ev.shiftKey = shift;
  node.dispatchEvent(ev);
}

function key(root, k, extra = {}) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
  ev.key = k;
  Object.assign(ev, extra);
  root.dispatchEvent(ev);
}

function stubLayout(root, kx = 1, ky = null) {
  const kyEff = ky ?? kx;
  const svg = root.querySelector("svg");
  svg.getBoundingClientRect = () => ({
    left: 100, top: 50, width: 1280 * kx, height: 720 * kyEff,
    right: 100 + 1280 * kx, bottom: 50 + 720 * kyEff,
  });
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

function handleFor(root, id, handle) {
  return root.querySelector(`[data-handle-layer] [data-handle-for="${id}"][data-resize-handle="${handle}"]`);
}

function firstResizableId(r, kind = null) {
  const scene = r.doc.snapshot().scenes[r.viewer.api.snapshot().slideIndex];
  const found = scene.elements.find((e) => !e.locked && (kind ? e.kind === kind : ["text", "shape", "image", "chart"].includes(e.kind)));
  return found?.id ?? null;
}

describe("v2-5e resize math", () => {
  it("moves the correct edges for all eight handles", () => {
    const o = { x: 2, y: 2, w: 4, h: 2 };
    assert.deepEqual(resizeGeometry(o, "se", 1, 0.5), { x: 2, y: 2, w: 5, h: 2.5 });
    assert.deepEqual(resizeGeometry(o, "nw", -1, -0.5), { x: 1, y: 1.5, w: 5, h: 2.5 });
    assert.deepEqual(resizeGeometry(o, "e", 1, 9), { x: 2, y: 2, w: 5, h: 2 });
    assert.deepEqual(resizeGeometry(o, "w", 1, 9), { x: 3, y: 2, w: 3, h: 2 });
    assert.deepEqual(resizeGeometry(o, "s", 9, 0.5), { x: 2, y: 2, w: 4, h: 2.5 });
    assert.deepEqual(resizeGeometry(o, "n", 9, 0.5), { x: 2, y: 2.5, w: 4, h: 1.5 });
    assert.deepEqual(resizeGeometry(o, "ne", 1, -0.5), { x: 2, y: 1.5, w: 5, h: 2.5 });
    assert.deepEqual(resizeGeometry(o, "sw", -1, 0.5), { x: 1, y: 2, w: 5, h: 2.5 });
  });

  it("clamps at the positive floor holding the opposite edge", () => {
    const o = { x: 2, y: 2, w: 4, h: 2 };
    assert.deepEqual(resizeGeometry(o, "w", 10, 0), { x: 2 + 4 - MIN_RESIZE_IN, y: 2, w: MIN_RESIZE_IN, h: 2 });
    assert.deepEqual(resizeGeometry(o, "e", -10, 0), { x: 2, y: 2, w: MIN_RESIZE_IN, h: 2 });
    assert.deepEqual(resizeGeometry(o, "n", 0, 10), { x: 2, y: 2 + 2 - MIN_RESIZE_IN, w: 4, h: MIN_RESIZE_IN });
    assert.deepEqual(resizeGeometry(o, "s", 0, -10), { x: 2, y: 2, w: 4, h: MIN_RESIZE_IN });
    assert.equal(MIN_RESIZE_IN, 0.1);
  });

  it("rejects non-finite geometry loudly", () => {
    assert.throws(() => resizeGeometry({ x: 0, y: 0, w: 1, h: 1 }, "se", NaN, 0), /non-finite/);
    assert.throws(() => resizeGeometry({ x: 0, y: 0, w: 1, h: 1 }, "se", 0, Infinity), /non-finite/);
  });

  it("cascades deterministically and stays on-canvas", () => {
    const base = { x: 4.667, y: 3.25, w: 4, h: 1 };
    const first = cascadeBox(base, 0);
    assert.deepEqual(first, { ...base });
    const third = cascadeBox(base, 2);
    assert.equal(third.x, Math.round((base.x + 0.8) * 1000) / 1000);
    assert.equal(third.y, Math.round((base.y + 0.8) * 1000) / 1000);
    assert.deepEqual(cascadeBox(base, 6), { ...base }, "cycle wraps");
    for (let n = 0; n < 30; n++) {
      const b = cascadeBox(base, n);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 13.333 + 0.001 && b.y + b.h <= 7.5 + 0.001, `step ${n} on-canvas`);
    }
    assert.equal(cascadeIndex({ elements: [{ provenance: "compiler" }, { provenance: "human" }] }), 1);
    assert.equal(cascadeIndex(null), 0);
  });
});

describe("v2-5e resize handles", () => {
  it("renders eight aligned handles with directional cursors", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    click(r.root, nodeFor(r.root, id));
    assert.equal(r.editor.handlesVisible(), 8, "full handle set, never a partial one");
    for (const h of RESIZE_HANDLES) {
      const node = handleFor(r.root, id, h);
      assert.ok(node, `handle ${h} present`);
      assert.equal(node.style.cursor, HANDLE_CURSORS[h]);
    }
    const rect = r.viewer.api.bounds(id);
    const se = handleFor(r.root, id, "se");
    assert.equal(parseFloat(se.style.left), Math.round((rect.x + rect.w) * 10) / 10);
    assert.equal(parseFloat(se.style.top), Math.round((rect.y + rect.h) * 10) / 10);
    const nw = handleFor(r.root, id, "nw");
    assert.equal(parseFloat(nw.style.left), Math.round(rect.x * 10) / 10);
  });

  it("shows no handles without selection, in multiselect, or read-only", async () => {
    const r = await fixtureRig();
    assert.equal(r.editor.handlesVisible(), 0, "nothing selected");
    const [a, b] = r.viewer.api.selectableIds();
    r.viewer.api.selectMany([a, b]);
    assert.equal(r.editor.handlesVisible(), 0, "multiselect refused, not improvised");
    // Read-only viewers never load the adapter: no handle layer at all.
    const document = dom();
    const root = document.createElement("div");
    document.body.appendChild(root);
    createViewer(root, r.doc.snapshot().scenes);
    assert.equal(root.querySelector("[data-handle-layer]"), null);
  });

  it("locked elements expose no actionable handles", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:lock", kind: "shape", x: 2, y: 2, w: 3, h: 2, z: 0, provenance: "compiler", locked: true,
        shape: { form: "rect", fill: "AABBCC" },
      }],
    }];
    const r = await rig(scenes);
    stubLayout(r.root);
    assert.equal(r.viewer.api.selectableIds().includes("s:lock"), false);
    assert.equal(r.editor.handlesVisible(), 0);
    const started = r.editor.beginResize("se", "s:lock");
    assert.equal(started.ok, false);
    assert.equal(started.code, "locked");
  });

  it("se resize commits one setGeometry with exact coordinates", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 396, y: 348 });
    assert.ok(r.root.querySelector("[data-resize-preview]"), "dashed preview during gesture");
    ptr(r.root, "pointerup", handleFor(r.root, id, "se"), { x: 396, y: 348 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1, "one entry per gesture");
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(after.w, Math.round((origin.w + 96 / 96) * 1000) / 1000, "96 client px at scale 1 is one inch");
    assert.equal(after.h, Math.round((origin.h + 48 / 96) * 1000) / 1000);
    assert.equal(after.x, origin.x, "se keeps the origin");
    assert.equal(after.y, origin.y);
    assert.equal(after.provenance, "human");
    assert.equal(after.customized, true, "geometry ownership recorded");
    assert.equal(after.contentCustomized, origin.contentCustomized, "no false content ownership");
    assert.equal(r.root.querySelector("[data-resize-preview]"), null, "preview cleared");
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("nw resize moves the origin and holds no jump at start", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "nw"), { x: 300, y: 300 });
    // A press without movement previews nothing and commits nothing.
    ptr(r.root, "pointerup", handleFor(r.root, id, "nw"), { x: 300, y: 300 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0, "no jump at resize start");
    ptr(r.root, "pointerdown", handleFor(r.root, id, "nw"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "nw"), { x: 252, y: 276 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "nw"), { x: 252, y: 276 });
    await r.editor.pending();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(after.x, Math.round((origin.x - 48 / 96) * 1000) / 1000);
    assert.equal(after.y, Math.round((origin.y - 24 / 96) * 1000) / 1000);
    assert.equal(after.w, Math.round((origin.w + 48 / 96) * 1000) / 1000);
    assert.equal(after.h, Math.round((origin.h + 24 / 96) * 1000) / 1000);
  });

  it("converts at the rendered scale on both axes independently", async () => {
    const r = await fixtureRig();
    stubLayout(r.root, 2, 0.5);
    const id = firstResizableId(r);
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 300 + 96, y: 300 + 96 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "se"), { x: 300 + 96, y: 300 + 96 });
    await r.editor.pending();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    // kx = 2 (96 client px = 48 svg px = 0.5in), ky = 0.5 (96 px = 2in).
    assert.equal(after.w, Math.round((origin.w + 0.5) * 1000) / 1000, "x divides by kx");
    assert.equal(after.h, Math.round((origin.h + 2) * 1000) / 1000, "y divides by ky");
  });

  it("release coordinates decide the commit, matching the preview", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "e"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "e"), { x: 360, y: 300 });
    const previewed = r.editor.previewResize(360, 300);
    assert.ok(previewed, "preview geometry observable");
    ptr(r.root, "pointerup", handleFor(r.root, id, "e"), { x: 396, y: 300 });
    await r.editor.pending();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(after.w, Math.round((origin.w + 96 / 96) * 1000) / 1000, "release (not last move) decides");
    assert.notDeepEqual(previewed.w, after.w, "preview and commit differ exactly by the release delta");
  });

  it("cancellation and Escape commit nothing", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const before = JSON.stringify(r.doc.snapshot().scenes[0]);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 500, y: 500 });
    ptr(r.root, "pointercancel", handleFor(r.root, id, "se"), { x: 500, y: 500 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0);
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 500, y: 500 });
    key(r.root, "Escape");
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 0, "Escape abandons the gesture");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0]), before);
    assert.equal(r.root.querySelector("[data-resize-preview]"), null);
  });

  it("undo restores exact geometry and ownership; redo restores the resize", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const before = structuredClone(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id));
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 396, y: 300 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "se"), { x: 396, y: 300 });
    await r.editor.pending();
    await r.editor.undo();
    assert.deepEqual(
      r.doc.snapshot().scenes[0].elements.find((e) => e.id === id),
      before,
      "geometry and metadata byte-identical",
    );
    await r.editor.redo();
    const redone = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(redone.w, Math.round((before.w + 1) * 1000) / 1000);
    assert.equal(redone.customized, true);
  });

  it("refuses groups, lines, tables, and stale multi-targets", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        {
          id: "s:g", kind: "group", x: 2, y: 2, w: 6, h: 3, z: 0, provenance: "compiler",
          group: { children: [{ id: "s:g:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 0, provenance: "compiler", shape: { form: "rect", fill: "00FF00" } }] },
        },
        { id: "s:ln", kind: "line", x: 1, y: 1, w: 3, h: 0.1, z: 1, provenance: "compiler", line: { x2: 4, y2: 1 } },
        {
          id: "s:tb", kind: "table", x: 1, y: 4, w: 4, h: 2, z: 2, provenance: "compiler",
          table: { rows: [["a", "b"]], layout: { colWidths: [2, 2], gridColor: "999999" } },
        },
      ],
    }];
    const r = await rig(scenes);
    stubLayout(r.root);
    for (const id of ["s:g", "s:ln", "s:tb"]) {
      r.viewer.api.select(id);
      assert.equal(r.editor.handlesVisible(), 0, `no handles for ${id}`);
      const started = r.editor.beginResize("se", id);
      assert.equal(started.ok, false, `${id} refused explicitly`);
    }
    assert.equal(r.doc.status().historyLength, 0);
    assert.equal(r.errors.length, 3, "each refusal surfaced");
  });

  it("text keeps every run byte-identical through a resize", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r, "text");
    assert.ok(id, "fixture carries text");
    const paras = structuredClone(r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs);
    click(r.root, nodeFor(r.root, id));
    ptr(r.root, "pointerdown", handleFor(r.root, id, "s"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "s"), { x: 300, y: 396 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "s"), { x: 300, y: 396 });
    await r.editor.pending();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.deepEqual(after.paragraphs, paras, "no silent text loss, no reflow");
    assert.equal(after.contentCustomized, undefined, "resize sets no content ownership");
  });

  it("shrinking text warns overflow without touching content", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s:t", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 0, provenance: "compiler", semanticRef: "body", fitPolicy: "wrap",
        paragraphs: [{ runs: [{ text: "word ".repeat(40), role: "body", size: 18, color: "111111" }], align: "left" }],
      }],
    }];
    const r = await rig(scenes);
    stubLayout(r.root);
    r.viewer.api.select("s:t");
    // Shrink width hard via the west handle: 4 inches narrower.
    ptr(r.root, "pointerdown", handleFor(r.root, "s:t", "w"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, "s:t", "w"), { x: 300 + 384, y: 300 });
    ptr(r.root, "pointerup", handleFor(r.root, "s:t", "w"), { x: 300 + 384, y: 300 });
    await r.editor.pending();
    const after = r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:t");
    assert.equal(after.w, 2, "geometry committed as dragged");
    assert.equal(after.paragraphs[0].runs[0].text, "word ".repeat(40), "content intact");
    assert.ok(r.errors.some((e) => /overflow/.test(e.message)), "honest overflow warning");
  });

  it("handle presses never drag, clear, or edit", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    click(r.root, nodeFor(r.root, id));
    // A handle press released without movement: no drag, no clear.
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    await r.editor.pending();
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [id], "selection kept");
    assert.equal(r.doc.status().historyLength, 0);
    assert.equal(r.editor.editingId(), null, "no edit mode from a handle");
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(el.x, origin.x, "element did not move");
  });

  it("charts resize while tables stay refused", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const scene = r.doc.snapshot().scenes[r.viewer.api.snapshot().slideIndex];
    const chart = scene.elements.find((e) => e.kind === "chart" && !e.locked);
    if (!chart) {
      assert.ok(true, "no chart on this slide; chart path covered in Chrome");
      return;
    }
    r.viewer.api.select(chart.id);
    assert.equal(r.editor.handlesVisible(), 8);
  });
});

describe("v2-5e insertion cascade", () => {
  it("repeated inserts step diagonally without stacking", async () => {
    const r = await fixtureRig();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const added = await r.editor.addTextElement({ text: `box ${i}` });
      assert.equal(added.ok, true);
      ids.push(added.id);
    }
    const scene = r.doc.snapshot().scenes[0];
    const boxes = ids.map((id) => scene.elements.find((e) => e.id === id));
    assert.notDeepEqual([boxes[0].x, boxes[0].y], [boxes[1].x, boxes[1].y]);
    assert.notDeepEqual([boxes[1].x, boxes[1].y], [boxes[2].x, boxes[2].y]);
    assert.equal(boxes[1].x, Math.round((boxes[0].x + 0.4) * 1000) / 1000);
    assert.equal(boxes[1].y, Math.round((boxes[0].y + 0.4) * 1000) / 1000);
    for (const b of boxes) {
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 13.333 + 0.001 && b.y + b.h <= 7.5 + 0.001, "on-canvas");
    }
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [ids[2]], "latest insert selected");
  });

  it("cascade is zoom-invariant and survives undo/redo exactly", async () => {
    const r = await fixtureRig();
    r.viewer.api.setZoom(2);
    const a = await r.editor.addShapeElement("rect");
    const b = await r.editor.addShapeElement("rect");
    const scene = r.doc.snapshot().scenes[0];
    const ea = scene.elements.find((e) => e.id === a.id);
    const eb = scene.elements.find((e) => e.id === b.id);
    assert.notDeepEqual([ea.x, ea.y], [eb.x, eb.y], "placement needs no viewport math");
    await r.editor.undo();
    assert.ok(!r.doc.snapshot().scenes[0].elements.some((e) => e.id === b.id));
    await r.editor.redo();
    const restored = r.doc.snapshot().scenes[0].elements.find((e) => e.id === b.id);
    assert.deepEqual({ x: restored.x, y: restored.y }, { x: eb.x, y: eb.y }, "exact geometry restored");
  });

  it("explicit boxes bypass the cascade and caller input stays immutable", async () => {
    const r = await fixtureRig();
    const box = { x: 1, y: 1, w: 3, h: 1 };
    const added = await r.editor.addTextElement({ text: "pinned", box });
    assert.equal(added.ok, true);
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === added.id);
    assert.deepEqual({ x: el.x, y: el.y }, { x: 1, y: 1 });
    box.x = 9;
    const again = r.doc.snapshot().scenes[0].elements.find((e) => e.id === added.id);
    assert.equal(again.x, 1, "mutating caller input cannot move the scene");
  });

  it("handles survive committed scene swaps", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    click(r.root, nodeFor(r.root, id));
    assert.equal(r.editor.handlesVisible(), 8);
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 396, y: 300 });
    ptr(r.root, "pointerup", handleFor(r.root, id, "se"), { x: 396, y: 300 });
    await r.editor.pending();
    assert.equal(r.doc.status().historyLength, 1);
    assert.ok(r.root.querySelector("[data-handle-layer]"), "layer re-attached after re-render");
    assert.equal(r.editor.handlesVisible(), 8, "handles rebuilt on the new geometry");
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [id]);
  });

  it("detach removes handles, previews, and listeners", async () => {
    const r = await fixtureRig();
    stubLayout(r.root);
    const id = firstResizableId(r);
    click(r.root, nodeFor(r.root, id));
    assert.equal(r.editor.handlesVisible(), 8);
    ptr(r.root, "pointerdown", handleFor(r.root, id, "se"), { x: 300, y: 300 });
    ptr(r.root, "pointermove", handleFor(r.root, id, "se"), { x: 500, y: 500 });
    r.editor.detach();
    assert.equal(r.root.querySelector("[data-handle-layer]"), null, "layer removed");
    assert.equal(r.root.querySelector("[data-resize-preview]"), null, "preview removed");
    assert.equal(r.doc.snapshot().revision, 0, "detach commits nothing");
    key(r.root, "ArrowRight");
    assert.equal(r.viewer.api.snapshot().slideIndex, 1, "read-only keys restored");
  });
});
