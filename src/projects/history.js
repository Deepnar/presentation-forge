// V2 durable revision history — audit + recoverable snapshots (V2-6B).
//
// Three concepts, kept separate by construction:
//
//   A. Durable saved revision: a complete, validated project document
//      snapshot stored per durable revision number. Recovery reopens
//      these bytes directly — the compiler is never asked to regenerate
//      them, and exact-state undo images are never the durable record
//      (V2-5B-1: inverses alone do not restore every customization
//      flag, so only full snapshots are recoverable).
//   B. Audit record: a description of the operation that produced a
//      revision (kind, actor hint, envelope ids, summary). Audit rows
//      carry NO executable op payloads — envelope ids and summaries
//      only — so a stored audit entry can never be replayed as a
//      command and can never escalate privilege. Audit records are
//      data, not instructions.
//   C. Interactive undo/redo: session-scoped engine snapshots. NOT
//      persisted here; after reload or restore the stacks are empty
//      and the client says so. Durable history is not persistent undo.
//
// Retention: at most MAX_RECOVERABLE full snapshots per project; older
// rows are compacted to audit-only (payload NULL, metadata kept). At
// most MAX_AUDIT_ROWS audit rows per project; older audit-only rows
// are dropped. The current document is never pruned. Pruning runs
// inside the same transaction as the write that triggers it, and a
// restore transaction exempts its source revision.
export const MAX_RECOVERABLE_REVISIONS = 20;
export const MAX_AUDIT_ROWS = 100;

export const HISTORY_KINDS = ["create", "save", "rename", "restore", "baseline"];
export const SAVE_ORIGINS = ["manual", "autosave", "unknown"];

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function idStr(v) {
  return typeof v === "string" && v.length > 0 && v.length <= 200;
}

// Validate client-supplied provenance. Descriptive metadata only:
// actor/agent attribution is never authorization (the routes derive
// owner/admin from the session). Unknown-origin changes (paths that
// recorded no envelopes) arrive with no envelopeIds and are stored
// as-is — never fabricated.
export function validateProvenance(input) {
  const out = {
    actor: null,
    agentId: null,
    envelopeIds: [],
    summary: null,
    engineRevision: null,
    historyLength: null,
    saveOrigin: "unknown",
  };
  if (input === undefined || input === null) return { ok: true, provenance: out };
  if (!isRecord(input)) return { ok: false, errors: ["provenance: must be an object"] };
  const { actor, agentId, envelopeIds, summary, engineRevision, historyLength, saveOrigin } = input;
  if (actor !== undefined && actor !== null && actor !== "human" && actor !== "agent") {
    return { ok: false, errors: ['provenance.actor must be "human" or "agent"'] };
  }
  if (agentId !== undefined && agentId !== null && !idStr(agentId)) {
    return { ok: false, errors: ["provenance.agentId must be a non-empty string up to 200 chars"] };
  }
  if (envelopeIds !== undefined) {
    if (!Array.isArray(envelopeIds) || envelopeIds.length > 50) {
      return { ok: false, errors: ["provenance.envelopeIds must be an array of at most 50 ids"] };
    }
    for (const id of envelopeIds) {
      if (!idStr(id)) return { ok: false, errors: ["provenance.envelopeIds must be non-empty strings up to 200 chars"] };
    }
  }
  if (summary !== undefined && summary !== null) {
    if (typeof summary !== "string" || summary.length === 0 || summary.length > 500) {
      return { ok: false, errors: ["provenance.summary must be a non-empty string up to 500 chars"] };
    }
  }
  for (const [k, v] of [["engineRevision", engineRevision], ["historyLength", historyLength]]) {
    if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) {
      return { ok: false, errors: [`provenance.${k} must be a non-negative integer`] };
    }
  }
  if (saveOrigin !== undefined && !SAVE_ORIGINS.includes(saveOrigin)) {
    return { ok: false, errors: [`provenance.saveOrigin must be one of ${SAVE_ORIGINS.join(", ")}`] };
  }
  out.actor = actor ?? null;
  out.agentId = agentId ?? null;
  out.envelopeIds = envelopeIds !== undefined ? [...envelopeIds] : [];
  out.summary = summary ?? null;
  out.engineRevision = engineRevision ?? null;
  out.historyLength = historyLength ?? null;
  out.saveOrigin = saveOrigin ?? "unknown";
  return { ok: true, provenance: out };
}

// Default human-readable summary when the client sends none. Built
// from recorded facts only — never invented command history.
export function defaultSummary({ kind, revision, envelopeIds, sceneCount, saveOrigin, restoredFrom, title }) {
  const slides = `${sceneCount} slide${sceneCount === 1 ? "" : "s"}`;
  const env = envelopeIds?.length ? ` · ${envelopeIds.length} command envelope${envelopeIds.length === 1 ? "" : "s"}` : "";
  switch (kind) {
    case "create":
      return `created with ${slides}`;
    case "save":
      return `${saveOrigin === "autosave" ? "autosaved" : saveOrigin === "manual" ? "saved" : "saved"} rev ${revision} · ${slides}${env}`;
    case "rename":
      return `renamed to “${title}” (rev ${revision})`;
    case "restore":
      return `restored rev ${restoredFrom} as rev ${revision} · ${slides}`;
    case "baseline":
      return `baseline captured from stored rev ${revision} (pre-history project)`;
    default:
      return `rev ${revision} · ${slides}`;
  }
}

export function ensureHistorySchema(db) {
  db.exec(`
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
  `);
}

// Pure audit builder shared by every backend: the audit JSON for
// one history row. Ids and summaries only — never executable ops —
// so both stores record the same description for the same write.
export function buildAudit({ doc, kind, provenance, restoredFrom = null }) {
  const prov = provenance ?? { actor: null, agentId: null, envelopeIds: [], summary: null, engineRevision: null, historyLength: null, saveOrigin: "unknown" };
  return {
    kind,
    saveOrigin: kind === "save" ? (prov.saveOrigin ?? "unknown") : undefined,
    actor: prov.actor ?? null,
    agentId: prov.agentId ?? null,
    envelopeIds: [...(prov.envelopeIds ?? [])],
    engineRevision: prov.engineRevision ?? null,
    historyLength: prov.historyLength ?? null,
    restoredFrom,
    title: doc.title,
    sceneCount: doc.scenes.length,
    summary: prov.summary ?? defaultSummary({
      kind,
      revision: doc.revision,
      envelopeIds: prov.envelopeIds ?? [],
      sceneCount: doc.scenes.length,
      saveOrigin: prov.saveOrigin ?? "unknown",
      restoredFrom,
      title: doc.title,
    }),
  };
}

// Insert one history row for an already-validated document. Must be
// called inside the caller's write transaction so the project row
// and its history commit atomically — never one without the other.
export function insertRevisionRow(db, { projectId, doc, kind, provenance, restoredFrom = null }) {
  const audit = buildAudit({ doc, kind, provenance, restoredFrom });
  db.prepare(
    "INSERT INTO v2_project_revisions (project_id, revision, created_at, kind, audit, payload) VALUES (?,?,?,?,?,?)",
  ).run(projectId, doc.revision, doc.updatedAt, kind, JSON.stringify(audit), JSON.stringify(doc));
}

// Pure retention planner shared by every backend. Input: all known
// revisions newest-first as { revision, hasPayload }. Output: which
// to compact to audit-only (payload NULL) and which audit-only rows
// to drop. keepRevision (a restore source) is exempt.
export function computePrunePlan(allNewestFirst, keepRevision = null) {
  const keepSet = new Set();
  for (const { revision, hasPayload } of allNewestFirst) {
    if (keepSet.size >= MAX_RECOVERABLE_REVISIONS) break;
    if (hasPayload) keepSet.add(revision);
  }
  if (keepRevision !== null) keepSet.add(keepRevision);
  const nullPayload = [];
  const remove = [];
  let auditCount = 0;
  for (const { revision } of allNewestFirst) {
    if (keepSet.has(revision)) continue;
    auditCount += 1;
    if (auditCount > MAX_AUDIT_ROWS) remove.push(revision);
    else nullPayload.push(revision);
  }
  return { nullPayload, remove };
}

// Compact old rows inside the same transaction as the triggering
// write. Keeps the newest MAX_RECOVERABLE payloads; older rows keep
// their audit (payload NULL). Drops audit-only rows beyond
// MAX_AUDIT_ROWS. keepRevision (a restore source) is exempt.
export function pruneHistory(db, projectId, keepRevision = null) {
  const all = db.prepare(
    "SELECT revision, payload FROM v2_project_revisions WHERE project_id=? ORDER BY revision DESC",
  ).all(projectId).map((r) => ({ revision: r.revision, hasPayload: r.payload !== null && r.payload !== undefined }));
  const plan = computePrunePlan(all, keepRevision);
  for (const revision of plan.remove) {
    db.prepare("DELETE FROM v2_project_revisions WHERE project_id=? AND revision=?").run(projectId, revision);
  }
  for (const revision of plan.nullPayload) {
    db.prepare("UPDATE v2_project_revisions SET payload=NULL WHERE project_id=? AND revision=?").run(projectId, revision);
  }
}

// Baseline for a pre-history (V2-6A) project: capture the currently
// stored document as a recoverable revision when history is first
// needed. INSERT OR IGNORE makes concurrent first-touches safe.
// Never fabricates earlier revisions; never rewrites the project.
export function ensureBaselineRow(db, projectId, storedDoc) {
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
    summary: defaultSummary({ kind: "baseline", revision: storedDoc.revision, sceneCount: storedDoc.scenes.length }),
  };
  db.prepare(
    "INSERT OR IGNORE INTO v2_project_revisions (project_id, revision, created_at, kind, audit, payload) VALUES (?,?,?,?,?,?)",
  ).run(projectId, storedDoc.revision, storedDoc.updatedAt, "baseline", JSON.stringify(audit), JSON.stringify(storedDoc));
}

export function parseAuditRow(row) {
  let audit = null;
  try {
    audit = JSON.parse(row.audit);
  } catch {
    return null;
  }
  if (!isRecord(audit) || !HISTORY_KINDS.includes(audit.kind)) return null;
  return audit;
}

// Public revision metadata: audit facts plus recoverability, never
// scene bytes. Corrupt audit rows surface as { corrupt: true } so
// callers can report them without trusting their contents.
export function revisionMeta(row) {
  const audit = parseAuditRow(row);
  if (!audit) {
    return { projectId: row.project_id, revision: row.revision, createdAt: row.created_at, kind: "unknown", corrupt: true, recoverable: row.payload !== null && row.payload !== undefined };
  }
  return {
    projectId: row.project_id,
    revision: row.revision,
    createdAt: row.created_at,
    kind: audit.kind,
    saveOrigin: audit.saveOrigin ?? undefined,
    actor: audit.actor ?? null,
    agentId: audit.agentId ?? null,
    envelopeIds: Array.isArray(audit.envelopeIds) ? audit.envelopeIds : [],
    summary: typeof audit.summary === "string" ? audit.summary : "",
    sceneCount: audit.sceneCount ?? null,
    title: audit.title ?? null,
    restoredFrom: audit.restoredFrom ?? null,
    recoverable: row.payload !== null && row.payload !== undefined,
  };
}
