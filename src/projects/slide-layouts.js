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

// `scene` is the slide as the editor has it now, unsaved edits included;
// without it the stored slide is used.
export async function slideLayoutOptions({ owner = null, admin = false, id, slideId, scene: live = null, index: liveIndex = null, total: liveTotal = null }) {
  const store = await projectStore();
  const { doc } = await store.getProject({ owner, admin, id });
  if (!doc) throw refuse("not-found", "no such project");
  const stored = doc.scenes.findIndex((s) => s.id === slideId);
  if (stored < 0 && !live) throw refuse("not-found", "no such slide");
  if (live && live.id !== slideId) throw refuse("invalid-document", "the slide does not match its id");
  const prev = live ?? doc.scenes[stored];
  const index = Number.isInteger(liveIndex) && liveIndex >= 0 ? liveIndex : Math.max(0, stored);
  const total = Number.isInteger(liveTotal) && liveTotal > index ? liveTotal : doc.scenes.length;
  if (prev.layoutState === "detached") return { current: null, options: [], reason: "detached" };
  const { intent } = await store.getProjectIntent({ owner, admin, id });
  const source = storedSlide(intent, slideId);
  if (!source) return { current: null, options: [], reason: "no-intent" };
  if (FIXED.has(prev.recipeId)) return { current: choiceKey(prev.layoutChoice), options: [], reason: "fixed" };

  const place = { doc, stored: intent, chrome: source.chrome, index, total };
  // What the compiler owns on this slide now: those elements follow the new
  // arrangement (a move made in the old one means nothing in the new),
  // while wording, styling, locks and the person's own additions carry.
  const now = await compileInPlace({ ...place, slide: withLayoutChoice(source.slide, prev.layoutChoice) });
  const owned = new Set(now.scenes[0].elements.map((e) => e.id));
  const variants = [{ key: "auto", label: "Suggested", choice: null }, ...LAYOUT_CHOICES];
  const current = choiceKey(prev.layoutChoice);
  const options = [];
  for (const v of variants) {
    let compiled;
    try {
      compiled = await compileInPlace({ ...place, slide: withLayoutChoice(source.slide, v.choice) });
    } catch { continue; }
    const [fresh] = compiled.scenes;
    const freshIds = new Set(fresh.elements.map((e) => e.id));
    const base = structuredClone(prev);
    base.elements = base.elements
      .filter((e) => !owned.has(e.id) || freshIds.has(e.id) || e.semanticRef !== undefined)
      .map((e) => { if (owned.has(e.id)) delete e.customized; return e; });
    const sink = [...compiled.fitDiagnostics];
    const scene = carryEdits(fresh, base, compiled.design, slideId, sink);
    scene.background = structuredClone(prev.background);
    if (v.choice) scene.layoutChoice = structuredClone(v.choice);
    else delete scene.layoutChoice;
    const isCurrent = v.key === current || (current === null && sameChoice(v.choice, prev.layoutChoice));
    const fits = sink.length === 0;
    if (!isCurrent && !fits) continue;
    options.push({ key: v.key, label: v.label, current: isCurrent, fits, family: scene.recipeId, scene, sig: signature(scene) });
  }
  // Choices the compiler draws the same way are one option; the slide as it
  // stands wins its group, else the first listed.
  const winner = new Map();
  for (const o of options) if (!winner.has(o.sig) || o.current) winner.set(o.sig, o);
  return { current, options: options.filter((o) => winner.get(o.sig) === o).map(({ sig, ...o }) => o) };
}
