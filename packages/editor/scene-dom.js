// @forge/editor — scene-dom. Framework-free browser binding for a
// SlideScene: mounts the shared SVG projection as live DOM,
// tracks read-only viewer state (slide, zoom, selection), and
// exposes stable element handles for V2-5. No AI, no persistence,
// no PPTX, no planning, no scene mutation — selections are id sets,
// geometry comes from getBBox, and scenes are deep-frozen on mount
// in development so a read-only violation throws instead of
// corrupting. React (SceneViewer) and the smoke page are thin
// shells over this one implementation.
import { sceneToSvg } from "./scene-svg.js";
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

export const SLIDE_ASPECT = SCENE_W / SCENE_H;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

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
  const frozen = freezeScenes(scenes);
  const doc = rootEl.ownerDocument;
  const listeners = new Set();
  const state = {
    status: "ready",
    slideIndex: clampIndex(opts.slideIndex ?? 0, frozen.length),
    zoom: clampZoom(opts.zoom ?? 1),
    fit: 1,
    selectedId: null,
  };
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
    applySelection();
  }

  function applySelection() {
    const prev = rootEl.querySelectorAll("[data-selected]");
    for (const n of prev) n.removeAttribute("data-selected");
    if (state.selectedId == null) return;
    // CSS.escape is unavailable in some test DOMs; ids are
    // compiler-generated without quotes or backslashes.
    const found = rootEl.querySelector(`[data-el="${state.selectedId}"]`);
    if (found) found.setAttribute("data-selected", "true");
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
      selectedId: state.selectedId,
    };
  }

  const api = {
    goTo(i) {
      const next = clampIndex(i, frozen.length);
      if (next !== state.slideIndex) {
        state.slideIndex = next;
        state.selectedId = null;
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
      emit();
      return snapshot();
    },
    select(id) {
      // Locked chrome is inspectable but never selectable: V2-5
      // will skip locked elements the same way.
      const known = elementIds().find((e) => e.id === id);
      if (!known || known.locked) return snapshot();
      state.selectedId = id;
      applySelection();
      emit();
      return snapshot();
    },
    clearSelection() {
      if (state.selectedId !== null) {
        state.selectedId = null;
        applySelection();
        emit();
      }
      return snapshot();
    },
  };

  rootEl.addEventListener("click", (ev) => {
    const t = ev.target?.closest?.("[data-el]");
    if (!t) {
      api.clearSelection();
      return;
    }
    api.select(t.getAttribute("data-el"));
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
