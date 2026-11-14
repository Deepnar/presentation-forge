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
import { SCENE_W, SCENE_H, isSystemChrome } from "../model/scene-constants.ts";
import { SNAP_PX, PASTE_STEP, unionBox, snapTargets, snapMove, snapResize, constrainAxis, keepAspect, copyElements, alignMoves, distributeMoves, groupElements, ungroupElement, visualBox, toLocal, toWorld, rotatedResize, slideFromLayout } from "./scene-arrange.js";
import {
  isEditableText,
  describeStructure,
  paragraphsToDraft,
  buildUpdatedParagraphs,
  defaultTextElement,
  defaultShapeElement, defaultImageElement, defaultIconElement,
  overflowEstimate,
  measureText,
  tableOverflowEstimate,
  blankSlide,
  mintHumanId,
  mintSlideId,
  cascadeBox,
  cascadeIndex,
  CASCADE_STEP,
  CASCADE_CYCLE,
} from "./scene-text.js";
import {
  buildLayoutScene,
  getLayoutTemplate,
  collectSceneIds,
  buildInsertElement,
} from "./layout-templates.js";

// Documented keybinding contract (see the viewer toolbar hint and
// docs/V2-5C-EVAL.md): arrows move selection, Shift+arrows move
// further, Delete/Backspace removes, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
// (or Ctrl+Y) undo and redo. Arrows navigate slides when nothing is
// selected or the viewer is read-only.
export const NUDGE_STEP = 0.05; // inches per arrow press
export const NUDGE_LARGE_STEP = 0.25; // inches with Shift held
export const DRAG_THRESHOLD_PX = 4; // client px before a press becomes a drag
export const MIN_RESIZE_IN = 0.1; // floor for resized extents, in scene inches
export const SHRINK_FLOOR_PT = 9; // shrink-to-fit never sets text smaller than this
const ROTATABLE_KINDS = new Set(["text", "shape", "image"]);
// Resize-handle vocabulary: eight anchors with per-handle cursors.
// Only the full set is ever rendered — every handle below has a
// correct implementation through element.setGeometry (§4).
export const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const HANDLE_CURSORS = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
};
// Kinds a resize box may model safely: the box owns x/y/w/h and the
// renderers project it verbatim. Groups (children would need
// rescaling, not re-boxing), lines (absolute x2/y2 endpoints), and
// tables (absolute colWidths summing to w) are explicitly refused.
export const RESIZABLE_KINDS = new Set(["text", "shape", "image", "chart"]);

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

// Pure resize math, shared by preview and commit so the two can
// never drift: an origin box plus a handle plus a scene-inch delta
// yields the new box. Corner handles move the origin and shrink the
// extent; edge handles move one axis. Extents clamp at MIN_RESIZE_IN
// holding the opposite edge, so a west drag past the east edge parks
// at the floor instead of inverting or NaN-ing.
// `floor(w)`, when given, is the least height the element's content
// needs at width w: a text box stops at its text the way PowerPoint and
// Canva boxes do, rather than accepting a box its text spills out of.
// `slideH` caps that floor at the slide edge so a box never grows off
// the slide to seat text that cannot fit anyway.
export function resizeGeometry(origin, handle, dxIn, dyIn, { floor, slideH, aspect } = {}) {
  for (const v of [origin.x, origin.y, origin.w, origin.h, dxIn, dyIn]) {
    if (!Number.isFinite(v)) throw new Error("scene-edit: non-finite resize geometry");
  }
  let x = origin.x;
  let y = origin.y;
  let w = origin.w;
  let h = origin.h;
  if (handle.includes("e")) w = origin.w + dxIn;
  if (handle.includes("s")) h = origin.h + dyIn;
  if (handle.includes("w")) {
    x = origin.x + dxIn;
    w = origin.w - dxIn;
  }
  if (handle.includes("n")) {
    y = origin.y + dyIn;
    h = origin.h - dyIn;
  }
  if (!(w >= MIN_RESIZE_IN)) {
    if (handle.includes("w")) x = origin.x + origin.w - MIN_RESIZE_IN;
    w = MIN_RESIZE_IN;
  }
  if (!(h >= MIN_RESIZE_IN)) {
    if (handle.includes("n")) y = origin.y + origin.h - MIN_RESIZE_IN;
    h = MIN_RESIZE_IN;
  }
  if (aspect) ({ x, y, w, h } = keepAspect(origin, handle, { x, y, w, h }));
  if (floor) {
    const room = handle.includes("n") ? origin.y + origin.h : (slideH ?? Infinity) - y;
    // Rounded up, so the committed box holds the text after the
    // three-decimal rounding below rather than falling a hair short.
    const least = Math.min(Math.ceil(floor(w) * 1000 - 1e-6) / 1000, Math.max(room, MIN_RESIZE_IN));
    if (Number.isFinite(least) && h < least) {
      h = least;
      if (handle.includes("n")) y = origin.y + origin.h - least;
    }
  }
  if (![x, y, w, h].every(Number.isFinite)) {
    throw new Error("scene-edit: non-finite resize geometry");
  }
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

export function attachEditor(viewer, doc, opts = {}) {
  const root = opts.root ?? null;
  if (!viewer?.api || !doc || !root) throw new Error("scene-edit: viewer, engine document, and root required");
  const onError = typeof opts.onError === "function" ? opts.onError : null;
  // Advice, not failure: the edit went through and something about the
  // result is worth saying (text longer than a box that cannot grow).
  const onNotice = typeof opts.onNotice === "function" ? opts.onNotice : null;
  // Image files pasted onto the slide: uploading belongs to the shell
  // (it knows the project), placing them to addImageElement.
  const onPasteFiles = typeof opts.onPasteFiles === "function" ? opts.onPasteFiles : null;
  const notice = (n) => { if (onNotice) onNotice(n); };
  const slideHeight = (slideId) => doc.snapshot().scenes.find((sc) => sc.id === slideId)?.height ?? SCENE_H;
  // The ops that commit a text change and, when the text no longer fits,
  // grow its box down to seat it (never past the slide's bottom edge) —
  // one batch, so one undo takes back both.
  function withGrowToFit(slideId, el, paragraphs, op) {
    const ops = [{ slideId, op }];
    if (el.kind !== "text") return ops;
    const need = Math.ceil((measureText(el, el.w, paragraphs)?.height ?? 0) * 1000 - 1e-6) / 1000;
    const h = Math.min(need, r3(slideHeight(slideId) - el.y));
    if (h > el.h + 1e-6) ops.push({ slideId, op: { type: "element.setGeometry", id: el.id, x: el.x, y: el.y, w: el.w, h } });
    return ops;
  }
  function submitOps(ops, baseRevision) {
    if (ops.length === 1) return doc.apply({ id: newEditId(), slideId: ops[0].slideId, op: ops[0].op, baseRevision, actor: "human" });
    return doc.applyBatch({ id: newEditId(), baseRevision, actor: "human", ops });
  }
  function noticeOverflow(slideId, id) {
    const fresh = findIn(doc.snapshot().scenes, slideId, id);
    const overflow = fresh?.kind === "text" ? overflowEstimate(fresh) : null;
    if (overflow && !overflow.fits) notice({ code: "overflow", elementId: id, message: overflow.message });
    return overflow;
  }
  const onSync = typeof opts.onSync === "function" ? opts.onSync : null;
  const onTextEdit = typeof opts.onTextEdit === "function" ? opts.onTextEdit : null;
  const api = viewer.api;
  let drag = null;
  let marquee = null;
  // Fast double-click on an unselected element selects on the first
  // press — which reveals the inspector and shifts the stage — so the
  // second press can land on the background beside the target. The
  // adapter remembers a freshly single-selected unit briefly so that
  // dblclick still reaches it. Time-bounded (600ms) and selection-
  // checked, so a later background dblclick never edits stale state.
  let lastSingleSelect = null;
  const SINGLE_SELECT_WINDOW_MS = 600;
  let pending = Promise.resolve(null);
  const track = (p) => {
    pending = Promise.resolve(p);
    return pending;
  };
  const newEditId = () =>
    `edit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  // V2-5D inline text session: one editing draft per adapter, owned
  // here (never in React, never as DOM mutations on the authoritative
  // SVG). Typing touches only session.draft; exactly one
  // element.updateText envelope commits on success, none on cancel
  // or on an unchanged draft. The engine still sets
  // contentCustomized — never duplicated here.
  let textSession = null;

  function notifyText(info = {}) {
    if (onTextEdit) {
      try {
        onTextEdit({
          editing: textSession !== null,
          elementId: textSession?.elementId ?? info.elementId ?? null,
          slideId: textSession?.slideId ?? info.slideId ?? null,
          draft: textSession?.draft ?? null,
          ...info,
        });
      } catch { /* status-only */ }
    }
  }

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
        id: newEditId(),
        slideId: placed.slideId, op: placed.op, baseRevision, actor: "human",
      });
    } else {
      result = await doc.applyBatch({
        id: newEditId(),
        baseRevision, actor: "human", ops,
      });
    }
    if (result.ok) sync();
    return report(result);
  }

  function clearPreview() {
    if (!drag) return;
    drawGuides([]);
    for (const node of drag.nodes) node.removeAttribute("transform");
    drag = null;
    api.reposition();
  }

  // Inches a guide catches from, for the stage as it is drawn now.
  const snapReach = (scales) => SNAP_PX / (scales.kx * IN);

  // The move a drag means, in scene inches: Shift keeps it on one axis,
  // and edges and centres snap to the slide and its neighbours unless Alt
  // is held — the PowerPoint and Canva conventions. Preview and commit
  // both read this, so the box lands where its preview showed it.
  function dragDelta(d, clientX, clientY, mods, scales) {
    const raw = clientToSvgDelta(clientX - d.startX, clientY - d.startY, scales);
    let dx = raw.dx / IN, dy = raw.dy / IN;
    if (mods.shiftKey) ({ dx, dy } = constrainAxis(dx, dy));
    if (mods.altKey || !d.box) return { dx, dy, guides: [] };
    const snapped = snapMove(d.box, dx, dy, d.targets, snapReach(scales));
    if (mods.shiftKey) {
      if (dy === 0) snapped.dy = 0;
      if (dx === 0) snapped.dx = 0;
      snapped.guides = snapped.guides.filter((g) => (g.axis === "x" ? dx !== 0 : dy !== 0));
    }
    return snapped;
  }

  function drawGuides(guides) {
    ensureHandleLayer();
    if (!handleLayer) return;
    for (const old of handleLayer.querySelectorAll("[data-snap-guide]")) old.remove();
    const docEl = root.ownerDocument;
    // The layer is drawn at the stage's zoom, so a hairline is one
    // screen pixel divided by it — otherwise a fitted slide thins it away.
    const k = svgScales(root)?.kx ?? 1;
    const t = `${(1 / k).toFixed(2)}px`;
    const slide = doc.snapshot().scenes.find((sc) => sc.id === api.snapshot().slideId);
    const W = (slide?.width ?? SCENE_W) * IN, H = (slide?.height ?? SCENE_H) * IN;
    for (const g of guides) {
      const line = docEl.createElement("div");
      line.setAttribute("data-snap-guide", g.axis);
      line.style.position = "absolute";
      line.style.pointerEvents = "none";
      line.style.background = "#e0409a";
      if (g.axis === "x") Object.assign(line.style, { left: `${(g.at * IN - 0.5 / k).toFixed(1)}px`, top: "0px", width: t, height: `${H}px` });
      else Object.assign(line.style, { top: `${(g.at * IN - 0.5 / k).toFixed(1)}px`, left: "0px", height: t, width: `${W}px` });
      handleLayer.appendChild(line);
    }
  }

  function previewTo(clientX, clientY, mods = {}) {
    if (!drag) return;
    const scales = svgScales(root);
    if (!scales) return;
    if (!drag.moved && Math.hypot(clientX - drag.startX, clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const { dx, dy, guides } = dragDelta(drag, clientX, clientY, mods, scales);
    for (const node of drag.nodes) {
      // A rotated element is drawn inside its rotation, so a screen-space
      // move has to be expressed in its own frame or it slides sideways.
      const deg = drag.rotations.get(node) ?? 0;
      const t = deg ? toLocal(dx, dy, deg) : { dx, dy };
      node.setAttribute("transform", `translate(${(t.dx * IN).toFixed(1)} ${(t.dy * IN).toFixed(1)})`);
    }
    api.reposition();
    drawGuides(guides);
  }

  function onPointerDown(ev) {
    // Text-edit mode disables dragging: the press belongs to the
    // textarea caret, never to a move. Selection is left untouched.
    if (textSession) return;
    if (drag) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    // Resize handles own their press: starting a move here would
    // drag the whole element instead of reshaping it.
    const knob = ev.target?.closest?.("[data-rotate-handle]");
    if (knob) {
      ev.preventDefault();
      beginRotate(knob.getAttribute("data-handle-for"), ev);
      return;
    }
    const handleNode = ev.target?.closest?.("[data-resize-handle]");
    if (handleNode) {
      if (resize) return;
      ev.preventDefault();
      beginResize(
        handleNode.getAttribute("data-resize-handle"),
        handleNode.getAttribute("data-handle-for"),
        ev,
      );
      return;
    }
    if (resize) return;
    // Fast double-click on an unselected element selects on the first
    // press — which reveals the inspector and shifts the stage — so
    // the second press can land on the background. Hold the freshly
    // single-selected unit through the clearing click that follows,
    // so the dblclick event still reaches it. Editing itself never
    // opens here: a press may still become a drag, and entering
    // edit mode on press would hijack rapid successive drags.
    if (lastSingleSelect && Date.now() - lastSingleSelect.t < SINGLE_SELECT_WINDOW_MS) {
      const held = api.snapshot();
      if (held.selectedIds.length === 1 && held.selectedIds[0] === lastSingleSelect.id && api.resolveNode(ev.target) === null) {
        api.suppressNextClick();
      }
    }
    const id = api.resolveNode(ev.target);
    if (id === null) {
      // A press on empty canvas starts a selection box, as in every slide
      // editor; a plain click there still clears the selection.
      marquee = { pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, additive: !!ev.shiftKey, base: api.snapshot().selectedIds, moved: false };
      return;
    }
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
    const rotations = new Map();
    for (const o of origins) {
      const node = root.querySelector(`[data-el="${o.id}"]`);
      if (!node) continue;
      nodes.push(node);
      const deg = findIn(doc.snapshot().scenes, slideId, o.id)?.rotation;
      if (deg) rotations.set(node, deg);
    }
    const docScene = doc.snapshot().scenes.find((sc) => sc.id === slideId);
    const selected = api.snapshot().selectedIds.map((sid) => findIn(doc.snapshot().scenes, slideId, sid)).filter(Boolean);
    drag = {
      pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY,
      slideId, origins, nodes, rotations, moved: false,
      box: unionBox(selected), targets: snapTargets(docScene, selected.map((e) => e.id)),
      collapseTo: !ev.shiftKey && snap.selectedIds.includes(id) && snap.selectedIds.length > 1 ? id : null,
    };
    ev.preventDefault();
  }

  // The selection box in SVG px (the overlay's units) from two client
  // points, through the slide's own rendered rect.
  function marqueeRect(m, clientX, clientY) {
    const svg = root.querySelector("svg");
    const rect = svg?.getBoundingClientRect?.();
    const scales = svgScales(root);
    if (!rect || !scales) return null;
    const ax = (m.startX - rect.left) / scales.kx, ay = (m.startY - rect.top) / scales.ky;
    const bx = (clientX - rect.left) / scales.kx, by = (clientY - rect.top) / scales.ky;
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }

  function drawMarquee(r) {
    ensureHandleLayer();
    let box = handleLayer?.querySelector("[data-marquee]");
    if (!r) { box?.remove(); return; }
    if (!box) {
      box = root.ownerDocument.createElement("div");
      box.setAttribute("data-marquee", "");
      box.setAttribute("data-snap-guide", "marquee");
      Object.assign(box.style, { position: "absolute", pointerEvents: "none", border: "1px solid #3b82f6", background: "rgba(59,130,246,0.12)", boxSizing: "border-box" });
      handleLayer.appendChild(box);
    }
    const k = svgScales(root)?.kx ?? 1;
    Object.assign(box.style, { left: `${r.x.toFixed(1)}px`, top: `${r.y.toFixed(1)}px`, width: `${r.w.toFixed(1)}px`, height: `${r.h.toFixed(1)}px`, borderWidth: `${(1 / k).toFixed(2)}px` });
  }

  // Every unit wholly inside the box — PowerPoint's rule, which keeps a
  // full-slide panel behind the content from joining every sweep.
  function unitsInside(r) {
    return api.selectableIds().filter((id) => {
      const b = api.bounds(id);
      return b && b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.w <= r.x + r.w + 0.5 && b.y + b.h <= r.y + r.h + 0.5;
    });
  }

  async function onPointerUp(ev) {
    if (rotating) {
      if (ev.pointerId !== undefined && ev.pointerId !== rotating.pointerId) return null;
      return track(commitRotate(ev));
    }
    if (marquee) {
      if (ev.pointerId !== undefined && ev.pointerId !== marquee.pointerId) return null;
      const m = marquee;
      marquee = null;
      drawMarquee(null);
      if (!m.moved) return null;
      const r = marqueeRect(m, ev.clientX, ev.clientY);
      const inside = r ? unitsInside(r) : [];
      api.selectMany(m.additive ? [...new Set([...m.base, ...inside])] : inside);
      api.suppressNextClick();
      return { ok: true, revision: doc.snapshot().revision, selected: api.snapshot().selectedIds.length };
    }
    if (resize) {
      if (ev.pointerId !== undefined && ev.pointerId !== resize.pointerId) return null;
      return commitResize(ev);
    }
    if (!drag || (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;
    for (const node of d.nodes) node.removeAttribute("transform");
    api.reposition();
    if (!d.moved) {
      if (d.collapseTo) api.select(d.collapseTo);
      const s = api.snapshot();
      lastSingleSelect = s.selectedIds.length === 1 ? { id: s.selectedIds[0], t: Date.now() } : null;
      return { ok: true, revision: doc.snapshot().revision, noop: true };
    }
    const scales = svgScales(root);
    if (!scales) return report({ ok: false, code: "op-rejected", message: "no layout to project the drag through" });
    // Release coordinates decide the commit (not the last move
    // event), through the same conversion as the preview.
    drawGuides([]);
    const { dx, dy } = dragDelta(d, ev.clientX, ev.clientY, ev, scales);
    const ops = d.origins.map((o) => ({
      slideId: d.slideId,
      op: {
        type: "element.move", id: o.id,
        x: r3(o.x + dx),
        y: r3(o.y + dy),
      },
    }));
    return track(submitMoveLike(ops, doc.snapshot().revision));
  }

  function onPointerMove(ev) {
    if (rotating) {
      if (ev.pointerId !== undefined && ev.pointerId !== rotating.pointerId) return;
      previewRotate(ev.clientX, ev.clientY, ev);
      return;
    }
    if (marquee) {
      if (ev.pointerId !== undefined && ev.pointerId !== marquee.pointerId) return;
      if (!marquee.moved && Math.hypot(ev.clientX - marquee.startX, ev.clientY - marquee.startY) < DRAG_THRESHOLD_PX) return;
      if (!marquee.moved) {
        marquee.moved = true;
        try { root.setPointerCapture?.(ev.pointerId); } catch { /* linkedom and some browsers lack capture */ }
      }
      drawMarquee(marqueeRect(marquee, ev.clientX, ev.clientY));
      return;
    }
    if (resize) {
      if (ev.pointerId !== undefined && ev.pointerId !== resize.pointerId) return;
      previewResizeTo(ev.clientX, ev.clientY, ev);
      return;
    }
    if (!drag) return;
    if (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId) return;
    previewTo(ev.clientX, ev.clientY, ev);
  }

  function onPointerCancel(ev) {
    if (rotating) { cancelRotate(); return; }
    if (marquee) {
      marquee = null;
      drawMarquee(null);
      return;
    }
    if (resize) {
      if (ev.pointerId !== undefined && ev.pointerId !== resize.pointerId) return;
      cancelResize();
      return;
    }
    if (!drag || (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId)) return;
    clearPreview();
  }

  function onKeyDown(ev) {
    // scene-dom's own listener (registered first) already cleared
    // selection on Escape; here only the drag preview is cancelled.
    if (ev.key === "Escape" && drag) clearPreview();
    if (ev.key === "Escape" && marquee) { marquee = null; drawMarquee(null); }
    if (ev.key === "Escape" && rotating) cancelRotate();
    // Escape abandons a resize gesture with no history entry (the
    // selection clear above stands — documented §4 behavior).
    if (ev.key === "Escape" && resize) cancelResize();
    // Enter on a single selected text element opens text-edit mode
    // (double-click is the pointer equivalent). Never from form
    // fields or buttons — those own the key.
    if (
      !textSession && !drag && ev.key === "Enter" &&
      !(ev.target && ev.target.closest?.("input, textarea, select, button, [contenteditable='true'], [contenteditable='']"))
    ) {
      const snap = api.snapshot();
      if (snap.selectedIds.length === 1) {
        const opened = beginTextEdit(snap.selectedIds[0]);
        if (opened.ok) ev.preventDefault();
      }
    }
  }

  async function nudgeSelected(key, shift) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
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
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    if (snap.selectedIds.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const missing = snap.selectedIds.filter((id) => !originsFor([id], snap.slideId).length);
    if (missing.length > 0) {
      return report({ ok: false, code: "unknown-element", message: `selection left the document: ${missing.join(",")}` });
    }
    const ops = snap.selectedIds.map((id) => ({ slideId: snap.slideId, op: { type: "element.delete", id } }));
    return track(submitMoveLike(ops, doc.snapshot().revision));
  }

  // ——— Clipboard, duplicate, select all ———
  //
  // The clipboard lives with this editor: copies keep `asset:` image
  // references that only this project's store can resolve, so they are
  // never offered to another project. Locked institutional chrome is not
  // copyable — it belongs to the slide, not to the person.
  let clipboard = null;
  const pasteCount = new Map();

  function selectedTopLevel() {
    const snap = api.snapshot();
    const slide = doc.snapshot().scenes.find((sc) => sc.id === snap.slideId);
    const ids = new Set(snap.selectedIds);
    return { snap, els: (slide?.elements ?? []).filter((e) => ids.has(e.id) && !isSystemChrome(e)) };
  }

  function busy() {
    if (textSession) return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    if (resize || drag) return report({ ok: false, code: "op-rejected", message: "finish the current gesture first" });
    return null;
  }

  function copySelected() {
    const blocked = busy();
    if (blocked) return blocked;
    const { snap, els } = selectedTopLevel();
    if (els.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    clipboard = { slideId: snap.slideId, elements: structuredClone(els) };
    pasteCount.clear();
    return { ok: true, revision: doc.snapshot().revision, copied: els.length };
  }

  async function addCopies(slideId, elements, offset) {
    const copies = copyElements(elements, mintHumanId, offset, offset);
    const ops = copies.map((element) => ({ slideId, op: { type: "element.add", element } }));
    const result = await submitOps(ops, doc.snapshot().revision);
    if (!result.ok) return report(result);
    sync();
    api.selectMany(copies.map((c) => c.id));
    return { ...result, ids: copies.map((c) => c.id) };
  }

  async function pasteClipboard() {
    const blocked = busy();
    if (blocked) return blocked;
    if (!clipboard) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const slideId = api.snapshot().slideId;
    // Pasted onto the slide it came from, each copy steps down and right
    // of the last; onto another slide, the first lands in place.
    const n = (pasteCount.get(slideId) ?? 0) + 1;
    pasteCount.set(slideId, n);
    const offset = PASTE_STEP * (slideId === clipboard.slideId ? n : n - 1);
    return addCopies(slideId, clipboard.elements, offset);
  }

  async function duplicateSelected() {
    const blocked = busy();
    if (blocked) return blocked;
    const { snap, els } = selectedTopLevel();
    if (els.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    return addCopies(snap.slideId, els, PASTE_STEP);
  }

  async function cutSelected() {
    const copied = copySelected();
    if (!copied.ok || copied.noop) return copied;
    return deleteSelected();
  }

  // One element lines up with the slide; several line up with each other.
  // Distribution needs three, so there is a middle to space.
  // Ctrl+G: two or more top-level elements become one group, moved and
  // selected as one; one undo takes it apart again.
  async function groupSelected() {
    const blocked = busy();
    if (blocked) return blocked;
    const { snap, els } = selectedTopLevel();
    if (els.length < 2) return report({ ok: false, code: "op-rejected", message: "Select two or more items to group them." });
    if (els.some((e) => e.locked)) return report({ ok: false, code: "locked", message: "Unlock the items before grouping them." });
    if (els.some((e) => e.kind === "line" || (e.kind === "group" && JSON.stringify(e.group).includes('"kind":"line"')))) {
      return report({ ok: false, code: "op-rejected", message: "Lines can't be grouped yet." });
    }
    const group = groupElements(els, mintHumanId());
    const ops = [
      ...els.map((e) => ({ slideId: snap.slideId, op: { type: "element.delete", id: e.id } })),
      { slideId: snap.slideId, op: { type: "element.add", element: group } },
    ];
    const result = await submitOps(ops, doc.snapshot().revision);
    if (!result.ok) return report(result);
    sync();
    api.select(group.id);
    return { ...result, id: group.id };
  }

  // Ctrl+Shift+G: each selected group's members return to the slide,
  // where they were, selected.
  async function ungroupSelected() {
    const blocked = busy();
    if (blocked) return blocked;
    const { snap, els } = selectedTopLevel();
    const groups = els.filter((e) => e.kind === "group" && !e.locked);
    if (groups.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const freed = [];
    const ops = [];
    for (const g of groups) {
      ops.push({ slideId: snap.slideId, op: { type: "element.delete", id: g.id } });
      for (const element of ungroupElement(g)) {
        freed.push(element.id);
        ops.push({ slideId: snap.slideId, op: { type: "element.add", element } });
      }
    }
    const result = await submitOps(ops, doc.snapshot().revision);
    if (!result.ok) return report(result);
    sync();
    api.selectMany(freed);
    return result;
  }

  async function arrangeSelected(kind, how) {
    const blocked = busy();
    if (blocked) return blocked;
    const { snap, els } = selectedTopLevel();
    const movable = els.filter((e) => !e.locked && e.hidden !== true);
    if (movable.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const slide = doc.snapshot().scenes.find((sc) => sc.id === snap.slideId);
    // Lined up by what is seen: a turned element by the box around it, then
    // moved by the same amount.
    const items = movable.map((e) => ({ id: e.id, ...visualBox(e) }));
    const offset = new Map(movable.map((e) => { const v = visualBox(e); return [e.id, { dx: (e.x ?? 0) - v.x, dy: (e.y ?? 0) - v.y }]; }));
    let moves;
    try {
      moves = kind === "distribute"
        ? distributeMoves(items, how)
        : alignMoves(items, how, items.length === 1 ? { x: 0, y: 0, w: slide?.width ?? SCENE_W, h: slide?.height ?? SCENE_H } : unionBox(items));
    } catch (err) {
      return report({ ok: false, code: "bad-envelope", message: String(err?.message ?? err) });
    }
    const ops = moves
      .filter((m) => { const b = items.find((i) => i.id === m.id); return Math.abs(b.x - m.x) > 1e-9 || Math.abs(b.y - m.y) > 1e-9; })
      .map((m) => ({ slideId: snap.slideId, op: { type: "element.move", id: m.id, x: Math.round((m.x + offset.get(m.id).dx) * 1000) / 1000, y: Math.round((m.y + offset.get(m.id).dy) * 1000) / 1000 } }));
    if (ops.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const result = await submitOps(ops, doc.snapshot().revision);
    if (!result.ok) return report(result);
    sync();
    return result;
  }

  // PowerPoint's "shrink text on overflow", on request: every paragraph
  // scaled by one factor (so a heading stays larger than its body), the
  // largest factor that seats the text, never below the readable floor.
  async function shrinkTextToFit(id = null) {
    const blocked = busy();
    if (blocked) return blocked;
    const snap = api.snapshot();
    const target = id ?? (snap.selectedIds.length === 1 ? snap.selectedIds[0] : null);
    const el = target ? findIn(doc.snapshot().scenes, snap.slideId, target) : null;
    if (!el || el.kind !== "text") return report({ ok: false, code: "op-rejected", message: "Select a text box to shrink its text." });
    if (el.locked) return report({ ok: false, code: "locked", message: "This text is locked." });
    if (overflowEstimate(el)?.fits !== false) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const paras = el.paragraphs ?? [];
    if (paras.some((p) => (p.runs ?? []).length !== 1)) {
      return report({ ok: false, code: "op-rejected", message: "This text mixes formatting inside a paragraph, so it can't be shrunk evenly." });
    }
    const sizes = paras.map((p) => p.runs[0].size ?? 12);
    const at = (k) => sizes.map((z) => Math.max(SHRINK_FLOOR_PT, Math.floor(z * k * 2) / 2));
    const seated = (next) => (measureText(el, el.w, paras.map((p, i) => ({ ...p, runs: [{ ...p.runs[0], size: next[i] }] })))?.height ?? 0) <= el.h + 1e-6;
    let next = at(SHRINK_FLOOR_PT / Math.max(...sizes));
    for (let k = 0.98; k > 0; k -= 0.02) {
      const tried = at(k);
      if (seated(tried)) { next = tried; break; }
      if (tried.every((z) => z === SHRINK_FLOOR_PT)) break;
    }
    const ops = next
      .map((size, i) => ({ size, i }))
      .filter(({ size, i }) => size !== sizes[i])
      .map(({ size, i }) => ({ slideId: snap.slideId, op: { type: "element.setTextStyle", id: el.id, paragraphIndex: i, style: { size } } }));
    if (ops.length === 0) return { ok: true, revision: doc.snapshot().revision, noop: true };
    const result = await submitOps(ops, doc.snapshot().revision);
    if (!result.ok) return report(result);
    sync();
    noticeOverflow(snap.slideId, el.id);
    return { ...result, sizes: next };
  }

  function selectAll() {
    if (textSession) return { ok: true, revision: doc.snapshot().revision, noop: true };
    api.selectMany(api.selectableIds());
    return { ok: true, revision: doc.snapshot().revision, selected: api.snapshot().selectedIds.length };
  }

  // ——— V2-5D inline text editing ———
  //
  // Interaction model (PowerPoint-like): single click selects;
  // double-click or Enter opens text-edit mode; a textarea overlay
  // sits exactly over the text box (slide layout undisplaced, the
  // authoritative SVG node hidden beneath it); Ctrl/Cmd+Enter or
  // the shell's commit commits; Escape cancels; focus leaving the
  // overlay commits (click-away = commit, PowerPoint behavior).
  // While open, drags, nudges, deletes, and engine undo/redo are
  // explicitly rejected — arrows and Backspace belong to the caret.

  function textTarget(id) {
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    return { snap, el };
  }

  function openTextarea(session) {
    const docEl = root.ownerDocument;
    closeTextarea(session, true);
    const rect = api.measuredBounds?.(session.elementId) ?? api.bounds?.(session.elementId);
    if (!rect) return null;
    const slide = doc.snapshot().scenes.find((s) => s.id === session.slideId);
    const run = session.origParagraphs[0]?.runs?.[0] ?? {};
    const box = docEl.createElement("textarea");
    box.setAttribute("data-text-edit", session.elementId);
    box.value = session.draft;
    const px = (pt) => `${((pt ?? 13) * 96) / 72}px`;
    box.style.position = "absolute";
    box.style.left = `${rect.x.toFixed(1)}px`;
    box.style.top = `${rect.y.toFixed(1)}px`;
    box.style.width = `${Math.max(24, rect.w).toFixed(1)}px`;
    box.style.height = `${Math.max(20, rect.h).toFixed(1)}px`;
    box.style.boxSizing = "border-box";
    box.style.zIndex = "5";
    box.style.margin = "0";
    box.style.padding = "2px";
    box.style.resize = "none";
    box.style.overflow = "auto";
    box.style.outline = "none";
    box.style.border = "2px solid #e0705a";
    box.style.borderRadius = "2px";
    box.style.background = `#${slide?.background?.fill ?? "FFFFFF"}`;
    box.style.color = `#${(run.color ?? "111111").replace(/^#/, "")}`;
    box.style.fontSize = px(run.size);
    if (run.family) box.style.fontFamily = run.family;
    if (run.italic) box.style.fontStyle = "italic";
    if ((run.weight ?? 400) >= 600 || run.bold) box.style.fontWeight = "bold";
    box.style.textAlign = session.origParagraphs[0]?.align ?? "left";
    box.style.lineHeight = String(run.line ?? 1.35);
    box.addEventListener("input", () => {
      if (textSession === session) textSession.draft = box.value;
    });
    box.addEventListener("keydown", (ev) => {
      // Caret keys stay native; engine shortcuts never fire here.
      // Escape cancels, Ctrl/Cmd+Enter commits. Plain Enter is a
      // newline. Stop propagation so no canvas handler reinterprets.
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        cancelTextEdit();
      } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        commitTextEdit();
      } else {
        ev.stopPropagation();
      }
    });
    root.appendChild(box);
    const node = root.querySelector(`[data-el="${session.elementId}"]`);
    if (node) node.style.visibility = "hidden";
    session.node = node ?? null;
    session.box = box;
    try {
      box.focus();
      box.select?.();
    } catch { /* linkedom focus is best-effort */ }
    return box;
  }

  function closeTextarea(session, removeOnly = false) {
    // Null the box BEFORE detaching it: Chrome fires focusout
    // synchronously during remove(), and the focusout handler must
    // see no box (otherwise cancel-then-remove recommits the draft).
    const box = session?.box ?? null;
    if (session) session.box = null;
    if (box) {
      try {
        box.remove();
      } catch { /* teardown only */ }
    }
    if (session?.node) {
      try {
        session.node.style.visibility = "";
      } catch { /* teardown only */ }
      if (removeOnly !== true) session.node = null;
    }
  }

  function beginTextEdit(id = null) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "a text edit is already open — commit or cancel it first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    const target = id ?? (snap.selectedIds.length === 1 ? snap.selectedIds[0] : null);
    if (!target) {
      return report({ ok: false, code: "op-rejected", message: "select a single text element to edit" });
    }
    const el = findIn(doc.snapshot().scenes, snap.slideId, target);
    if (!el) {
      return report({ ok: false, code: "unknown-element", message: `unknown element ${target}` });
    }
    if (el.locked) {
      return report({ ok: false, code: "locked", message: `element ${target} is locked` });
    }
    if (el.kind !== "text") {
      return report({ ok: false, code: "op-rejected", message: `element ${target} is not text` });
    }
    if (el.hidden === true) {
      return report({ ok: false, code: "op-rejected", message: `element ${target} is hidden — re-show it first` });
    }
    if (!isEditableText(el.paragraphs)) {
      const d = describeStructure(el.paragraphs);
      return report({
        ok: false,
        code: "op-rejected",
        message: `rich runs are read-only in this slice (${d.paragraphs} paragraph(s), ${d.runs} run(s)) — editing would flatten their formatting`,
      });
    }
    const origParagraphs = structuredClone(el.paragraphs);
    textSession = {
      slideId: snap.slideId,
      elementId: target,
      baseRevision: doc.snapshot().revision,
      origParagraphs,
      draft: paragraphsToDraft(origParagraphs),
      box: null,
      node: null,
    };
    openTextarea(textSession);
    notifyText({ elementId: target, slideId: snap.slideId, draft: textSession.draft, paragraphs: origParagraphs.length });
    return { ok: true, revision: textSession.baseRevision, elementId: target, draft: textSession.draft, paragraphs: origParagraphs.length };
  }

  // One committed text-update command per editing session (D2):
  // typing never touched the engine, so commit builds a single
  // element.updateText from the draft and submits one envelope.
  // commitTextEdit is wrapped so pending() covers the whole
  // transaction: the inner body awaits the engine before returning,
  // which would leave focusout-triggered commits untrackable.
  function commitTextEdit(opts = {}) {
    return track(commitTextEditInner(opts));
  }

  // Per-session in-flight commit guard (§10.1): two nearly
  // simultaneous triggers (blur + Commit, double Commit clicks,
  // Ctrl+Enter + blur, commit + navigation) share one engine
  // submission. A late trigger JOINS the in-flight commit and
  // resolves with its outcome — never a second envelope, never a
  // second history entry. A failed first commit resets the flag, so
  // retry stays possible; the draft is never discarded first.
  async function commitTextEditInner(opts = {}) {
    const s = textSession;
    if (!s) return report({ ok: false, code: "op-rejected", message: "no text edit in progress" });
    if (s.committing) {
      notifyText({ duplicate: true });
      return track(s.commitPromise);
    }
    s.committing = true;
    const run = commitTextApply(s, opts).finally(() => {
      s.committing = false;
    });
    s.commitPromise = run;
    return track(run);
  }

  async function commitTextApply(s, opts = {}) {
    if (s.box) {
      try {
        s.draft = s.box.value;
      } catch { /* read-only draft stands */ }
    }
    const cur = doc.snapshot();
    // Conflict policy: never silently rebase onto a newer revision.
    // A moved revision keeps the session (and draft) open and
    // reports stale-revision; only an explicit force re-bases, and
    // that is a deliberate user overwrite, never background magic.
    if (cur.revision !== s.baseRevision && !opts.force) {
      const conflict = {
        ok: false,
        code: "stale-revision",
        message: `text edit began at revision ${s.baseRevision} but the document is at ${cur.revision} — draft preserved; force to overwrite or cancel to discard`,
        expectedRevision: cur.revision,
        actualRevision: s.baseRevision,
      };
      notifyText({ conflict: conflict.message });
      return track(Promise.resolve(report(conflict)));
    }
    const el = findIn(cur.scenes, s.slideId, s.elementId);
    if (!el) {
      const gone = {
        ok: false,
        code: "unknown-element",
        message: `edited element ${s.elementId} no longer exists — draft preserved for copy-out`,
      };
      notifyText({ error: gone.message });
      return track(Promise.resolve(report(gone)));
    }
    const next = buildUpdatedParagraphs(s.origParagraphs, s.draft);
    if (JSON.stringify(next) === JSON.stringify(s.origParagraphs)) {
      const rev = cur.revision;
      closeTextarea(s);
      textSession = null;
      sync();
      notifyText({ committed: false, noop: true });
      return track(Promise.resolve({ ok: true, revision: rev, noop: true }));
    }
    const result = await submitOps(
      withGrowToFit(s.slideId, el, next, { type: "element.updateText", id: s.elementId, paragraphs: next }),
      opts.force ? cur.revision : s.baseRevision,
    );
    if (result.ok) {
      closeTextarea(s);
      textSession = null;
      sync();
      const overflow = noticeOverflow(s.slideId, s.elementId);
      notifyText({ committed: true, overflow: overflow?.fits === false ? overflow.message : null });
      return track(result);
    }
    // Failure preserves the draft and the open session: the user can
    // fix the conflict (or copy the text out) instead of losing it.
    notifyText({ error: result.message });
    return track(report(result));
  }

  function cancelTextEdit() {
    const s = textSession;
    if (!s) return { ok: true, revision: doc.snapshot().revision, noop: true };
    closeTextarea(s);
    textSession = null;
    sync();
    notifyText({ committed: false, cancelled: true });
    return { ok: true, revision: doc.snapshot().revision, noop: true };
  }

  // Pending-edit policy (documented, tested): a slide/deck change or
  // an edit-mode exit with an open session commits the draft first;
  // navigation proceeds only on commit success. Shells call this
  // before api.goTo / deck switches.
  async function commitPendingEdit(opts = {}) {
    if (!textSession) return { ok: true, revision: doc.snapshot().revision, noop: true };
    // Navigation during a commit waits for the in-flight submission
    // instead of starting a second one.
    if (textSession.committing && textSession.commitPromise) return track(textSession.commitPromise);
    return commitTextEdit(opts);
  }

  // ——— V2-5D native insertion ———
  //
  // Deterministic center placement in scene inches (never CSS px):
  // visible at fit/100%/200%, scrolled, and narrow viewports alike,
  // clear of locked chrome by construction (chrome seats at the
  // edges). Appends at top draw order, selects the new element, and
  // reuses the engine's element.add — so move/nudge/delete/undo/redo
  // and regeneration-carry all work unchanged.

  async function addTextElement(opts = {}) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    const cur = doc.snapshot();
    const slideId = opts.slideId ?? api.snapshot().slideId;
    const slide = cur.scenes.find((x) => x.id === slideId);
    if (!slide) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${slideId}` });
    const element = defaultTextElement(slide, opts);
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await doc.apply({
        id: newEditId(), slideId, op: { type: "element.add", element }, baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (result.ok) {
        sync();
        api.select(element.id);
        notifyText({ added: element.id });
        return track({ ...result, id: element.id });
      }
      if (result.code !== "op-rejected" || attempt === 2) return track(report(result));
      element.id = mintHumanId();
    }
    return track(report({ ok: false, code: "op-rejected", message: "could not mint a fresh element id" }));
  }

  async function addShapeElement(form = "rect", opts = {}) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    let element;
    try {
      const cur = doc.snapshot();
      const slideId = opts.slideId ?? api.snapshot().slideId;
      const slide = cur.scenes.find((x) => x.id === slideId);
      if (!slide) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${slideId}` });
      element = defaultShapeElement(slide, form, opts);
      const result = await doc.apply({
        id: newEditId(), slideId, op: { type: "element.add", element }, baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (result.ok) {
        sync();
        api.select(element.id);
        notifyText({ added: element.id });
        return track({ ...result, id: element.id });
      }
      return track(report(result));
    } catch (err) {
      return track(report({ ok: false, code: "bad-envelope", message: String(err?.message ?? err) }));
    }
  }

  // Chart, table or rule, styled from the slide it lands on.
  async function addPresetElement(kind, opts = {}) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    try {
      const slideId = opts.slideId ?? api.snapshot().slideId;
      const slide = doc.snapshot().scenes.find((x) => x.id === slideId);
      if (!slide) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${slideId}` });
      const { z: _templateZ, ...element } = buildInsertElement(kind, slide, { newId: mintHumanId, index: cascadeIndex(slide) });
      const result = await doc.apply({
        id: newEditId(), slideId, op: { type: "element.add", element }, baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (!result.ok) return track(report(result));
      sync();
      api.select(element.id);
      return track({ ...result, id: element.id });
    } catch (err) {
      return track(report({ ok: false, code: "bad-envelope", message: String(err?.message ?? err) }));
    }
  }

  async function addIconElement(glyph, opts = {}) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    try {
      const slideId = opts.slideId ?? api.snapshot().slideId;
      const slide = doc.snapshot().scenes.find((x) => x.id === slideId);
      if (!slide) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${slideId}` });
      const element = defaultIconElement(slide, glyph);
      const result = await doc.apply({
        id: newEditId(), slideId, op: { type: "element.add", element }, baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (!result.ok) return track(report(result));
      sync();
      api.select(element.id);
      return track({ ...result, id: element.id });
    } catch (err) {
      return track(report({ ok: false, code: "bad-envelope", message: String(err?.message ?? err) }));
    }
  }

  async function addImageElement(image, opts = {}) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    try {
      const slideId = opts.slideId ?? api.snapshot().slideId;
      const slide = doc.snapshot().scenes.find((x) => x.id === slideId);
      if (!slide) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${slideId}` });
      const element = defaultImageElement(slide, image);
      const result = await doc.apply({
        id: newEditId(), slideId, op: { type: "element.add", element }, baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (!result.ok) return track(report(result));
      sync();
      api.select(element.id);
      return track({ ...result, id: element.id });
    } catch (err) {
      return track(report({ ok: false, code: "bad-envelope", message: String(err?.message ?? err) }));
    }
  }

  async function undo() {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const result = await doc.undo();
    if (result.ok) sync();
    return track(report(result));
  }

  async function redo() {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const result = await doc.redo();
    if (result.ok) sync();
    return track(report(result));
  }

  // ——— V2-5E resize handles ———
  //
  // Handles live in their own pointer-transparent layer over the
  // stage (never in the scene, never in the export): eight white
  // squares with accent borders, one per anchor, with directional
  // cursors. A press on a handle starts a resize session, never a
  // drag; moves redraw a dashed preview box at the candidate
  // geometry (the element itself is never transform-distorted);
  // release commits exactly one element.setGeometry. Escape and
  // pointer cancellation discard the preview with no history.
  let resize = null;
  let handleLayer = null;

  function resizeTarget(id) {
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return { ok: false, code: "unknown-element", message: `unknown element ${id}` };
    if (el.locked) return { ok: false, code: "locked", message: `element ${id} is locked` };
    if (el.hidden === true) return { ok: false, code: "op-rejected", message: `element ${id} is hidden — re-show it first` };
    if (!RESIZABLE_KINDS.has(el.kind)) {
      return { ok: false, code: "op-rejected", message: `element ${id} (${el.kind}) is not resizable in this slice` };
    }
    if (snap.selectedIds.length !== 1 || snap.selectedIds[0] !== id) {
      return { ok: false, code: "op-rejected", message: "resize needs its target singly selected" };
    }
    return { ok: true, snap, el };
  }

  // Authoritative scene geometry first: the resize box IS the
  // element box, so interaction targets never depend on font settle
  // or layout state. Measured rects back it up where available.
  function handleRect(id) {
    return api.bounds?.(id) ?? api.measuredBounds?.(id);
  }

  function anchorOf(rect, handle) {
    const x = rect.x;
    const y = rect.y;
    const mx = rect.x + rect.w / 2;
    const my = rect.y + rect.h / 2;
    const ex = rect.x + rect.w;
    const ey = rect.y + rect.h;
    switch (handle) {
      case "nw": return [x, y];
      case "n": return [mx, y];
      case "ne": return [ex, y];
      case "e": return [ex, my];
      case "se": return [ex, ey];
      case "s": return [mx, ey];
      case "sw": return [x, ey];
      case "w": return [x, my];
      default: return [ex, ey];
    }
  }

  // Handles render only for a single selectable unit of a resizable
  // kind — never for locked units, groups, lines, tables, multisets,
  // text sessions, or read-only viewers (this module never loads
  // there). The layer is rebuilt on every viewer change, so zoom,
  // scroll, selection, and commits reposition for free.
  function canShowHandles() {
    if (textSession || !api) return null;
    const snap = api.snapshot();
    if (snap.selectedIds.length !== 1) return null;
    const id = snap.selectedIds[0];
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el || el.locked || !RESIZABLE_KINDS.has(el.kind)) return null;
    return { slideId: snap.slideId, id };
  }

  // The viewer's render clears the mount root on every committed
  // scene swap, which destroys this layer with it — so reconcile
  // re-attaches whenever it finds itself detached, then rebuilds.
  function ensureHandleLayer() {
    if (handleLayer && handleLayer.isConnected !== false && root.contains(handleLayer)) return;
    try {
      handleLayer?.remove();
    } catch { /* teardown only */ }
    handleLayer = root.ownerDocument.createElement("div");
    handleLayer.setAttribute("data-handle-layer", "");
    handleLayer.style.position = "absolute";
    handleLayer.style.inset = "0";
    handleLayer.style.pointerEvents = "none";
    handleLayer.style.zIndex = "4";
    root.appendChild(handleLayer);
  }

  function reconcileHandles() {
    ensureHandleLayer();
    // Guides belong to the gesture, not the selection: a viewer change
    // mid-drag rebuilds the handles and leaves the guides standing.
    if (handleLayer) {
      for (const child of [...handleLayer.children]) {
        if (!child.hasAttribute?.("data-snap-guide")) handleLayer.removeChild(child);
      }
    }
    const target = canShowHandles();
    if (!target || !handleLayer) return;
    const rect = handleRect(target.id);
    if (!rect) return;
    const docEl = root.ownerDocument;
    const el = findIn(doc.snapshot().scenes, target.slideId, target.id);
    // Handles sit on the element as drawn: around its centre at its angle.
    const deg = el?.rotation ?? 0;
    const cxr = rect.x + rect.w / 2, cyr = rect.y + rect.h / 2;
    const turn = (px, py) => { if (!deg) return [px, py]; const v = toWorld(px - cxr, py - cyr, deg); return [cxr + v.dx, cyr + v.dy]; };
    for (const handle of RESIZE_HANDLES) {
      const [ax, ay] = turn(...anchorOf(rect, handle));
      const node = docEl.createElement("div");
      node.setAttribute("data-resize-handle", handle);
      node.setAttribute("data-handle-for", target.id);
      node.setAttribute("role", "presentation");
      node.style.position = "absolute";
      node.style.left = `${ax.toFixed(1)}px`;
      node.style.top = `${ay.toFixed(1)}px`;
      node.style.width = "12px";
      node.style.height = "12px";
      node.style.transform = "translate(-50%, -50%)";
      node.style.boxSizing = "border-box";
      node.style.background = "#ffffff";
      node.style.border = "2px solid #e0705a";
      node.style.borderRadius = "3px";
      node.style.boxShadow = "0 1px 3px rgba(0,0,0,0.45)";
      node.style.cursor = HANDLE_CURSORS[handle];
      node.style.pointerEvents = "auto";
      handleLayer.appendChild(node);
    }
    // The rotate handle: a round knob above the top edge, on a stem, as in
    // PowerPoint and Canva — above the edge as it is turned.
    if (el && ROTATABLE_KINDS.has(el.kind)) {
      const k = svgScales(root)?.kx ?? 1;
      const lift = 28 / k;
      const [kx, ky] = turn(cxr, rect.y - lift);
      const stem = docEl.createElement("div");
      stem.setAttribute("data-rotate-stem", "");
      Object.assign(stem.style, { position: "absolute", left: `${(cxr - 0.5 / k).toFixed(1)}px`, top: `${(rect.y - lift).toFixed(1)}px`, width: `${(1 / k).toFixed(2)}px`, height: `${lift.toFixed(1)}px`, background: "#e0705a", pointerEvents: "none",
        ...(deg ? { transformOrigin: `${(0.5 / k).toFixed(2)}px ${(lift + rect.h / 2).toFixed(1)}px`, transform: `rotate(${deg}deg)` } : {}) });
      handleLayer.appendChild(stem);
      const knob = docEl.createElement("div");
      knob.setAttribute("data-rotate-handle", "");
      knob.setAttribute("data-handle-for", target.id);
      knob.setAttribute("role", "presentation");
      knob.setAttribute("title", "Rotate (Shift: 15° steps)");
      Object.assign(knob.style, { position: "absolute", left: `${kx.toFixed(1)}px`, top: `${ky.toFixed(1)}px`, width: "14px", height: "14px", transform: "translate(-50%, -50%)", boxSizing: "border-box", background: "#ffffff", border: "2px solid #e0705a", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,0.45)", cursor: "grab", pointerEvents: "auto" });
      handleLayer.appendChild(knob);
    }
  }

  // ——— Rotation ———
  //
  // The angle is the pointer's bearing from the element's centre, with
  // 0° straight up. Shift steps by 15°; otherwise it settles on a right
  // angle within 4°, so "upright" is easy to get back to.
  let rotating = null;
  function rotationAt(s, clientX, clientY, mods) {
    const raw = (Math.atan2(clientY - s.cy, clientX - s.cx) * 180) / Math.PI + 90;
    let a = ((raw % 360) + 360) % 360;
    if (mods.shiftKey) a = Math.round(a / 15) * 15;
    else {
      const right = Math.round(a / 90) * 90;
      if (Math.abs(a - right) <= 4) a = right;
    }
    a = Math.round(a * 10) / 10;
    return a > 180 ? a - 360 : a;
  }

  function beginRotate(id, ev) {
    const blocked = busy();
    if (blocked) return blocked;
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    const rect = root.querySelector("svg")?.getBoundingClientRect?.();
    const scales = svgScales(root);
    if (!el || !rect || !scales) return report({ ok: false, code: "op-rejected", message: "no layout to rotate through" });
    try { root.setPointerCapture?.(ev.pointerId); } catch { /* linkedom and some browsers lack capture */ }
    api.suppressNextClick();
    rotating = {
      id, slideId: snap.slideId, pointerId: ev.pointerId, from: el.rotation ?? 0,
      cx: rect.left + (el.x + el.w / 2) * IN * scales.kx,
      cy: rect.top + (el.y + el.h / 2) * IN * scales.ky,
      pivot: `${((el.x + el.w / 2) * IN).toFixed(1)} ${((el.y + el.h / 2) * IN).toFixed(1)}`,
      moved: false, angle: el.rotation ?? 0,
    };
    return { ok: true, revision: doc.snapshot().revision, rotating: true };
  }

  function previewRotate(clientX, clientY, mods) {
    const s = rotating;
    if (!s) return;
    s.moved = true;
    s.angle = rotationAt(s, clientX, clientY, mods);
    root.querySelector(`[data-el="${s.id}"]`)?.setAttribute("transform", `rotate(${s.angle - s.from} ${s.pivot})`);
  }

  async function commitRotate(ev) {
    const s = rotating;
    rotating = null;
    root.querySelector(`[data-el="${s.id}"]`)?.removeAttribute("transform");
    if (!s.moved) { api.reposition(); return { ok: true, revision: doc.snapshot().revision, noop: true }; }
    const rotation = rotationAt(s, ev.clientX, ev.clientY, ev);
    if (rotation === s.from) { api.reposition(); return { ok: true, revision: doc.snapshot().revision, noop: true }; }
    const result = await doc.apply({ id: newEditId(), slideId: s.slideId, op: { type: "element.setRotation", id: s.id, rotation }, baseRevision: doc.snapshot().revision, actor: "human" });
    if (!result.ok) return report(result);
    sync();
    return { ...result, rotation };
  }

  function cancelRotate() {
    if (!rotating) return;
    root.querySelector(`[data-el="${rotating.id}"]`)?.removeAttribute("transform");
    rotating = null;
    api.reposition();
  }

  function drawResizePreview(geom) {
    if (!handleLayer) return;
    let preview = handleLayer.querySelector("[data-resize-preview]");
    const docEl = root.ownerDocument;
    if (!preview) {
      preview = docEl.createElement("div");
      preview.setAttribute("data-resize-preview", "");
      preview.style.position = "absolute";
      preview.style.boxSizing = "border-box";
      preview.style.border = "2px dashed #e0705a";
      preview.style.background = "rgba(224,112,90,0.08)";
      preview.style.pointerEvents = "none";
      handleLayer.appendChild(preview);
    }
    preview.style.left = `${(geom.x * IN).toFixed(1)}px`;
    preview.style.top = `${(geom.y * IN).toFixed(1)}px`;
    preview.style.width = `${Math.max(1, geom.w * IN).toFixed(1)}px`;
    preview.style.height = `${Math.max(1, geom.h * IN).toFixed(1)}px`;
    preview.style.transform = resize?.rotation ? `rotate(${resize.rotation}deg)` : "";
  }

  function clearResizePreview() {
    handleLayer?.querySelector("[data-resize-preview]")?.remove();
    drawGuides([]);
  }

  function beginResize(handle, id, ev) {
    if (!RESIZE_HANDLES.includes(handle)) {
      return report({ ok: false, code: "bad-envelope", message: `unknown resize handle ${handle}` });
    }
    const target = resizeTarget(id);
    if (!target.ok) return report(target);
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    api.suppressNextClick();
    if (ev.pointerId !== undefined) {
      try {
        root.setPointerCapture?.(ev.pointerId);
      } catch { /* linkedom and some browsers lack capture */ }
    }
    resize = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      slideId: target.snap.slideId,
      id,
      handle,
      origin: { x: target.el.x, y: target.el.y, w: target.el.w, h: target.el.h },
      kind: target.el.kind,
      rotation: target.el.rotation ?? 0,
      targets: snapTargets(doc.snapshot().scenes.find((sc) => sc.id === target.snap.slideId), [id]),
      limits: target.el.kind === "text"
        ? { floor: (w) => measureText(target.el, w)?.height ?? 0, slideH: slideHeight(target.snap.slideId) }
        : {},
      moved: false,
    };
    return { ok: true, revision: doc.snapshot().revision, resizing: true };
  }

  // The box a resize means: moving edges snap like a move does (Alt off),
  // and a corner keeps proportions with Shift — or always for a picture,
  // which PowerPoint and Canva never stretch unless asked.
  function resizeTo(s, clientX, clientY, mods, scales) {
    let { dx, dy } = clientToSvgDelta(clientX - s.startX, clientY - s.startY, scales);
    dx /= IN; dy /= IN;
    let guides = [];
    const aspect = s.handle.length === 2 && (s.kind === "image" ? !mods.shiftKey : !!mods.shiftKey);
    if (s.rotation) {
      // A turned box resizes along its own axes; guides stay off, since its
      // edges are not the slide's.
      const local = toLocal(dx, dy, s.rotation);
      const inFrame = resizeGeometry(s.origin, s.handle, local.dx, local.dy, { ...s.limits, aspect });
      return { geom: rotatedResize(s.origin, inFrame, s.rotation), guides };
    }
    if (!mods.altKey && !aspect) ({ dx, dy, guides } = snapResize(s.origin, s.handle, dx, dy, s.targets, snapReach(scales)));
    return { geom: resizeGeometry(s.origin, s.handle, dx, dy, { ...s.limits, aspect }), guides };
  }

  function previewResizeTo(clientX, clientY, mods = {}) {
    if (!resize) return null;
    const scales = svgScales(root);
    if (!scales) return null;
    if (!resize.moved && Math.hypot(clientX - resize.startX, clientY - resize.startY) < DRAG_THRESHOLD_PX) {
      return null;
    }
    resize.moved = true;
    const { geom, guides } = resizeTo(resize, clientX, clientY, mods, scales);
    drawResizePreview(geom);
    drawGuides(guides);
    return geom;
  }

  // Release coordinates decide the commit (not the last move event),
  // through the same conversion as the preview — one function, no
  // parallel formulas. Exactly one element.setGeometry per gesture.
  // Tracking is eager (like text commits): the transaction registers
  // with pending() synchronously, so observers never resolve early.
  function commitResize(ev) {
    const s = resize;
    resize = null;
    clearResizePreview();
    if (!s) return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    if (!s.moved) return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    return track(commitResizeApply(s, ev));
  }

  async function commitResizeApply(s, ev) {
    const scales = svgScales(root);
    if (!scales) return report({ ok: false, code: "op-rejected", message: "no layout to project the resize through" });
    let geom;
    try {
      geom = resizeTo(s, ev.clientX, ev.clientY, ev, scales).geom;
    } catch (err) {
      return track(Promise.resolve(report({ ok: false, code: "op-rejected", message: String(err?.message ?? err) })));
    }
    const result = await doc.apply({
      id: newEditId(),
      slideId: s.slideId,
      op: { type: "element.setGeometry", id: s.id, ...geom },
      baseRevision: doc.snapshot().revision,
      actor: "human",
    });
    if (result.ok) {
      sync();
      noticeOverflow(s.slideId, s.id);
      return track({ ...result, geometry: geom });
    }
    return track(report(result));
  }

  function cancelResize() {
    if (!resize) return { ok: true, revision: doc.snapshot().revision, noop: true };
    resize = null;
    clearResizePreview();
    api.reposition();
    return { ok: true, revision: doc.snapshot().revision, noop: true };
  }

  // ——— V2-5E shape styling ———
  //
  // Small explicit appearance edits through element.setStyle: fill,
  // stroke, and stroke width with hex validation up front. Partial
  // patches touch only mentioned keys; null clears a key. Genuine
  // no-ops return without contacting the engine.

  function setElementStyle(id, patch) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return report({ ok: false, code: "unknown-element", message: `unknown element ${id}` });
    if (el.locked) return report({ ok: false, code: "locked", message: `element ${id} is locked` });
    if (el.kind !== "shape") return report({ ok: false, code: "op-rejected", message: `element ${id} is not a shape` });
    if (!patch || typeof patch !== "object") {
      return report({ ok: false, code: "bad-envelope", message: "element.setStyle needs a style patch" });
    }
    const style = {};
    const hex = /^[0-9A-Fa-f]{6}$/;
    for (const k of ["fill", "stroke", "strokeWidth"]) {
      let v = patch[k];
      if (v === undefined) continue;
      if (v === null) {
        style[k] = null;
        continue;
      }
      if (k === "strokeWidth") {
        const n = typeof v === "string" ? Number(v) : v;
        if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 24) {
          return report({ ok: false, code: "bad-envelope", message: "strokeWidth must be a number from 0 to 24" });
        }
        style[k] = n;
        continue;
      }
      const s = String(v).replace(/^#/, "");
      if (!hex.test(s)) {
        return report({ ok: false, code: "bad-envelope", message: `${k} must be a 6-digit hex color` });
      }
      style[k] = s.toUpperCase();
    }
    if (Object.keys(style).length === 0) {
      return report({ ok: false, code: "bad-envelope", message: "element.setStyle needs at least one changed key" });
    }
    const cur = el.shape ?? {};
    const norm = (k) => (style[k] === null ? null : (style[k] ?? null));
    const same = Object.keys(style).every((k) => {
      const have = cur[k] === undefined ? null : cur[k];
      const want = norm(k);
      return k === "strokeWidth" ? have === want : String(have ?? "").toUpperCase() === String(want ?? "").toUpperCase();
    });
    if (same) return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    return track((async () => {
      const result = await doc.apply({
        id: newEditId(),
        slideId: snap.slideId,
        op: { type: "element.setStyle", id, style },
        baseRevision: doc.snapshot().revision,
        actor: "human",
      });
      if (result.ok) sync();
      return report(result);
    })());
  }

  // ——— V2-5F text formatting ———
  //
  // Narrow appearance edits over whole addressable runs:
  // paragraph-scoped (paragraphIndex) or whole-element. Partial
  // patches touch only mentioned keys; null clears a key back to
  // absence (bold:false differs from absent bold under weight >=
  // 600). Multi-run paragraphs are refused — formatting never
  // splits runs here. Genuine no-ops return without engine contact.
  function setTextStyle(id, paragraphIndex, patch) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return report({ ok: false, code: "unknown-element", message: `unknown element ${id}` });
    if (el.locked) return report({ ok: false, code: "locked", message: `element ${id} is locked` });
    if (el.kind !== "text") return report({ ok: false, code: "op-rejected", message: `element ${id} is not text` });
    if (!patch || typeof patch !== "object") {
      return report({ ok: false, code: "bad-envelope", message: "element.setTextStyle needs a style patch" });
    }
    const paras = el.paragraphs ?? [];
    let idxs;
    if (paragraphIndex === undefined || paragraphIndex === null) {
      idxs = paras.map((_, i) => i);
    } else {
      if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= paras.length) {
        return report({ ok: false, code: "bad-envelope", message: `paragraph ${paragraphIndex} out of range for element ${id}` });
      }
      idxs = [paragraphIndex];
    }
    for (const i of idxs) {
      const runs = paras[i]?.runs;
      if (!Array.isArray(runs) || runs.length !== 1) {
        return report({ ok: false, code: "op-rejected", message: `paragraph ${i} of element ${id} is not a single run` });
      }
    }
    const style = {};
    const hex = /^[0-9A-Fa-f]{6}$/;
    if (patch.color !== undefined) {
      if (patch.color === null) style.color = null;
      else {
        const s = String(patch.color).replace(/^#/, "");
        if (!hex.test(s)) return report({ ok: false, code: "bad-envelope", message: "color must be a 6-digit hex color" });
        style.color = s.toUpperCase();
      }
    }
    if (patch.size !== undefined) {
      if (patch.size === null) style.size = null;
      else {
        const n = typeof patch.size === "string" ? Number(patch.size) : patch.size;
        if (typeof n !== "number" || !Number.isFinite(n) || n < 6 || n > 144) {
          return report({ ok: false, code: "bad-envelope", message: "size must be a number from 6 to 144" });
        }
        style.size = n;
      }
    }
    for (const k of ["bold", "italic"]) {
      if (patch[k] === undefined) continue;
      if (patch[k] === null) style[k] = null;
      else if (typeof patch[k] !== "boolean") {
        return report({ ok: false, code: "bad-envelope", message: `${k} must be a boolean` });
      } else style[k] = patch[k];
    }
    if (Object.keys(style).length === 0) {
      return report({ ok: false, code: "bad-envelope", message: "element.setTextStyle needs at least one changed key" });
    }
    const same = idxs.every((i) => {
      const run = paras[i].runs[0] ?? {};
      return Object.keys(style).every((k) => {
        const have = run[k] === undefined ? null : run[k];
        const want = style[k];
        return k === "color" && typeof have === "string" && typeof want === "string"
          ? have.toUpperCase() === want.toUpperCase()
          : have === want;
      });
    });
    if (same) return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    const op = { type: "element.setTextStyle", id, style };
    if (paragraphIndex !== undefined && paragraphIndex !== null) op.paragraphIndex = paragraphIndex;
    // The size a restyle leaves the runs at decides whether the box must
    // grow, so measure the paragraphs as they will be, not as they are.
    const styled = paras.map((p, i) => (idxs.includes(i)
      ? { ...p, runs: p.runs.map((r) => ({ ...r, ...(style.size != null ? { size: style.size } : {}), ...(style.bold != null ? { weight: style.bold ? 700 : 400 } : {}) })) }
      : p));
    return track((async () => {
      const result = await submitOps(withGrowToFit(snap.slideId, el, styled, op), doc.snapshot().revision);
      if (result.ok) {
        sync();
        noticeOverflow(snap.slideId, id);
      }
      return report(result);
    })());
  }

  // ——— Chart-data editing ———
  //
  // Bounded native edits over the compiler's own chart contract:
  // categories, series names/values, and kind changes. The draft
  // lives in the inspector panel (never in the scene); one Apply
  // submits one element.setChartData envelope. Length agreement is
  // enforced before commit — changing the category count without
  // supplying matching values is rejected, never zero-filled.
  // Conversions that native OOXML cannot keep (multi-series pie /
  // doughnut) are rejected here with an explanation, ahead of the
  // export preflight that remains the last line of defense.
  const CHART_KINDS = ["bar", "hbar", "line", "pie", "doughnut", "area"];

  function setChartData(id, payload) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return report({ ok: false, code: "unknown-element", message: `unknown element ${id}` });
    if (el.locked) return report({ ok: false, code: "locked", message: `element ${id} is locked` });
    if (el.kind !== "chart") return report({ ok: false, code: "op-rejected", message: `element ${id} is not a chart` });
    if (!payload || typeof payload !== "object") {
      return report({ ok: false, code: "bad-envelope", message: "element.setChartData needs a chart payload" });
    }
    const cur = el.chart ?? {};
    const nextKind = payload.chartKind ?? cur.chartKind ?? "bar";
    const nextCats = payload.categories ?? [...(cur.categories ?? [])];
    const nextSeries = (payload.series ?? cur.series ?? []).map((s) => ({ name: s.name, values: [...s.values] }));
    if (payload.chartKind !== undefined && !CHART_KINDS.includes(payload.chartKind)) {
      return report({ ok: false, code: "bad-envelope", message: "chartKind must be a supported kind" });
    }
    if (payload.chartKind === undefined && payload.categories === undefined && payload.series === undefined) {
      return report({ ok: false, code: "bad-envelope", message: "element.setChartData needs at least one of chartKind, categories, series" });
    }
    if (nextCats.length === 0) {
      return report({ ok: false, code: "op-rejected", message: "a chart needs at least one category — deletion of the last one is refused" });
    }
    if (nextSeries.length === 0) {
      return report({ ok: false, code: "op-rejected", message: "a chart needs at least one series — deletion of the last one is refused" });
    }
    for (const c of nextCats) {
      if (typeof c !== "string") {
        return report({ ok: false, code: "bad-envelope", message: "every category must be a string" });
      }
    }
    for (const s of nextSeries) {
      if (!s || typeof s.name !== "string" || s.name.trim().length === 0) {
        return report({ ok: false, code: "bad-envelope", message: "every series needs a non-empty name" });
      }
      if (!Array.isArray(s.values) || s.values.length !== nextCats.length) {
        return report({ ok: false, code: "op-rejected", message: `series "${s.name}" holds ${s.values?.length ?? 0} values for ${nextCats.length} categories — supply the full matrix` });
      }
      for (const v of s.values) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          return report({ ok: false, code: "bad-envelope", message: `series "${s.name}" carries a non-numeric value — nothing was coerced` });
        }
      }
    }
    if ((nextKind === "pie" || nextKind === "doughnut") && nextSeries.length > 1) {
      return report({ ok: false, code: "op-rejected", message: `${nextKind} cannot keep ${nextSeries.length} series in native PowerPoint output — remove series first or pick a bar, line, or area kind` });
    }
    const sameKind = (cur.chartKind ?? "bar") === nextKind;
    const sameCats = JSON.stringify(cur.categories ?? []) === JSON.stringify(nextCats);
    const sameSeries = JSON.stringify(cur.series ?? []) === JSON.stringify(nextSeries);
    if (sameKind && sameCats && sameSeries) {
      return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    }
    return track((async () => {
      const result = await doc.apply({
        id: newEditId(),
        slideId: snap.slideId,
        op: { type: "element.setChartData", id, chart: { chartKind: nextKind, categories: nextCats, series: nextSeries } },
        baseRevision: doc.snapshot().revision,
        actor: "human",
      });
      if (result.ok) sync();
      return report(result);
    })());
  }

  // ——— Table-data editing ———
  //
  // Bounded native edits over the compiler's own table contract:
  // the full cell matrix, verbatim strings. Structural edits
  // travel as complete replacement matrices — a short row is
  // rejected, never padded, so populated cells elsewhere cannot
  // silently vanish. The header flag, layout, typography, and
  // geometry ride along untouched. One Apply submits one
  // element.setTableData envelope; density warnings reuse the
  // compiler's line-count heuristic without resizing anything.
  function setTableData(id, rows) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return report({ ok: false, code: "unknown-element", message: `unknown element ${id}` });
    if (el.locked) return report({ ok: false, code: "locked", message: `element ${id} is locked` });
    if (el.kind !== "table") return report({ ok: false, code: "op-rejected", message: `element ${id} is not a table` });
    if (!Array.isArray(rows) || rows.length === 0) {
      return report({ ok: false, code: "bad-envelope", message: "element.setTableData needs a non-empty rows array" });
    }
    const width = Array.isArray(rows[0]) ? rows[0].length : 0;
    if (width === 0) {
      return report({ ok: false, code: "bad-envelope", message: "a table needs at least one column" });
    }
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!Array.isArray(row) || row.length !== width) {
        return report({ ok: false, code: "op-rejected", message: `row ${ri + 1} holds ${Array.isArray(row) ? row.length : 0} cells for a ${width}-column table — supply the full matrix` });
      }
      for (let ci = 0; ci < row.length; ci++) {
        if (typeof row[ci] !== "string") {
          return report({ ok: false, code: "bad-envelope", message: `cell r${ri + 1}c${ci + 1} must be a string — nothing is coerced` });
        }
      }
    }
    const cur = el.table?.rows ?? null;
    if (JSON.stringify(cur) === JSON.stringify(rows)) {
      return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    }
    const matrix = rows.map((r) => [...r]);
    return track((async () => {
      const result = await doc.apply({
        id: newEditId(),
        slideId: snap.slideId,
        op: { type: "element.setTableData", id, table: { rows: matrix } },
        baseRevision: doc.snapshot().revision,
        actor: "human",
      });
      if (result.ok) {
        sync();
        const fresh = findIn(doc.snapshot().scenes, snap.slideId, id);
        if (fresh?.kind === "table") {
          const overflow = tableOverflowEstimate(fresh);
          if (overflow && !overflow.fits && onError) {
            onError({ ok: false, code: "op-rejected", message: `overflow: ${overflow.message}` });
          }
        }
      }
      return report(result);
    })());
  }

  // ——— V2-5I slide management ———
  //
  // The engine's ordered SlideScene collection stays the sole
  // source of truth: React owns active-slide identity, filmstrip
  // selection, and drag previews, while every committed slide
  // mutation crosses the engine as a slide.* envelope (single or
  // atomic batch) and the viewer re-renders from snapshots.
  // Navigation (goTo by index) never touches history.

  function activeSlideId() {
    return api.snapshot().slideId;
  }

  // Pending-draft gate for slide mutations: an open text session
  // on a slide about to disappear is cancelled with its overlay
  // (committing to a deleted slide is pointless); anywhere else
  // the draft commits first and a failed commit blocks the
  // mutation — drafts are never lost silently. Chart/table panels
  // are explicit-Apply and unmount with navigation by design.
  async function gateTextForSlides(deleteIds = []) {
    if (!textSession) return { ok: true, revision: doc.snapshot().revision, noop: true };
    if (deleteIds.includes(textSession.slideId)) {
      cancelTextEdit();
      return { ok: true, revision: doc.snapshot().revision, noop: true };
    }
    return commitPendingEdit();
  }

  async function insertSlide(index = null) {
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    const cur = doc.snapshot();
    const at = index ?? api.snapshot().slideIndex + 1;
    const sibling = cur.scenes[api.snapshot().slideIndex] ?? cur.scenes[0];
    for (let attempt = 0; attempt < 3; attempt++) {
      const scene = blankSlide(sibling);
      const result = await doc.apply({
        id: newEditId(), slideId: null,
        op: { type: "slide.insert", scene, index: Math.max(0, at) },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (result.ok) {
        sync();
        return track({ ...result, id: scene.id, index: Math.min(Math.max(0, at), doc.snapshot().scenes.length - 1) });
      }
      if (!(result.code === "op-rejected" && /already exists/.test(result.message)) || attempt === 2) {
        return track(report(result));
      }
    }
    return track(report({ ok: false, code: "op-rejected", message: "could not mint a fresh slide id" }));
  }

  // V2-5K layout-gallery insertion: one template skeleton through
  // the accepted slide.insert path — one envelope, one revision, one
  // undo entry, navigation by the caller. Unknown template ids refuse
  // before touching state; the text gate commits pending drafts
  // exactly like blank insertion. Element ids are minted per build,
  // and slide.insert guards slide ids only, so each attempt rebuilds
  // and checks the new scene against the live deck domain before
  // submitting — repeated uses of one template can never collide.
  // A layout the person saved, inserted after the current slide.
  async function insertSavedLayout(layout, index = null) {
    if (resize) return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    const at = index ?? api.snapshot().slideIndex + 1;
    const scene = slideFromLayout(layout, { slideId: mintSlideId(), newId: () => mintHumanId() });
    const result = await doc.apply({ id: newEditId(), slideId: null, op: { type: "slide.insert", scene, index: Math.max(0, at) }, baseRevision: doc.snapshot().revision, actor: "human" });
    if (!result.ok) return track(report(result));
    sync();
    api.goTo?.(Math.min(Math.max(0, at), doc.snapshot().scenes.length - 1));
    return track({ ...result, id: scene.id });
  }

  // A compiled slide laid out another way (the server's layout options):
  // one envelope, so a single undo restores the slide exactly. `basis` is
  // the slide the options were computed from; if it changed since, the
  // options are stale and nothing is applied.
  async function replaceSlideLayout(scene, basis) {
    if (resize) return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    const cur = doc.snapshot();
    const at = cur.scenes.findIndex((s) => s.id === scene?.id);
    if (at < 0) return track(report({ ok: false, code: "op-rejected", message: "that slide is gone" }));
    if (basis !== undefined && JSON.stringify(cur.scenes[at]) !== basis) {
      return track(report({ ok: false, code: "stale", message: "the slide changed — open the layouts again" }));
    }
    const result = await doc.applyBatch({ id: newEditId(), baseRevision: cur.revision, actor: "human", ops: [
      { slideId: null, op: { type: "slide.delete", id: scene.id } },
      { slideId: null, op: { type: "slide.insert", scene: structuredClone(scene), index: at } },
    ] });
    if (!result.ok) return track(report(result));
    sync();
    api.goTo?.(at);
    return track(result);
  }

  async function insertLayoutSlide(templateId, index = null) {
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    if (!getLayoutTemplate(templateId)) {
      return track(report({ ok: false, code: "op-rejected", message: `unknown layout template ${templateId}` }));
    }
    const cur = doc.snapshot();
    const at = index ?? api.snapshot().slideIndex + 1;
    const sibling = cur.scenes[api.snapshot().slideIndex] ?? cur.scenes[0];
    for (let attempt = 0; attempt < 3; attempt++) {
      const scene = buildLayoutScene(templateId, sibling, { slideId: mintSlideId(), newId: () => mintHumanId() });
      const domain = new Set();
      for (const s of doc.snapshot().scenes) {
        for (const id of collectSceneIds(s)) domain.add(id);
      }
      if (collectSceneIds(scene).some((id) => domain.has(id))) continue;
      const result = await doc.apply({
        id: newEditId(), slideId: null,
        op: { type: "slide.insert", scene, index: Math.max(0, at) },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
      if (result.ok) {
        sync();
        return track({ ...result, id: scene.id, templateId, index: Math.min(Math.max(0, at), doc.snapshot().scenes.length - 1) });
      }
      if (!(result.code === "op-rejected" && /already exists/.test(result.message)) || attempt === 2) {
        return track(report(result));
      }
    }
    return track(report({ ok: false, code: "op-rejected", message: "could not mint fresh layout ids" }));
  }

  async function duplicateSlides(ids) {    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    // Duplication copies committed content only — drafts live
    // outside the scene and never leak into the copy.
    const before = new Set(doc.snapshot().scenes.map((s) => s.id));
    let result;
    if (ids.length === 1) {
      result = await doc.apply({
        id: newEditId(), slideId: null,
        op: { type: "slide.duplicate", id: ids[0] },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
    } else if (ids.length === 0) {
      return track({ ok: true, revision: doc.snapshot().revision, noop: true });
    } else {
      result = await doc.applyBatch({
        id: newEditId(),
        baseRevision: doc.snapshot().revision, actor: "human",
        ops: ids.map((id) => ({ slideId: null, op: { type: "slide.duplicate", id } })),
      });
    }
    if (!result.ok) return track(report(result));
    sync();
    const added = doc.snapshot().scenes.map((s) => s.id).filter((id) => !before.has(id));
    return track({ ...result, ids: added });
  }

  async function duplicateSlide(id = null) {
    const target = id ?? activeSlideId();
    if (!target) return report({ ok: false, code: "op-rejected", message: "no active slide to duplicate" });
    const result = await duplicateSlides([target]);
    if (!result.ok) return result;
    return { ...result, id: result.ids[0] ?? null };
  }

  async function deleteSlides(ids) {
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides(ids);
    if (!gated.ok) return track(gated);
    if (ids.length === 0) return track({ ok: true, revision: doc.snapshot().revision, noop: true });
    let result;
    if (ids.length === 1) {
      result = await doc.apply({
        id: newEditId(), slideId: null,
        op: { type: "slide.delete", id: ids[0] },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
    } else {
      result = await doc.applyBatch({
        id: newEditId(),
        baseRevision: doc.snapshot().revision, actor: "human",
        ops: ids.map((id) => ({ slideId: null, op: { type: "slide.delete", id } })),
      });
    }
    if (!result.ok) return track(report(result));
    sync();
    return track({ ...result, deletedIds: [...ids] });
  }

  async function reorderSlide(id, toIndex) {
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    if (!Number.isInteger(toIndex) || toIndex < 0) {
      return report({ ok: false, code: "bad-envelope", message: "reorder needs a non-negative index" });
    }
    const result = await doc.apply({
      id: newEditId(), slideId: null,
      op: { type: "slide.reorder", id, toIndex },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return track(report(result));
    if (result.noop) return track(result);
    sync();
    return track(result);
  }

  async function detachSlide(id = null) {
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const gated = await gateTextForSlides();
    if (!gated.ok) return track(gated);
    const target = id ?? activeSlideId();
    if (!target) return report({ ok: false, code: "op-rejected", message: "no active slide to detach" });
    const result = await doc.apply({
      id: newEditId(), slideId: null,
      op: { type: "slide.setLayoutState", id: target, layoutState: "detached" },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return track(report(result));
    if (result.noop) return track(result);
    sync();
    return track(result);
  }

  async function setNotes(id, notes) {
    const target = id ?? activeSlideId();
    if (!target) return report({ ok: false, code: "op-rejected", message: "no active slide" });
    const scene = doc.snapshot().scenes.find((s) => s.id === target);
    if (!scene) return report({ ok: false, code: "unknown-slide", message: `unknown slide ${target}` });
    if ((scene.notes ?? "") === notes) return { ok: true, noop: true };
    const result = await doc.apply({
      id: newEditId(), slideId: null,
      op: { type: "slide.setNotes", id: target, notes },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return report(result);
    if (result.noop) return result;
    sync();
    return result;
  }

  // ——— V2-5J layer operations ———
  //
  // Draw order, user locks, and visibility over authoritative
  // element ids. Reorder rewrites the top-level array and the z
  // ranks together (z is the rank both projections sort by);
  // nested children refuse with the group unit named. Lock and
  // visibility toggles are explicit booleans, revisioned and
  // undoable like every other command.

  function layerTarget(id, kinds = null) {
    const snap = api.snapshot();
    const el = findIn(doc.snapshot().scenes, snap.slideId, id);
    if (!el) return { ok: false, code: "unknown-element", message: `unknown element ${id}` };
    if (kinds && !kinds.has(el.kind)) {
      return { ok: false, code: "op-rejected", message: `element ${id} (${el.kind}) is out of scope here` };
    }
    return { ok: true, snap, el };
  }

  // Top-down ancestor chain for a nested id, outermost first.
  // Locks inherit downward: an element under a locked group is
  // treated as locked for every modifying panel action, even
  // when the element itself carries no lock.
  function lockedAncestor(id) {
    const snap = api.snapshot();
    const slide = doc.snapshot().scenes.find((s) => s.id === snap.slideId);
    if (!slide) return null;
    const walk = (els, chain) => {
      for (const el of els ?? []) {
        if (el.id === id) return chain;
        const found = walk(el.group?.children, [...chain, el]);
        if (found) return found;
      }
      return null;
    };
    const chain = walk(slide.elements, []);
    if (!chain) return null;
    return chain.find((a) => a.locked === true) ?? null;
  }

  async function reorderElement(id, toIndex) {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    if (!Number.isInteger(toIndex) || toIndex < 0) {
      return report({ ok: false, code: "bad-envelope", message: "reorder needs a non-negative index" });
    }
    const target = layerTarget(id);
    if (!target.ok) return report(target);
    const result = await doc.apply({
      id: newEditId(), slideId: target.snap.slideId,
      op: { type: "element.reorder", id, toIndex },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return track(report(result));
    if (result.noop) return track(result);
    sync();
    return track(result);
  }

  async function setElementLocked(id, locked) {
    if (typeof locked !== "boolean") {
      return report({ ok: false, code: "bad-envelope", message: "locked must be a boolean" });
    }
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const target = layerTarget(id);
    if (!target.ok) return report(target);
    // System chrome stays locked: branding and structural marks
    // are institutional, and the panel must never bypass that.
    if (target.el.locked === true && locked === false && isSystemChrome(target.el)) {
      return report({ ok: false, code: "locked", message: `element ${id} is system chrome — it cannot be unlocked` });
    }
    if ((target.el.locked === true) === locked) {
      return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    }
    const result = await doc.apply({
      id: newEditId(), slideId: target.snap.slideId,
      op: { type: "element.setLocked", id, locked },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return track(report(result));
    if (result.noop) return track(result);
    sync();
    return track(result);
  }

  async function setElementHidden(id, hidden) {
    if (typeof hidden !== "boolean") {
      return report({ ok: false, code: "bad-envelope", message: "hidden must be a boolean" });
    }
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "commit or cancel the open text edit first" });
    }
    if (resize) {
      return report({ ok: false, code: "op-rejected", message: "finish resizing first" });
    }
    const target = layerTarget(id);
    if (!target.ok) return report(target);
    if (target.el.locked === true) {
      return report({ ok: false, code: "locked", message: `element ${id} is locked` });
    }
    const ancestor = lockedAncestor(id);
    if (ancestor) {
      return report({ ok: false, code: "locked", message: `element ${id} sits in locked group ${ancestor.id}` });
    }
    if ((target.el.hidden === true) === hidden) {
      return track(Promise.resolve({ ok: true, revision: doc.snapshot().revision, noop: true }));
    }
    const result = await doc.apply({
      id: newEditId(), slideId: target.snap.slideId,
      op: { type: "element.setVisibility", id, hidden },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    if (!result.ok) return track(report(result));
    if (result.noop) return track(result);
    sync();
    return track(result);
  }

  async function onEditAction(action) {
    // Interaction precedence: an open text edit outranks every canvas
    // shortcut. Arrows/Backspace belong to the caret (scene-dom never
    // forwards them from the textarea), and engine undo/redo stays
    // off while editing so Ctrl+Z means native text-undo, never a
    // document rewind. Each rejection is explicit, never silent.
    if (textSession && (action.type === "nudge" || action.type === "delete" || action.type === "undo" || action.type === "redo")) {
      return track(report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" }));
    }
    if (resize && (action.type === "nudge" || action.type === "delete" || action.type === "undo" || action.type === "redo")) {
      return track(report({ ok: false, code: "op-rejected", message: "finish resizing first" }));
    }
    if (action.type === "copy") return copySelected();
    if (action.type === "cut") return track(cutSelected());
    if (action.type === "paste") return track(pasteClipboard());
    if (action.type === "duplicate") return track(duplicateSelected());
    if (action.type === "selectAll") return selectAll();
    if (action.type === "group") return track(groupSelected());
    if (action.type === "ungroup") return track(ungroupSelected());
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

  const CLIP_MARKER = "presentation-forge/elements";
  const fromField = (ev) => ev.target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");

  // The system copy that follows Ctrl+C on the slide carries only our
  // marker, replacing whatever image was there, so the next paste is ours.
  function onClipboardCopy(ev) {
    if (textSession || fromField(ev) || !clipboard || !ev.clipboardData) return;
    ev.clipboardData.setData("text/plain", CLIP_MARKER);
    ev.preventDefault();
  }

  function onPaste(ev) {
    if (textSession || fromField(ev)) return;
    const data = ev.clipboardData;
    const files = [...(data?.files ?? [])].filter((f) => /^image\//.test(f.type ?? ""));
    if (files.length > 0 && onPasteFiles && data?.getData?.("text/plain") !== CLIP_MARKER) {
      ev.preventDefault();
      onPasteFiles(files);
      return;
    }
    if (clipboard) {
      ev.preventDefault();
      track(pasteClipboard());
    }
  }

  function onDblClick(ev) {
    if (textSession || drag) return;
    let id = api.resolveNode(ev.target);
    if (id === null && lastSingleSelect && Date.now() - lastSingleSelect.t < SINGLE_SELECT_WINDOW_MS) {
      const snap = api.snapshot();
      if (snap.selectedIds.length === 1 && snap.selectedIds[0] === lastSingleSelect.id) {
        id = lastSingleSelect.id;
      }
    }
    if (id === null) return;
    const snap = api.snapshot();
    if (!snap.selectedIds.includes(id)) api.select(id);
    beginTextEdit(id);
  }

  function onFocusOut(ev) {
    // Click-away commits (PowerPoint behavior): focus leaving the
    // editing overlay for anywhere outside it commits the draft.
    // Escape cancels through the textarea key handler before blur.
    if (!textSession?.box) return;
    const next = ev.relatedTarget;
    if (next && textSession.box.contains?.(next)) return;
    if (next && root.contains(next) && next.closest?.("[data-text-edit]")) return;
    commitTextEdit();
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerCancel);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("dblclick", onDblClick);
  root.addEventListener("copy", onClipboardCopy);
  root.addEventListener("cut", onClipboardCopy);
  root.addEventListener("paste", onPaste);
  root.addEventListener("focusout", onFocusOut);
  // Resize handles live in their own layer beside the selection
  // overlay layer: pointer-transparent except the handles
  // themselves, rebuilt on every viewer change (selection, zoom,
  // refit, commit) so alignment is never stale. See
  // ensureHandleLayer: viewer re-renders destroy the layer, so it
  // re-attaches itself on every reconcile.
  const offChange = viewer.onChange ? viewer.onChange(() => reconcileHandles()) : null;
  reconcileHandles();
  api.setEditable(true);
  api.onEditAction(onEditAction);
  // The viewer keeps whatever scenes it was created with; every
  // commit path syncs it back to the document, so the attach must
  // seat it too — otherwise opening (or restoring) a project whose
  // scenes differ from the fixture leaves the stage stale while the
  // filmstrip and engine already moved on. This is a silent seat,
  // not a commit: onSync stays per-commit, so attach fires none.
  api.replaceScenes(doc.snapshot().scenes);

  return {
    nudgeSelected: (key, shift = false) => nudgeSelected(key, shift),
    copySelected: () => copySelected(),
    cutSelected: () => track(cutSelected()),
    paste: () => track(pasteClipboard()),
    canPaste: () => clipboard !== null,
    duplicateSelected: () => track(duplicateSelected()),
    selectAll: () => selectAll(),
    alignSelected: (how) => track(arrangeSelected("align", how)),
    groupSelected: () => track(groupSelected()),
    ungroupSelected: () => track(ungroupSelected()),
    shrinkTextToFit: (id = null) => track(shrinkTextToFit(id)),
    distributeSelected: (axis) => track(arrangeSelected("distribute", axis)),
    deleteSelected: () => deleteSelected(),
    undo: () => undo(),
    redo: () => redo(),
    revision: () => doc.snapshot().revision,
    pending: () => pending,
    beginTextEdit: (id = null) => beginTextEdit(id),
    commitTextEdit: (opts = {}) => track(commitTextEdit(opts)),
    cancelTextEdit: () => cancelTextEdit(),
    commitPendingEdit: (opts = {}) => track(commitPendingEdit(opts)),
    hasPendingEdit: () => textSession !== null,
    pendingDraft: () => textSession?.draft ?? null,
    editingId: () => textSession?.elementId ?? null,
    addTextElement: (opts = {}) => addTextElement(opts),
    addShapeElement: (form = "rect", opts = {}) => addShapeElement(form, opts),
    addImageElement: (image, opts = {}) => addImageElement(image, opts),
    addIconElement: (glyph, opts = {}) => addIconElement(glyph, opts),
    insertSavedLayout: (layout, index = null) => insertSavedLayout(layout, index),
    replaceSlideLayout: (scene, basis) => replaceSlideLayout(scene, basis),
    addPresetElement: (kind, opts = {}) => addPresetElement(kind, opts),
    beginResize: (handle, id) => beginResize(handle, id, { pointerId: undefined, clientX: 0, clientY: 0 }),
    previewResize: (clientX, clientY) => previewResizeTo(clientX, clientY),
    commitResizeNow: (clientX, clientY) => commitResize({ clientX, clientY, pointerId: resize?.pointerId }),
    cancelResize: () => cancelResize(),
    resizingId: () => resize?.id ?? null,
    handlesVisible: () => (handleLayer ? handleLayer.querySelectorAll("[data-resize-handle]").length : 0),
    setElementStyle: (id, patch) => setElementStyle(id, patch),
    setTextStyle: (id, paragraphIndex, patch) => setTextStyle(id, paragraphIndex, patch),
    setChartData: (id, payload) => setChartData(id, payload),
    setTableData: (id, rows) => setTableData(id, rows),
    reorderElement: (id, toIndex) => track(reorderElement(id, toIndex)),
    setElementLocked: (id, locked) => track(setElementLocked(id, locked)),
    setElementHidden: (id, hidden) => track(setElementHidden(id, hidden)),
    insertSlide: (index = null) => track(insertSlide(index)),
    insertLayoutSlide: (templateId, index = null) => track(insertLayoutSlide(templateId, index)),
    duplicateSlide: (id = null) => track(duplicateSlide(id)),
    duplicateSlides: (ids) => track(duplicateSlides(ids ?? [])),
    deleteSlides: (ids) => track(deleteSlides(ids ?? [])),
    reorderSlide: (id, toIndex) => track(reorderSlide(id, toIndex)),
    detachSlide: (id = null) => track(detachSlide(id)),
    setNotes: (id, notes) => track(setNotes(id, notes)),
    detach() {
      if (drag) clearPreview();
      if (resize) cancelResize();
      lastSingleSelect = null;
      if (textSession) {
        closeTextarea(textSession);
        textSession = null;
      }
      try {
        offChange?.();
      } catch { /* teardown only */ }
      try {
        handleLayer?.remove();
      } catch { /* teardown only */ }
      handleLayer = null;
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("dblclick", onDblClick);
      root.removeEventListener("copy", onClipboardCopy);
      root.removeEventListener("cut", onClipboardCopy);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("focusout", onFocusOut);
      api.setEditable(false);
      api.onEditAction(null);
    },
  };
}
