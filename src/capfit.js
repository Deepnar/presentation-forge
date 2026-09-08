import { themeMatrix } from "./themematrix.js";
import { specimenDeck } from "./specimens.js";
import { deckSchema } from "./ai/catalog.js";
import { slideFieldMeta } from "./ai/trim.js";
import { fieldInventory } from "./ai/fieldlength.js";
import { NON_TEXT } from "./textcheck.js";

const WORDS = (
  "the model writes to the cap it is given so a generous one is an instruction " +
  "rather than a limit and every deck pays for it in a rewrite pass that may " +
  "not survive the slide it was asked to repair when the layout has no room"
).split(" ");

const FIGURE = /^[^\d]{0,3}\d[\d.,\s]*[^\d]{0,4}$/;

function figure(n, like) {
  const prefix = /^[^\d]*/.exec(like)[0];
  const suffix = /[^\d]*$/.exec(like)[0];
  const room = Math.max(1, n - prefix.length - suffix.length);
  const digits = "1234567890".repeat(Math.ceil(room / 10)).slice(0, room);
  return prefix + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",").slice(-room).replace(/^,/, "") + suffix;
}

export function filler(n, like = null) {
  if (n <= 0) return "";
  if (like && FIGURE.test(like)) return figure(n, like);
  let out = "";
  for (let i = 0; out.length < n; i++) out += (out ? " " : "") + WORDS[i % WORDS.length];
  const cut = out.slice(0, n);
  const space = cut.lastIndexOf(" ");
  return space > n * 0.6 ? cut.slice(0, space) : cut;
}

export async function grow(slide, scale, inventory) {
  const out = structuredClone(slide);
  const setAt = (obj, path, make) => {
    const parts = path.split(".");
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
    const assign = (container, key) => {
      if (!container || typeof container !== "object" || !(key in container)) return;
      const current = container[key];
      if (Array.isArray(current)) container[key] = current.map((v) => (typeof v === "string" ? make(v) : v));
      else if (typeof current === "string") container[key] = make(current);
    };
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

export async function capInventory(slide) {
  return (await fieldInventory(slide)).filter(
    (f) => f.cap && !NON_TEXT.has(f.path.split(".").at(-1).replace("[]", "")),
  );
}

export async function atCaps(slide, scale = 1) {
  const seeded = await seedShared(slide);
  return grow(seeded, scale, await capInventory(seeded));
}

async function seedShared(slide) {
  const schema = await deckSchema();
  const { strings } = await slideFieldMeta(slide.type);
  const out = structuredClone(slide);
  for (const path of strings) {
    if (path.includes(".") || path.includes("[")) continue;
    const spec = schema.definitions.slide.properties?.[path];
    if (spec?.type !== "string" || !spec.maxLength) continue;
    if (typeof out[path] === "string" && out[path].trim()) continue;
    out[path] = path;
  }
  return out;
}

export async function capFit(type, { themes, steps = 7 } = {}) {
  const deck = await specimenDeck();
  const found = deck.slides.find((s) => s.type === type);
  if (!found) return null;
  const slide = await seedShared(found);

  const inventory = await capInventory(slide);
  if (!inventory.length) return { type, scale: 1, caps: [], fields: 0 };

  const withNote = (s) => ({ ...s, speaker_note: s.speaker_note ?? "A note the presenter reads." });

  const fits = async (scale) => {
    const one = structuredClone(deck);
    one.slides = [withNote(await grow(slide, scale, inventory))];
    const r = await themeMatrix({ deck: one, themes });
    return r.total === 0;
  };

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

export async function capsOf(type) {
  const deck = await specimenDeck();
  const slide = deck.slides.find((s) => s.type === type);
  if (!slide) return [];
  await slideFieldMeta(type);
  return (await fieldInventory(slide)).filter((f) => f.cap);
}
