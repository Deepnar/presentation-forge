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
  isSimpleText,
  describeStructure,
  paragraphsToDraft,
  buildUpdatedParagraphs,
  defaultTextElement,
  defaultShapeElement,
  overflowEstimate,
  mintHumanId,
} from "./scene-text.js";

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
  const SINGLE_SELECT_WINDOW_MS = 600;  let pending = Promise.resolve(null);
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
    if (!isSimpleText(el.paragraphs)) {
      const d = describeStructure(el.paragraphs);
      return report({
        ok: false,
        code: "op-rejected",
        message: `rich text is read-only in this slice (${d.paragraphs} paragraph(s), ${d.runs} run(s)) — editing would flatten its formatting`,
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
    notifyText({ elementId: target, slideId: snap.slideId, draft: textSession.draft });
    return { ok: true, revision: textSession.baseRevision, elementId: target, draft: textSession.draft };
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

  async function commitTextEditInner(opts = {}) {
    const s = textSession;
    if (!s) return report({ ok: false, code: "op-rejected", message: "no text edit in progress" });
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
    const result = await doc.undo();
    if (result.ok) sync();
    return track(report(result));
  }

  async function redo() {
    if (textSession) {
      return report({ ok: false, code: "op-rejected", message: "finish the open text edit first (commit or cancel)" });
    }
    const result = await doc.redo();
    if (result.ok) sync();
    return track(report(result));
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
    detach() {
      if (drag) clearPreview();
      lastSingleSelect = null;
      if (textSession) {
        closeTextarea(textSession);
        textSession = null;
      }
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
