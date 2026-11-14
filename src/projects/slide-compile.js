// Lay out a slide the Assistant proposes (add_slide) in the project's own
// theme, appearance and chrome — deterministic compile of semantic content,
// so the plan carries the compiler's layout and never a model's. A plate
// theme's ground is stored as a project asset, so the scene stays small.
import { randomBytes } from "node:crypto";
import { projectStore } from "./backend.js";
import { compileInPlace, slideInLayout } from "./slide-layouts.js";
import { storePlates } from "./import-generated.js";
import { carryEdits } from "../../packages/compiler/compile.js";

// `replaces` names an existing slide to regenerate: same id and place, and
// what the person moved, locked or added carried across — but not their old
// wording, which the rewrite they asked for replaces. Their own (detached)
// slides are never regenerated.
export async function compileSlide(binding, { slide, index, total, replaces = null, layout = null }) {
  // change_layout: the slide's own content, laid out another way.
  if (layout !== null) {
    if (!replaces) return null;
    const out = await slideInLayout({ owner: binding.owner ?? null, id: binding.id, slideId: replaces, layout, index, total });
    return out.scene ?? null;
  }
  const store = await projectStore();
  const { doc } = await store.getProject({ owner: binding.owner ?? null, id: binding.id });
  if (!doc) return null;
  const prev = replaces ? doc.scenes.find((s) => s.id === replaces) : null;
  if (replaces && (!prev || prev.layoutState === "detached")) return null;
  const { intent: stored } = await store.getProjectIntent({ owner: binding.owner ?? null, id: binding.id });
  const id = replaces ?? `a-${randomBytes(6).toString("hex")}`;
  const intentSlide = {
    id, purpose: slide.purpose ?? slide.title, title: slide.title,
    blocks: slide.blocks.map((b, i) => ({ id: `${id}-b${i + 1}`, ...b })),
  };
  // The chrome a content slide of this deck carries, numbered where the
  // slide will land.
  const chrome = { surface: "content", suppressPresenter: false, presenterText: stored?.chrome?.fallback };
  const compiled = await compileInPlace({ doc, stored, slide: intentSlide, chrome, index, total });
  let [scene] = compiled.scenes;
  if (prev) {
    const kept = structuredClone(prev);
    for (const el of kept.elements) for (const k of ["contentCustomized", "formatCustomized", "dataCustomized", "tableCustomized"]) delete el[k];
    scene = carryEdits(scene, kept, compiled.design, id, []);
  }
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
