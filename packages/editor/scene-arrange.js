// Arrangement helpers a slide editor's hands expect: snapping a dragged
// box to the slide and to its neighbours, and copying elements so they can
// be pasted or duplicated. Pure functions over scene inches — the editor
// adapter owns the gestures and the overlay, these own the arithmetic, so
// preview and commit can never disagree.

// Client pixels within which an edge or centre catches a guide. PowerPoint
// and Canva both sit around this; much wider and boxes jump while placing.
export const SNAP_PX = 6;

const boxOf = (el) => ({ x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? 0, h: el.h ?? 0 });

// The union box of a set of elements, in scene inches.
export function unionBox(elements) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of elements) {
    const b = boxOf(el);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// The lines a moving box may align to: the slide's edges and centre, and
// the edges and centres of every other visible element on it.
export function snapTargets(scene, excludeIds = []) {
  const skip = new Set(excludeIds);
  const W = scene?.width ?? 13.333;
  const H = scene?.height ?? 7.5;
  const xs = [0, W / 2, W];
  const ys = [0, H / 2, H];
  for (const el of scene?.elements ?? []) {
    if (skip.has(el.id) || el.hidden === true || el.kind === "line") continue;
    const b = boxOf(el);
    if (!(b.w > 0) || !(b.h > 0)) continue;
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

// The nearest pull for one axis: each feature of the box (start, centre,
// end) against each target line, the closest pair inside the threshold.
function pull(features, lines, threshold) {
  let best = null;
  for (const f of features) {
    for (const at of lines) {
      const d = at - f;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d) - 1e-9)) best = { d, at };
    }
  }
  return best;
}

// A box moved by (dx, dy) inches, snapped: each axis independently takes
// the nearest alignment within `threshold` inches. Returns the adjusted
// delta and the guide lines to draw (every target the snapped box now
// touches on that axis, so a centre and an edge both show).
export function snapMove(box, dx, dy, targets, threshold) {
  const fx = (d) => [box.x + d, box.x + d + box.w / 2, box.x + d + box.w];
  const fy = (d) => [box.y + d, box.y + d + box.h / 2, box.y + d + box.h];
  const px = pull(fx(dx), targets.xs, threshold);
  const py = pull(fy(dy), targets.ys, threshold);
  const ndx = px ? dx + px.d : dx;
  const ndy = py ? dy + py.d : dy;
  return { dx: ndx, dy: ndy, guides: guidesFor(fx(ndx), fy(ndy), targets, !!px, !!py) };
}

// The moving edges of a resize, snapped the same way: only the edges the
// handle drags take part, so the anchored side never moves.
export function snapResize(origin, handle, dx, dy, targets, threshold) {
  let ndx = dx, ndy = dy, sx = false, sy = false;
  if (handle.includes("e") || handle.includes("w")) {
    const edge = handle.includes("e") ? origin.x + origin.w + dx : origin.x + dx;
    const p = pull([edge], targets.xs, threshold);
    if (p) { ndx = dx + p.d; sx = true; }
  }
  if (handle.includes("n") || handle.includes("s")) {
    const edge = handle.includes("s") ? origin.y + origin.h + dy : origin.y + dy;
    const p = pull([edge], targets.ys, threshold);
    if (p) { ndy = dy + p.d; sy = true; }
  }
  const xEdge = handle.includes("e") ? origin.x + origin.w + ndx : origin.x + ndx;
  const yEdge = handle.includes("s") ? origin.y + origin.h + ndy : origin.y + ndy;
  return { dx: ndx, dy: ndy, guides: guidesFor([xEdge], [yEdge], targets, sx, sy) };
}

// One guide per line touched: neighbours sharing an edge (or a centre on
// the slide's centre) differ only by rounding, and would draw twice.
function guidesFor(fxs, fys, targets, sx, sy) {
  const guides = [];
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const add = (axis, at) => { if (!guides.some((g) => g.axis === axis && near(g.at, at))) guides.push({ axis, at }); };
  if (sx) for (const at of targets.xs) if (fxs.some((f) => near(f, at))) add("x", at);
  if (sy) for (const at of targets.ys) if (fys.some((f) => near(f, at))) add("y", at);
  return guides;
}

// Shift while dragging keeps the move on one axis, the one the pointer
// has travelled further along — the PowerPoint and Canva constraint.
export function constrainAxis(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

// A corner resize that keeps the box's proportions: the larger relative
// change wins and the corner opposite the handle stays put.
export function keepAspect(origin, handle, geom) {
  if (handle.length !== 2 || !(origin.w > 0) || !(origin.h > 0)) return geom;
  const s = Math.max(geom.w / origin.w, geom.h / origin.h);
  const w = origin.w * s, h = origin.h * s;
  return {
    x: handle.includes("w") ? origin.x + origin.w - w : origin.x,
    y: handle.includes("n") ? origin.y + origin.h - h : origin.y,
    w, h,
  };
}

// Ownership and identity a copy must not inherit: a pasted element is the
// person's own, so regeneration never treats it as the compiled original
// (which would leave two elements claiming one semantic slot).
const COMPILED_ONLY = ["semanticRef", "customized", "contentCustomized", "styleCustomized", "formatCustomized", "dataCustomized", "tableCustomized", "z", "locked"];

// Copies of `elements` ready for element.add: fresh ids all the way down a
// group, human provenance, no compiled ownership, offset by (ox, oy).
export function copyElements(elements, newId, ox = 0, oy = 0) {
  const strip = (el, top) => {
    const out = structuredClone(el);
    for (const k of COMPILED_ONLY) delete out[k];
    out.id = newId();
    out.provenance = "human";
    if (top) {
      out.x = Math.round(((out.x ?? 0) + ox) * 1000) / 1000;
      out.y = Math.round(((out.y ?? 0) + oy) * 1000) / 1000;
      if (out.kind === "line" && out.line) {
        out.line = { ...out.line };
        if (typeof out.line.x2 === "number") out.line.x2 = Math.round((out.line.x2 + ox) * 1000) / 1000;
        if (typeof out.line.y2 === "number") out.line.y2 = Math.round((out.line.y2 + oy) * 1000) / 1000;
      }
    }
    if (out.group?.children) out.group = { ...out.group, children: out.group.children.map((c) => strip(c, false)) };
    return out;
  };
  return elements.map((el) => strip(el, true));
}

// The offset a paste lands at: in place on another slide, and stepped down
// and right from the originals on the same slide, further for each repeat,
// so a pasted copy is never hidden exactly under what it copied.
export const PASTE_STEP = 0.25;

// Where each box goes to line up along one side or centre of `frame` —
// the slide for a single element, the selection's own box for several
// (PowerPoint's "align selected" and "align to slide").
export function alignMoves(items, how, frame) {
  return items.map((b) => {
    let { x, y } = b;
    if (how === "left") x = frame.x;
    else if (how === "center") x = frame.x + (frame.w - b.w) / 2;
    else if (how === "right") x = frame.x + frame.w - b.w;
    else if (how === "top") y = frame.y;
    else if (how === "middle") y = frame.y + (frame.h - b.h) / 2;
    else if (how === "bottom") y = frame.y + frame.h - b.h;
    else throw new Error(`unknown alignment ${how}`);
    return { id: b.id, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  });
}

// Equal gaps between three or more boxes along one axis: the outermost
// two stay where they are and the rest are spaced between them, in the
// order they already sit.
export function distributeMoves(items, axis) {
  if (items.length < 3) return items.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  const pos = axis === "x" ? "x" : "y", size = axis === "x" ? "w" : "h";
  const sorted = [...items].sort((a, b) => a[pos] - b[pos] || a.id.localeCompare(b.id));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = last[pos] + last[size] - first[pos];
  const gap = (span - sorted.reduce((n, b) => n + b[size], 0)) / (sorted.length - 1);
  let at = first[pos];
  const moved = new Map();
  for (const b of sorted) {
    moved.set(b.id, Math.round(at * 1000) / 1000);
    at += b[size] + gap;
  }
  return items.map((b) => ({ id: b.id, x: pos === "x" ? moved.get(b.id) : b.x, y: pos === "y" ? moved.get(b.id) : b.y }));
}
