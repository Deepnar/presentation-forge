// @forge/editor — scene-edit. Browser interaction adapter binding
// a scene-dom viewer to a command-engine document. The browser owns
// input mechanics and temporary drag state; every authoritative
// change crosses the engine as an envelope, and the viewer
// re-renders from engine snapshots via replaceScenes. No React,
// no server: the shell creates the document, attaches this, and
// forwards undo/redo buttons into it. Read-only viewers never load
// this module.
//
// Selection ownership stays with the viewer at all times; the
// adapter reads it, never stores its own copy.
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

// Documented keybinding contract (see the viewer toolbar hint and
// docs/V2-5C-EVAL.md): arrows move selection, Shift+arrows move
// further, Delete/Backspace removes, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
// (or Ctrl+Y) undo and redo. Arrows navigate slides when nothing is
// selected or the viewer is read-only.
export const NUDGE_STEP = 0.05; // inches per arrow press
export const NUDGE_LARGE_STEP = 0.25; // inches with Shift held
export const DRAG_THRESHOLD_PX = 4; // client px before a press becomes a drag

const IN = 96; // svg px per scene inch, matching scene-svg.js

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

function findIn(docScenes, slideId, id) {
  const slide = docScenes.find((s) => s.id === slideId);
  if (!slide) return null;
  const walk = (els) => {
    for (const el of els ?? []) {
      if (el.id === id) return el;
      const found = walk(el.group?.children);
      if (found) return found;
    }
    return null;
  };
  return walk(slide.elements);
}

// Coordinate spaces: client (screen) px → rendered SVG bounding-box
// px → SVG viewBox units → authoritative scene inches. For a slide
// W×H inches rendered R×S client px, client px per inch is R/W
// (and S/H). Equivalently with the SVG-unit model (96 px per inch):
// client px per SVG px kx = R/(W·96), ky = S/(H·96), so device
// deltas DIVIDE by k. Multiplying inflates movement by k² at zoom
// k — the V2-5C-1 correction (100 client px at 200% is 50 SVG px,
// not 200). Scales derive per axis so non-uniform rendering can
// never silently shear a drag; today's stage is exactly 16:9, so
// kx and ky agree in practice.
//
// Rendered SVG px per client px from live layout; null without
// layout (linkedom) so drag commits degrade to an explicit error
// there instead of guessing geometry.
export function svgScales(root) {
  const svg = root.querySelector("svg");
  const rect = svg?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  const kx = rect.width / (SCENE_W * IN);
  const ky = rect.height / (SCENE_H * IN);
  if (!(kx > 0) || !(ky > 0)) return null;
  return { kx, ky };
}

// One central conversion used by preview and commit alike, so the
// two can never drift: client-pixel deltas to SVG-unit deltas.
export function clientToSvgDelta(dxClient, dyClient, scales) {
  return { dx: dxClient / scales.kx, dy: dyClient / scales.ky };
}

export function attachEditor(viewer, doc, opts = {}) {
  const root = opts.root ?? null;
  if (!viewer?.api || !doc || !root) throw new Error("scene-edit: viewer, engine document, and root required");
  const onError = typeof opts.onError === "function" ? opts.onError : null;
  const onSync = typeof opts.onSync === "function" ? opts.onSync : null;
  const api = viewer.api;
  let drag = null;
  let pending = Promise.resolve(null);
  const track = (p) => {
    pending = Promise.resolve(p);
    return pending;
  };

  function report(result) {
    if (!result.ok && onError) onError(result);
    return result;
  }

  function sync() {
    const scenes = doc.snapshot().scenes;
    api.replaceScenes(scenes);
    if (onSync) onSync(scenes);
    return api.snapshot();
  }

  function originsFor(ids, slideId) {
    const docScenes = doc.snapshot().scenes;
    const out = [];
    for (const id of ids) {
      const el = findIn(docScenes, slideId, id);
      if (el) out.push({ id, x: el.x, y: el.y });
    }
    return out;
  }

  async function submitMoveLike(ops, baseRevision) {
    let result;
    if (ops.length === 1) {
      const [placed] = ops;
      result = await doc.apply({
        id: `edit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        slideId: placed.slideId, op: placed.op, baseRevision, actor: "human",
      });
    } else {
      result = await doc.applyBatch({
        id: `edit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        baseRevision, actor: "human", ops,
      });
    }
    if (result.ok) sync();
    return report(result);
  }

  function clearPreview() {
    if (!drag) return;
    for (const node of drag.nodes) node.removeAttribute("transform");
    drag = null;
    api.reposition();
  }

  function previewTo(clientX, clientY) {
    if (!drag) return;
    const scales = svgScales(root);
    if (!scales) return;
    const { dx, dy } = clientToSvgDelta(clientX - drag.startX, clientY - drag.startY, scales);
    if (!drag.moved && Math.hypot(clientX - drag.startX, clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    for (const node of drag.nodes) {
      node.setAttribute("transform", `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
    }
    api.reposition();
  }

  function onPointerDown(ev) {
    if (drag) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    const id = api.resolveNode(ev.target);
    if (id === null) return;
    const snap = api.snapshot();
    if (ev.shiftKey) api.toggle(id);
    else if (!snap.selectedIds.includes(id)) api.select(id);
    api.suppressNextClick();
    const slideId = api.snapshot().slideId;
    const origins = originsFor(api.snapshot().selectedIds, slideId);
    if (origins.length === 0) return;
    try {
      root.setPointerCapture?.(ev.pointerId);
    } catch { /* linkedom and some browsers lack capture */ }
    const nodes = [];
    for (const o of origins) {
      const node = root.querySelector(`[data-el="${o.id}"]`);
      if (node) nodes.push(node);
    }
    drag = {
      pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY,
      slideId, origins, nodes, moved: false,
      collapseTo: !ev.shiftKey && snap.selectedIds.includes(id) && snap.selectedIds.length > 1 ? id : null,
    };
    ev.preventDefault();
  }

  async function onPointerUp(ev) {
    if (!drag || (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    for (const node of d.nodes) node.removeAttribute("transform");
    api.reposition();
    if (!d.moved) {
      if (d.collapseTo) api.select(d.collapseTo);
      return { ok: true, revision: doc.snapshot().revision, noop: true };
    }
    const scales = svgScales(root);
    if (!scales) return report({ ok: false, code: "op-rejected", message: "no layout to project the drag through" });
    // Release coordinates decide the commit (not the last move
    // event), through the same conversion as the preview.
    const { dx, dy } = clientToSvgDelta(ev.clientX - d.startX, ev.clientY - d.startY, scales);
    const ops = d.origins.map((o) => ({
      slideId: d.slideId,
      op: {
        type: "element.move", id: o.id,
        x: r3(o.x + dx / IN),
        y: r3(o.y + dy / IN),
      },
    }));
    return track(submitMoveLike(ops, doc.snapshot().revision));
  }

  function onPointerMove(ev) {
    if (!drag) return;
    if (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId) return;
    previewTo(ev.clientX, ev.clientY);
  }

  function onPointerCancel(ev) {
    if (!drag || (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) return;
    clearPreview();
  }

  function onKeyDown(ev) {
    // scene-dom's own listener (registered first) already cleared
    // selection on Escape; here only the drag preview is cancelled.
    if (ev.key === "Escape" && drag) clearPreview();
  }

  async function nudgeSelected(key, shift) {
    const snap = api.snapshot();
    if (snap.selectedIds.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const step = shift ? NUDGE_LARGE_STEP : NUDGE_STEP;
    const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0;
    const dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
    const origins = originsFor(snap.selectedIds, snap.slideId);
    const missing = snap.selectedIds.filter((id) => !origins.some((o) => o.id === id));
    // A stale selection fails the whole batch explicitly — never a
    // silent partial move of the members that still resolve.
    if (missing.length > 0) {
      return report({ ok: false, code: "unknown-element", message: `selection left the document: ${missing.join(",")}` });
    }
    const ops = origins.map((o) => ({
      slideId: snap.slideId,
      op: { type: "element.move", id: o.id, x: r3(o.x + dx), y: r3(o.y + dy) },
    }));
    return track(submitMoveLike(ops, doc.snapshot().revision));
  }

  async function deleteSelected() {
    const snap = api.snapshot();
    if (snap.selectedIds.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const missing = snap.selectedIds.filter((id) => !originsFor([id], snap.slideId).length);
    if (missing.length > 0) {
      return report({ ok: false, code: "unknown-element", message: `selection left the document: ${missing.join(",")}` });
    }
    const ops = snap.selectedIds.map((id) => ({ slideId: snap.slideId, op: { type: "element.delete", id } }));
    return track(submitMoveLike(ops, doc.snapshot().revision));
  }

  async function undo() {
    const result = await doc.undo();
    if (result.ok) sync();
    return track(report(result));
  }

  async function redo() {
    const result = await doc.redo();
    if (result.ok) sync();
    return track(report(result));
  }

  async function onEditAction(action) {
    if (action.type === "nudge") return track(nudgeSelected(action.key, !!action.shift));
    if (action.type === "delete") return track(deleteSelected());
    if (action.type === "undo") {
      if (drag) clearPreview();
      return track(undo());
    }
    if (action.type === "redo") {
      if (drag) clearPreview();
      return track(redo());
    }
    return null;
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerCancel);
  root.addEventListener("keydown", onKeyDown);
  api.setEditable(true);
  api.onEditAction(onEditAction);

  return {
    nudgeSelected: (key, shift = false) => nudgeSelected(key, shift),
    deleteSelected: () => deleteSelected(),
    undo: () => undo(),
    redo: () => redo(),
    revision: () => doc.snapshot().revision,
    pending: () => pending,
    detach() {
      if (drag) clearPreview();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("keydown", onKeyDown);
      api.setEditable(false);
      api.onEditAction(null);
    },
  };
}
