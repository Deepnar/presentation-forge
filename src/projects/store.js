// V2 project store — the one durable adapter for V2-6A.
//
// Interface (ProjectStore) so a future hosted database replaces this
// module without touching the project model, the engine, or the routes:
//
//   create({ owner, title, scenes, theme, origin }) -> { doc }
//   get({ owner, id, admin }) -> { doc | null }
//   list({ owner, admin }) -> [summary]
//   save({ owner, id, admin, baseRevision, title?, scenes, theme?, origin? })
//     -> { status: "saved"|"noop", doc } | { status: "stale", expected, actual }
//   rename({ owner, id, admin, title }) -> { doc }
//   remove({ owner, id, admin }) -> { removed: boolean }
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
import { getDb } from "../db.js";
import {
  buildProjectDocument,
  validateProjectDocument,
  validateSavePayload,
  projectSummary,
  validProjectId,
  PROJECT_SCHEMA_VERSION,
} from "../../packages/projects/document.js";

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
  `);
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

function canRead(row, { owner, admin }) {
  if (admin) return true;
  if (row.owner === null || row.owner === undefined) return true;
  return row.owner === (owner ?? null);
}

async function createProjectInner({ owner = null, title, scenes, theme = null, origin = null }) {
  const db = ensureSchema();
  const doc = buildProjectDocument({ title, scenes, theme, origin });
  const verdict = await validateProjectDocument(doc);
  if (!verdict.ok) {
    const err = new Error(`invalid project: ${verdict.errors[0]}`);
    err.code = "invalid-document";
    err.details = verdict.errors;
    throw err;
  }
  const now = doc.updatedAt;
  try {
    db.prepare(
      "INSERT INTO v2_projects (id, owner, title, payload, revision, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run(doc.id, owner ?? null, doc.title, JSON.stringify(doc), doc.revision, doc.createdAt, now);
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
  return { doc: structuredClone(doc) };
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
  if (!canRead(row, { owner, admin })) return { doc: null };
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
    if (!canRead(row, { owner, admin })) continue;
    const doc = rowToDoc(row);
    if (!doc) continue;
    out.push(projectSummary(doc));
  }
  return { projects: out };
}

// Optimistic-concurrency save. Validation precedes the transaction;
// the revision check and write share one IMMEDIATE transaction so
// concurrent savers serialize with exactly one winner.
async function saveProjectInner({ owner = null, id, admin = false, baseRevision, title, scenes, theme, origin }) {
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
    if (!canRead(row, { owner, admin })) {
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

async function renameProjectInner({ owner = null, id, admin = false, title }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const clean = String(title ?? "").trim();
  if (!clean || clean.length > 200) {
    const err = new Error("title must be a non-empty string up to 200 chars");
    err.code = "invalid-document";
    throw err;
  }
  const db = ensureSchema();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM v2_projects WHERE id=?").get(id);
    if (!row || !canRead(row, { owner, admin })) {
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
    const now = new Date().toISOString();
    const next = { ...structuredClone(stored), title: clean, updatedAt: now, revision: stored.revision + 1 };
    const res = db
      .prepare("UPDATE v2_projects SET title=?, payload=?, revision=?, updated_at=? WHERE id=? AND revision=?")
      .run(next.title, JSON.stringify(next), next.revision, now, id, stored.revision);
    if (res.changes !== 1) {
      db.exec("ROLLBACK");
      const err = new Error("concurrent rename conflict — reload and retry");
      err.code = "stale";
      throw err;
    }
    db.exec("COMMIT");
    return { doc: structuredClone(next) };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch { /* path already rolled back */ }
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "stale")) throw err;
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
    if (!row || !canRead(row, { owner, admin })) return { removed: false };
    const res = db.prepare("DELETE FROM v2_projects WHERE id=?").run(id);
    return { removed: res.changes === 1 };
  } catch (err) {
    const e = new Error(`storage unavailable: ${err.message}`);
    e.code = "storage-unavailable";
    throw e;
  }
}

// Serialized writers: see the lane above. Reads (get/list) stay
// concurrent; every mutation runs inside its acquired turn.
export function createProject(args) {
  return serializeWrite(() => createProjectInner(args));
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
