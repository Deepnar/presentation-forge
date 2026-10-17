import { validProjectId } from "../../packages/projects/document.js";

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

function refuse(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function readProjectCover(store, { id, revision, owner = null, admin = false }) {
  if (!validProjectId(id)) throw refuse("invalid-id", "invalid project id");
  if (!Number.isSafeInteger(revision) || revision < 0) throw refuse("invalid-cover-revision", "a non-negative revision is required");
  const { doc } = await store.getProject({ id, owner, admin });
  if (!doc) throw refuse("not-found", "no such project");
  if (doc.revision !== revision) throw refuse("cover-stale", "the saved project changed; refresh its preview");
  const cover = { projectId: doc.id, revision: doc.revision, scene: structuredClone(doc.scenes[0]) };
  if (new TextEncoder().encode(JSON.stringify(cover)).byteLength > MAX_COVER_BYTES) {
    throw refuse("cover-too-large", "this slide is too large for a project-card preview");
  }
  return cover;
}
