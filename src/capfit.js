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
 *
 * KNOWN LIMIT: it can only measure fields the specimen populates. An optional
 * field the specimen omits — `compare.left.points`, say — is never grown, so
 * its cap stays unverified and a real deck that uses it can still overflow.
 * Enriching `src/specimens.js` to exercise every optional field is what would
 * close that.
 */

// Filler that measures like prose rather than like a block of one letter —
// `measure()` is character-count times an advance, but line breaking is not,
// and a run with no spaces cannot wrap.
const WORDS = (
  "the model writes to the cap it is given so a generous one is an instruction " +
  "rather than a limit and every deck pays for it in a rewrite pass that may " +
  "not survive the slide it was asked to repair when the layout has no room"
).split(" ");

/**
 * A field the specimen fills with a figure, not prose.
 *
 * Length is not the only thing a filler has to preserve. `funnel` tapers its
 * bars only when EVERY stage carries a number it can read — so growing "42%"
 * into "the model writes" switched the type to its equal-width composition and
 * measured a cap against a funnel that does not taper. The narrowest bar, which
 * is where a funnel actually runs out of room, was never rendered. A figure
 * also cannot wrap at a space and sets in lining digits, both of which measure
 * differently from prose at the same character count.
 */
const FIGURE = /^[^\d]{0,3}\d[\d.,\s]*[^\d]{0,4}$/;

/** Digits grouped in threes, `n` characters wide, keeping `like`'s affixes. */
function figure(n, like) {
  const prefix = /^[^\d]*/.exec(like)[0];
  const suffix = /[^\d]*$/.exec(like)[0];
  const room = Math.max(1, n - prefix.length - suffix.length);
  const digits = "1234567890".repeat(Math.ceil(room / 10)).slice(0, room);
  return prefix + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",").slice(-room).replace(/^,/, "") + suffix;
}

/** Filler of approximately `n` characters, in the kind `like` is written in. */
export function filler(n, like = null) {
  if (n <= 0) return "";
  if (like && FIGURE.test(like)) return figure(n, like);
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
  const setAt = (obj, path, make) => {
    const parts = path.split(".");
    // `branches[].steps[].title` walks through TWO arrays, and reading a key
    // off an array yields undefined — so a doubly-nested path silently grew
    // nothing and the field was reported at whatever the specimen happened to
    // say. Each array level fans out instead of being indexed.
    let nodes = [obj];
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i].replace("[]", "");
      const next = [];
      for (const n of nodes) {
        for (const member of Array.isArray(n) ? n : [n]) {
          const v = member?.[key];
          if (v != null) next.push(v);
        }
      }
      nodes = next;
      if (!nodes.length) return;
    }
    const last = parts.at(-1).replace("[]", "");
    // A cap on an array field caps its ITEMS, so replacing the array with a
    // string throws in the layout at every scale — which the bisection then
    // reads as "nothing fits at all". `bullets` and `sets[].items` are both
    // arrays of strings, the second nested inside an array of objects.
    const assign = (container, key) => {
      if (!container || typeof container !== "object" || !(key in container)) return;
      const current = container[key];
      if (Array.isArray(current)) container[key] = current.map((v) => (typeof v === "string" ? make(v) : v));
      else if (typeof current === "string") container[key] = make(current);
    };
    // `items[].title`: the parent resolved to the array, so every member gets it
    // — including the members that did not carry the field. A field only some
    // members populate is still one the model may write on all of them, and the
    // member that lacks it is routinely the one the layout cannot seat: the
    // funnel specimen puts a body on the second bar of four, so the narrowest
    // bar, which is where a funnel runs out of room, was never measured.
    for (const node of nodes) {
      if (Array.isArray(node)) {
        const like = node.map((it) => it?.[last]).find((v) => typeof v === "string");
        for (const item of node) {
          if (like != null && item && typeof item === "object" && !(last in item)) item[last] = like;
          assign(item, last);
        }
      } else {
        assign(node, last);
      }
    }
  };
  for (const f of inventory) {
    if (!f.cap) continue;
    const n = Math.max(1, Math.round(f.cap * scale));
    setAt(out, f.path, (current) => filler(n, current));
  }
  return out;
}

/**
 * The fields of a slide a cap sweep may grow: capped, and prose the layout
 * sets. Identifiers, asset paths and icon glyphs carry a maxLength but are not
 * text on the page — growing a node's id breaks the edges that name it.
 */
export async function capInventory(slide) {
  return (await fieldInventory(slide)).filter(
    (f) => f.cap && !NON_TEXT.has(f.path.split(".").at(-1).replace("[]", "")),
  );
}

/**
 * A slide with every capped field at `scale` of its cap.
 *
 * This is the payload worth looking at. A specimen's own text is hand-written
 * to behave and a model writes to the cap it is given, so a type that renders
 * beautifully from the specimen and breaks in the field breaks HERE first.
 */
export async function atCaps(slide, scale = 1) {
  return grow(slide, scale, await capInventory(slide));
}

/**
 * The largest fraction of its schema caps that a type can carry in EVERY theme.
 * Returns { scale, caps } — caps is the measured length per field path.
 */
export async function capFit(type, { themes, steps = 7 } = {}) {
  const deck = await specimenDeck();
  const slide = deck.slides.find((s) => s.type === type);
  if (!slide) return null;

  const inventory = await capInventory(slide);
  if (!inventory.length) return { type, scale: 1, caps: [], fields: 0 };

  // A speaker note reserves 0.7in of the content box, and a real deck carries
  // them. Measuring without one reports a cap that only holds on slides that
  // have no note — which is not the cap the schema should promise.
  const withNote = (s) => ({ ...s, speaker_note: s.speaker_note ?? "A note the presenter reads." });

  const fits = async (scale) => {
    const one = structuredClone(deck);
    one.slides = [withNote(await grow(slide, scale, inventory))];
    const r = await themeMatrix({ deck: one, themes });
    return r.total === 0;
  };

  // A type that still fails with every field at ONE character has a failure no
  // cap can fix: a shape sized without reference to the box, a stack that does
  // not fit under its heading. Growing a field against a constant measures the
  // constant, and the bisection then reports "fits 1" for every field on the
  // slide — which reads exactly like a savage cap and is nothing of the kind.
  // `branching-flow` sat at 0% for that reason and `diagram` still does.
  if (!(await fits(0))) {
    return { type, scale: 0, fields: inventory.length, blocked: true, caps: [] };
  }

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
      one.slides = [withNote(s2)];
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
