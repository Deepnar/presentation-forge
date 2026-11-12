// What a slide editor's hands expect beyond moving and resizing: guides
// that catch edges and centres, Shift to constrain, pictures that keep
// their proportions, and copy / paste / duplicate / select all.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { snapTargets, snapMove, snapResize, keepAspect, copyElements, unionBox, PASTE_STEP } from "../packages/editor/scene-arrange.js";

const slide = (id, elements) => ({ id, width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "detached", elements });
const box = (id, x, y, w, h, extra = {}) => ({
  id, kind: "shape", x, y, w, h, z: 0, provenance: "human", shape: { form: "rect", fill: "336699" }, ...extra,
});

async function rig(scenes) {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const editor = attachEditor(viewer, doc, { root, onError: (r) => errors.push(r) });
  // 1280x720 client px for the 13.333x7.5in slide: 96 px per inch.
  root.querySelector("svg").getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 });
  return { root, viewer, doc, editor, errors };
}

function ptr(root, type, target, { x, y, shift = false, alt = false }) {
  const ev = new root.ownerDocument.defaultView.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { clientX: x, clientY: y, shiftKey: shift, altKey: alt, button: 0, pointerId: 1 });
  target.dispatchEvent(ev);
}
function key(root, k, extra = {}) {
  const ev = new root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(ev, { key: k, ...extra });
  root.dispatchEvent(ev);
}
function paste(r, files = [], text = "") {
  const ev = new r.root.ownerDocument.defaultView.Event("paste", { bubbles: true, cancelable: true });
  ev.clipboardData = { files, getData: () => text };
  r.root.dispatchEvent(ev);
  return ev;
}
const node = (r, id) => r.root.querySelector(`[data-el="${id}"]`);
const el = (r, id, slideIndex = 0) => r.doc.snapshot().scenes[slideIndex].elements.find((e) => e.id === id);

describe("snapping arithmetic", () => {
  const targets = snapTargets(slide("s", [box("a", 1, 1, 2, 1)]), []);

  it("pulls the nearest edge or centre inside the reach, and nothing outside it", () => {
    // A 2in box whose centre lands 0.03in off the slide's centre line.
    const moved = snapMove({ x: 0, y: 4, w: 2, h: 1 }, 5.6966, 0, targets, 0.0625);
    assert.ok(Math.abs(moved.dx + 1 - 13.333 / 2) < 1e-9, "centre on the slide's centre");
    assert.deepEqual(moved.guides.map((g) => g.axis), ["x"]);
    const far = snapMove({ x: 0, y: 4, w: 2, h: 1 }, 5.5, 0, targets, 0.0625);
    assert.equal(far.dx, 5.5, "out of reach stays where the hand put it");
    assert.deepEqual(far.guides, []);
  });

  it("snaps a box's top to a neighbour's bottom", () => {
    const moved = snapMove({ x: 6, y: 0, w: 1, h: 1 }, 0, 2.04, targets, 0.0625);
    assert.ok(Math.abs(moved.dy - 2) < 1e-9);
  });

  it("only the edges a resize handle drags take part", () => {
    const origin = { x: 4, y: 4, w: 2, h: 1 };
    const r = snapResize(origin, "e", 0.64, 0, targets, 0.0625);
    assert.ok(Math.abs(origin.x + origin.w + r.dx - 13.333 / 2) < 1e-9, "right edge on the centre line");
    assert.equal(snapResize(origin, "e", 0.3, 0, targets, 0.0625).dx, 0.3);
  });

  it("a corner keeps proportions from the opposite corner", () => {
    const o = { x: 2, y: 2, w: 4, h: 2 };
    assert.deepEqual(keepAspect(o, "se", { x: 2, y: 2, w: 6, h: 2.2 }), { x: 2, y: 2, w: 6, h: 3 });
    assert.deepEqual(keepAspect(o, "nw", { x: 1, y: 1.9, w: 5, h: 2.1 }), { x: 1, y: 1.5, w: 5, h: 2.5 });
    assert.deepEqual(keepAspect(o, "e", { x: 2, y: 2, w: 6, h: 2 }), { x: 2, y: 2, w: 6, h: 2 }, "edges never constrain");
  });

  it("copies are the person's own: fresh ids down a group, no compiled ownership", () => {
    let n = 0;
    const group = {
      id: "g", kind: "group", x: 1, y: 1, w: 2, h: 2, z: 30, provenance: "compiler", semanticRef: "cards", customized: true,
      group: { children: [box("c1", 0, 0, 1, 1, { provenance: "compiler", semanticRef: "card-0" })] },
    };
    const [copy] = copyElements([group], () => `h-${String(++n).padStart(12, "0")}`, 0.25, 0.25);
    assert.equal(copy.id, "h-000000000001");
    assert.equal(copy.group.children[0].id, "h-000000000002");
    assert.equal(copy.provenance, "human");
    assert.equal(copy.semanticRef, undefined);
    assert.equal(copy.customized, undefined);
    assert.equal(copy.z, undefined, "lands on top when added");
    assert.equal(copy.group.children[0].semanticRef, undefined);
    assert.deepEqual([copy.x, copy.y], [1.25, 1.25]);
    assert.deepEqual([copy.group.children[0].x, copy.group.children[0].y], [0, 0], "children stay relative");
    assert.equal(group.id, "g", "originals untouched");
  });

  it("the union box spans a selection", () => {
    assert.deepEqual(unionBox([box("a", 1, 1, 2, 1), box("b", 4, 3, 1, 1)]), { x: 1, y: 1, w: 4, h: 3 });
  });
});

describe("snapping in the editor", () => {
  it("a dragged box catches the slide's centre and shows a guide; Alt lets it go", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    r.viewer.api.select("a");
    // Box centre at 2in; the slide's centre is 6.6665in = 448 px away. Drag 445.
    ptr(r.root, "pointerdown", node(r, "a"), { x: 192, y: 144 });
    ptr(r.root, "pointermove", node(r, "a"), { x: 192 + 445, y: 144 + 200 });
    assert.ok(r.root.querySelector('[data-snap-guide="x"]'), "a vertical guide while it holds");
    ptr(r.root, "pointerup", node(r, "a"), { x: 192 + 445, y: 144 + 200 });
    await r.editor.pending();
    assert.equal(el(r, "a").x, Math.round((13.333 / 2 - 1) * 1000) / 1000, "centred");
    assert.equal(r.root.querySelector("[data-snap-guide]"), null, "guides gone after release");

    const r2 = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    r2.viewer.api.select("a");
    ptr(r2.root, "pointerdown", node(r2, "a"), { x: 192, y: 144 });
    ptr(r2.root, "pointermove", node(r2, "a"), { x: 192 + 445, y: 144 + 200, alt: true });
    ptr(r2.root, "pointerup", node(r2, "a"), { x: 192 + 445, y: 144 + 200, alt: true });
    await r2.editor.pending();
    assert.equal(el(r2, "a").x, Math.round((1 + 445 / 96) * 1000) / 1000, "Alt places it exactly");
  });

  it("Shift keeps a drag on the axis it travelled furthest", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    r.viewer.api.select("a");
    ptr(r.root, "pointerdown", node(r, "a"), { x: 192, y: 144 });
    ptr(r.root, "pointermove", node(r, "a"), { x: 392, y: 174, shift: true, alt: true });
    ptr(r.root, "pointerup", node(r, "a"), { x: 392, y: 174, shift: true, alt: true });
    await r.editor.pending();
    assert.equal(el(r, "a").y, 1, "no vertical drift");
    assert.equal(el(r, "a").x, Math.round((1 + 200 / 96) * 1000) / 1000);
  });

  it("a picture's corner keeps its proportions; Shift frees it", async () => {
    const pic = { id: "p", kind: "image", x: 1, y: 1, w: 4, h: 2, z: 0, provenance: "human", image: { src: "data:image/png;base64,iVBORw0KGgo=" } };
    const r = await rig([slide("s", [pic])]);
    r.viewer.api.select("p");
    const handle = () => r.root.querySelector('[data-handle-for="p"][data-resize-handle="se"]');
    ptr(r.root, "pointerdown", handle(), { x: 480, y: 288 });
    ptr(r.root, "pointermove", handle(), { x: 480 + 192, y: 288 + 20, alt: true });
    ptr(r.root, "pointerup", handle(), { x: 480 + 192, y: 288 + 20, alt: true });
    await r.editor.pending();
    const after = el(r, "p");
    assert.equal(after.w / after.h, 2, `kept 2:1 (${after.w}x${after.h})`);
    const r2 = await rig([slide("s", [{ ...pic, w: 6, h: 3 }])]);
    r2.viewer.api.select("p");
    const handle2 = r2.root.querySelector('[data-handle-for="p"][data-resize-handle="se"]');
    ptr(r2.root, "pointerdown", handle2, { x: 576, y: 384 });
    ptr(r2.root, "pointermove", handle2, { x: 576, y: 384 + 96, shift: true, alt: true });
    ptr(r2.root, "pointerup", handle2, { x: 576, y: 384 + 96, shift: true, alt: true });
    await r2.editor.pending();
    assert.equal(el(r2, "p").w, 6, "Shift stretches only the axis dragged");
    assert.equal(el(r2, "p").h, 4);
  });
});

describe("clipboard and duplicate", () => {
  it("Ctrl+C, Ctrl+V on the same slide steps each copy down and right, selected", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    r.viewer.api.select("a");
    key(r.root, "c", { ctrlKey: true });
    paste(r);
    await r.editor.pending();
    paste(r);
    await r.editor.pending();
    const els = r.doc.snapshot().scenes[0].elements;
    assert.equal(els.length, 3);
    assert.deepEqual(els.slice(1).map((e) => [e.x, e.y]), [[1 + PASTE_STEP, 1 + PASTE_STEP], [1 + 2 * PASTE_STEP, 1 + 2 * PASTE_STEP]]);
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [els[2].id], "the newest copy is selected");
    for (const scene of r.doc.snapshot().scenes) assert.equal(validateScene(scene).ok ?? true, true);
    await r.doc.undo();
    assert.equal(r.doc.snapshot().scenes[0].elements.length, 2, "one paste, one undo");
  });

  it("pasting onto another slide lands in place", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)]), slide("t", [])]);
    r.viewer.api.select("a");
    key(r.root, "c", { metaKey: true });
    r.viewer.api.goTo(1);
    paste(r);
    await r.editor.pending();
    const [copy] = r.doc.snapshot().scenes[1].elements;
    assert.deepEqual([copy.x, copy.y, copy.w, copy.h], [1, 1, 2, 1]);
    assert.notEqual(copy.id, "a");
  });

  it("Ctrl+D duplicates, Ctrl+X cuts, Ctrl+A selects everything selectable", async () => {
    const chrome = box("crest", 12, 0.2, 1, 1, { provenance: "compiler", locked: true });
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1), box("b", 5, 3, 1, 1), chrome])]);
    key(r.root, "a", { ctrlKey: true });
    assert.deepEqual([...r.viewer.api.snapshot().selectedIds].sort(), ["a", "b"], "locked chrome is not selectable");
    key(r.root, "d", { ctrlKey: true });
    await r.editor.pending();
    assert.equal(r.doc.snapshot().scenes[0].elements.length, 5, "both duplicated");
    assert.equal(r.doc.snapshot().scenes[0].elements.filter((e) => e.id === "crest").length, 1, "chrome never copied");
    r.viewer.api.select("a");
    key(r.root, "x", { ctrlKey: true });
    await r.editor.pending();
    assert.equal(el(r, "a"), undefined, "cut removes it");
    paste(r);
    await r.editor.pending();
    assert.equal(r.doc.snapshot().scenes[0].elements.length, 5, "and paste brings a copy back");
    assert.deepEqual(r.errors, []);
  });

  it("an image file on the system clipboard is handed to the shell, unless our copy is newer", async () => {
    const { parseHTML: ph } = await import("linkedom");
    const scenes = [slide("s", [box("a", 1, 1, 2, 1)])];
    const { document } = ph("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, scenes);
    const doc = await createDocument(structuredClone(scenes));
    const got = [];
    const editor = attachEditor(viewer, doc, { root, onPasteFiles: (f) => got.push(f) });
    const r = { root, viewer, doc, editor };
    const png = { type: "image/png", name: "shot.png" };
    assert.equal(paste(r, [png]).defaultPrevented, true);
    assert.equal(got.length, 1, "the screenshot goes to the shell to upload");
    viewer.api.select("a");
    key(root, "c", { ctrlKey: true });
    paste(r, [png], "presentation-forge/elements");
    await editor.pending();
    assert.equal(got.length, 1, "our marker on the clipboard means our copy is the newer one");
    assert.equal(doc.snapshot().scenes[0].elements.length, 2, "so the element copy is pasted");
  });

  it("with nothing selected, copy leaves the browser's own behaviour alone", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    const ev = new r.root.ownerDocument.defaultView.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(ev, { key: "c", ctrlKey: true });
    r.root.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, false);
  });
});

describe("selection box", () => {
  const sweep = async (r, from, to, extra = {}) => {
    const bg = r.root.querySelector("svg");
    ptr(r.root, "pointerdown", bg, { x: from[0], y: from[1], ...extra });
    ptr(r.root, "pointermove", bg, { x: to[0], y: to[1], ...extra });
    ptr(r.root, "pointerup", bg, { x: to[0], y: to[1], ...extra });
    await r.editor.pending();
    return [...r.viewer.api.snapshot().selectedIds].sort();
  };

  it("dragging on empty canvas selects every unit wholly inside the box", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 1, 1), box("b", 3, 1, 1, 1), box("c", 6, 1, 1, 1)])]);
    // 0.5in..4.5in across, 0.5in..2.5in down: a and b inside, c outside.
    assert.deepEqual(await sweep(r, [48, 48], [432, 240]), ["a", "b"]);
    assert.equal(r.root.querySelector("[data-marquee]"), null, "the box goes on release");
  });

  it("a unit the box only touches stays out, and Shift adds to the selection", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 1, 1), box("b", 3, 1, 1, 1), box("c", 6, 1, 1, 1)])]);
    assert.deepEqual(await sweep(r, [48, 48], [336, 240]), ["a"], "b is only half inside");
    assert.deepEqual(await sweep(r, [560, 48], [720, 240], { shift: true }), ["a", "c"]);
  });
});

describe("align and distribute", () => {
  it("one element aligns to the slide, several to their own box, in one undo", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1), box("b", 4, 2, 1, 1)])]);
    r.viewer.api.select("a");
    await r.editor.alignSelected("center");
    assert.equal(el(r, "a").x, Math.round((13.333 / 2 - 1) * 1000) / 1000, "centred on the slide");
    r.viewer.api.selectMany(["a", "b"]);
    await r.editor.alignSelected("top");
    assert.deepEqual([el(r, "a").y, el(r, "b").y], [1, 1]);
    await r.editor.alignSelected("right");
    assert.equal(el(r, "a").x + 2, el(r, "b").x + 1, "right edges meet");
    const depth = r.doc.status().historyLength;
    await r.doc.undo();
    assert.equal(r.doc.status().historyLength, depth - 1);
  });

  it("distribution spaces the middle boxes evenly and leaves the ends", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 1, 1), box("b", 2.5, 1, 2, 1), box("c", 9, 1, 1, 1)])]);
    r.viewer.api.selectMany(["a", "b", "c"]);
    await r.editor.distributeSelected("x");
    assert.equal(el(r, "a").x, 1);
    assert.equal(el(r, "c").x, 9);
    // span 1..10 = 9in, boxes 4in, two gaps of 2.5in.
    assert.equal(el(r, "b").x, 4.5);
    assert.deepEqual(r.errors, []);
  });
});

describe("shrink text to fit", () => {
  const text = (h) => slide("s", [{
    id: "t", kind: "text", x: 1, y: 1, w: 5, h, z: 0, provenance: "human",
    paragraphs: [
      { runs: [{ text: "A heading", size: 28, color: "111111" }], align: "left" },
      { runs: [{ text: "Body text that runs on for a while so that it wraps over several lines in a five inch box. ".repeat(3), size: 18, color: "111111" }], align: "left" },
    ],
  }]);

  it("scales every paragraph by one factor until the text seats, in one undo", async () => {
    const r = await rig([text(1.6)]);
    r.viewer.api.select("t");
    const result = await r.editor.shrinkTextToFit();
    assert.equal(result.ok, true);
    const [h, b] = el(r, "t").paragraphs.map((p) => p.runs[0].size);
    assert.ok(h < 28 && b < 18, `both shrank (${h}, ${b})`);
    assert.ok(h > b, "the heading stays larger than the body");
    const { overflowEstimate } = await import("../packages/editor/scene-text.js");
    assert.equal(overflowEstimate(el(r, "t")).fits, true);
    await r.doc.undo();
    assert.deepEqual(el(r, "t").paragraphs.map((p) => p.runs[0].size), [28, 18]);
  });

  it("stops at the readable floor rather than going smaller", async () => {
    const r = await rig([text(0.3)]);
    r.viewer.api.select("t");
    await r.editor.shrinkTextToFit();
    assert.ok(el(r, "t").paragraphs.every((p) => p.runs[0].size >= 9));
  });
});

describe("group and ungroup", () => {
  it("Ctrl+G groups, the group moves as one, Ctrl+Shift+G puts the members back", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1, { z: 0 }), box("b", 4, 3, 1, 1, { z: 1 }), box("c", 8, 1, 1, 1, { z: 2 })])]);
    r.viewer.api.selectMany(["a", "b"]);
    key(r.root, "g", { ctrlKey: true });
    await r.editor.pending();
    const els = r.doc.snapshot().scenes[0].elements;
    const g = els.find((e) => e.kind === "group");
    assert.ok(g, "a group exists");
    assert.deepEqual([g.x, g.y, g.w, g.h], [1, 1, 4, 3]);
    assert.deepEqual(g.group.children.map((c) => [c.id, c.x, c.y]), [["a", 0, 0], ["b", 3, 2]]);
    assert.equal(g.z, 1, "sits where the topmost member sat, still under c");
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [g.id]);
    assert.equal(validateScene(r.doc.snapshot().scenes[0]).ok ?? true, true);
    key(r.root, "ArrowRight", { shiftKey: true });
    await r.editor.pending();
    key(r.root, "g", { ctrlKey: true, shiftKey: true });
    await r.editor.pending();
    const back = r.doc.snapshot().scenes[0].elements;
    assert.equal(back.some((e) => e.kind === "group"), false);
    assert.ok(el(r, "a").x > 1 && el(r, "b").x > 4, "members moved with the group");
    assert.equal(el(r, "b").x - el(r, "a").x, 3, "and kept their spacing");
    assert.deepEqual([...r.viewer.api.snapshot().selectedIds].sort(), ["a", "b"]);
    assert.deepEqual(r.errors, []);
  });

  it("grouping is one undo, and lines are refused plainly", async () => {
    const line = { id: "l", kind: "line", x: 1, y: 5, w: 3, h: 0.01, z: 3, provenance: "human", line: { x2: 4, y2: 5, stroke: "333333", strokeWidth: 2 } };
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1), box("b", 4, 3, 1, 1), line])]);
    r.viewer.api.selectMany(["a", "b"]);
    await r.editor.groupSelected();
    await r.editor.undo();
    assert.deepEqual(r.doc.snapshot().scenes[0].elements.map((e) => e.id), ["a", "b", "l"]);
    r.viewer.api.selectMany(["a", "l"]);
    const refused = await r.editor.groupSelected();
    assert.equal(refused.ok, false);
    assert.match(refused.message, /Lines can't be grouped/);
  });

  it("moving a line carries its far end, so it moves instead of stretching", async () => {
    const line = { id: "l", kind: "line", x: 1, y: 5, w: 3, h: 0.01, z: 0, provenance: "human", line: { x2: 4, y2: 5, stroke: "333333", strokeWidth: 2 } };
    const r = await rig([slide("s", [line])]);
    r.viewer.api.select("l");
    key(r.root, "ArrowDown", { shiftKey: true });
    await r.editor.pending();
    const moved = el(r, "l");
    assert.equal(moved.line.x2 - moved.x, 3, "same length");
    assert.equal(moved.line.y2, moved.y, "still level");
    await r.doc.undo();
    assert.deepEqual([el(r, "l").y, el(r, "l").line.y2], [5, 5]);
  });
});

describe("rotation", () => {
  it("the knob turns a box about its centre; it settles on right angles and Shift steps by 15°", async () => {
    const r = await rig([slide("s", [box("a", 1, 1, 2, 1)])]);
    r.viewer.api.select("a");
    const knob = () => r.root.querySelector('[data-rotate-handle][data-handle-for="a"]');
    assert.ok(knob(), "a selected box shows the knob");
    // Centre (192, 144) px; due right of it is 90°, 2° off still lands on 90.
    ptr(r.root, "pointerdown", knob(), { x: 192, y: 100 });
    ptr(r.root, "pointermove", knob(), { x: 400, y: 137 });
    ptr(r.root, "pointerup", knob(), { x: 400, y: 137 });
    await r.editor.pending();
    assert.equal(el(r, "a").rotation, 90);
    assert.deepEqual([el(r, "a").x, el(r, "a").y, el(r, "a").w, el(r, "a").h], [1, 1, 2, 1], "the box itself is unchanged");
    assert.match(r.root.querySelector("svg").outerHTML, /rotate\(90 192\.0 144\.0\)/);
    // The commit redrew the slide, which drops the harness's size stub.
    r.root.querySelector("svg").getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 });
    r.viewer.api.select("a");
    ptr(r.root, "pointerdown", knob(), { x: 192, y: 100 });
    ptr(r.root, "pointermove", knob(), { x: 300, y: 50, shift: true });
    ptr(r.root, "pointerup", knob(), { x: 300, y: 50, shift: true });
    await r.editor.pending();
    assert.notEqual(el(r, "a").rotation, 90, "the second turn landed");
    assert.equal(el(r, "a").rotation % 15, 0, `stepped (${el(r, "a").rotation})`);
    await r.editor.undo();
    assert.equal(el(r, "a").rotation, 90, "one undo per turn");
  });

  it("upright is absence, angles normalise, and lines, charts and tables do not rotate", async () => {
    const { createDocument: create } = await import("../packages/model/engine.ts");
    const doc = await create([slide("s", [box("a", 1, 1, 2, 1)])]);
    const turn = (rotation, id = "a") => doc.apply({ id: `e${Math.random()}`, slideId: "s", op: { type: "element.setRotation", id, rotation }, baseRevision: doc.snapshot().revision, actor: "human" });
    await turn(270);
    assert.equal(doc.snapshot().scenes[0].elements[0].rotation, -90);
    await turn(360);
    assert.equal("rotation" in doc.snapshot().scenes[0].elements[0], false);
  });

  it("the native export carries the rotation", async () => {
    const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
    const JSZip = (await import("jszip")).default;
    const bytes = await renderPptx([slide("s", [box("a", 1, 1, 2, 1, { rotation: 30 })])]);
    const xml = await (await JSZip.loadAsync(bytes)).files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /rot="1800000"/);
  });
});

describe("which boxes overflow on a slide", () => {
  it("lists editable text and tables that do not fit, inside groups too, and nothing hidden or locked", async () => {
    const { sceneOverflow } = await import("../packages/editor/scene-text.js");
    const long = (id, extra = {}) => ({ id, kind: "text", x: 1, y: 1, w: 1, h: 0.3, z: 0, provenance: "human", paragraphs: [{ runs: [{ text: "word ".repeat(40), size: 14, color: "111111" }] }], ...extra });
    const fine = { id: "ok", kind: "text", x: 1, y: 3, w: 4, h: 1, z: 0, provenance: "human", paragraphs: [{ runs: [{ text: "Short", size: 14, color: "111111" }] }] };
    const scene = slide("s", [
      long("a"), fine, long("hidden", { hidden: true }), long("locked", { locked: true }),
      { id: "g", kind: "group", x: 5, y: 1, w: 2, h: 2, z: 1, provenance: "human", group: { children: [long("inner")] } },
    ]);
    assert.deepEqual(sceneOverflow(scene), ["a", "inner"]);
    assert.deepEqual(sceneOverflow(slide("t", [fine])), []);
  });
});
