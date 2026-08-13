/**
 * Deterministic content trim for overfull slides.
 *
 * The fitter's role floor is a hard stop: a slide whose text would need to
 * render below the readable floor gets flagged into the render `problems[]`
 * ("body would need 11.4pt — floor 14pt") and the overfull content used to
 * ship as-is. This module closes that loop without a model call.
 *
 * The trim is rule-based and schema-driven: which fields a slide type owns
 * (which arrays are drop-able, which strings are shortenable) derives from
 * deck.schema.json at run time, so a new type gets a sensible trim for free
 * and no drift. Each `trimSlide` step is small and deterministic — drop the
 * last element of the most-slack array, then shorten the longest prose string
 * at a sentence boundary — and `trimDeckToFit` re-renders between steps, so
 * a slide is trimmed only as far as its box actually demands. The flag stays
 * only when the content genuinely cannot fit at the floor.
 */

import { deckSchema } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { render } from "../render.js";

/** A slide that renders cleanly at its floor needs no trim and reports no flag. */
export function parseFloorProblems(problems) {
  // "slide 6 (feature-grid): body would need 8.1pt — floor 14pt (cut text...)"
  const re = /^slide (\d+) \(([^)]+)\): (.+?) would need [\d.]+pt — floor \d+pt/;
  const map = new Map();
  for (const p of problems ?? []) {
    const m = String(p).match(re);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (!map.has(idx)) map.set(idx, new Set());
    map.get(idx).add(m[3]);
  }
  return map;
}

function resolveRef(ref, schema) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], schema) ?? {};
}

const _meta = new Map();

/**
 * Per-type trim metadata, derived from the schema: which fields are arrays
 * (with their minItems floor — a drop may not go below it) and which are
 * strings. Item-field strings are encoded as `<array>[].<field>`.
 */
async function metaFor(type) {
  if (_meta.has(type)) return _meta.get(type);
  const schema = await deckSchema();
  const rule = schema.definitions.slide.allOf?.find(
    (r) => r.if?.properties?.type?.const === type,
  );
  const arrays = [];
  const strings = [];
  // `prefix` accumulates the parent path ("left.", "items[]."), so a string
  // inside a nested object or an array item resolves to its real location.
  const walk = (props, prefix) => {
    for (const [name, spec] of Object.entries(props ?? {})) {
      const resolved = spec.$ref ? resolveRef(spec.$ref, schema) : spec;
      const path = prefix ? `${prefix}${name}` : name;
      if (resolved.type === "string") {
        // An image field names a file, not prose — never shorten it.
        if (name !== "image") strings.push(path);
      } else if (resolved.type === "array") {
        arrays.push({ path, minItems: resolved.minItems ?? 0 });
        const item = resolved.items?.$ref ? resolveRef(resolved.items.$ref, schema) : resolved.items;
        if (item?.type === "object") walk(item.properties, `${path}[].`);
        else if (item?.type === "string") strings.push(path);
      } else if (resolved.type === "object") {
        walk(resolved.properties, `${path}.`);
      }
    }
  };
  walk(rule?.then?.properties ?? {}, "");
  const meta = { arrays, strings };
  _meta.set(type, meta);
  return meta;
}

/** Read an array by a dot path ("left.points"). */
function readArray(slide, path) {
  return path.split(".").reduce((o, k) => o?.[k], slide);
}

/**
 * Every string under a path, with a `set` that writes back into `slide`.
 * "items[].text" iterates the items array; a plain array-of-strings path
 * ("bullets") yields each element.
 */
function walkStrings(slide, path) {
  const segs = path.split(".");
  let nodes = [{ val: slide, path: [] }];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const next = [];
    for (const n of nodes) {
      if (seg.endsWith("[]")) {
        const key = seg.slice(0, -2);
        const arr = n.val?.[key];
        if (Array.isArray(arr)) arr.forEach((item, idx) => next.push({ val: item, path: [...n.path, { key, idx }] }));
      } else if (i === segs.length - 1 && Array.isArray(n.val?.[seg])) {
        n.val[seg].forEach((item, idx) => next.push({ val: item, path: [...n.path, { key: seg, idx }] }));
      } else {
        next.push({ val: n.val?.[seg], path: [...n.path, { key: seg }] });
      }
    }
    nodes = next.filter((n) => n.val !== undefined && n.val !== null);
  }
  return nodes
    .filter((n) => typeof n.val === "string")
    .map((n) => ({
      value: n.val,
      set: (v) => {
        let cur = slide;
        for (const seg of n.path.slice(0, -1)) {
          cur = seg.idx != null ? cur[seg.key][seg.idx] : cur[seg.key];
        }
        const last = n.path[n.path.length - 1];
        if (last.idx != null) cur[last.key][last.idx] = v;
        else cur[last.key] = v;
      },
    }));
}

/** Cut prose at a sentence/word boundary to ~72% of its length, with an ellipsis. */
export function shortenString(s) {
  const t = String(s).trim();
  if (t.length <= 40 || !t.includes(" ")) return null;
  const target = Math.max(40, Math.ceil(t.length * 0.72));
  const cut = t.slice(0, target);
  const sent = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  const end = sent >= 32 ? sent + 1 : cut.lastIndexOf(" ");
  const kept = (end > 0 ? t.slice(0, end) : t.slice(0, target)).trimEnd().replace(/[.,;:—–]+$/, "");
  if (kept.length >= t.length) return null;
  return `${kept}…`;
}

/**
 * One deterministic trim step, on a clone:
 * 1. drop the last element of the array with the most slack over minItems;
 * 2. else shorten the longest prose string (headline/standfirst last).
 * Returns a new slide, or null when nothing more can be trimmed.
 */
export async function trimSlide(slide) {
  const { arrays, strings } = await metaFor(slide.type);

  const droppable = arrays
    .map((a) => ({ ...a, arr: readArray(slide, a.path) }))
    .filter((a) => Array.isArray(a.arr) && a.arr.length > a.minItems)
    .sort((x, y) => (y.arr.length - y.minItems) - (x.arr.length - x.minItems));
  if (droppable.length) {
    const out = structuredClone(slide);
    readArray(out, droppable[0].path).pop();
    return out;
  }

  for (const skipHeadline of [true, false]) {
    const candidates = [];
    for (const path of strings) {
      if (skipHeadline && (path === "headline" || path === "standfirst")) continue;
      for (const w of walkStrings(slide, path)) {
        if (w.value.length > 40 && w.value.includes(" ")) candidates.push({ ...w, path });
      }
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => b.value.length - a.value.length);
    const best = candidates[0];
    const next = shortenString(best.value);
    if (!next) continue;
    const out = structuredClone(slide);
    for (const w of walkStrings(out, best.path)) {
      if (w.value === best.value) { w.set(next); return out; }
    }
  }
  return null;
}

/**
 * The trim pass. Renders (in-memory, no pptx written), trims every slide the
 * fitter flags below its floor, and re-renders until the deck is clean or no
 * trim can help. Deterministic throughout — no model call.
 */
export async function trimDeckToFit({ deck, themeName, deckDir, maxRounds = 24, signal }) {
  let cur = structuredClone(deck);
  const trimmed = [];
  let audit = { problems: [] };

  for (let round = 0; round < maxRounds; round++) {
    audit = await render({ deck: cur, themeName, deckDir, write: false, signal });
    const overfull = parseFloorProblems(audit.problems);
    if (!overfull.size) return { deck: cur, trimmed, converged: true, problems: audit.problems };

    let changed = false;
    for (const [idx] of overfull) {
      const t = await trimSlide(cur.slides[idx]);
      if (t) {
        cur.slides[idx] = t;
        changed = true;
        trimmed.push({ index: idx, type: cur.slides[idx].type });
      }
    }
    if (!changed) return { deck: cur, trimmed, converged: false, problems: audit.problems };

    const { ok } = await validateDeck(cur);
    if (!ok) return { deck: cur, trimmed, converged: false, problems: audit.problems };
  }

  audit = await render({ deck: cur, themeName, deckDir, write: false, signal });
  return { deck: cur, trimmed, converged: audit.problems.length === 0, problems: audit.problems };
}
