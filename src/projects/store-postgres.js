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
import { assetSchema } from "./asset-schema.js";
import { intentSchema } from "./intent-schema.js";
import { fileSchema, FILE_ROLES, FILE_LIMITS, layoutSchema, LAYOUT_LIMITS, documentSchema, DOCUMENT_KINDS, DOCUMENT_LIMITS } from "./file-schema.js";
import { seedSources, SEED_SOURCE_SQL, seedSourceBytes } from "./source-seed.js";
import { ASSET_LIMITS } from "./assets.js";
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
import { sourceSchema } from "./source-schema.js";
import { turnDiscoveryQuery } from './turn-discovery-query.js';

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
  if (err && (err.code === "runtime-fenced" || err.code === "store-misconfigured" || err.code === "invalid-id" || err.code === "invalid-document" || err.code === "not-found" || err.code === "revision-pruned" || err.code === "import-source-changed" || err.code === "import-target-deleted")) return err;
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
  await clientOrPool.query(PROJECT_DDL + sourceSchema("postgres") + assetSchema("postgres") + intentSchema("postgres") + fileSchema("postgres") + layoutSchema() + documentSchema());
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
    const onError = () => { /* initialization query reports the failure */ };
    client.on("error", onError);
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
    } finally { client.removeListener("error", onError); client.release(); }
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
  const onError = () => { /* mapped at the pending query */ };
  client.on("error", onError);
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
    client.removeListener("error", onError);
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

async function insertCreatedProject(client, doc, owner, provenance) {
  await client.query("INSERT INTO v2_projects (id, owner, title, payload, revision, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [doc.id, owner ?? null, doc.title, JSON.stringify(doc), doc.revision, doc.createdAt, doc.updatedAt]);
  await insertRevisionRow(client, { projectId: doc.id, doc, kind: "create", provenance });
}

export async function createProject({ owner = null, title, scenes, theme = null, origin = null, provenance = null, importRequest = null, assets = [], id = null, sources = null }) {
  const request = validateImportRequest(importRequest, owner);
  const prov = validateProvenance(provenance ?? undefined);
  if (!prov.ok) {
    const err = new Error(prov.errors[0]);
    err.code = "invalid-document";
    err.details = prov.errors;
    throw err;
  }
  const doc = buildProjectDocument({ id, title, scenes, theme, origin });
  const seed = seedSources(doc, sources);
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

      await insertCreatedProject(client, doc, owner, prov.provenance);
      await insertAssets(client, doc.id, assets);
      if (seed) {
        const pg = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
        await client.query(pg(SEED_SOURCE_SQL.catalog), [doc.id, 0, 1, seed.sources.length, seed.bytes, 1]);
        for (const source of seed.sources) await client.query(pg(SEED_SOURCE_SQL.source), [doc.id, source.id, JSON.stringify(source), seedSourceBytes(source)]);
      }
      return { doc: structuredClone(doc), ...(request ? { reused: false } : {}) };
    });
  } catch (err) {
    if (err && (err.code === "invalid-document" || err.code === "storage-unavailable" || err.code === "asset-quota")) throw err;
    throw storageUnavailable(err);
  }
}

// Content-addressed: a repeat of a stored image is a no-op, and the budget
// counts each distinct image once. The project row lock serializes
// concurrent uploads to one project against the same budget.
async function insertAssets(client, projectId, assets) {
  if (!assets?.length) return;
  await client.query("SELECT 1 FROM v2_projects WHERE id=$1 FOR UPDATE", [projectId]);
  let total = Number((await client.query("SELECT COALESCE(SUM(size),0) AS n FROM v2_project_assets WHERE project_id=$1", [projectId])).rows[0].n);
  const now = new Date().toISOString();
  for (const a of assets) {
    const has = await client.query("SELECT 1 FROM v2_project_assets WHERE project_id=$1 AND hash=$2", [projectId, a.hash]);
    if (has.rowCount) continue;
    total += a.size;
    if (total > ASSET_LIMITS.projectBytes) {
      throw Object.assign(new Error(`project images exceed ${ASSET_LIMITS.projectBytes / 1024 / 1024} MB`), { code: "asset-quota" });
    }
    await client.query("INSERT INTO v2_project_assets (project_id,hash,mime,width,height,size,bytes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [projectId, a.hash, a.mime, a.width, a.height, a.size, a.bytes, now]);
  }
}

export async function putProjectAsset({ owner = null, admin = false, id, asset }) {
  if (!validProjectId(id)) throw Object.assign(new Error(`invalid project id ${id}`), { code: "invalid-id" });
  try {
    await ensureSchemaPool(await pool());
    return await withTxn(async (client) => {
      const row = (await client.query("SELECT owner FROM v2_projects WHERE id=$1", [id])).rows[0];
      if (!row || !canAccessProject(row, { owner, admin })) return { stored: false };
      await insertAssets(client, id, [asset]);
      return { stored: true, asset: { hash: asset.hash, mime: asset.mime, width: asset.width, height: asset.height, size: asset.size } };
    });
  } catch (err) {
    if (err?.code === "asset-quota" || err?.code === "storage-unavailable") throw err;
    throw storageUnavailable(err);
  }
}

export async function getProjectAssets({ owner = null, admin = false, id, hashes }) {
  if (!validProjectId(id)) throw Object.assign(new Error(`invalid project id ${id}`), { code: "invalid-id" });
  const out = new Map();
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const row = (await p.query("SELECT owner FROM v2_projects WHERE id=$1", [id])).rows[0];
    if (!row || !canAccessProject(row, { owner, admin })) return out;
    const wanted = [...new Set(hashes)];
    if (!wanted.length) return out;
    const res = await p.query("SELECT hash,mime,width,height,size,bytes FROM v2_project_assets WHERE project_id=$1 AND hash = ANY($2::text[])", [id, wanted]);
    for (const a of res.rows) out.set(a.hash, { ...a, size: Number(a.size), width: Number(a.width), height: Number(a.height) });
  } catch (err) { throw storageUnavailable(err); }
  return out;
}

export async function getAccessibleAsset({ owner = null, admin = false, hash }) {
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const rows = (await p.query("SELECT p.owner AS owner, a.mime AS mime, a.bytes AS bytes FROM v2_project_assets a JOIN v2_projects p ON p.id=a.project_id WHERE a.hash=$1", [hash])).rows;
    const hit = rows.find(r => canAccessProject(r, { owner, admin }));
    return hit ? { mime: hit.mime, bytes: hit.bytes } : null;
  } catch (err) { throw storageUnavailable(err); }
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


// ——— Project files (F8): text and role, owner-checked like the project ———
const FILE_COLUMNS = "id,name,kind,role,size,chars,created_at";
const fileRow = (r) => ({ id: r.id, name: r.name, kind: r.kind, role: r.role, size: Number(r.size), chars: Number(r.chars), createdAt: r.created_at });

async function ownedRowPg(p, id, owner, admin) {
  if (!validProjectId(id)) throw Object.assign(new Error(`invalid project id ${id}`), { code: "invalid-id" });
  const row = (await p.query("SELECT owner FROM v2_projects WHERE id=$1", [id])).rows[0];
  return row && canAccessProject(row, { owner, admin });
}
async function filePool() { const p = await pool(); await ensureSchemaPool(p); return p; }
export async function putProjectFile({ owner = null, admin = false, id, file }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { stored: false };
    const n = Number((await p.query("SELECT COUNT(*) AS n FROM v2_project_files WHERE project_id=$1", [id])).rows[0].n);
    if (n >= FILE_LIMITS.perProject) throw Object.assign(new Error(`a project holds at most ${FILE_LIMITS.perProject} files`), { code: "file-quota" });
    await p.query("INSERT INTO v2_project_files (project_id,id,name,kind,role,size,chars,text,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, file.id, file.name, file.kind, file.role, file.size, file.text.length, file.text, new Date().toISOString()]);
    const r = (await p.query(`SELECT ${FILE_COLUMNS} FROM v2_project_files WHERE project_id=$1 AND id=$2`, [id, file.id])).rows[0];
    return { stored: true, file: fileRow(r) };
  } catch (err) { if (err?.code === "file-quota") throw err; throw storageUnavailable(err); }
}
export async function listProjectFiles({ owner = null, admin = false, id }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { files: null };
    return { files: (await p.query(`SELECT ${FILE_COLUMNS} FROM v2_project_files WHERE project_id=$1 ORDER BY created_at, id`, [id])).rows.map(fileRow) };
  } catch (err) { throw storageUnavailable(err); }
}
export async function readProjectFile({ owner = null, admin = false, id, fileId, offset = 0, limit = 20000 }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { file: null };
    const r = (await p.query(`SELECT ${FILE_COLUMNS},text FROM v2_project_files WHERE project_id=$1 AND id=$2`, [id, fileId])).rows[0];
    if (!r) return { file: null };
    return { file: { ...fileRow(r), text: r.text.slice(offset, offset + limit), offset, nextOffset: offset + limit < r.text.length ? offset + limit : null } };
  } catch (err) { throw storageUnavailable(err); }
}
export async function listProjectLayouts({ owner = null, admin = false, id }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { layouts: null };
    return { layouts: (await p.query("SELECT id,name,scene,created_at FROM v2_project_layouts WHERE project_id=$1 ORDER BY created_at, id", [id])).rows.map((r) => ({ id: r.id, name: r.name, scene: JSON.parse(r.scene), createdAt: r.created_at })) };
  } catch (err) { throw storageUnavailable(err); }
}
export async function putProjectLayout({ owner = null, admin = false, id, layout }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { stored: false };
    if (Number((await p.query("SELECT COUNT(*) AS n FROM v2_project_layouts WHERE project_id=$1", [id])).rows[0].n) >= LAYOUT_LIMITS.perProject) throw Object.assign(new Error(`a project holds at most ${LAYOUT_LIMITS.perProject} saved layouts`), { code: "layout-quota" });
    await p.query("INSERT INTO v2_project_layouts (project_id,id,name,scene,created_at) VALUES ($1,$2,$3,$4,$5)", [id, layout.id, layout.name, JSON.stringify(layout.scene), new Date().toISOString()]);
    return { stored: true };
  } catch (err) { if (err?.code === "layout-quota") throw err; throw storageUnavailable(err); }
}
export async function deleteProjectLayout({ owner = null, admin = false, id, layoutId }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { removed: false };
    return { removed: (await p.query("DELETE FROM v2_project_layouts WHERE project_id=$1 AND id=$2", [id, layoutId])).rowCount === 1 };
  } catch (err) { throw storageUnavailable(err); }
}
// A project's written documents — newest first, owner-checked like it.
const docRow = (r, withBody) => ({ id: r.id, kind: r.kind, title: r.title, basisRevision: Number(r.basis_revision), createdAt: r.created_at, ...(withBody ? { body: JSON.parse(r.body) } : {}) });
export async function listProjectDocuments({ owner = null, admin = false, id }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { documents: null };
    return { documents: (await p.query("SELECT id,kind,title,basis_revision,created_at FROM v2_project_documents WHERE project_id=$1 ORDER BY created_at DESC, id DESC", [id])).rows.map((r) => docRow(r, false)) };
  } catch (err) { throw storageUnavailable(err); }
}
export async function getProjectDocument({ owner = null, admin = false, id, documentId }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { document: null };
    const r = (await p.query("SELECT * FROM v2_project_documents WHERE project_id=$1 AND id=$2", [id, documentId])).rows[0];
    return { document: r ? docRow(r, true) : null };
  } catch (err) { throw storageUnavailable(err); }
}
export async function putProjectDocument({ owner = null, admin = false, id, document }) {
  if (!DOCUMENT_KINDS.includes(document?.kind)) throw Object.assign(new Error("unknown document kind"), { code: "invalid-document" });
  const body = JSON.stringify(document.body);
  if (body.length > DOCUMENT_LIMITS.bodyChars) throw Object.assign(new Error("the document is too large to keep"), { code: "invalid-document" });
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { stored: false };
    const n = Number((await p.query("SELECT COUNT(*) AS n FROM v2_project_documents WHERE project_id=$1", [id])).rows[0].n);
    if (n >= DOCUMENT_LIMITS.perProject) await p.query("DELETE FROM v2_project_documents WHERE project_id=$1 AND id IN (SELECT id FROM v2_project_documents WHERE project_id=$1 ORDER BY created_at, id LIMIT $2)", [id, n - DOCUMENT_LIMITS.perProject + 1]);
    await p.query("INSERT INTO v2_project_documents (project_id,id,kind,title,body,basis_revision,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, document.id, document.kind, String(document.title).slice(0, DOCUMENT_LIMITS.titleChars), body, document.basisRevision, new Date().toISOString()]);
    return { stored: true };
  } catch (err) { throw storageUnavailable(err); }
}
export async function deleteProjectDocument({ owner = null, admin = false, id, documentId }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { removed: false };
    return { removed: (await p.query("DELETE FROM v2_project_documents WHERE project_id=$1 AND id=$2", [id, documentId])).rowCount === 1 };
  } catch (err) { throw storageUnavailable(err); }
}
export async function setProjectFileRole({ owner = null, admin = false, id, fileId, role }) {
  if (!FILE_ROLES.includes(role)) throw Object.assign(new Error("unknown file role"), { code: "invalid-document" });
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { file: null };
    await p.query("UPDATE v2_project_files SET role=$1 WHERE project_id=$2 AND id=$3", [role, id, fileId]);
    const r = (await p.query(`SELECT ${FILE_COLUMNS} FROM v2_project_files WHERE project_id=$1 AND id=$2`, [id, fileId])).rows[0];
    return { file: r ? fileRow(r) : null };
  } catch (err) { throw storageUnavailable(err); }
}
export async function deleteProjectFile({ owner = null, admin = false, id, fileId }) {
  try {
    const p = await filePool();
    if (!(await ownedRowPg(p, id, owner, admin))) return { removed: false };
    return { removed: (await p.query("DELETE FROM v2_project_files WHERE project_id=$1 AND id=$2", [id, fileId])).rowCount === 1 };
  } catch (err) { throw storageUnavailable(err); }
}

// The DeckIntent a project compiles from — owner-checked like the project.
export async function getProjectIntent({ owner = null, admin = false, id }) {
  if (!validProjectId(id)) throw Object.assign(new Error(`invalid project id ${id}`), { code: "invalid-id" });
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const row = (await p.query("SELECT p.owner AS owner, i.intent AS intent FROM v2_projects p LEFT JOIN v2_project_intents i ON i.project_id=p.id WHERE p.id=$1", [id])).rows[0];
    if (!row || !canAccessProject(row, { owner, admin }) || !row.intent) return { intent: null };
    return { intent: JSON.parse(row.intent) };
  } catch (err) { throw storageUnavailable(err); }
}

export async function putProjectIntent({ owner = null, admin = false, id, intent }) {
  if (!validProjectId(id)) throw Object.assign(new Error(`invalid project id ${id}`), { code: "invalid-id" });
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const row = (await p.query("SELECT owner FROM v2_projects WHERE id=$1", [id])).rows[0];
    if (!row || !canAccessProject(row, { owner, admin })) return { stored: false };
    await p.query("INSERT INTO v2_project_intents (project_id,intent,updated_at) VALUES ($1,$2,$3) ON CONFLICT (project_id) DO UPDATE SET intent=EXCLUDED.intent, updated_at=EXCLUDED.updated_at",
      [id, JSON.stringify(intent), new Date().toISOString()]);
    return { stored: true };
  } catch (err) { throw storageUnavailable(err); }
}

// Point an import request at the deck version its project now holds, after
// a re-import updated the project in place. Only the request's own project.
export async function relinkImport({ owner = null, importRequest, projectId }) {
  const request = validateImportRequest(importRequest, owner);
  if (!request) throw Object.assign(new Error("import identity required"), { code: "invalid-document" });
  try {
    const p = await pool();
    await ensureSchemaPool(p);
    const result = await p.query("UPDATE v2_project_imports SET source_digest=$1 WHERE request_key=$2 AND project_id=$3", [request.digest, request.key, projectId]);
    return { relinked: result.rowCount === 1 };
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

const runtimeEnsured = new WeakMap();
async function ensureRuntimeSchema(p) {
  if (!runtimeEnsured.has(p)) {
    const ready = (async () => {
      const { RUN_DDL } = await import("../agent/schema.js");
      await ensureSchemaPool(p);
      await withTxn(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(21441, 8)");
        await client.query(RUN_DDL);
      });
    })();
    runtimeEnsured.set(p, ready);
    ready.catch(() => runtimeEnsured.delete(p));
  }
  return runtimeEnsured.get(p);
}

export async function readTurnMetadataPage(input) {
  const { sql, params } = turnDiscoveryQuery(input, 'postgres');
  try {
    const p = await pool();
    await ensureRuntimeSchema(p);
    return (await p.query(sql, params)).rows;
  } catch (error) { throw storageUnavailable(error); }
}

async function withLockedProjectTransaction({ owner = null, id }, job) {
  if (!validProjectId(id))
    throw Object.assign(new Error("Invalid project"), { code: "invalid-id" });
  const { runtimeDocument } = await import("./runtime-document.js");
  try {
    await ensureRuntimeSchema(await pool());
    return await withTxn(async (client) => {
      const row = (
        await client.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [
          id,
        ])
      ).rows[0];
      let doc = readAccessibleProjectRow(row, id, owner, false);
      if (!(await validateProjectDocument(doc)).ok)
        throw Object.assign(new Error("Invalid project"), {
          code: "invalid-document",
        });
      let guard = null;
      const result = await job({
        beforeCommit(check) {
          guard = check;
        },
        doc: structuredClone(doc),
        async query(sql, params = []) {
          let i = 0;
          return (
            await client.query(
              sql.replace(/\?/g, () => `$${++i}`),
              params,
            )
          ).rows;
        },
        async now() {
          return Number(
            (
              await client.query(
                "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) AS ms",
              )
            ).rows[0].ms,
          );
        },
        async insertCopy(destination) {
          if (destination.id === id || destination.revision !== 0 || !(await validateProjectDocument(destination)).ok)
            throw Object.assign(new Error("Invalid copy"), { code: "invalid-document" });
          await insertCreatedProject(client, destination, owner, null);
        },
        async saveScenes(scenes, provenance) {
          const next = await runtimeDocument(doc, scenes, provenance);
          if (!next.changed) return doc.revision;
          await ensureBaselineRow(client, id, doc);
          const r = await client.query(
            "UPDATE v2_projects SET payload=$1, revision=$2, updated_at=$3 WHERE id=$4 AND revision=$5",
            [
              JSON.stringify(next.doc),
              next.doc.revision,
              next.doc.updatedAt,
              id,
              doc.revision,
            ],
          );
          if (r.rowCount !== 1)
            throw Object.assign(new Error("Runtime project changed"), {
              code: "invalid-document",
            });
          await insertRevisionRow(client, {
            projectId: id,
            doc: next.doc,
            kind: "save",
            provenance: next.provenance,
          });
          await pruneHistory(client, id);
          doc = next.doc;
          return doc.revision;
        },
      });
      if (guard) await guard();
      return result;
    });
  } catch (error) {
    throw storageUnavailable(error);
  }
}

export function withRuntimeTransaction(binding, job) {
  return withLockedProjectTransaction(binding, tx => job({ doc: tx.doc, query: tx.query,
    now: tx.now, saveScenes: tx.saveScenes, beforeCommit: tx.beforeCommit }));
}

export async function withCopyTransaction(binding, job) {
  let original, failed = false, completed = false;
  try {
    return await withLockedProjectTransaction(binding, async tx => {
      try {
        const result = await job(Object.freeze({ dialect: 'postgres', doc: tx.doc, query: tx.query, insertCopy: tx.insertCopy }));
        completed = true;
        return result;
      } catch (error) {
        original = error; failed = true;
        throw Object.assign(new Error('Copy transaction refused.'), { code: 'runtime-fenced' });
      }
    });
  } catch (error) {
    if (failed && error?.code === 'runtime-fenced') throw original;
    if (completed) throw Object.assign(new Error('Copy commit outcome is unknown.'), { code: 'copy-outcome-unknown' });
    throw error;
  }
}

async function withProjectDomainTransaction(binding, job, fullDocument, citationWrite = false) {
  let original, failed = false;
  try {
    return await withRuntimeTransaction(binding, async tx => {
      try {
        return await job(Object.freeze({ dialect: 'postgres',
          doc: fullDocument ? tx.doc : { id: tx.doc.id, revision: tx.doc.revision }, query: tx.query,
          ...(citationWrite ? { saveScenes: tx.saveScenes } : {}) }));
      } catch (error) {
        original = error; failed = true;
        // Throw through the canonical boundary so every mutation rolls back.
        throw Object.assign(new Error('Source transaction refused.'), { code: 'runtime-fenced' });
      }
    });
  } catch (error) {
    if (failed && error?.code === 'runtime-fenced') throw original;
    throw error;
  }
}

export function withSourceTransaction(binding, job) {
  return withProjectDomainTransaction(binding, job, false);
}

// Citation checks share the parent lock but receive no scene-write capability.
export function withCitationReadTransaction(binding, job) {
  return withProjectDomainTransaction(binding, job, true);
}

// Qualified citation writes reuse private refusal rollback without widening H.
export function withCitationTransaction(binding, job) {
  return withProjectDomainTransaction(binding, job, true, true);
}

// The trusted compile the Assistant's add_slide uses (see slide-compile.js).
export { compileSlide } from "./slide-compile.js";
