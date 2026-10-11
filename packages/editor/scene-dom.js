// @forge/editor — scene-dom. Framework-free browser binding for a
// SlideScene: mounts the shared SVG projection as live DOM,
// tracks read-only viewer state (slide, zoom, selection), and
// exposes stable element handles for V2-5. No AI, no persistence,
// no PPTX, no planning, no scene mutation — selections are id sets,
// geometry comes from scene inches or getBoundingClientRect, and
// scenes are deep-frozen on mount in development so a read-only
// violation throws instead of corrupting. React (SceneViewer) and
// the smoke page are thin shells over this one implementation.
//
// Selection model (V2-4E): `selectedIds` is an ordered,
// de-duplicated list of authoritative element ids, independent
// of scene content. Clicks resolve through the DOM to the
// outermost [data-el] unit (group children resolve to their
// parent group); locked elements — including locked descendants
// of unlocked groups — never resolve. Overlays are a separate
// pointer-transparent layer positioned from measured DOM rects
// with scene-geometry fallback, so the scene SVG is never
// modified for selection. Keyboard (Tab cycles, Escape clears,
// arrows/Home/End navigate, +/-/0 zoom) is bound here so every
// shell shares one behavior.
import { sceneToSvg } from "./scene-svg.js";
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

export const SLIDE_ASPECT = SCENE_W / SCENE_H;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const SELECT_ACCENT = "#e0705a";

const IN_PX = 96; // svg px per scene inch, matching scene-svg.js

// Flat scene-element walk including group children, in document
// order. Exported for tests and V2-5 tooling; read-only.
export function walkSceneEls(els, out = []) {
  for (const el of els ?? []) {
    out.push(el);
    walkSceneEls(el.group?.children ?? [], out);
  }
  return out;
}

function parseSvg(doc, svg) {
  const tpl = doc.createElement("div");
  tpl.innerHTML = svg.trim();
  const node = tpl.querySelector("svg");
  if (!node) throw new Error("scene-dom: projection produced no <svg> root");
  return node;
}

function freezeScenes(scenes) {
  const frozen = structuredClone(scenes);
  const walk = (v) => {
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) walk(v[k]);
      Object.freeze(v);
    }
  };
  walk(frozen);
  return frozen;
}

// Deterministic zoom math, DOM-free and unit-tested: fit scale for
// a container, clamped user zoom, and the effective render scale.
export function fitScale(containerW, containerH) {
  const w = Number(containerW);
  const h = Number(containerH);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1;
  return Math.min(w / (SCENE_W * 96), h / (SCENE_H * 96));
}

export function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
}

export function nextIndex(i, n) {
  if (n <= 0) return 0;
  return (i + 1 + n) % n;
}

export function prevIndex(i, n) {
  if (n <= 0) return 0;
  return (i - 1 + n) % n;
}

export function clampIndex(i, n) {
  if (n <= 0) return 0;
  if (!Number.isFinite(i)) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor(i)));
}

export function createViewer(rootEl, scenes, opts = {}) {
  if (!rootEl) throw new Error("scene-dom: mount requires a root element");
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { state: { status: "empty" }, api: {}, onChange() {}, destroy() {} };
  }
  let frozen = freezeScenes(scenes);
  const doc = rootEl.ownerDocument;
  rootEl.style.position = "relative";
  const listeners = new Set();
  const state = {
    status: "ready",
    slideIndex: clampIndex(opts.slideIndex ?? 0, frozen.length),
    zoom: clampZoom(opts.zoom ?? 1),
    fit: 1,
    selectedIds: [],
  };
  // V2-5 editing seams: the frozen set is replaced wholesale by
  // replaceScenes (never mutated in place); selection, overlays,
  // and keyboard stay viewer-owned while commits cross the engine.
  let editable = false;
  let editAction = null;
  let suppressClick = false;
  let overlayLayer = null;
  const emit = () => {
    const snap = snapshot();
    for (const fn of listeners) fn(snap);
  };

  function render() {
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    const scene = frozen[state.slideIndex];
    const node = parseSvg(doc, sceneToSvg(scene, { wrapText: true }));
    node.setAttribute("data-slide", scene.id);
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.display = "block";
    const stage = doc.createElement("div");
    stage.setAttribute("data-stage", scene.id);
    stage.appendChild(node);
    rootEl.appendChild(stage);
    const layer = doc.createElement("div");
    layer.setAttribute("data-overlay-layer", "");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    rootEl.appendChild(layer);
    overlayLayer = layer;
    applySelection();
  }

  // Selection operates on authoritative units: the outermost
  // [data-el] ancestor of a hit target. Chart/table/text innards
  // carry no data-el so they resolve to their element; group
  // children do, and resolve to the parent group — children lack
  // authored-block semanticRefs, and group lock flags do not
  // propagate in the projection, so resolution also enforces
  // locked exclusion where the hit node alone would miss it.
  function authoritativeId(node) {
    let top = node;
    let parent = top.parentElement;
    while (parent && rootEl.contains(parent)) {
      const g = parent.closest("[data-el]");
      if (!g || !rootEl.contains(g)) break;
      top = g;
      parent = top.parentElement;
    }
    return top.getAttribute("data-el");
  }

  function resolveId(id) {
    const safe = String(id ?? "").replace(/["\\]/g, "");
    if (!safe) return null;
    const node = rootEl.querySelector(`[data-el="${safe}"]`);
    if (!node) return null;
    let n = node;
    while (n && rootEl.contains(n)) {
      if (typeof n.getAttribute === "function" && n.getAttribute("data-locked") === "true") return null;
      n = n.parentElement;
    }
    return authoritativeId(node);
  }

  // Outermost unlocked units in DOM order: the Tab cycle and the
  // keyboard anchor. Nested group children never list; locked
  // groups never list.
  function selectableIds() {
    const out = [];
    for (const n of rootEl.querySelectorAll("[data-el]")) {
      const up = n.parentElement && n.parentElement.closest ? n.parentElement.closest("[data-el]") : null;
      if (up && rootEl.contains(up)) continue;
      if (n.getAttribute("data-locked") === "true") continue;
      out.push(n.getAttribute("data-el"));
    }
    return out;
  }

  // Authoritative scene-geometry rect in SVG px, mirroring the
  // projection's group offsets. DOM-free, so unit tests and the
  // overlay fallback share it.
  function sceneRect(id) {
    const scene = frozen[state.slideIndex];
    if (!scene) return null;
    const walk = (els, ox, oy) => {
      for (const el of els ?? []) {
        const ax = ox + (el.x ?? 0);
        const ay = oy + (el.y ?? 0);
        if (el.id === id) {
          if (el.kind === "line") {
            const x2 = el.line?.x2 ?? ax;
            const y2 = el.line?.y2 ?? ay;
            const pad = (el.line?.strokeWidth ?? 1.5) / 2 + 1;
            return {
              x: Math.min(ax, x2) * IN_PX - pad,
              y: Math.min(ay, y2) * IN_PX - pad,
              w: Math.abs(x2 - ax) * IN_PX + pad * 2,
              h: Math.abs(y2 - ay) * IN_PX + pad * 2,
            };
          }
          return { x: ax * IN_PX, y: ay * IN_PX, w: (el.w ?? 0) * IN_PX, h: (el.h ?? 0) * IN_PX };
        }
        const found = walk(el.group?.children, ax, ay);
        if (found) return found;
      }
      return null;
    };
    return walk(scene.elements, 0, 0);
  }

  // Measured rect in SVG px via client rects, so nested transforms
  // and zoom need no special cases. Null without layout (linkedom)
  // or for unknown ids; callers fall back to sceneRect.
  function measuredRect(id) {
    const safe = String(id ?? "").replace(/["\\]/g, "");
    const svg = rootEl.querySelector("svg");
    const node = safe ? rootEl.querySelector(`[data-el="${safe}"]`) : null;
    if (!svg || !node || typeof node.getBoundingClientRect !== "function") return null;
    const s = svg.getBoundingClientRect();
    if (!s || !(s.width > 0) || !(s.height > 0)) return null;
    const r = node.getBoundingClientRect();
    const k = s.width / (SCENE_W * IN_PX);
    if (!(k > 0)) return null;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  // Overlay boxes live in a pointer-transparent layer over the
  // stage, positioned in SVG px so the shell's scale transform
  // carries them through zoom and fit for free. The scene SVG is
  // never touched. Borders draw inside the box (border-box) so
  // edge elements keep a stable, unclipped ring.
  function positionOverlays() {
    if (!overlayLayer) return;
    while (overlayLayer.firstChild) overlayLayer.removeChild(overlayLayer.firstChild);
    for (const id of state.selectedIds) {
      const rect = measuredRect(id) ?? sceneRect(id);
      if (!rect) continue;
      const box = doc.createElement("div");
      box.setAttribute("data-overlay", id);
      box.style.position = "absolute";
      box.style.left = `${rect.x.toFixed(1)}px`;
      box.style.top = `${rect.y.toFixed(1)}px`;
      box.style.width = `${Math.max(0, rect.w).toFixed(1)}px`;
      box.style.height = `${Math.max(0, rect.h).toFixed(1)}px`;
      box.style.boxSizing = "border-box";
      box.style.border = `2px solid ${SELECT_ACCENT}`;
      box.style.borderRadius = "2px";
      box.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.85)";
      box.style.pointerEvents = "none";
      overlayLayer.appendChild(box);
    }
  }

  function applySelection() {
    const prev = rootEl.querySelectorAll("[data-selected]");
    for (const n of prev) n.removeAttribute("data-selected");
    for (const id of state.selectedIds) {
      // First match in document order is the outermost unit:
      // parents precede their children, so nested duplicates
      // never arise from authoritative ids.
      const safe = String(id).replace(/["\\]/g, "");
      const found = rootEl.querySelector(`[data-el="${safe}"]`);
      if (found) found.setAttribute("data-selected", "true");
    }
    positionOverlays();
  }

  function elementIds() {
    const out = [];
    for (const n of rootEl.querySelectorAll("[data-el]")) {
      out.push({
        id: n.getAttribute("data-el"),
        locked: n.getAttribute("data-locked") === "true",
      });
    }
    return out;
  }

  function snapshot() {
    const scene = frozen[state.slideIndex];
    return {
      status: state.status,
      slideIndex: state.slideIndex,
      slideId: scene?.id ?? null,
      slideCount: frozen.length,
      zoom: state.zoom,
      fit: state.fit,
      effectiveScale: state.fit * state.zoom,
      selectedIds: [...state.selectedIds],
      selectedId: state.selectedIds[0] ?? null,
    };
  }

  const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

  const api = {
    snapshot,
    goTo(i) {
      const next = clampIndex(i, frozen.length);
      if (next !== state.slideIndex) {
        state.slideIndex = next;
        state.selectedIds = [];
        render();
        emit();
      }
      return snapshot();
    },
    next() {
      return api.goTo(nextIndex(state.slideIndex, frozen.length));
    },
    prev() {
      return api.goTo(prevIndex(state.slideIndex, frozen.length));
    },
    setZoom(z) {
      const next = clampZoom(z);
      if (next !== state.zoom) {
        state.zoom = next;
        positionOverlays();
        emit();
      }
      return snapshot();
    },
    zoomIn() {
      return api.setZoom(state.zoom * 1.25);
    },
    zoomOut() {
      return api.setZoom(state.zoom / 1.25);
    },
    resetZoom() {
      return api.setZoom(1);
    },
    refit(containerW, containerH) {
      state.fit = fitScale(containerW, containerH);
      positionOverlays();
      emit();
      return snapshot();
    },
    select(id, opts = {}) {
      // Locked chrome is inspectable but never selectable: V2-5
      // will skip locked elements the same way. Unknown ids are a
      // no-op. Group children resolve to their parent group.
      const resolved = resolveId(id);
      if (resolved === null) return snapshot();
      if (opts.additive) {
        state.selectedIds = state.selectedIds.includes(resolved)
          ? state.selectedIds.filter((s) => s !== resolved)
          : [...state.selectedIds, resolved];
      } else {
        state.selectedIds = [resolved];
      }
      applySelection();
      emit();
      return snapshot();
    },
    toggle(id) {
      return api.select(id, { additive: true });
    },
    selectMany(ids) {
      const out = [];
      for (const id of ids ?? []) {
        const resolved = resolveId(id);
        if (resolved !== null && !out.includes(resolved)) out.push(resolved);
      }
      state.selectedIds = out;
      applySelection();
      emit();
      return snapshot();
    },
    clearSelection() {
      if (state.selectedIds.length > 0) {
        state.selectedIds = [];
        applySelection();
        emit();
      }
      return snapshot();
    },
    // Tab-order focus: advance single selection through the
    // selectable units in DOM order, wrapping. The anchor is the
    // most recent selection, so repeated Tabs walk forward and
    // Shift+Tab walks back deterministically.
    cycleSelection(dir = 1) {
      const ids = selectableIds();
      if (ids.length === 0) return snapshot();
      const anchor = state.selectedIds.length > 0
        ? state.selectedIds[state.selectedIds.length - 1]
        : null;
      const at = anchor === null ? -1 : ids.indexOf(anchor);
      const step = dir < 0 ? ids.length - 1 : 1;
      state.selectedIds = [ids[(at + step + ids.length) % ids.length]];
      applySelection();
      emit();
      return snapshot();
    },
    selectableIds,
    // Authoritative scene-geometry bounds in SVG px (DOM-free).
    bounds(id) {
      const resolved = resolveId(id);
      return resolved === null ? null : sceneRect(resolved);
    },
    // Measured DOM bounds in SVG px, or null without layout.
    measuredBounds(id) {
      const resolved = resolveId(id);
      return resolved === null ? null : measuredRect(resolved);
    },
    // Grounded inspector record from the authoritative scene —
    // the read-only debugging surface V2-5 builds on.
    inspect(id) {
      const els = walkSceneEls(frozen[state.slideIndex]?.elements);
      const el = els.find((e) => e.id === id);
      if (!el) return null;
      return {
        id: el.id,
        kind: el.kind,
        x: r3(el.x ?? 0),
        y: r3(el.y ?? 0),
        w: r3(el.w ?? 0),
        h: r3(el.h ?? 0),
        locked: el.locked === true,
        semanticRef: el.semanticRef ?? null,
        provenance: el.provenance ?? null,
      };
    },
    // Reposition overlays after out-of-band layout changes (font
    // settle, stylesheet arrival). Zoom, refit, render, and every
    // selection op already reposition.
    reposition() {
      positionOverlays();
      return snapshot();
    },
    // Resolve a DOM event target to its authoritative unit id, or
    // null for background and locked hits. Shared by the click
    // handler and editing adapters so hit testing has one path.
    resolveNode(node) {
      const t = node?.closest?.("[data-el]");
      if (!t || !rootEl.contains(t)) return null;
      let n = t;
      while (n && rootEl.contains(n)) {
        if (typeof n.getAttribute === "function" && n.getAttribute("data-locked") === "true") return null;
        n = n.parentElement;
      }
      return authoritativeId(t);
    },
    // Replace the frozen scene set wholesale after an engine
    // commit (never mutated in place). Selection reconciles by
    // dropping ids that no longer resolve; slide, zoom, and fit
    // are preserved.
    replaceScenes(scenes) {
      if (!Array.isArray(scenes) || scenes.length === 0) return snapshot();
      frozen = freezeScenes(scenes);
      state.slideIndex = clampIndex(state.slideIndex, frozen.length);
      render();
      state.selectedIds = state.selectedIds.filter((id) => resolveId(id) !== null);
      applySelection();
      emit();
      return snapshot();
    },
    // Editable mode for V2-5 interaction adapters. Read-only
    // behavior is unchanged while off; edit keys ignore when off.
    setEditable(on) {
      editable = !!on;
      return snapshot();
    },
    // Editing adapters register one callback receiving
    // { type: "nudge", key, shift } | { type: "delete" } |
    // { type: "undo" } | { type: "redo" }. The viewer never
    // interprets commands — it forwards and re-renders.
    onEditAction(fn) {
      editAction = typeof fn === "function" ? fn : null;
    },
    // Suppress the next click's selection handling (used after a
    // pointerdown already applied click-equivalent selection, so a
    // trailing click cannot double-apply a shift-toggle).
    suppressNextClick() {
      suppressClick = true;
    },
  };

  rootEl.addEventListener("click", (ev) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = api.resolveNode(ev.target);
    if (id === null) {
      api.clearSelection();
      return;
    }
    if (ev.shiftKey) api.toggle(id);
    else api.select(id);
  });

  // One keyboard behavior for every shell: slide navigation,
  // zoom, selection clearing, and Tab-order focus. Bound here —
  // not per shell — so headless tests drive the same path as
  // Chrome. The listener lives on the mount root, so inputs and
  // filmstrip controls outside it are never hijacked. In editable
  // mode with a selection, arrows nudge and Delete removes via the
  // registered edit action instead of navigating; Ctrl/Cmd+Z/Y
  // undo and redo. Edit keys never fire from form fields.
  rootEl.addEventListener("keydown", (ev) => {
    const k = ev.key;
    const inField = ev.target && ev.target.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
    if (editable && !inField && editAction) {
      const mod = ev.ctrlKey || ev.metaKey;
      if ((k === "ArrowRight" || k === "ArrowLeft" || k === "ArrowUp" || k === "ArrowDown") && state.selectedIds.length > 0) {
        editAction({ type: "nudge", key: k, shift: !!ev.shiftKey });
        ev.preventDefault();
        return;
      }
      if ((k === "Delete" || k === "Backspace") && state.selectedIds.length > 0) {
        editAction({ type: "delete" });
        ev.preventDefault();
        return;
      }
      if (mod && (k === "z" || k === "Z")) {
        editAction({ type: ev.shiftKey ? "redo" : "undo" });
        ev.preventDefault();
        return;
      }
      if (mod && (k === "y" || k === "Y")) {
        editAction({ type: "redo" });
        ev.preventDefault();
        return;
      }
    }
    if (k === "ArrowRight") api.next();
    else if (k === "ArrowLeft") api.prev();
    else if (k === "Home") api.goTo(0);
    else if (k === "End") api.goTo(frozen.length - 1);
    else if (k === "Escape") api.clearSelection();
    else if (k === "Tab") api.cycleSelection(ev.shiftKey ? -1 : 1);
    else if (k === "+" || k === "=") api.zoomIn();
    else if (k === "-") api.zoomOut();
    else if (k === "0") api.resetZoom();
    else return;
    ev.preventDefault();
  });

  render();
  emit();
  return {
    state,
    api,
    elementIds,
    scenes: frozen,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      listeners.clear();
      while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
    },
  };
}
