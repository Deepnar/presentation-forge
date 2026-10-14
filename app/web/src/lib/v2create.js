// V2-7A presentation creation: blank scenes and layout-template
// scenes as validated Layer-C input for POST /api/v2/projects.
// Pure builders over the accepted editor primitives — no React, no
// engine, no network. The dashboard calls these, then apiCreate, so
// manual creation produces legitimate project documents through the
// existing persistence API. Throws honest errors; never fabricates.
import { blankSlide, mintSlideId, mintHumanId } from "../../../../packages/editor/scene-text.js";
import { listLayoutTemplates, buildLayoutScene } from "../../../../packages/editor/layout-templates.js";
import { validateScene } from "../../../../packages/model/scene.ts";

export { listLayoutTemplates };

export function layoutTemplateList() {
  return listLayoutTemplates().map((t) => ({ id: t.id, name: t.name ?? t.id, category: t.category ?? "Layout" }));
}

// One intentionally blank editable slide. Validates vacuously (no
// elements to check) but is still verified before return.
export async function buildBlankScenes() {
  const scene = blankSlide();
  const verdict = await validateScene(scene);
  if (!verdict.ok) throw new Error(`blank scene invalid: ${verdict.errors.join("; ")}`);
  return [scene];
}

// One editable slide from an accepted layout skeleton, with minted
// slide and element ids (never the shared `layout-<id>` default).
export async function buildLayoutScenes(templateId) {
  const scene = buildLayoutScene(templateId, null, {
    slideId: mintSlideId(),
    newId: () => mintHumanId(),
  });
  const verdict = await validateScene(scene);
  if (!verdict.ok) throw new Error(`layout scene invalid: ${verdict.errors.join("; ")}`);
  return [scene];
}

export function defaultProjectTitle(kind, templateName = "") {
  if (kind === "layout" && templateName) return `${templateName} presentation`;
  if (kind === "layout") return "Layout presentation";
  return "Untitled presentation";
}
