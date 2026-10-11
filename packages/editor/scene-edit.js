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
import {
  isEditableText,
  describeStructure,
  paragraphsToDraft,
  buildUpdatedParagraphs,
  defaultTextElement,
  defaultShapeElement,
  overflowEstimate,
  tableOverflowEstimate,
  mintHumanId,
  cascadeBox,
  cascadeIndex,
  CASCADE_STEP,
  CASCADE_CYCLE,
} from "./scene-text.js";

// Documented keybinding contract (see the viewer toolbar hint and
// docs/V2-5C-EVAL.md): arrows move selection, Shift+arrows move
// further, Delete/Backspace removes, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
// (or Ctrl+Y) undo and redo. Arrows navigate slides when nothing is
// selected or the viewer is read-only.
export const NUDGE_STEP = 0.05; // inches per arrow press
export const NUDGE_LARGE_STEP = 0.25; // inches with Shift held
export const DRAG_THRESHOLD_PX = 4; // client px before a press becomes a drag
export const MIN_RESIZE_IN = 0.1; // floor for resized extents, in scene inches
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
export function resizeGeometry(origin, handle, dxIn, dyIn) {
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
  if (![x, y, w, h].every(Number.isFinite)) {
    throw new Error("scene-edit: non-finite resize geometry");
  }
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

export function attachEditor(viewer, doc, opts = {}) {
  const root = opts.root ?? null;
  if (!viewer?.api || !doc || !root) throw new Error("scene-edit: viewer, engine document, and root required");
  const onError = typeof opts.onError === "function" ? opts.onError : null;
  const onSync = typeof opts.onSync === "function" ? opts.onSync : null;
  const onTextEdit = typeof opts.onTextEdit === "function" ? opts.onTextEdit : null;
  const api = viewer.api;
  let drag = null;
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
    // Text-edit mode disables dragging: the press belongs to the
    // textarea caret, never to a move. Selection is left untouched.
    if (textSession) return;
    if (drag) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    // Resize handles own their press: starting a move here would
    // drag the whole element instead of reshaping it.
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
    if (resize) {
      if (ev.pointerId !== undefined && ev.pointerId !== resize.pointerId) return;
      previewResizeTo(ev.clientX, ev.clientY);
      return;
    }
    if (!drag) return;
    if (ev.pointerId !== undefined && ev.pointerId !== drag.pointerId) return;
    previewTo(ev.clientX, ev.clientY);
  }

  function onPointerCancel(ev) {
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
    const result = await doc.apply({
      id: newEditId(),
      slideId: s.slideId,
      op: { type: "element.updateText", id: s.elementId, paragraphs: next },
      baseRevision: opts.force ? cur.revision : s.baseRevision,
      actor: "human",
    });
    if (result.ok) {
      closeTextarea(s);
      textSession = null;
      sync();
      const fresh = findIn(doc.snapshot().scenes, s.slideId, s.elementId);
      const overflow = fresh ? overflowEstimate(fresh) : null;
      notifyText({ committed: true, overflow: overflow?.message ?? null });
      if (overflow && !overflow.fits && onError) {
        onError({ ok: false, code: "op-rejected", message: `overflow: ${overflow.message}` });
      }
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
    if (handleLayer) {
      while (handleLayer.firstChild) handleLayer.removeChild(handleLayer.firstChild);
    }
    const target = canShowHandles();
    if (!target || !handleLayer) return;
    const rect = handleRect(target.id);
    if (!rect) return;
    const docEl = root.ownerDocument;
    for (const handle of RESIZE_HANDLES) {
      const [ax, ay] = anchorOf(rect, handle);
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
  }

  function clearResizePreview() {
    handleLayer?.querySelector("[data-resize-preview]")?.remove();
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
      moved: false,
    };
    return { ok: true, revision: doc.snapshot().revision, resizing: true };
  }

  function previewResizeTo(clientX, clientY) {
    if (!resize) return null;
    const scales = svgScales(root);
    if (!scales) return null;
    if (!resize.moved && Math.hypot(clientX - resize.startX, clientY - resize.startY) < DRAG_THRESHOLD_PX) {
      return null;
    }
    resize.moved = true;
    const { dx, dy } = clientToSvgDelta(clientX - resize.startX, clientY - resize.startY, scales);
    const geom = resizeGeometry(resize.origin, resize.handle, dx / IN, dy / IN);
    drawResizePreview(geom);
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
      const { dx, dy } = clientToSvgDelta(ev.clientX - s.startX, ev.clientY - s.startY, scales);
      geom = resizeGeometry(s.origin, s.handle, dx / IN, dy / IN);
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
      const fresh = findIn(doc.snapshot().scenes, s.slideId, s.id);
      if (fresh?.kind === "text") {
        const overflow = overflowEstimate(fresh);
        if (overflow && !overflow.fits && onError) {
          onError({ ok: false, code: "op-rejected", message: `overflow: ${overflow.message}` });
        }
      }
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
    return track((async () => {
      const result = await doc.apply({
        id: newEditId(),
        slideId: snap.slideId,
        op,
        baseRevision: doc.snapshot().revision,
        actor: "human",
      });
      if (result.ok) {
        sync();
        const fresh = findIn(doc.snapshot().scenes, snap.slideId, id);
        if (fresh?.kind === "text") {
          const overflow = overflowEstimate(fresh);
          if (overflow && !overflow.fits && onError) {
            onError({ ok: false, code: "op-rejected", message: `overflow: ${overflow.message}` });
          }
        }
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

  return {
    nudgeSelected: (key, shift = false) => nudgeSelected(key, shift),
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
      root.removeEventListener("focusout", onFocusOut);
      api.setEditable(false);
      api.onEditAction(null);
    },
  };
}
