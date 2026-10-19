import { validateProjectDocument } from "../../packages/projects/document.js";
import { validateProvenance } from "./history.js";

// Only scenes can change through the runtime; document metadata stays authoritative.
export async function runtimeDocument(stored, scenes, provenance) {
  const prov = validateProvenance(provenance);
  if (!prov.ok)
    throw Object.assign(new Error("Invalid runtime provenance"), {
      code: "invalid-document",
    });
  if (JSON.stringify(scenes) === JSON.stringify(stored.scenes))
    return { doc: stored, provenance: prov.provenance, changed: false };
  const doc = {
    ...structuredClone(stored),
    scenes: structuredClone(scenes),
    revision: stored.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  if (!(await validateProjectDocument(doc)).ok)
    throw Object.assign(new Error("Invalid runtime document"), {
      code: "invalid-document",
    });
  return { doc, provenance: prov.provenance, changed: true };
}
