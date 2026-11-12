// Lay out a slide the Assistant proposes (add_slide) in the project's own
// theme, appearance and chrome — deterministic compile of semantic content,
// so the plan carries the compiler's layout and never a model's. A plate
// theme's ground is stored as a project asset, so the scene stays small.
import { randomBytes } from "node:crypto";
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { chromeFromRecipe } from "./import-source.js";
import { storePlates } from "./import-generated.js";

export async function compileSlide(binding, { slide, index, total }) {
  const store = await projectStore();
  const { doc } = await store.getProject({ owner: binding.owner ?? null, id: binding.id });
  if (!doc) return null;
  const { intent: stored } = await store.getProjectIntent({ owner: binding.owner ?? null, id: binding.id });
  const id = `a-${randomBytes(6).toString("hex")}`;
  const intent = {
    id: stored?.deck?.id ?? doc.id, title: stored?.deck?.title ?? doc.title,
    slides: [{
      id, purpose: slide.purpose ?? slide.title, title: slide.title,
      blocks: slide.blocks.map((b, i) => ({ id: `${id}-b${i + 1}`, ...b })),
    }],
  };
  // The chrome a content slide of this deck carries, numbered where the
  // slide will land.
  const recipe = stored?.chrome ? { ...stored.chrome, slides: [{ surface: "content", suppressPresenter: false, presenterText: stored.chrome.fallback }] } : null;
  const chromeForDeck = recipe ? (i, design, ctx) => {
    const built = chromeFromRecipe(recipe)(i, design, ctx);
    return { slides: built.slides.map((s) => ({ ...s, index: index + 1, total })) };
  } : null;
  const compiled = await compileSceneDeck({
    intent, theme: doc.theme?.name ?? "warm-humanist", style: stored?.style ?? null,
    mode: doc.theme?.variant === "dark" ? "dark" : "light", chromeForDeck,
  });
  const [scene] = compiled.scenes;
  // Kept under the new slide's id, so a later theme change recompiles it
  // like any imported slide. A rejected proposal leaves an entry whose slide
  // never appears, which nothing reads.
  if (stored?.deck) {
    await store.putProjectIntent({ owner: binding.owner ?? null, id: binding.id,
      intent: { ...stored, added: { ...(stored.added ?? {}), [id]: compiled.intent.slides[0] } } });
  }
  for (const asset of await storePlates([scene])) await store.putProjectAsset({ owner: binding.owner ?? null, id: binding.id, asset });
  return scene;
}
