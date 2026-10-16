// V2 hosted project store — the PostgreSQL ProjectStore adapter (V2-6C).
//
// Same interface and response semantics as src/projects/store.js
// (create/get/list/save/rename/remove/listRevisions/getRevision/
// restoreRevision, with saved/noop/stale shapes and invalid-id,
// invalid-document, not-found, storage-unavailable, revision-pruned
// codes). Shared pure logic (provenance validation, audit building,
// retention planning, ownership predicate) is imported, never
// reimplemented, so the two backends cannot drift on policy.
//
// Multi-instance safety comes from the database, never from a
// per-process queue: every revision-changing op runs SELECT ..
// FOR UPDATE + compare-and-swap UPDATE (.. WHERE id AND revision)
// + history INSERT + prune inside one READ COMMITTED transaction.
// Two processes racing on one base produce exactly one winner; the
// loser re-reads and reports stale. Payloads are TEXT holding the
// same JSON.stringify bytes as SQLite (byte-identical round-trips,
// no JSONB normalization surprises).
//
// Pooling: one memoized pg Pool per connection string, bounded by
// FORGE_PROJECTS_PG_POOL_MAX (default 10). Credentials stay
// server-side (env only); nothing here logs URLs, payloads, or
// slide contents.
import {
  buildProjectDocument,
  validateProjectDocument,
  validateSavePayload,
  projectSummary,
  validProjectId,
  PROJECT_SCHEMA_VERSION,
} from "../../packages/projects/document.js";
import {
  buildAudit,
  computePrunePlan,
  revisionMeta,
  validateProvenance,
  MAX_RECOVERABLE_REVISIONS,
  MAX_AUDIT_ROWS,
} from "./history.js";
import { canAccessProject } from "./store.js";

import { validateImportRequest, replayImportedProject } from "../../packages/projects/import-request.js";

export { canAccessProject };

const pools = new Map();

function poolConfig() {
  const max = Number.parseInt(process.env.FORGE_PROJECTS_PG_POOL_MAX ?? "10", 10);
  const config = {
    connectionString: process.env.FORGE_PROJECTS_DATABASE_URL,
    max: Number.isInteger(max) && max > 0 ? Math.min(max, 50) : 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  };
  const ssl = (process.env.FORGE_PROJECTS_PG_SSL ?? "").trim();
  if (ssl === "1") {
    config.ssl = process.env.FORGE_PROJECTS_PG_SSL_VERIFY === "0"
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true };
  } else if (ssl === "0") {
    config.ssl = false;
  }
  return config;
}

async function pool() {
  const url = process.env.FORGE_PROJECTS_DATABASE_URL;
  if (!url) {
    const err = new Error("project storage is not configured on this host: FORGE_PROJECTS_BACKEND=postgres but FORGE_PROJECTS_DATABASE_URL is not set");
    err.code = "store-misconfigured";
    throw err;
  }
  let p = pools.get(url);
  if (!p) {
    const { Pool } = await import("pg");
    p = new Pool(poolConfig());
    p.on("error", () => { /* idle-client errors surface per-query; never crash the process */ });
    pools.set(url, p);
  }
  return p;
}

// Test-only: close every pool and forget them, so suites can switch
// databases by changing the env var. Never used outside tests.
export async function closeProjectStore() {
  for (const p of pools.values()) {
    try {
      await p.end();
    } catch { /* teardown only */ }
  }
  pools.clear();
}

export async function __testReset() { await closeProjectStore(); }

// Test-only: raw access for corruption/legacy-row fixtures. The
// adapter itself never exposes this to routes.
export async function __testQuery(text, params = []) {
  const p = await pool();
  return p.query(text, params);
}

function storageUnavailable(err) {
  // Coded domain errors (thrown deliberately above) pass through
  // untouched; only raw driver failures become storage-unavailable.
  // pg driver codes ('23505', 'ECONNREFUSED', …) are never in this
  // set, so they can never leak through as domain codes.
  if (err && (err.code === "store-misconfigured" || err.code === "invalid-id" || err.code === "invalid-document" || err.code === "not-found" || err.code === "revision-pruned" || err.code === "import-source-changed" || err.code === "import-target-deleted")) return err;
  const e = new Error(`storage unavailable: ${err?.message ?? String(err)}`);
  e.code = "storage-unavailable";
  return e;
}

function rowToDoc(row) {
  try {
    return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  } catch {
    return null;
  }
}

const PROJECT_DDL = `
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
  CREATE TABLE IF NOT EXISTS v2_project_revisions (
    project_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    audit TEXT NOT NULL,
    payload TEXT,
    PRIMARY KEY (project_id, revision)
  );
  CREATE INDEX IF NOT EXISTS idx_v2_revisions_project ON v2_project_revisions(project_id);
`;

async function ensureSchema(clientOrPool) {
  await clientOrPool.query(PROJECT_DDL);
}

// Schema is idempotent DDL and must never run inside a write
// transaction: two concurrent writers both creating-if-missing
// deadlock on the table/index locks. Ensure once per pool outside
// every transaction instead.
const ensuredPools = new WeakMap();
async function ensureSchemaPool(p) {
  if (ensuredPools.has(p)) return ensuredPools.get(p);
  const ready = (async () => {
    const client = await p.connect();
    client.on("error", () => { /* initialization query reports the failure */ });
    try {
      await client.query("BEGIN");
      // DDL has its own short transaction. The shared lock also covers cold
      // initialization in a different process, before any document transaction.
      await client.query("SELECT pg_advisory_xact_lock(21441, 7)");
      await ensureSchema(client);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
      throw error;
    } finally { client.release(); }
  })();
  ensuredPools.set(p, ready);
  try { await ready; } catch (error) { ensuredPools.delete(p); throw error; }
}

async function withTxn(fn) {
  const p = await pool();
  const client = await p.connect().catch((err) => { throw storageUnavailable(err); });
  // A backend terminated mid-transaction emits 'error' on the
  // checked-out client; without a listener that event crashes the
  // process. The failure itself still rejects the pending query and
  // is mapped below — this only keeps the crash from doubling it.
  client.on("error", () => { /* mapped at the pending query */ });
  try {
    await client.query("BEGIN");
    try {
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch { /* rollback best-effort */ }
      throw err;
    }
  } finally {
    client.release();
  }
}

function readAccessibleProjectRow(row, id, owner, admin) {
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

async function insertRevisionRow(client, { projectId, doc, kind, provenance, restoredFrom = null }) {
  const audit = buildAudit({ doc, kind, provenance, restoredFrom });
  await client.query(
    "INSERT INTO v2_project_revisions (project_id, revision, created_at, kind, audit, payload) VALUES ($1,$2,$3,$4,$5,$6)",
    [projectId, doc.revision, doc.updatedAt, kind, JSON.stringify(audit), JSON.stringify(doc)],
  );
}

async function pruneHistory(client, projectId, keepRevision = null) {
  const all = (await client.query(
    "SELECT revision, payload FROM v2_project_revisions WHERE project_id=$1 ORDER BY revision DESC",
    [projectId],
  )).rows.map((r) => ({ revision: r.revision, hasPayload: r.payload !== null && r.payload !== undefined }));
  const plan = computePrunePlan(all, keepRevision);
  for (const revision of plan.remove) {
    await client.query("DELETE FROM v2_project_revisions WHERE project_id=$1 AND revision=$2", [projectId, revision]);
  }
  for (const revision of plan.nullPayload) {
    await client.query("UPDATE v2_project_revisions SET payload=NULL WHERE project_id=$1 AND revision=$2", [projectId, revision]);
  }
}

async function ensureBaselineRow(client, projectId, storedDoc) {
  const audit = {
    kind: "baseline",
    actor: null,
    agentId: null,
    envelopeIds: [],
    engineRevision: null,
    historyLength: null,
    restoredFrom: null,
    title: storedDoc.title,
    sceneCount: storedDoc.scenes.length,
    summary: `baseline captured from stored rev ${storedDoc.revision} (pre-history project)`,
  };
  await client.query(
    "INSERT INTO v2_project_revisions (project_id, revision, created_at, kind, audit, payload) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (project_id, revision) DO NOTHING",
    [projectId, storedDoc.revision, storedDoc.updatedAt, "baseline", JSON.stringify(audit), JSON.stringify(storedDoc)],
  );
}

function checkSchemaVersion(stored) {
  if (stored.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    const err = new Error(`stored project uses schemaVersion ${stored.schemaVersion}, this build reads ${PROJECT_SCHEMA_VERSION}`);
    err.code = "invalid-document";
    throw err;
  }
}

export async function createProject({ owner = null, title, scenes, theme = null, origin = null, provenance = null, importRequest = null }) {
  const request = validateImportRequest(importRequest, owner);
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
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      if (request) {
        // The unique insertion waits for a competing transaction. Its reservation,
        // project and baseline history either all commit or all roll back.
        const reserved = await client.query(
          "INSERT INTO v2_project_imports (request_key,source_digest,project_id) VALUES ($1,$2,$3) ON CONFLICT (request_key) DO NOTHING RETURNING project_id",
          [request.key, request.digest, doc.id],
        );
        if (!reserved.rowCount) {
          const link = (await client.query("SELECT * FROM v2_project_imports WHERE request_key=$1", [request.key])).rows[0];
          const row = (await client.query("SELECT * FROM v2_projects WHERE id=$1", [link.project_id])).rows[0];
          return replayImportedProject(link, request, row, owner);
        }
      }

      try {
        await client.query(
          "INSERT INTO v2_projects (id, owner, title, payload, revision, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [doc.id, owner ?? null, doc.title, JSON.stringify(doc), doc.revision, doc.createdAt, now],
        );
      } catch (err) {
        // Id collision or any insert failure: like SQLite, the
        // whole creation is unavailable, never half-written.
        throw storageUnavailable(err);
      }
      await insertRevisionRow(client, { projectId: doc.id, doc, kind: "create", provenance: prov.provenance });
      return { doc: structuredClone(doc), ...(request ? { reused: false } : {}) };
    });
  } catch (err) {
    if (err && (err.code === "invalid-document" || err.code === "storage-unavailable")) throw err;
    throw storageUnavailable(err);
  }
}

export async function lookupImportedProject({ owner = null, importRequest }) {
  const request = validateImportRequest(importRequest, owner);
  if (!request) throw Object.assign(new Error("import identity required"), { code: "invalid-document" });
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const link = (await p.query("SELECT * FROM v2_project_imports WHERE request_key=$1", [request.key])).rows[0];
    if (!link) return null;
    const row = (await p.query("SELECT * FROM v2_projects WHERE id=$1", [link.project_id])).rows[0];
    return await replayImportedProject(link, request, row, owner);
  } catch (err) { throw storageUnavailable(err); }
}

export async function getProject({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const p = await pool().catch((err) => { throw storageUnavailable(err); });
  let row = null;
  try {
    await ensureSchemaPool(p);
    row = (await p.query("SELECT * FROM v2_projects WHERE id=$1", [id])).rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "store-misconfigured") throw err;
    throw storageUnavailable(err);
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
  const p = await pool().catch((err) => { throw storageUnavailable(err); });
  let rows = [];
  try {
    await ensureSchemaPool(p);
    // Same observable contract as SQLite (full scan + JS filter +
    // corrupt-row skip); filtering in SQL would change nothing
    // observable and would risk drifting the skip semantics.
    rows = (await p.query("SELECT * FROM v2_projects ORDER BY updated_at DESC")).rows;
  } catch (err) {
    if (err && err.code === "store-misconfigured") throw err;
    throw storageUnavailable(err);
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

async function checkStale(client, id, baseRevision, storedRevision) {
  if (baseRevision !== storedRevision) {
    const fresh = (await client.query("SELECT revision FROM v2_projects WHERE id=$1", [id])).rows[0];
    return { status: "stale", expected: fresh?.revision ?? storedRevision + 1, actual: baseRevision };
  }
  return null;
}

export async function saveProject({ owner = null, id, admin = false, baseRevision, title, scenes, theme, origin, provenance = null }) {
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
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      const row = (await client.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? null;
      const stored = readAccessibleProjectRow(row, id, owner, admin);
      checkSchemaVersion(stored);
      const stale = await checkStale(client, id, baseRevision, stored.revision);
      if (stale) return stale;
      const nextScenes = structuredClone(scenes);
      const nextTitle = title !== undefined ? String(title).trim() : stored.title;
      const unchanged =
        JSON.stringify(nextScenes) === JSON.stringify(stored.scenes) &&
        nextTitle === stored.title &&
        JSON.stringify(theme ?? stored.theme ?? null) === JSON.stringify(stored.theme ?? null) &&
        JSON.stringify(origin ?? stored.origin ?? null) === JSON.stringify(stored.origin ?? null);
      if (unchanged) return { status: "noop", doc: structuredClone(stored) };
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
        const err = new Error(verdict.errors[0]);
        err.code = "invalid-document";
        err.details = verdict.errors;
        throw err;
      }
      const res = await client.query(
        "UPDATE v2_projects SET title=$1, payload=$2, revision=$3, updated_at=$4 WHERE id=$5 AND revision=$6",
        [next.title, JSON.stringify(next), next.revision, now, id, stored.revision],
      );
      if (res.rowCount !== 1) {
        const fresh = (await client.query("SELECT revision FROM v2_projects WHERE id=$1", [id])).rows[0];
        return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
      }
      await insertRevisionRow(client, { projectId: id, doc: next, kind: "save", provenance: prov.provenance });
      await pruneHistory(client, id);
      return { status: "saved", doc: structuredClone(next) };
    });
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "store-misconfigured")) throw err;
    throw storageUnavailable(err);
  }
}

export async function renameProject({ owner = null, id, admin = false, baseRevision, title, provenance = null }) {
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
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      const row = (await client.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? null;
      const stored = readAccessibleProjectRow(row, id, owner, admin);
      const stale = await checkStale(client, id, baseRevision, stored.revision);
      if (stale) return stale;
      if (clean === stored.title) return { status: "noop", doc: structuredClone(stored) };
      const now = new Date().toISOString();
      const next = { ...structuredClone(stored), title: clean, updatedAt: now, revision: stored.revision + 1 };
      const res = await client.query(
        "UPDATE v2_projects SET title=$1, payload=$2, revision=$3, updated_at=$4 WHERE id=$5 AND revision=$6",
        [next.title, JSON.stringify(next), next.revision, now, id, stored.revision],
      );
      if (res.rowCount !== 1) {
        const fresh = (await client.query("SELECT revision FROM v2_projects WHERE id=$1", [id])).rows[0];
        return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
      }
      await insertRevisionRow(client, { projectId: id, doc: next, kind: "rename", provenance: prov.provenance });
      await pruneHistory(client, id);
      return { status: "saved", doc: structuredClone(next) };
    });
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "store-misconfigured")) throw err;
    throw storageUnavailable(err);
  }
}

export async function deleteProject({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      const row = (await client.query("SELECT owner FROM v2_projects WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? null;
      if (!row || !canAccessProject(row, { owner, admin })) return { removed: false };
      await client.query("DELETE FROM v2_project_revisions WHERE project_id=$1", [id]);
      const res = await client.query("DELETE FROM v2_projects WHERE id=$1", [id]);
      return { removed: res.rowCount === 1 };
    });
  } catch (err) {
    if (err && (err.code === "invalid-id" || err.code === "store-misconfigured")) throw err;
    throw storageUnavailable(err);
  }
}

async function readStoredForHistory(client, id, owner, admin) {
  const row = (await client.query("SELECT * FROM v2_projects WHERE id=$1", [id])).rows[0] ?? null;
  return readAccessibleProjectRow(row, id, owner, admin);
}

export async function listRevisions({ owner = null, id, admin = false }) {
  if (!validProjectId(id)) {
    const err = new Error(`invalid project id ${id}`);
    err.code = "invalid-id";
    throw err;
  }
  const p = await pool().catch((err) => { throw storageUnavailable(err); });
  try {
    await ensureSchemaPool(p);
    const stored = await readStoredForHistory(p, id, owner, admin);
    // ON CONFLICT DO NOTHING: concurrent first-touches are safe
    // without any lock, on every backend alike.
    await ensureBaselineRow(p, id, stored);
    const rows = (await p.query("SELECT * FROM v2_project_revisions WHERE project_id=$1 ORDER BY revision DESC", [id])).rows;
    return {
      currentRevision: stored.revision,
      retention: { maxRecoverable: MAX_RECOVERABLE_REVISIONS, maxAudit: MAX_AUDIT_ROWS },
      revisions: rows.map(revisionMeta),
    };
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "store-misconfigured" || err.code === "revision-pruned")) throw err;
    throw storageUnavailable(err);
  }
}

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
  const p = await pool().catch((err) => { throw storageUnavailable(err); });
  try {
    await ensureSchemaPool(p);
    const stored = await readStoredForHistory(p, id, owner, admin);
    await ensureBaselineRow(p, id, stored);
    const row = (await p.query("SELECT * FROM v2_project_revisions WHERE project_id=$1 AND revision=$2", [id, revision])).rows[0] ?? null;
    if (!row) {
      const err = new Error(`no such revision ${revision} for project ${id}`);
      err.code = "not-found";
      throw err;
    }
    const meta = revisionMeta(row);
    if (row.payload === null || row.payload === undefined) return { found: true, pruned: true, meta, doc: null };
    let doc = null;
    try {
      doc = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
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
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "store-misconfigured")) throw err;
    throw storageUnavailable(err);
  }
}

export async function restoreRevision({ owner = null, id, admin = false, targetRevision, baseRevision, provenance = null }) {
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
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      const row = (await client.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [id])).rows[0] ?? null;
      const stored = readAccessibleProjectRow(row, id, owner, admin);
      checkSchemaVersion(stored);
      const stale = await checkStale(client, id, baseRevision, stored.revision);
      if (stale) return stale;
      await ensureBaselineRow(client, id, stored);
      const target = (await client.query("SELECT * FROM v2_project_revisions WHERE project_id=$1 AND revision=$2", [id, targetRevision])).rows[0] ?? null;
      if (!target) {
        const err = new Error(`no such revision ${targetRevision} for project ${id}`);
        err.code = "not-found";
        throw err;
      }
      if (target.payload === null || target.payload === undefined) {
        const err = new Error(`revision ${targetRevision} has been pruned to audit-only and can no longer be restored`);
        err.code = "revision-pruned";
        throw err;
      }
      let targetDoc = null;
      try {
        targetDoc = typeof target.payload === "string" ? JSON.parse(target.payload) : target.payload;
      } catch {
        targetDoc = null;
      }
      if (!targetDoc) {
        const err = new Error(`stored revision ${targetRevision} is corrupt`);
        err.code = "invalid-document";
        throw err;
      }
      const now = new Date().toISOString();
      const next = {
        ...structuredClone(stored),
        scenes: structuredClone(targetDoc.scenes),
        updatedAt: now,
        revision: stored.revision + 1,
      };
      const verdict = await validateProjectDocument(next);
      if (!verdict.ok) {
        const err = new Error(verdict.errors[0]);
        err.code = "invalid-document";
        err.details = verdict.errors;
        throw err;
      }
      const res = await client.query(
        "UPDATE v2_projects SET title=$1, payload=$2, revision=$3, updated_at=$4 WHERE id=$5 AND revision=$6",
        [next.title, JSON.stringify(next), next.revision, now, id, stored.revision],
      );
      if (res.rowCount !== 1) {
        const fresh = (await client.query("SELECT revision FROM v2_projects WHERE id=$1", [id])).rows[0];
        return { status: "stale", expected: fresh?.revision ?? stored.revision + 1, actual: baseRevision };
      }
      await insertRevisionRow(client, { projectId: id, doc: next, kind: "restore", provenance: prov.provenance, restoredFrom: targetRevision });
      await pruneHistory(client, id, targetRevision);
      return { status: "restored", doc: structuredClone(next), restoredFrom: targetRevision };
    });
  } catch (err) {
    if (err && (err.code === "not-found" || err.code === "invalid-document" || err.code === "invalid-id" || err.code === "revision-pruned" || err.code === "store-misconfigured")) throw err;
    throw storageUnavailable(err);
  }
}
