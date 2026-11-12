// Change a project's theme or appearance, keeping what the person did.
// The project's stored DeckIntent compiles in the new theme — reordered to
// the slides the project has now, so numbering follows their order and a
// slide they deleted stays deleted — and each slide's edits are carried
// across (carryEdits), as any recompile does. Detached slides are theirs
// outright and keep their scenes; slides they made themselves keep their
// content and take the new theme's ground. One new revision, so History
// can take it back.
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { carryEdits } from "../../packages/compiler/compile.js";
import { chromeFromRecipe } from "./import-source.js";
import { storePlates } from "./import-generated.js";

const refuse = (code, message) => Object.assign(new Error(message), { code });

export async function changeProjectTheme({ owner = null, admin = false, id, theme, mode = "light", baseRevision }) {
  const store = await projectStore();
  const { doc } = await store.getProject({ owner, admin, id });
  if (!doc) throw refuse("not-found", "no such project");
  if (doc.revision !== baseRevision) return { status: "stale", expected: doc.revision, actual: baseRevision };
  const { intent: stored } = await store.getProjectIntent({ owner, admin, id });
  if (!stored?.deck) throw refuse("no-intent", "This project was saved before projects kept their structure, so it can't be restyled. Open it again from its deck to add it.");
  const byId = new Map(stored.deck.slides.map((slide, i) => [slide.id, { slide, chrome: stored.chrome?.slides?.[i] }]));
  // Slides the Assistant added keep their intent beside the deck's.
  for (const [slideId, slide] of Object.entries(stored.added ?? {})) {
    if (!byId.has(slideId)) byId.set(slideId, { slide, chrome: { surface: "content", suppressPresenter: false, presenterText: stored.chrome?.fallback } });
  }
  const kept = doc.scenes.filter((s) => byId.has(s.id));
  if (!kept.length) throw refuse("no-intent", "None of this project's slides came from its deck, so there is nothing to restyle.");
  const intent = { ...stored.deck, slides: kept.map((s) => byId.get(s.id).slide) };
  const recipe = stored.chrome ? { ...stored.chrome, slides: kept.map((s) => byId.get(s.id).chrome) } : null;
  const compiled = await compileSceneDeck({ intent, theme, style: stored.style ?? null, mode, chromeForDeck: recipe ? chromeFromRecipe(recipe) : null });
  const freshById = new Map(compiled.scenes.map((s) => [s.id, s]));
  const ground = compiled.scenes.find((s) => s.recipeId !== "divider")?.background ?? compiled.scenes[0].background;
  const scenes = doc.scenes.map((prev) => {
    const fresh = freshById.get(prev.id);
    if (prev.layoutState === "detached") return prev;
    if (!fresh) return { ...prev, background: structuredClone(ground) };
    return carryEdits(fresh, structuredClone(prev), compiled.design, prev.id, []);
  });
  for (const asset of await storePlates(scenes)) await store.putProjectAsset({ owner, admin, id, asset });
  const label = `${theme}${mode === "dark" ? " (dark)" : ""}`;
  const saved = await store.saveProject({
    owner, admin, id, baseRevision, title: doc.title, scenes,
    theme: { name: theme, variant: mode }, origin: doc.origin,
    provenance: { actor: "human", summary: `Changed the theme to ${label}`, saveOrigin: "manual" },
  });
  return saved;
}
