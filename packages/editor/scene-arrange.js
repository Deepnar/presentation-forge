// Arrangement helpers a slide editor's hands expect: snapping a dragged
// box to the slide and to its neighbours, and copying elements so they can
// be pasted or duplicated. Pure functions over scene inches — the editor
// adapter owns the gestures and the overlay, these own the arithmetic, so
// preview and commit can never disagree.

// Client pixels within which an edge or centre catches a guide. PowerPoint
// and Canva both sit around this; much wider and boxes jump while placing.
export const SNAP_PX = 6;

// The box an element occupies on screen: its own box, or for a rotated one
// the upright box around it — what a person lines it up by.
export function visualBox(el) {
  const x = el.x ?? 0, y = el.y ?? 0, w = el.w ?? 0, h = el.h ?? 0;
  const deg = el.rotation ?? 0;
  if (!deg) return { x, y, w, h };
  const t = (deg * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const W = w * c + h * s, H = w * s + h * c;
  return { x: x + w / 2 - W / 2, y: y + h / 2 - H / 2, w: W, h: H };
}
const boxOf = visualBox;

// A client-space vector expressed in a rotated element's own frame, and back.
export function toLocal(dx, dy, deg) {
  const t = (-(deg ?? 0) * Math.PI) / 180;
  return { dx: dx * Math.cos(t) - dy * Math.sin(t), dy: dx * Math.sin(t) + dy * Math.cos(t) };
}
export const toWorld = (dx, dy, deg) => toLocal(dx, dy, -(deg ?? 0));

// A resize of a rotated element, done in its own frame: the handle's edge
// moves along the element's axes and the opposite edge stays where it is on
// screen. `geomLocal` is the unrotated-frame result of resizeGeometry.
export function rotatedResize(origin, geomLocal, deg) {
  const dcx = geomLocal.x + geomLocal.w / 2 - (origin.x + origin.w / 2);
  const dcy = geomLocal.y + geomLocal.h / 2 - (origin.y + origin.h / 2);
  const shift = toWorld(dcx, dcy, deg);
  const cx = origin.x + origin.w / 2 + shift.dx, cy = origin.y + origin.h / 2 + shift.dy;
  const r = (n) => Math.round(n * 1000) / 1000;
  return { x: r(cx - geomLocal.w / 2), y: r(cy - geomLocal.h / 2), w: geomLocal.w, h: geomLocal.h };
}

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
  const boxes = [];
  for (const el of scene?.elements ?? []) {
    if (skip.has(el.id) || el.hidden === true || el.kind === "line") continue;
    const b = boxOf(el);
    if (!(b.w > 0) || !(b.h > 0)) continue;
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    // Spacing reads neighbours, and a panel behind the whole slide is
    // nobody's neighbour.
    if (b.w < W * 0.9 || b.h < H * 0.9) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  }
  return { xs, ys, boxes };
}

// Equal spacing on one axis, as Figma and PowerPoint offer it: the box
// centred between its nearest neighbours in the same row (or column), or
// set one gap away from a neighbour that already has that gap to its own
// neighbour. Returns the nearest within `threshold` as { d, gaps } — the
// correction and the equal gaps to mark — or null.
function spacingPull(box, d, boxes, axis, threshold) {
  const [p, s, q, t] = axis === "x" ? ["x", "w", "y", "h"] : ["y", "h", "x", "w"];
  const at = box[p] + d;
  const end = at + box[s];
  // Neighbours share some of the box's span across the axis.
  const row = (boxes ?? []).filter((o) => o[q] < box[q] + box[t] - 1e-6 && o[q] + o[t] > box[q] + 1e-6);
  const cross = (o) => (Math.max(o[q], box[q]) + Math.min(o[q] + o[t], box[q] + box[t])) / 2;
  const before = row.filter((o) => o[p] + o[s] <= at + threshold).sort((a, b) => (b[p] + b[s]) - (a[p] + a[s]));
  const after = row.filter((o) => o[p] >= end - threshold).sort((a, b) => a[p] - b[p]);
  const L = before[0], R = after[0];
  const candidates = [];
  if (L && R) {
    const pos = (L[p] + L[s] + R[p] - box[s]) / 2;
    if (pos >= L[p] + L[s] - 1e-6) candidates.push({ pos, gaps: [[L[p] + L[s], pos, cross(L)], [pos + box[s], R[p], cross(R)]] });
  }
  if (L) {
    const LL = before.find((o) => o !== L && o[p] + o[s] <= L[p] + 1e-6);
    const gap = LL ? L[p] - (LL[p] + LL[s]) : 0;
    if (gap > 1e-6) candidates.push({ pos: L[p] + L[s] + gap, gaps: [[LL[p] + LL[s], L[p], cross(LL)], [L[p] + L[s], L[p] + L[s] + gap, cross(L)]] });
  }
  if (R) {
    const RR = after.find((o) => o !== R && o[p] >= R[p] + R[s] - 1e-6);
    const gap = RR ? RR[p] - (R[p] + R[s]) : 0;
    if (gap > 1e-6) candidates.push({ pos: R[p] - gap - box[s], gaps: [[R[p] + R[s], RR[p], cross(RR)], [R[p] - gap, R[p], cross(R)]] });
  }
  let best = null;
  for (const c of candidates) {
    const corr = c.pos - at;
    if (Math.abs(corr) <= threshold && (!best || Math.abs(corr) < Math.abs(best.d))) best = { d: corr, gaps: c.gaps };
  }
  return best;
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
  // Spacing wins an axis only when it is the nearer pull; alignment keeps
  // a tie, since a shared edge is the stronger statement.
  const gx = spacingPull(box, dx, targets.boxes, "x", threshold);
  const gy = spacingPull({ ...box, x: box.x + dx }, dy, targets.boxes, "y", threshold);
  const useGx = gx && (!px || Math.abs(gx.d) < Math.abs(px.d) - 1e-9);
  const useGy = gy && (!py || Math.abs(gy.d) < Math.abs(py.d) - 1e-9);
  const ndx = useGx ? dx + gx.d : px ? dx + px.d : dx;
  const ndy = useGy ? dy + gy.d : py ? dy + py.d : dy;
  const guides = guidesFor(fx(ndx), fy(ndy), targets, !!px && !useGx, !!py && !useGy);
  if (useGx) for (const [from, to, at] of gx.gaps) guides.push({ axis: "x", kind: "gap", from, to, at });
  if (useGy) for (const [from, to, at] of gy.gaps) guides.push({ axis: "y", kind: "gap", from, to, at });
  return { dx: ndx, dy: ndy, guides };
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
    // A member keeps its z: it is its order inside the group, which the
    // schema requires; only a top-level copy is restacked by the caller.
    for (const k of COMPILED_ONLY) if (top || k !== "z") delete out[k];
    out.id = newId();
    out.provenance = "human";
    if (top) {
      out.x = Math.round(((out.x ?? 0) + ox) * 1000) / 1000;
      out.y = Math.round(((out.y ?? 0) + oy) * 1000) / 1000;
    }
    // A line's far end is a slide point at any depth, so a copy placed
    // elsewhere carries it — inside a pasted group too.
    if (out.kind === "line" && out.line) {
      out.line = { ...out.line };
      if (typeof out.line.x2 === "number") out.line.x2 = Math.round((out.line.x2 + ox) * 1000) / 1000;
      if (typeof out.line.y2 === "number") out.line.y2 = Math.round((out.line.y2 + oy) * 1000) / 1000;
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

// Ownership a grouped element sheds: the group is the person's, so its
// members stop claiming compiled slots (regeneration tombstones the
// originals when they leave the top level).
const GROUP_SHEDS = ["semanticRef", "customized", "contentCustomized", "styleCustomized", "formatCustomized", "dataCustomized", "tableCustomized"];

// A group of `elements`: its box is their union, its members keep their
// ids and stacking order with coordinates made relative to it, and it
// sits where the topmost member sat.
export function groupElements(elements, id) {
  const box = unionBox(elements);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const ordered = [...elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const children = ordered.map((el, i) => {
    const c = structuredClone(el);
    for (const k of GROUP_SHEDS) delete c[k];
    c.provenance = "human";
    c.x = r3((el.x ?? 0) - box.x);
    c.y = r3((el.y ?? 0) - box.y);
    c.z = i;
    return c;
  });
  return {
    id, kind: "group", provenance: "human",
    x: r3(box.x), y: r3(box.y), w: r3(box.w), h: r3(box.h),
    z: Math.max(...elements.map((e) => e.z ?? 0)),
    group: { children },
  };
}

// A group's members back on the slide at their slide positions, in their
// order, at the group's place in the stack.
export function ungroupElement(group) {
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return (group.group?.children ?? []).map((c) => ({ ...structuredClone(c), x: r3(group.x + c.x), y: r3(group.y + c.y), z: group.z ?? 0 }));
}

// A slide made into a reusable layout: its arrangement and wording as the
// person left them, without what belongs to that one slide — institutional
// chrome (crest, number), notes, citations, compiled ownership.
export function layoutFromSlide(scene) {
  const keep = (scene.elements ?? []).filter((e) => !(e.locked === true && e.provenance === "compiler" && e.semanticRef === undefined));
  return {
    id: scene.id, width: scene.width, height: scene.height, background: structuredClone(scene.background),
    elements: copyElements(keep, ((n) => () => `h-${String(++n).padStart(12, "0")}`)(0)).map((e, i) => ({ ...e, z: i * 10 })),
    layoutState: "detached",
  };
}

// A new slide from a saved layout: fresh ids all the way down, the
// person's own.
export function slideFromLayout(layout, { slideId, newId }) {
  return { ...structuredClone(layout), id: slideId, elements: copyElements(layout.elements, newId).map((e, i) => ({ ...e, z: i * 10 })), layoutState: "detached" };
}
