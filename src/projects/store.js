// V2 project store — the one durable adapter for V2-6A.
//
// Interface (ProjectStore) so a future hosted database replaces this
// module without touching the project model, the engine, or the routes:
//
//   create({ owner, title, scenes, theme, origin, provenance? }) -> { doc }
//   get({ owner, id, admin }) -> { doc | null }
//   list({ owner, admin }) -> [summary]
//   save({ owner, id, admin, baseRevision, title?, scenes, theme?, origin?, provenance? })
//     -> { status: "saved"|"noop", doc } | { status: "stale", expected, actual }
//   rename({ owner, id, admin, baseRevision, title, provenance? })
//     -> { status: "saved"|"noop", doc } | { status: "stale", expected, actual }
//   remove({ owner, id, admin }) -> { removed: boolean }
//   listRevisions({ owner, id, admin }) -> { currentRevision, retention, revisions }
//   getRevision({ owner, id, admin, revision }) -> { found, pruned, meta, doc }
//   restoreRevision({ owner, id, admin, targetRevision, baseRevision, provenance? })
//     -> { status: "restored", doc, restoredFrom } | { status: "stale", expected, actual }
//
// Durability: node:sqlite file at CONFIG/forge.db (FORGE_DB_PATH
// override), WAL journal, one row per project holding the full versioned
// JSON. Saves run in BEGIN IMMEDIATE so two concurrent writers serialize;
// the revision check and the write share the transaction, so a stale
// writer cannot overwrite a newer commit. A failed save never touches the
// stored row — validation runs before the transaction opens.
//
// Durability limits (documented, not hidden): this is local disk, not
// cloud storage. It survives process restarts and OS reboots on the same
// volume, but not volume loss, image rebuilds without the mount, or
// multi-host deployments. Hosted mode still requires a session (see the
// routes); the store itself enforces owner scoping but not HTTP auth.
import { getDb, closeDb } from "../db.js";
import {
  buildProjectDocument,
  validateProjectDocument,
  validateSavePayload,
  projectSummary,
  validProjectId,
  PROJECT_SCHEMA_VERSION,
} from "../../packages/projects/document.js";
import {
  ensureHistorySchema,
  insertRevisionRow,
  pruneHistory,
  ensureBaselineRow,
  revisionMeta,
  validateProvenance,
} from "./history.js";

import { validateImportRequest, replayImportedProject } from "../../packages/projects/import-request.js";
import { sourceSchema } from "./source-schema.js";
import { turnDiscoveryQuery } from './turn-discovery-query.js';

function storageFailure(error) {
  if (error?.code?.startsWith("ERR_SQLITE") || ["EACCES", "EPERM", "EROFS", "ENOSPC"].includes(error?.code)) {
    return Object.assign(new Error("project storage unavailable"), { code: "storage-unavailable" });
  }
  return error;
}

function ensureSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS v2_projects (
      id TEXT PRIMARY KEY,
      owner TEXT,
      title TEXT NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_v2_projects_owner ON v2_projects(owner);
    CREATE TABLE IF NOT EXISTS v2_project_imports (
      request_key TEXT PRIMARY KEY,
      source_digest TEXT NOT NULL,
      project_id TEXT NOT NULL
    );
  `);
  db.exec(sourceSchema("sqlite"));
  ensureHistorySchema(db);
  return db;
}

function rowToDoc(row) {
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

// Writers serialize through one FIFO lane: node:sqlite connections
// hold a single open transaction, and save validation awaits AJV, so
// two concurrent savers would otherwise BEGIN inside each other's
// transaction. Reads stay concurrent; every revision-changing op runs
// its check and its write inside its acquired turn (same shape as the
// engine's own boundary).
let writeTail = Promise.resolve();
function serializeWrite(job) {
  const run = writeTail.then(job, job);
  writeTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Canonical authorization predicate for every operation. Ownership
// must match EXACTLY: an authenticated caller (owner Alice) sees only
// Alice's rows, an anonymous local caller (owner null) sees only
// ownerless local rows, and nobody treats ownerless rows as public.
// Admins keep the established full-access policy. Every read and every
// write funnels through this one function — no ad hoc checks.
export function canAccessProject(row, { owner, admin }) {
  if (admin) return true;
  return (row.owner ?? null) === (owner ?? null);
}

async function createProjectInner({ owner = null, title, scenes, theme = null, origin = null, provenance = null, importRequest = null }) {
  const request = validateImportRequest(importRequest, owner);
  const db = ensureSchema();
  const prov = validateProvenance(provenance ?? undefined);
  if (!prov.ok) {
    const err = new Error(prov.errors[0]);
    err.code = "invalid-document";
    err.details = prov.errors;
    throw err;
  }
  const doc = buildProjectDocument({ title, scenes, theme, origin });
  const verdict = await validateProjectDocument(doc);
  if (!verdict.ok) {
    const err = new Error(`invalid project: ${verdict.errors[0]}`);
    err.code = "invalid-document";
    err.details = verdict.errors;
    throw err;
  }
  const now = doc.updatedAt;
  // The project row and its first history entry commit together:
  // a created project always has a recoverable rev-0 baseline.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (request) {
      const link = db.prepare("SELECT * FROM v2_project_imports WHERE request_key=?").get(request.key);
      if (link) {
        const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(link.project_id);
        const result = await replayImportedProject(link, request, row, owner);
        db.exec("COMMIT");
        return result;
      }
    }
    try {
      db.prepare(
        "INSERT INTO v2_projects (id, owner, title, payload, revision, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      ).run(doc.id, owner ?? null, doc.title, JSON.stringify(doc), doc.revision, doc.createdAt, now);
    } catch (err) {
      db.exec("ROLLBACK");
      const e = new Error(`storage unavailable: ${err.message}`);
      e.code = "storage-unavailable";
      throw e;
    }
    try {
      insertRevisionRow(db, { projectId: doc.id, doc, kind: "create", provenance: prov.provenance });
    } catch (err) {
      db.exec("ROLLBACK");
      const e = new Error(`storage unavailable: ${err.message}`);
      e.code = "storage-unavailable";
      throw e;
    }
    if (request) db.prepare("INSERT INTO v2_project_imports (request_key,source_digest,project_id) VALUES (?,?,?)").run(request.key, request.digest, doc.id);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch { /* already rolled back */ }
    if (err && (err.code === "invalid-document" || err.code === "storage-unavailable" || err.code === "import-source-changed" || err.code === "import-target-deleted" || err.code === "not-found")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  return { doc: structuredClone(doc), ...(request ? { reused: false } : {}) };
}

export async function lookupImportedProject({ owner = null, importRequest }) {
  const request = validateImportRequest(importRequest, owner);
  if (!request) throw Object.assign(new Error("import identity required"), { code: "invalid-document" });
  try {
    const db = ensureSchema();
    const link = db.prepare("SELECT * FROM v2_project_imports WHERE request_key=?").get(request.key);
    if (!link) return null;
    const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(link.project_id);
    return await replayImportedProject(link, request, row, owner);
  } catch (error) { throw storageFailure(error); }
}

export async function getProject({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const db = ensureSchema();
  let row = null;
  try {
    row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(id);
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  if (!row) return { doc: null };
  if (!canAccessProject(row, { owner, admin })) return { doc: null };
  const doc = rowToDoc(row);
  if (!doc) {
    const err = new Error("stored project is corrupt");
    err.code = "invalid-document";
    throw err;
  }
  return { doc };
}

export async function listProjects({ owner = null, admin = false }) {
  const db = ensureSchema();
  let rows = [];
  try {
    rows = db.prepare("SELECT * FROM v2_projects ORDER BY updated_at DESC").all();
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  const out = [];
  for (const row of rows) {
    if (!canAccessProject(row, { owner, admin })) continue;
    const doc = rowToDoc(row);
    if (!doc) continue;
    out.push(projectSummary(doc));
  }
  return { projects: out };
}

// Optimistic-concurrency save. Validation precedes the transaction;
// the revision check and write share one IMMEDIATE transaction so
// concurrent savers serialize with exactly one winner.
async function saveProjectInner({ owner = null, id, admin = false, baseRevision, title, scenes, theme, origin, provenance = null }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const payloadVerdict = await validateSavePayload({ baseRevision, title, scenes, theme, origin });
  if (!payloadVerdict.ok) {
    const err = new Error(payloadVerdict.errors[0]);
    err.code = "invalid-document";
    err.details = payloadVerdict.errors;
    throw err;
  }
  const prov = validateProvenance(provenance ?? undefined);
  if (!prov.ok) {
    const err = new Error(prov.errors[0]);
    err.code = "invalid-document";
    err.details = prov.errors;
    throw err;
  }
  const db = ensureSchema();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(id);
    if (!row) {
      db.exec("ROLLBACK");
      const err = new Error(`no such project ${id}`);
      err.code = "not-found";
      throw err;
    }
    if (!canAccessProject(row, { owner, admin })) {
      db.exec("ROLLBACK");
      const err = new Error(`no such project ${id}`);
      err.code = "not-found";
      throw err;
    }
    const stored = rowToDoc(row);
    if (!stored) {
      db.exec("ROLLBACK");
      const err = new Error("stored project is corrupt");
      err.code = "invalid-document";
      throw err;
    }
    if (stored.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      db.exec("ROLLBACK");
      const err = new Error(`stored project uses schemaVersion ${stored.schemaVersion}, this build reads ${PROJECT_SCHEMA_VERSION}`);
      err.code = "invalid-document";
      throw err;
    }
    if (baseRevision !== stored.revision) {
      db.exec("ROLLBACK");
      return { status: "stale", expected: stored.revision, actual: baseRevision };
    }
    const nextScenes = structuredClone(scenes);
    const nextTitle = title !== undefined ? String(title).trim() : stored.title;
    const unchanged =
      JSON.stringify(nextScenes) === JSON.stringify(stored.scenes) &&
      nextTitle === stored.title &&
      JSON.stringify(theme ?? stored.theme ?? null) === JSON.stringify(stored.theme ?? null) &&
      JSON.stringify(origin ?? stored.origin ?? null) === JSON.stringify(stored.origin ?? null);
    if (unchanged) {
      db.exec("ROLLBACK");
      return { status: "noop", doc: structuredClone(stored) };
    }
    const now = new Date().toISOString();
    const next = {
      ...structuredClone(stored),
      title: nextTitle,
      scenes: nextScenes,
      updatedAt: now,
      revision: stored.revision + 1,
      ...(theme !== undefined ? (theme === null ? {} : { theme: structuredClone(theme) }) : {}),
      ...(origin !== undefined ? (origin === null ? {} : { origin: structuredClone(origin) }) : {}),
    };
    if (theme === null) delete next.theme;
    if (origin === null) delete next.origin;
    const verdict = await validateProjectDocument(next);
    if (!verdict.ok) {
      db.exec("ROLLBACK");
      const err = new Error(verdict.errors[0]);
      err.code = "invalid-document";
      err.details = verdict.errors;
      throw err;
    }
    const res = db
      .prepare("UPDATE v2_projects SET title=?, payload=?, revision=?, updated_at=? WHERE id=? AND revision=?")
      .run(next.title, JSON.stringify(next), next.revision, now, id, stored.revision);
    if (res.changes !== 1) {
      db.exec("ROLLBACK");
      const fresh = db.prepare("SELECT revision FROM v2_projects WHERE id=?").get(id);
      return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
    }
    // The new document and its history entry commit atomically with
    // the same transaction; pruning compacts inside it as well.
    insertRevisionRow(db, { projectId: id, doc: next, kind: "save", provenance: prov.provenance });
    pruneHistory(db, id);
    db.exec("COMMIT");
    return { status: "saved", doc: structuredClone(next) };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch { /* already rolled back on the stale/noop paths */ }
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
}

async function renameProjectInner({ owner = null, id, admin = false, baseRevision, title, provenance = null }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    const err = new Error("baseRevision must be a non-negative integer");
    err.code = "invalid-document";
    throw err;
  }
  const clean = String(title ?? "").trim();
  if (!clean || clean.length > 200) {
    const err = new Error("title must be a non-empty string up to 200 chars");
    err.code = "invalid-document";
    throw err;
  }
  const prov = validateProvenance(provenance ?? undefined);
  if (!prov.ok) {
    const err = new Error(prov.errors[0]);
    err.code = "invalid-document";
    err.details = prov.errors;
    throw err;
  }
  const db = ensureSchema();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(id);
    if (!row || !canAccessProject(row, { owner, admin })) {
      db.exec("ROLLBACK");
      const err = new Error(`no such project ${id}`);
      err.code = "not-found";
      throw err;
    }
    const stored = rowToDoc(row);
    if (!stored) {
      db.exec("ROLLBACK");
      const err = new Error("stored project is corrupt");
      err.code = "invalid-document";
      throw err;
    }
    // The expected-revision check shares the transaction with the
    // write, so two same-base renames serialize to one winner and one
    // stale conflict — the same no-lost-update principle as scene
    // saves, without retransmitting the presentation.
    if (baseRevision !== stored.revision) {
      db.exec("ROLLBACK");
      return { status: "stale", expected: stored.revision, actual: baseRevision };
    }
    if (clean === stored.title) {
      db.exec("ROLLBACK");
      return { status: "noop", doc: structuredClone(stored) };
    }
    const now = new Date().toISOString();
    const next = { ...structuredClone(stored), title: clean, updatedAt: now, revision: stored.revision + 1 };
    const res = db
      .prepare("UPDATE v2_projects SET title=?, payload=?, revision=?, updated_at=? WHERE id=? AND revision=?")
      .run(next.title, JSON.stringify(next), next.revision, now, id, stored.revision);
    if (res.changes !== 1) {
      db.exec("ROLLBACK");
      const fresh = db.prepare("SELECT revision FROM v2_projects WHERE id=?").get(id);
      return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
    }
    insertRevisionRow(db, { projectId: id, doc: next, kind: "rename", provenance: prov.provenance });
    pruneHistory(db, id);
    db.exec("COMMIT");
    return { status: "saved", doc: structuredClone(next) };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch { /* path already rolled back */ }
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
}

async function deleteProjectInner({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const db = ensureSchema();
  try {
    const row = db.prepare("SELECT owner FROM v2_projects WHERE id=?").get(id);
    if (!row || !canAccessProject(row, { owner, admin })) return { removed: false };
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM v2_project_revisions WHERE project_id=?").run(id);
      const res = db.prepare("DELETE FROM v2_projects WHERE id=?").run(id);
      db.exec("COMMIT");
      return { removed: res.changes === 1 };
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch { /* already rolled back */ }
      throw err;
    }
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
}

// Read the project row with the caller's access applied. Returns the
// parsed stored document, or throws not-found / invalid-document.
function readAccessibleProject(db, id, owner, admin) {
  const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(id);
  if (!row || !canAccessProject(row, { owner, admin })) {
    const err = new Error(`no such project ${id}`);
    err.code = "not-found";
    throw err;
  }
  const stored = rowToDoc(row);
  if (!stored) {
    const err = new Error("stored project is corrupt");
    err.code = "invalid-document";
    throw err;
  }
  return stored;
}

// List durable revisions (audit metadata, never scene bytes),
// newest first. Pre-history projects capture a baseline from the
// stored document on first touch — no earlier rows fabricated.
export async function listRevisions({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const db = ensureSchema();
  let stored = null;
  try {
    stored = readAccessibleProject(db, id, owner, admin);
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  // INSERT OR IGNORE is synchronous and idempotent, so concurrent
  // first-touches cannot duplicate or interleave the baseline.
  ensureBaselineRow(db, id, stored);
  let rows = [];
  try {
    rows = db.prepare("SELECT * FROM v2_project_revisions WHERE project_id=? ORDER BY revision DESC").all(id);
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  const { MAX_RECOVERABLE_REVISIONS, MAX_AUDIT_ROWS } = await import("./history.js");
  return {
    currentRevision: stored.revision,
    retention: { maxRecoverable: MAX_RECOVERABLE_REVISIONS, maxAudit: MAX_AUDIT_ROWS },
    revisions: rows.map(revisionMeta),
  };
}

// Read one recoverable revision: the full validated document as it
// was saved. Never executes stored data — the payload re-validates
// through the project + scene contracts like any load.
export async function getRevision({ owner = null, id, admin = false, revision }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  if (!Number.isInteger(revision) || revision < 0) {
    const err = new Error("revision must be a non-negative integer");
    err.code = "invalid-document";
    throw err;
  }
  const db = ensureSchema();
  let stored = null;
  try {
    stored = readAccessibleProject(db, id, owner, admin);
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  let row = null;
  try {
    ensureBaselineRow(db, id, stored);
    row = db.prepare("SELECT * FROM v2_project_revisions WHERE project_id=? AND revision=?").get(id, revision);
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  if (!row) {
    const err = new Error(`no such revision ${revision} for project ${id}`);
    err.code = "not-found";
    throw err;
  }
  const meta = revisionMeta(row);
  if (row.payload === null || row.payload === undefined) return { found: true, pruned: true, meta, doc: null };
  let doc = null;
  try {
    doc = JSON.parse(row.payload);
  } catch {
    doc = null;
  }
  if (!doc) {
    const err = new Error(`stored revision ${revision} is corrupt`);
    err.code = "invalid-document";
    throw err;
  }
  const verdict = await validateProjectDocument(doc);
  if (!verdict.ok) {
    const err = new Error(`stored revision ${revision} is invalid: ${verdict.errors[0]}`);
    err.code = "invalid-document";
    err.details = verdict.errors;
    throw err;
  }
  return { found: true, pruned: false, meta, doc };
}

// Restore a prior revision as a NEW current revision: the counter
// advances, the target row is preserved, and later rows are kept.
// A stale base refuses with 409 and changes nothing.
async function restoreRevisionInner({ owner = null, id, admin = false, targetRevision, baseRevision, provenance = null }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  if (!Number.isInteger(targetRevision) || targetRevision < 0) {
    const err = new Error("target revision must be a non-negative integer");
    err.code = "invalid-document";
    throw err;
  }
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    const err = new Error("baseRevision must be a non-negative integer");
    err.code = "invalid-document";
    throw err;
  }
  const prov = validateProvenance(provenance ?? undefined);
  if (!prov.ok) {
    const err = new Error(prov.errors[0]);
    err.code = "invalid-document";
    err.details = prov.errors;
    throw err;
  }
  const db = ensureSchema();
  db.exec("BEGIN IMMEDIATE");
  try {
    let stored = null;
    try {
      stored = readAccessibleProject(db, id, owner, admin);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    if (stored.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      db.exec("ROLLBACK");
      const err = new Error(`stored project uses schemaVersion ${stored.schemaVersion}, this build reads ${PROJECT_SCHEMA_VERSION}`);
      err.code = "invalid-document";
      throw err;
    }
    if (baseRevision !== stored.revision) {
      db.exec("ROLLBACK");
      return { status: "stale", expected: stored.revision, actual: baseRevision };
    }
    ensureBaselineRow(db, id, stored);
    const row = db.prepare("SELECT * FROM v2_project_revisions WHERE project_id=? AND revision=?").get(id, targetRevision);
    if (!row) {
      db.exec("ROLLBACK");
      const err = new Error(`no such revision ${targetRevision} for project ${id}`);
      err.code = "not-found";
      throw err;
    }
    if (row.payload === null || row.payload === undefined) {
      db.exec("ROLLBACK");
      const err = new Error(`revision ${targetRevision} has been pruned to audit-only and can no longer be restored`);
      err.code = "revision-pruned";
      throw err;
    }
    let target = null;
    try {
      target = JSON.parse(row.payload);
    } catch {
      target = null;
    }
    if (!target) {
      db.exec("ROLLBACK");
      const err = new Error(`stored revision ${targetRevision} is corrupt`);
      err.code = "invalid-document";
      throw err;
    }
    // The restored document carries the historical SCENES; identity
    // (title/theme/origin) stays current — a restore recovers content,
    // it does not clobber renames made since.
    const now = new Date().toISOString();
    const next = {
      ...structuredClone(stored),
      scenes: structuredClone(target.scenes),
      updatedAt: now,
      revision: stored.revision + 1,
    };
    const verdict = await validateProjectDocument(next);
    if (!verdict.ok) {
      db.exec("ROLLBACK");
      const err = new Error(verdict.errors[0]);
      err.code = "invalid-document";
      err.details = verdict.errors;
      throw err;
    }
    const res = db
      .prepare("UPDATE v2_projects SET title=?, payload=?, revision=?, updated_at=? WHERE id=? AND revision=?")
      .run(next.title, JSON.stringify(next), next.revision, now, id, stored.revision);
    if (res.changes !== 1) {
      db.exec("ROLLBACK");
      const fresh = db.prepare("SELECT revision FROM v2_projects WHERE id=?").get(id);
      return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
    }
    insertRevisionRow(db, { projectId: id, doc: next, kind: "restore", provenance: prov.provenance, restoredFrom: targetRevision });
    pruneHistory(db, id, targetRevision);
    db.exec("COMMIT");
    return { status: "restored", doc: structuredClone(next), restoredFrom: targetRevision };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch { /* path already rolled back */ }
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "revision-pruned")) throw err;
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
}

// Serialized writers: see the lane above. Reads (get/list) stay
// concurrent; every mutation runs inside its acquired turn.
// History reads (list/getRevision) stay concurrent; restore is a
// revision-changing op and serializes like save/rename.
export function createProject(args) {
  return serializeWrite(() => createProjectInner(args)).catch(error => { throw storageFailure(error); });
}
export function saveProject(args) {
  return serializeWrite(() => saveProjectInner(args));
}
export function renameProject(args) {
  return serializeWrite(() => renameProjectInner(args));
}
export function deleteProject(args) {
  return serializeWrite(() => deleteProjectInner(args));
}
export function restoreRevision(args) {
  return serializeWrite(() => restoreRevisionInner(args));
}

export function closeProjectStore() { closeDb(); }

export async function readTurnMetadataPage(input) {
  const { sql, params } = turnDiscoveryQuery(input, 'sqlite');
  return serializeWrite(async () => {
    const { RUN_DDL } = await import('../agent/schema.js');
    const db = ensureSchema();
    db.exec(RUN_DDL);
    const rows = db.prepare(sql).all(...params);
    // SQLite permits malformed TEXT; driver replacement decoding loses identity.
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    try {
      return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, value === null ? null : decoder.decode(value)])));
    } catch {
      throw Object.assign(new Error('Invalid discovery metadata.'), { code: 'invalid-document' });
    }
  }).catch(error => { throw storageFailure(error); });
}

// A host-only transaction seam; callbacks must contain local validation, never I/O
// to providers. Project/history and runtime effects share this one commit boundary.
export async function withRuntimeTransaction({ owner = null, id }, job) {
  if (!validProjectId(id))
    throw Object.assign(new Error("Invalid project"), { code: "invalid-id" });
  return serializeWrite(async () => {
    const { RUN_DDL } = await import("../agent/schema.js");
    const { runtimeDocument } = await import("./runtime-document.js");
    const db = ensureSchema();
    db.exec(RUN_DDL);
    db.exec("BEGIN IMMEDIATE");
    try {
      let doc = readAccessibleProject(db, id, owner, false);
      if (!(await validateProjectDocument(doc)).ok)
        throw Object.assign(new Error("Invalid project"), {
          code: "invalid-document",
        });
      let guard = null;
      const tx = {
        beforeCommit(check) {
          guard = check;
        },
        doc: structuredClone(doc),
        async query(sql, params = []) {
          const statement = db.prepare(sql);
          return statement.columns().length
            ? statement.all(...params)
            : (statement.run(...params), []);
        },
        async now() {
          return Math.floor(
            db.prepare("SELECT unixepoch('subsec') * 1000 AS ms").get().ms,
          );
        },
        async saveScenes(scenes, provenance) {
          const next = await runtimeDocument(doc, scenes, provenance);
          if (!next.changed) return doc.revision;
          ensureBaselineRow(db, id, doc);
          const r = db
            .prepare(
              "UPDATE v2_projects SET payload=?, revision=?, updated_at=? WHERE id=? AND revision=?",
            )
            .run(
              JSON.stringify(next.doc),
              next.doc.revision,
              next.doc.updatedAt,
              id,
              doc.revision,
            );
          if (r.changes !== 1)
            throw Object.assign(new Error("Runtime project changed"), {
              code: "invalid-document",
            });
          insertRevisionRow(db, {
            projectId: id,
            doc: next.doc,
            kind: "save",
            provenance: next.provenance,
          });
          pruneHistory(db, id);
          doc = next.doc;
          return doc.revision;
        },
      };
      const result = await job(tx);
      if (guard) await guard();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw storageFailure(error);
    }
  });
}

// Source SQL uses the actual adapter, never an environment-selected decoder.
export function withSourceTransaction(binding, job) {
  return withRuntimeTransaction(binding, tx => job(Object.freeze({
    dialect: 'sqlite', doc: { id: tx.doc.id, revision: tx.doc.revision }, query: tx.query,
  })));
}

// Citation checks share the parent lock but receive no scene-write capability.
export function withCitationReadTransaction(binding, job) {
  return withRuntimeTransaction(binding, tx => job(Object.freeze({
    dialect: 'sqlite', doc: tx.doc, query: tx.query,
  })));
}
