// V2 projects over HTTP: thin transport over the selected project
// store (src/projects/backend.js — SQLite by default, PostgreSQL
// when configured). No scene logic here — validation lives in the
// project model, durability in the store, revision authority in the
// save transaction. This module owns HTTP concerns only: body size
// caps, id shape, auth gating, and status-code mapping.
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
import { projectStore } from "../../src/projects/backend.js";
import { readProjectCover } from "../../src/projects/cover.js";
import { registerV2CopyRoute } from './v2-copy-routes.js';
import express from "express";
import { ASSET_LIMITS, prepareAsset, assetRef, scenesForExport } from "../../src/projects/assets.js";

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
  // The session cookie authenticates reads only (images and previews load
  // through <img>); a write must carry the bearer header, so a cookie can
  // never make a cross-site request change a project.
  const allowCookie = req.method === "GET" || req.method === "HEAD";
  if (!isHosted()) {
    try {
      const user = await resolveUser(req, { allowCookie });
      if (user) return { owner: user.email, admin: isAdmin(user) };
    } catch { /* anonymous local use */ }
    return { owner: null, admin: false };
  }
  const user = await resolveUser(req, { allowCookie });
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
  if (code === "cover-stale" || code === "invalid-cover-revision" || code === "cover-too-large") {
    return res.status(code === "cover-stale" ? 409 : code === "cover-too-large" ? 413 : 400).json({ ok: false, error: err.message, code });
  }
  if (code === "not-found") return fail(res, 404, err.message);
  if (code === "invalid-id") return fail(res, 400, err.message);
  if (code === "invalid-document") {
    return res.status(422).json({ ok: false, error: err.message, errors: err.details ?? [err.message], code: "invalid-document" });
  }
  if (code === "storage-unavailable") {
    return res.status(503).json({ ok: false, error: err.message, code: "storage-unavailable" });
  }
  if (code === "store-misconfigured") {
    return res.status(503).json({ ok: false, error: err.message, code: "store-misconfigured" });
  }
  if (code === "stale") return res.status(409).json({ ok: false, error: err.message, code: "stale" });
  if (code === "revision-pruned") return res.status(410).json({ ok: false, error: err.message, code: "revision-pruned" });
  if (code === "asset-quota" || code === "asset-too-large") return res.status(413).json({ ok: false, error: err.message, code });
  if (code === "asset-invalid" || code === "asset-unsupported") return res.status(415).json({ ok: false, error: err.message, code });
  return fail(res, 500, err?.message ?? "project request failed");
}

// Writers authenticate by bearer header only, never the cookie, so a
// cross-site form cannot add images to someone's project.
async function projectWriter(req) {
  if (!isHosted()) {
    const user = await resolveUser(req).catch(() => null);
    return user ? { owner: user.email, admin: isAdmin(user) } : { owner: null, admin: false };
  }
  const user = await resolveUser(req);
  return user ? { owner: user.email, admin: isAdmin(user) } : { denied: true };
}

export function registerV2ProjectRoutes(app) {
  // A PowerPoint file in, a new editable project out (F8). Bearer only; the
  // name rides in X-File-Name so the body stays the raw file.
  app.post("/api/v2/projects/import-pptx",
    express.raw({ type: () => true, limit: 61 * 1024 * 1024 }),
    wrap(async (req, res) => {
      if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
      const who = await projectWriter(req);
      if (who.denied) return fail(res, 401, "log in to use saved projects");
      let filename = "presentation.pptx";
      try { filename = decodeURIComponent(String(req.get("X-File-Name") ?? filename)).slice(0, 200) || filename; } catch { /* keep the default */ }
      try {
        const { importPptxProject } = await import("../../src/projects/pptx-import.js");
        const out = await importPptxProject({ owner: who.owner, bytes: Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array(), filename });
        res.status(201).json({ ok: true, project: out.project, warnings: out.warnings });
      } catch (err) {
        if (err?.code === "pptx-invalid") return res.status(422).json({ ok: false, error: err.message, code: err.code });
        if (err?.code === "pptx-too-large" || err?.code === "asset-quota") return res.status(413).json({ ok: false, error: err.message, code: err.code });
        mapStoreError(res, err);
      }
    }));

  // Files a person adds as material (F8): the text read out of them and a
  // role. Writes take the bearer only; reads also honour the cookie.
  const fileError = (res, err) => {
    if (["file-invalid", "file-unsupported", "file-unreadable", "file-empty"].includes(err?.code)) return res.status(422).json({ ok: false, error: err.message, code: err.code });
    if (err?.code === "file-too-large" || err?.code === "file-quota") return res.status(413).json({ ok: false, error: err.message, code: err.code });
    return mapStoreError(res, err);
  };
  app.post("/api/v2/projects/:id/files",
    express.raw({ type: () => true, limit: 41 * 1024 * 1024 }),
    wrap(async (req, res) => {
      if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
      if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
      const who = await projectWriter(req);
      if (who.denied) return fail(res, 401, "log in to use saved projects");
      let name = "file";
      try { name = decodeURIComponent(String(req.get("X-File-Name") ?? name)).slice(0, 200) || name; } catch { /* keep the default */ }
      const role = String(req.get("X-File-Role") ?? "source");
      try {
        const { FILE_ROLES } = await import("../../src/projects/file-schema.js");
        if (!FILE_ROLES.includes(role)) return res.status(422).json({ ok: false, error: "unknown file role", code: "invalid-document" });
        const { extractFile } = await import("../../src/projects/file-extract.js");
        const file = await extractFile(Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array(), name);
        const { putProjectFile } = await projectStore();
        const out = await putProjectFile({ owner: who.owner, admin: who.admin, id: req.params.id, file: { ...file, role } });
        if (!out.stored) return fail(res, 404, "no such project");
        res.status(201).json({ ok: true, file: out.file, truncated: file.truncated });
      } catch (err) { fileError(res, err); }
    }));
  app.get("/api/v2/projects/:id/files", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { listProjectFiles } = await projectStore();
      const out = await listProjectFiles({ owner: who.owner, admin: who.admin, id: req.params.id });
      if (!out.files) return fail(res, 404, "no such project");
      ok(res, { files: out.files });
    } catch (err) { fileError(res, err); }
  }));
  app.get("/api/v2/projects/:id/files/:fileId", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const offset = Math.max(0, Number.parseInt(req.query.offset ?? "0", 10) || 0);
    try {
      const { readProjectFile } = await projectStore();
      const out = await readProjectFile({ owner: who.owner, admin: who.admin, id: req.params.id, fileId: String(req.params.fileId), offset, limit: 20000 });
      if (!out.file) return fail(res, 404, "no such file");
      ok(res, { file: out.file });
    } catch (err) { fileError(res, err); }
  }));
  app.patch("/api/v2/projects/:id/files/:fileId", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectWriter(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { setProjectFileRole } = await projectStore();
      const out = await setProjectFileRole({ owner: who.owner, admin: who.admin, id: req.params.id, fileId: String(req.params.fileId), role: String(req.body?.role ?? "") });
      if (!out.file) return fail(res, 404, "no such file");
      ok(res, { file: out.file });
    } catch (err) { fileError(res, err); }
  }));
  app.delete("/api/v2/projects/:id/files/:fileId", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectWriter(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { deleteProjectFile } = await projectStore();
      const out = await deleteProjectFile({ owner: who.owner, admin: who.admin, id: req.params.id, fileId: String(req.params.fileId) });
      if (!out.removed) return fail(res, 404, "no such file");
      ok(res, {});
    } catch (err) { fileError(res, err); }
  }));

  // Slide layouts a person saved in the project (F4c).
  app.get("/api/v2/projects/:id/layouts", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const out = await (await projectStore()).listProjectLayouts({ owner: who.owner, admin: who.admin, id: req.params.id });
      if (!out.layouts) return fail(res, 404, "no such project");
      ok(res, { layouts: out.layouts });
    } catch (err) { mapStoreError(res, err); }
  }));
  app.post("/api/v2/projects/:id/layouts", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectWriter(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { name, scene } = req.body ?? {};
    const { LAYOUT_LIMITS } = await import("../../src/projects/file-schema.js");
    if (typeof name !== "string" || !name.trim() || name.length > LAYOUT_LIMITS.nameChars) return res.status(422).json({ ok: false, error: "give the layout a name", code: "invalid-document" });
    try {
      if (JSON.stringify(scene ?? null).length > LAYOUT_LIMITS.sceneChars) return res.status(413).json({ ok: false, error: "this slide is too large to save as a layout", code: "layout-too-large" });
      const { validateScene } = await import("../../packages/model/scene.ts");
      if (!(await validateScene(scene)).ok) return res.status(422).json({ ok: false, error: "this slide cannot be saved as a layout", code: "invalid-document" });
      const { randomBytes } = await import("node:crypto");
      const layout = { id: `layout_${randomBytes(8).toString("hex")}`, name: name.trim(), scene };
      const out = await (await projectStore()).putProjectLayout({ owner: who.owner, admin: who.admin, id: req.params.id, layout });
      if (!out.stored) return fail(res, 404, "no such project");
      res.status(201).json({ ok: true, layout });
    } catch (err) {
      if (err?.code === "layout-quota") return res.status(413).json({ ok: false, error: err.message, code: err.code });
      mapStoreError(res, err);
    }
  }));
  app.delete("/api/v2/projects/:id/layouts/:layoutId", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectWriter(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const out = await (await projectStore()).deleteProjectLayout({ owner: who.owner, admin: who.admin, id: req.params.id, layoutId: String(req.params.layoutId) });
      if (!out.removed) return fail(res, 404, "no such layout");
      ok(res, {});
    } catch (err) { mapStoreError(res, err); }
  }));

  app.post("/api/v2/projects/:id/assets",
    express.raw({ type: () => true, limit: ASSET_LIMITS.bytes + 1024 }),
    wrap(async (req, res) => {
      if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
      if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
      const who = await projectWriter(req);
      if (who.denied) return fail(res, 401, "log in to use saved projects");
      try {
        const asset = await prepareAsset(Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array());
        const { putProjectAsset } = await projectStore();
        const result = await putProjectAsset({ owner: who.owner, admin: who.admin, id: req.params.id, asset });
        if (!result.stored) return fail(res, 404, "no such project");
        ok(res, { asset: { ...result.asset, src: assetRef(result.asset.hash) } });
      } catch (err) {
        mapStoreError(res, err);
      }
    }));

  // Images are immutable and content-addressed, so a browser may cache one
  // for as long as it likes — but only privately, since access is per owner.
  app.get("/api/v2/assets/:hash", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!/^[0-9a-f]{64}$/.test(req.params.hash)) return fail(res, 400, "invalid asset");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { getAccessibleAsset } = await projectStore();
      const asset = await getAccessibleAsset({ owner: who.owner, admin: who.admin, hash: req.params.hash });
      if (!asset) return fail(res, 404, "no such asset");
      res.set("Cache-Control", "private, max-age=31536000, immutable");
      res.vary("Authorization").vary("Cookie");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(asset.mime).send(Buffer.from(asset.bytes));
    } catch (err) {
      mapStoreError(res, err);
    }
  }));

  registerV2CopyRoute(app, { allowed: projectsAllowed });
  app.get("/api/v2/projects/:id/cover", wrap(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const raw = req.query.revision;
    const revision = typeof raw === "string" && /^(0|[1-9]\d{0,15})$/.test(raw) ? Number(raw) : NaN;
    try {
      const store = await projectStore();
      const cover = await readProjectCover(store, { id: req.params.id, revision, owner: who.owner, admin: who.admin });
      ok(res, { cover });
    } catch (err) { mapStoreError(res, err); }
  }));

  app.get("/api/v2/projects", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { listProjects } = await projectStore();
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
    try {
      const { createProject } = await projectStore();
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
    try {
      const { getProject } = await projectStore();
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
    try {
      const { saveProject } = await projectStore();
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
    try {
      const { renameProject } = await projectStore();
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

  // Other layouts for one compiled slide, from the slide as the editor has
  // it now — src/projects/slide-layouts.js; nothing is written.
  app.post("/api/v2/projects/:id/slides/:slideId/layouts", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { scene = null, index = null, total = null } = req.body ?? {};
    if (scene !== null) {
      const { validateScene } = await import("../../packages/model/scene.ts");
      if (!(await validateScene(scene)).ok) return res.status(422).json({ ok: false, error: "the slide is not a valid scene", code: "invalid-document" });
    }
    try {
      const { slideLayoutOptions } = await import("../../src/projects/slide-layouts.js");
      const out = await slideLayoutOptions({ owner: who.owner, admin: who.admin, id: req.params.id, slideId: String(req.params.slideId), scene, index, total });
      ok(res, out);
    } catch (err) {
      if (err?.code === "not-found") return fail(res, 404, err.message);
      if (err?.code === "invalid-document") return res.status(422).json({ ok: false, error: err.message, code: err.code });
      mapStoreError(res, err);
    }
  }));

  // Restyle a project in another theme or appearance, keeping the person's
  // edits — the work is src/projects/retheme.js; this only carries it.
  // Bearer only, like every state-changing route.
  app.post("/api/v2/projects/:id/theme", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    const { theme, mode = "light", baseRevision } = req.body ?? {};
    if (typeof theme !== "string" || !theme) return res.status(422).json({ ok: false, error: "theme is required", code: "invalid-document" });
    if (!Number.isInteger(baseRevision) || baseRevision < 0) {
      return res.status(422).json({ ok: false, error: "baseRevision must be a non-negative integer", code: "invalid-document" });
    }
    try {
      const { changeProjectTheme } = await import("../../src/projects/retheme.js");
      const out = await changeProjectTheme({ owner: who.owner, admin: who.admin, id: req.params.id, theme, mode, baseRevision });
      if (out.status === "stale") {
        return res.status(409).json({ ok: false, error: `stale project revision: based on ${out.actual}, stored is ${out.expected}`, code: "stale-revision", expectedRevision: out.expected, actualRevision: out.actual });
      }
      ok(res, { project: out.doc, ...(out.status === "noop" ? { noop: true } : {}) });
    } catch (err) {
      if (err?.code === "no-intent") return res.status(409).json({ ok: false, error: err.message, code: "no-intent" });
      if (err?.code === "bad-theme" || err?.code === "bad-mode" || err?.code === "bad-style") return res.status(422).json({ ok: false, error: err.message, code: err.code });
      mapStoreError(res, err);
    }
  }));

  app.delete("/api/v2/projects/:id", wrap(async (req, res) => {
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { deleteProject } = await projectStore();
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
    try {
      const { listRevisions } = await projectStore();
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
    try {
      const { getRevision } = await projectStore();
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
    try {
      const { restoreRevision } = await projectStore();
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
    res.set("Cache-Control", "private, no-store");res.set("Pragma", "no-cache");res.vary("Authorization");
    if (!projectsAllowed()) return fail(res, 403, "project storage is disabled on this host");
    if (!validProjectId(req.params.id)) return fail(res, 400, "invalid project id");
    const who = await projectOwner(req);
    if (who.denied) return fail(res, 401, "log in to use saved projects");
    try {
      const { getProject } = await projectStore();
      const { doc } = await getProject({ owner: who.owner, id: req.params.id, admin: who.admin });
      if (!doc) return fail(res, 404, "no such project");
      const envelope = await validateProjectDocument(doc);
      if (!envelope.ok) return res.status(422).json({ ok: false, error: envelope.errors[0], errors: envelope.errors });
      res.set("X-Forge-Project-Revision", String(doc.revision));
      const unsafe = await preflightScenes(doc.scenes);
      if (unsafe.length) {
        if (doc.scenes.some(scene => scene.citations?.length)) res.set("X-Forge-Export-Refusal", "citation-preservation-required");
        return res.status(422).json({ ok: false, error: "stored scenes fail export preflight", issues: unsafe,
          ...(doc.scenes.some(scene => scene.citations?.length) ? { code: "citation-preservation-required" } : {}) });
      }
      const { getProjectAssets } = await projectStore();
      const scenes = await scenesForExport({ getProjectAssets }, { owner: who.owner, admin: who.admin, id: doc.id }, doc.scenes);
      const bytes = await renderPptx(scenes, { title: doc.title });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="${doc.id}.pptx"`);
      res.send(Buffer.from(bytes));
    } catch (err) {
      mapStoreError(res, err);
    }
  }));
}
