// V2 projects over HTTP: thin transport over src/projects/store.js.
// No scene logic here — validation lives in the project model, durability
// in the store, revision authority in the save transaction. This module
// owns HTTP concerns only: body size caps, id shape, auth gating, and
// status-code mapping.
//
// Exposure: local development allows unauthenticated use (single-user
// box, same as the legacy ownerless decks). On a hosted deployment the
// same routes require a session, so no public anonymous store appears in
// production by accident. Override: FORGE_V2_PROJECTS=1 forces on,
// =0 forces off.
import { fail, ok, wrap } from "./http.js";
import { isHosted } from "../../src/cloud.js";
import { resolveUser } from "./auth-routes.js";
import { isAdmin } from "../../src/auth.js";
import { validateProjectDocument, validateSavePayload, validProjectId } from "../../packages/projects/document.js";
import { renderPptx, preflightScenes } from "../../packages/renderer-pptx/render.ts";

export function projectsAllowed() {
  if (process.env.FORGE_V2_PROJECTS === "1") return true;
  if (process.env.FORGE_V2_PROJECTS === "0") return false;
  return true;
}

// Hosted policy: anonymous reads/writes are refused with 401; local
// boxes pass through with owner null. Authenticated callers scope to
// their own email; admins see everything (same rule as decks).
export async function resolveProjectOwner(req) {
  return projectOwner(req);
}

async function projectOwner(req) {
  if (!isHosted()) {
    try {
      const user = await resolveUser(req, { allowCookie: true });
      if (user) return { owner: user.email, admin: isAdmin(user) };
    } catch { /* anonymous local use */ }
    return { owner: null, admin: false };
  }
  const user = await resolveUser(req, { allowCookie: true });
  if (!user) return { denied: true };
  return { owner: user.email, admin: isAdmin(user) };
}

const MAX_BODY_CHARS = 6 * 1024 * 1024;

function bodyTooLarge(req) {
  try {
    return JSON.stringify(req.body ?? {}).length > MAX_BODY_CHARS;
  } catch {
    return true;
  }
}

function mapStoreError(res, err) {
  const code = err?.code;
  if (code === "not-found") return fail(res, 404, err.message);
  if (code === "invalid-id") return fail(res, 400, err.message);
  if (code === "invalid-document") {
    return res.status(422).json({ ok: false, error: err.message, errors: err.details ?? [err.message], code: "invalid-document" });
  }
  if (code === "storage-unavailable") {
    return res.status(503).json({ ok: false, error: err.message, code: "storage-unavailable" });
  }
  if (code === "stale") return res.status(409).json({ ok: false, error: err.message, code: "stale" });
  if (code === "revision-pruned") return res.status(410).json({ ok: false, error: err.message, code: "revision-pruned" });
  return fail(res, 500, err?.message ?? "project request failed");
}

export function registerV2ProjectRoutes(app) {
  app.get("/api/v2/projects", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { listProjects } = await import("../../src/projects/store.js");
    try {
      const { projects } = await listProjects({ owner: who.owner, admin: who.admin });
      ok(res, { projects });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.post("/api/v2/projects", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    if (bodyTooLarge(req)) return fail(res, 413, "request too large");
    const { title, scenes, theme, origin } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.length > 200) {
      return res.status(422).json({ ok: false, error: "title must be a non-empty string up to 200 chars", code: "invalid-document" });
    }
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(422).json({ ok: false, error: "scenes must be a non-empty array", code: "invalid-document" });
    }
    const payloadVerdict = await validateSavePayload({ baseRevision: 0, title: title.trim(), scenes, theme, origin });
    if (!payloadVerdict.ok) {
      return res.status(422).json({ ok: false, error: payloadVerdict.errors[0], errors: payloadVerdict.errors, code: "invalid-document" });
    }
    const { createProject } = await import("../../src/projects/store.js");
    try {
      const { doc } = await createProject({ owner: who.owner, title: title.trim(), scenes, theme, origin });
      ok(res, { project: doc });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.get("/api/v2/projects/:id", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { getProject } = await import("../../src/projects/store.js");
    try {
      const { doc } = await getProject({ owner: who.owner, id: req.params.id, admin: who.admin });
      if (!doc) return fail(res, 404, "no such project");
      ok(res, { project: doc });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.put("/api/v2/projects/:id", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    if (bodyTooLarge(req)) return fail(res, 413, "request too large");
    const { baseRevision, title, scenes, theme, origin, provenance } = req.body ?? {};
    const verdict = await validateSavePayload({ baseRevision, title, scenes, theme, origin });
    if (!verdict.ok) {
      return res.status(422).json({ ok: false, error: verdict.errors[0], errors: verdict.errors, code: "invalid-document" });
    }
    const { saveProject } = await import("../../src/projects/store.js");
    try {
      const out = await saveProject({
        owner: who.owner, id: req.params.id, admin: who.admin,
        baseRevision, title: title !== undefined ? String(title).trim() : undefined,
        scenes, theme, origin, provenance,
      });
      if (out.status === "stale") {
        return res.status(409).json({ ok: false, error: `stale project revision: based on ${out.actual}, stored is ${out.expected}`, code: "stale-revision", expectedRevision: out.expected, actualRevision: out.actual });
      }
      if (out.status === "noop") return ok(res, { project: out.doc, noop: true });
      ok(res, { project: out.doc });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.patch("/api/v2/projects/:id", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    // Renames obey the same no-lost-update principle as saves: the
    // caller names the durable revision it based the rename on, and a
    // stale base is refused rather than overwriting a newer title.
    const { title, baseRevision } = req.body ?? {};
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      return res.status(422).json({ ok: false, error: "baseRevision must be a non-negative integer", code: "invalid-document" });
    }
    const { renameProject } = await import("../../src/projects/store.js");
    try {
      const out = await renameProject({ owner: who.owner, id: req.params.id, admin: who.admin, baseRevision, title });
      if (out.status === "stale") {
        return res.status(409).json({ ok: false, error: `stale project revision: based on ${out.actual}, stored is ${out.expected}`, code: "stale-revision", expectedRevision: out.expected, actualRevision: out.actual });
      }
      if (out.status === "noop") return ok(res, { project: out.doc, noop: true });
      ok(res, { project: out.doc });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.delete("/api/v2/projects/:id", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { deleteProject } = await import("../../src/projects/store.js");
    try {
      const { removed } = await deleteProject({ owner: who.owner, id: req.params.id, admin: who.admin });
      if (!removed) return fail(res, 404, "no such project");
      ok(res, {});
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  // Durable revision history (V2-6B): audit metadata without scene
  // bytes, one recoverable snapshot at a time, and restore-as-new.
  // Same owner policy as project CRUD — no weaker path.
  app.get("/api/v2/projects/:id/revisions", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { listRevisions } = await import("../../src/projects/store.js");
    try {
      const out = await listRevisions({ owner: who.owner, id: req.params.id, admin: who.admin });
      ok(res, { currentRevision: out.currentRevision, retention: out.retention, revisions: out.revisions });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.get("/api/v2/projects/:id/revisions/:rev", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const rev = Number(req.params.rev);
    if (!Number.isInteger(rev) || rev < 0) {
      return res.status(422).json({ ok: false, error: "revision must be a non-negative integer", code: "invalid-document" });
    }
    const { getRevision } = await import("../../src/projects/store.js");
    try {
      const out = await getRevision({ owner: who.owner, id: req.params.id, admin: who.admin, revision: rev });
      if (out.pruned) {
        return res.status(410).json({ ok: false, error: `revision ${rev} has been pruned to audit-only and can no longer be restored`, code: "revision-pruned", revision: out.meta });
      }
      ok(res, { revision: out.meta, project: out.doc });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  app.post("/api/v2/projects/:id/restore", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    if (bodyTooLarge(req)) return fail(res, 413, "request too large");
    const { revision, baseRevision, provenance } = req.body ?? {};
    if (!Number.isInteger(revision) || revision < 0) {
      return res.status(422).json({ ok: false, error: "revision must be a non-negative integer", code: "invalid-document" });
    }
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      return res.status(422).json({ ok: false, error: "baseRevision must be a non-negative integer", code: "invalid-document" });
    }
    const { restoreRevision } = await import("../../src/projects/store.js");
    try {
      const out = await restoreRevision({
        owner: who.owner, id: req.params.id, admin: who.admin,
        targetRevision: revision, baseRevision, provenance,
      });
      if (out.status === "stale") {
        return res.status(409).json({ ok: false, error: `stale project revision: based on ${out.actual}, stored is ${out.expected}`, code: "stale-revision", expectedRevision: out.expected, actualRevision: out.actual });
      }
      ok(res, { project: out.doc, restoredFrom: out.restoredFrom });
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  // Native export from the stored document (not from live engine
  // state): proves a reopened project carries the same authored
  // content as the pre-save deck.
  app.get("/api/v2/projects/:id/export.pptx", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { getProject } = await import("../../src/projects/store.js");
    try {
      const { doc } = await getProject({ owner: who.owner, id: req.params.id, admin: who.admin });
      if (!doc) return fail(res, 404, "no such project");
      const envelope = await validateProjectDocument(doc);
      if (!envelope.ok) return res.status(422).json({ ok: false, error: envelope.errors[0], errors: envelope.errors });
      const unsafe = await preflightScenes(doc.scenes);
      if (unsafe.length) {
        return res.status(422).json({ ok: false, error: "stored scenes fail export preflight", issues: unsafe });
      }
      const bytes = await renderPptx(doc.scenes, { title: doc.title });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${doc.id}.pptx"`);
      res.send(Buffer.from(bytes));
    } catch (err) {
      mapStoreError(res, err);
    }
  }));
}
