import { themeMatrix } from "./themematrix.js";
import { specimenDeck } from "./specimens.js";
import { slideFieldMeta } from "./ai/trim.js";
import { fieldInventory } from "./ai/fieldlength.js";

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
    // `items[].title`: the parent resolved to the array, so every member gets it.
    if (Array.isArray(node)) {
      for (const item of node) if (item && typeof item === "object" && last in item) item[last] = value;
      return;
    }
    if (!node || typeof node !== "object") return;
    const current = node[last];
    // `bullets` is an array of strings and its cap is per item — replacing the
    // array with a string threw in the layout at every scale, which the
    // bisection then read as "nothing fits".
    if (Array.isArray(current)) node[last] = current.map((v) => (typeof v === "string" ? value : v));
    else if (typeof current === "string") node[last] = value;
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

  const inventory = (await fieldInventory(slide)).filter((f) => f.cap);
  if (!inventory.length) return { type, scale: 1, caps: [], fields: 0 };

  const fits = async (scale) => {
    const one = structuredClone(deck);
    one.slides = [await grow(slide, scale, inventory)];
    const r = await themeMatrix({ deck: one, themes });
    return r.total === 0;
  };

  if (await fits(1)) return { type, scale: 1, caps: inventory.map((f) => ({ path: f.path, cap: f.cap, fits: f.cap })), fields: inventory.length };

  let lo = 0, hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (await fits(mid)) lo = mid; else hi = mid;
  }
  return {
    type,
    scale: lo,
    fields: inventory.length,
    caps: inventory.map((f) => ({ path: f.path, cap: f.cap, fits: Math.max(1, Math.round(f.cap * lo)) })),
  };
}

/** Every type's field paths and caps, for reporting without a fit run. */
export async function capsOf(type) {
  const deck = await specimenDeck();
  const slide = deck.slides.find((s) => s.type === type);
  if (!slide) return [];
  await slideFieldMeta(type);
  return (await fieldInventory(slide)).filter((f) => f.cap);
}
