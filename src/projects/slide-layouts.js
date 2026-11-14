// Other ways to lay out one compiled slide: its stored intent compiled
// again under each layout choice (packages/compiler/layout-choice.js), in
// the project's theme and chrome, with what the person did carried
// across. Read-only — the editor applies the one picked as an ordinary,
// undoable slide replacement, and the choice travels on the scene.
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { chromeFromRecipe } from "./import-source.js";
import { carryEdits } from "../../packages/compiler/compile.js";
import { LAYOUT_CHOICES, withLayoutChoice, choiceKey, sameChoice } from "../../packages/compiler/layout-choice.js";

const refuse = (code, message) => Object.assign(new Error(message), { code });

// Families whose shape is their content — a chart is a chart — or that are
// not content slides at all; re-arranging them offers nothing honest.
const FIXED = new Set(["divider", "title", "chart", "data-table", "media-led"]);

// The intent and chrome a slide was compiled from: a slide the Assistant
// added or rewrote keeps its newer intent beside the deck's.
export function storedSlide(stored, slideId) {
  const at = stored?.deck?.slides?.findIndex((s) => s.id === slideId) ?? -1;
  const content = { surface: "content", suppressPresenter: false, presenterText: stored?.chrome?.fallback };
  const added = stored?.added?.[slideId];
  if (added) return { slide: added, chrome: at >= 0 ? stored.chrome?.slides?.[at] ?? content : content };
  if (at < 0) return null;
  return { slide: stored.deck.slides[at], chrome: stored.chrome?.slides?.[at] ?? content };
}

// One slide compiled where it sits in the project, numbered in place.
export async function compileInPlace({ doc, stored, slide, chrome, index, total }) {
  const intent = { id: stored?.deck?.id ?? doc.id, title: stored?.deck?.title ?? doc.title, slides: [slide] };
  const recipe = stored?.chrome ? { ...stored.chrome, slides: [chrome] } : null;
  const chromeForDeck = recipe ? (i, design, ctx) => {
    const built = chromeFromRecipe(recipe)(i, design, ctx);
    return { slides: built.slides.map((s) => ({ ...s, index: index + 1, total })) };
  } : null;
  return compileSceneDeck({
    intent, theme: doc.theme?.name ?? "warm-humanist", style: stored?.style ?? null,
    mode: doc.theme?.variant === "dark" ? "dark" : "light", chromeForDeck,
  });
}

const signature = (scene) => `${scene.recipeId}|${scene.elements
  .filter((e) => e.provenance === "compiler" || e.semanticRef !== undefined)
  .map((e) => `${e.kind}:${e.x.toFixed(2)},${e.y.toFixed(2)},${e.w.toFixed(2)},${e.h.toFixed(2)}`).join(";")}`;

export const VARIANTS = [{ key: "auto", label: "Suggested", choice: null }, ...LAYOUT_CHOICES];

// Where the slide sits, what it was compiled from and what the compiler
// owns on it now, or why it has no other layouts. `live` is the slide as
// the editor has it (unsaved edits included); without it the stored one.
async function prepare({ owner, admin, id, slideId, live, liveIndex, liveTotal }) {
  const store = await projectStore();
  const { doc } = await store.getProject({ owner, admin, id });
  if (!doc) throw refuse("not-found", "no such project");
  const stored = doc.scenes.findIndex((s) => s.id === slideId);
  if (stored < 0 && !live) throw refuse("not-found", "no such slide");
  if (live && live.id !== slideId) throw refuse("invalid-document", "the slide does not match its id");
  const prev = live ?? doc.scenes[stored];
  const index = Number.isInteger(liveIndex) && liveIndex >= 0 ? liveIndex : Math.max(0, stored);
  const total = Number.isInteger(liveTotal) && liveTotal > index ? liveTotal : doc.scenes.length;
  if (prev.layoutState === "detached") return { prev, reason: "detached" };
  const { intent } = await store.getProjectIntent({ owner, admin, id });
  const source = storedSlide(intent, slideId);
  if (!source) return { prev, reason: "no-intent" };
  if (FIXED.has(prev.recipeId)) return { prev, reason: "fixed" };
  const place = { doc, stored: intent, chrome: source.chrome, index, total };
  // What the compiler owns on this slide now: those elements follow the new
  // arrangement (a move made in the old one means nothing in the new),
  // while wording, styling, locks and the person's own additions carry.
  const now = await compileInPlace({ ...place, slide: withLayoutChoice(source.slide, prev.layoutChoice) });
  return { prev, place, source, owned: new Set(now.scenes[0].elements.map((e) => e.id)) };
}

// The slide laid out under one variant, or null when it will not compile.
async function variantScene({ prev, place, source, owned }, v) {
  let compiled;
  try {
    compiled = await compileInPlace({ ...place, slide: withLayoutChoice(source.slide, v.choice) });
  } catch { return null; }
  const [fresh] = compiled.scenes;
  const freshIds = new Set(fresh.elements.map((e) => e.id));
  const base = structuredClone(prev);
  base.elements = base.elements
    .filter((e) => !owned.has(e.id) || freshIds.has(e.id) || e.semanticRef !== undefined)
    .map((e) => { if (owned.has(e.id)) delete e.customized; return e; });
  const sink = [...compiled.fitDiagnostics];
  const scene = carryEdits(fresh, base, compiled.design, prev.id, sink);
  scene.background = structuredClone(prev.background);
  if (v.choice) scene.layoutChoice = structuredClone(v.choice);
  else delete scene.layoutChoice;
  return { scene, fits: sink.length === 0 };
}

export async function slideLayoutOptions({ owner = null, admin = false, id, slideId, scene: live = null, index: liveIndex = null, total: liveTotal = null }) {
  const ready = await prepare({ owner, admin, id, slideId, live, liveIndex, liveTotal });
  const current = choiceKey(ready.prev.layoutChoice);
  if (ready.reason) return { current: ready.reason === "fixed" ? current : null, options: [], reason: ready.reason };
  const options = [];
  for (const v of VARIANTS) {
    const out = await variantScene(ready, v);
    if (!out) continue;
    const isCurrent = v.key === current || (current === null && sameChoice(v.choice, ready.prev.layoutChoice));
    if (!isCurrent && !out.fits) continue;
    options.push({ key: v.key, label: v.label, current: isCurrent, fits: out.fits, family: out.scene.recipeId, scene: out.scene, sig: signature(out.scene) });
  }
  // Choices the compiler draws the same way are one option; the slide as it
  // stands wins its group, else the first listed.
  const winner = new Map();
  for (const o of options) if (!winner.has(o.sig) || o.current) winner.set(o.sig, o);
  return { current, options: options.filter((o) => winner.get(o.sig) === o).map(({ sig, ...o }) => o) };
}

// One named layout for a stored slide — the Assistant's change_layout.
// { scene } or { reason }: the slide has no other layouts, the name is
// unknown, or that layout does not fit its content.
export async function slideInLayout({ owner = null, admin = false, id, slideId, layout, index = null, total = null }) {
  const v = VARIANTS.find((x) => x.key === layout);
  if (!v) return { reason: "unknown-layout" };
  const ready = await prepare({ owner, admin, id, slideId, live: null, liveIndex: index, liveTotal: total });
  if (ready.reason) return { reason: ready.reason };
  const out = await variantScene(ready, v);
  if (!out) return { reason: "does-not-compile" };
  if (!out.fits) return { reason: "does-not-fit" };
  // A name the compiler draws as its own suggestion (quadrants of three
  // parts) would label the slide with a layout it does not have.
  if (v.choice) {
    const auto = await variantScene(ready, VARIANTS[0]);
    if (auto && signature(auto.scene) === signature(out.scene)) return { reason: "same-as-suggested" };
  }
  return { scene: out.scene };
}
