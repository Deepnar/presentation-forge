import { themeMatrix } from "./themematrix.js";
import { specimenDeck } from "./specimens.js";
import { slideFieldMeta } from "./ai/trim.js";
import { fieldInventory } from "./ai/fieldlength.js";
import { NON_TEXT } from "./textcheck.js";

/**
 * What length can a field actually be?
 *
 * The schema's `maxLength` is the instruction the model writes to. `cards[].body`
 * accepts 320 characters and the type accepts four of them, which no theme can
 * seat: four cards at 2.8in of measure need about thirteen lines each and the
 * card is three inches tall. A cap the renderer cannot honour guarantees a
 * rewrite pass on every generation, and a deck only the rewrite saves is a deck
 * that breaks whenever the rewrite fails.
 *
 * So the caps should come from the layouts. This grows a type's own specimen
 * payload — one valid slide per type, so no synthetic content has to be
 * invented — until some theme can no longer seat it, and reports the largest
 * length that every theme clears. Bisection, not a guess.
 *
 * It answers for the WHOLE type at once rather than one field at a time: the
 * fields of a card share the card, so measuring `title` with `body` held short
 * would report a cap that only holds while the body stays short.
 */

// Filler that measures like prose rather than like a block of one letter —
// `measure()` is character-count times an advance, but line breaking is not,
// and a run with no spaces cannot wrap.
const WORDS = (
  "the model writes to the cap it is given so a generous one is an instruction " +
  "rather than a limit and every deck pays for it in a rewrite pass that may " +
  "not survive the slide it was asked to repair when the layout has no room"
).split(" ");

/** Prose of approximately `n` characters, cut at a word boundary. */
export function filler(n) {
  if (n <= 0) return "";
  let out = "";
  for (let i = 0; out.length < n; i++) out += (out ? " " : "") + WORDS[i % WORDS.length];
  const cut = out.slice(0, n);
  // Never end mid-word: a trailing fragment measures the same but reads as a
  // bug when the sheet is looked at.
  const space = cut.lastIndexOf(" ");
  return space > n * 0.6 ? cut.slice(0, space) : cut;
}

/** Set every string on a slide to `scale` of that field's schema cap. */
export async function grow(slide, scale, inventory) {
  const out = structuredClone(slide);
  const setAt = (obj, path, value) => {
    const parts = path.split(".");
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i].replace("[]", "");
      node = parts[i].endsWith("[]") ? node[key] : node[key];
      if (node == null) return;
    }
    const last = parts.at(-1).replace("[]", "");
    // A cap on an array field caps its ITEMS, so replacing the array with a
    // string throws in the layout at every scale — which the bisection then
    // reads as "nothing fits at all". `bullets` and `sets[].items` are both
    // arrays of strings, the second nested inside an array of objects.
    const assign = (container, key) => {
      if (!container || typeof container !== "object" || !(key in container)) return;
      const current = container[key];
      if (Array.isArray(current)) container[key] = current.map((v) => (typeof v === "string" ? value : v));
      else if (typeof current === "string") container[key] = value;
    };
    // `items[].title`: the parent resolved to the array, so every member gets it.
    if (Array.isArray(node)) {
      for (const item of node) assign(item, last);
      return;
    }
    assign(node, last);
  };
  for (const f of inventory) {
    if (!f.cap) continue;
    setAt(out, f.path, filler(Math.max(1, Math.round(f.cap * scale))));
  }
  return out;
}

/**
 * The largest fraction of its schema caps that a type can carry in EVERY theme.
 * Returns { scale, caps } — caps is the measured length per field path.
 */
export async function capFit(type, { themes, steps = 7 } = {}) {
  const deck = await specimenDeck();
  const slide = deck.slides.find((s) => s.type === type);
  if (!slide) return null;

  // Identifiers, asset paths and icon glyphs carry a maxLength but are not
  // prose the layout sets — growing a node's id breaks the edges that name it.
  const inventory = (await fieldInventory(slide))
    .filter((f) => f.cap && !NON_TEXT.has(f.path.split(".").at(-1).replace("[]", "")));
  if (!inventory.length) return { type, scale: 1, caps: [], fields: 0 };

  const fits = async (scale) => {
    const one = structuredClone(deck);
    one.slides = [await grow(slide, scale, inventory)];
    const r = await themeMatrix({ deck: one, themes });
    return r.total === 0;
  };

  if (await fits(1)) {
    const paths = [...new Set(inventory.map((f) => f.path))];
    return {
      type, scale: 1, fields: inventory.length,
      caps: paths.map((path) => ({ path, cap: inventory.find((f) => f.path === path).cap, fits: inventory.find((f) => f.path === path).cap, binds: false })),
    };
  }

  let lo = 0, hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (await fits(mid)) lo = mid; else hi = mid;
  }

  // The type scale says every field cannot be at its cap AT ONCE. It does not
  // say which field binds — attributing it to all of them overstates the ones
  // that would happily hold their full cap. So each field is then grown on its
  // own, with the others held at the scale the type clears, which is the
  // number a schema cap should actually be set from.
  const paths = [...new Set(inventory.map((f) => f.path))];
  const caps = [];
  for (const path of paths) {
    const others = inventory.filter((f) => f.path !== path);
    const mine = inventory.filter((f) => f.path === path);
    const fitsField = async (scale) => {
      const one = structuredClone(deck);
      let s2 = await grow(slide, lo, others);
      s2 = await grow(s2, scale, mine);
      one.slides = [s2];
      return (await themeMatrix({ deck: one, themes })).total === 0;
    };
    const cap = mine[0].cap;
    if (await fitsField(1)) { caps.push({ path, cap, fits: cap, binds: false }); continue; }
    let flo = lo, fhi = 1;
    for (let i = 0; i < steps; i++) {
      const mid = (flo + fhi) / 2;
      if (await fitsField(mid)) flo = mid; else fhi = mid;
    }
    caps.push({ path, cap, fits: Math.max(1, Math.round(cap * flo)), binds: true });
  }

  return { type, scale: lo, fields: inventory.length, caps };
}

/** Every type's field paths and caps, for reporting without a fit run. */
export async function capsOf(type) {
  const deck = await specimenDeck();
  const slide = deck.slides.find((s) => s.type === type);
  if (!slide) return [];
  await slideFieldMeta(type);
  return (await fieldInventory(slide)).filter((f) => f.cap);
}
