import { createHash } from "node:crypto";
import { validateProjectDocument } from "./document.js";

export function importFailure(code, message) {
  return Object.assign(new Error(message), { code });
}

export function validateImportRequest(request, owner) {
  if (request === null || request === undefined) return null;
  if (typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).some(key => !["key", "digest"].includes(key)) ||
      typeof request.key !== "string" || !/^[A-Za-z0-9:_-]{1,180}$/.test(request.key) ||
      typeof request.digest !== "string" || !/^[a-f0-9]{64}$/.test(request.digest)) {
    throw importFailure("invalid-document", "invalid import request identity");
  }
  return {
    key: createHash("sha256").update(JSON.stringify([owner ?? null, request.key])).digest("hex"),
    digest: request.digest,
  };
}

export async function replayImportedProject(link, request, row, owner) {
  // The project the request already made travels with the refusal, so a
  // caller that means to update it (a regenerated deck) can.
  if (link.source_digest !== request.digest) throw Object.assign(importFailure("import-source-changed", "source changed; use an explicit new import request"), { projectId: link.project_id });
  if (!row) throw importFailure("import-target-deleted", "the imported project was deleted; use an explicit new import request");
  if ((row.owner ?? null) !== (owner ?? null)) throw importFailure("not-found", "no such project");
  let doc;
  try { doc = JSON.parse(row.payload); } catch { throw importFailure("invalid-document", "stored project is corrupt"); }
  const verdict = await validateProjectDocument(doc);
  if (!verdict.ok) throw importFailure("invalid-document", "stored project is invalid");
  return { doc: structuredClone(doc), reused: true };
}
