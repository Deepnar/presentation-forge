// V2-6B durable revision history: bounded recoverable snapshots,
// audit provenance, safe restore, migration, access control, and
// export-after-restore. Fails on af812ad: listRevisions/getRevision/
// restoreRevision do not exist there (no history table, no endpoints).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { validateProjectDocument } from "../packages/projects/document.js";
import { validateScene } from "../packages/model/scene.ts";
import { createDocument } from "../packages/model/engine.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { MAX_RECOVERABLE_REVISIONS, MAX_AUDIT_ROWS } from "../src/projects/history.js";

const ALICE = "alice@example.test";
const BOB = "bob@example.test";

let scratch = null;
let storeDb = null;
let httpDb = null;

async function scenes() {
  const design = await warmDesign();
  return compileDeck(sampleDeckIntent(), design);
}

async function useDb(file) {
  const { setDbPathForTest } = await import("../src/db.js");
  setDbPathForTest(file);
}

let _dbMod = null;

function historyRows(projectId) {
  const db = _dbMod.getDb();
  return db.prepare("SELECT * FROM v2_project_revisions WHERE project_id=? ORDER BY revision ASC").all(projectId);
}

// One-word text mutation so successive saves differ.
function bumped(scenes, word) {
  const next = structuredClone(scenes);
  const slide = next.find((s) => s.elements.some((e) => e.kind === "text"));
  const el = slide.elements.find((e) => e.kind === "text");
  el.paragraphs[0].runs[0].text = word;
  return next;
}

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "forge-6b-"));
  storeDb = path.join(scratch, "store.db");
  httpDb = path.join(scratch, "http.db");
  process.env.FORGE_DB_PATH = storeDb;
  _dbMod = await import("../src/db.js");
});

after(async () => {
  try {
    const { closeDb } = await import("../src/db.js");
    closeDb();
  } catch { /* teardown only */ }
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

describe("v2-6b history creation and per-save records", () => {
  it("create commits a recoverable rev-0 baseline atomically", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "H0", scenes: structuredClone(s) });
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.currentRevision, 0);
    assert.equal(listed.revisions.length, 1);
    assert.equal(listed.revisions[0].kind, "create");
    assert.equal(listed.revisions[0].revision, 0);
    assert.equal(listed.revisions[0].recoverable, true);
    assert.deepEqual(listed.retention, { maxRecoverable: MAX_RECOVERABLE_REVISIONS, maxAudit: MAX_AUDIT_ROWS });
    const got = await store.getRevision({ owner: null, id: created.id, revision: 0 });
    assert.equal(got.pruned, false);
    assert.deepEqual(got.doc, created);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("every successful save produces a required, validated history row", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "H1", scenes: structuredClone(s) });
    const out = await store.saveProject({
      owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "second"),
      provenance: { actor: "human", saveOrigin: "manual", envelopeIds: ["e-1"], engineRevision: 1, historyLength: 1 },
    });
    assert.equal(out.status, "saved");
    assert.equal(out.doc.revision, 1);
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 2);
    const save = listed.revisions.find((r) => r.revision === 1);
    assert.equal(save.kind, "save");
    assert.equal(save.saveOrigin, "manual");
    assert.equal(save.actor, "human");
    assert.deepEqual(save.envelopeIds, ["e-1"]);
    assert.equal(save.recoverable, true);
    assert.ok(save.summary.length > 0);
    const got = await store.getRevision({ owner: null, id: created.id, revision: 1 });
    assert.deepEqual(got.doc.scenes, out.doc.scenes);
    assert.equal((await validateProjectDocument(got.doc)).ok, true);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("no-op saves and no-op renames write no history", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "H2", scenes: structuredClone(s) });
    const noop = await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s) });
    assert.equal(noop.status, "noop");
    const rnoop = await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "H2" });
    assert.equal(rnoop.status, "noop");
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 1, "only the create row exists");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("renames record audit rows without touching scenes", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "H3", scenes: structuredClone(s) });
    const out = await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "H3 renamed" });
    assert.equal(out.status, "saved");
    assert.deepEqual(out.doc.scenes, s);
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 2);
    const rename = listed.revisions.find((r) => r.revision === 1);
    assert.equal(rename.kind, "rename");
    assert.equal(rename.title, "H3 renamed");
    assert.equal(rename.recoverable, true);
    const got = await store.getRevision({ owner: null, id: created.id, revision: 1 });
    assert.deepEqual(got.doc.scenes, s);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("failed saves leave history and the document untouched", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "H4", scenes: structuredClone(s) });
    const before = historyRows(created.id).length;
    const bad = structuredClone(s);
    bad[0].elements[0].w = -5;
    await assert.rejects(() => store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bad }));
    await assert.rejects(() => store.saveProject({
      owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s),
      provenance: { actor: "robot" },
    }), /provenance.actor/);
    assert.equal(historyRows(created.id).length, before, "no history row without a committed revision");
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 0);
    assert.deepEqual(kept.scenes, s);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b command provenance", () => {
  it("coalesced commands ride one save as envelope ids, never op payloads", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "P1", scenes: structuredClone(s) });
    const doc = await createDocument(structuredClone(s));
    const snap = doc.snapshot();
    const t0 = snap.scenes[0].elements.find((e) => e.kind === "text");
    const ids = ["p-a", "p-b", "p-c"];
    let rev = snap.revision;
    for (let i = 0; i < ids.length; i++) {
      const cur = doc.snapshot().scenes[0].elements.find((e) => e.id === t0.id);
      const next = structuredClone(cur.paragraphs);
      next[0].runs[0].text = `coalesced ${i}`;
      const r = await doc.apply({ id: ids[i], slideId: snap.scenes[0].id, op: { type: "element.updateText", id: t0.id, paragraphs: next }, baseRevision: rev, actor: "human" });
      assert.equal(r.ok, true);
      rev = r.revision;
    }
    const envIds = doc.log().filter((e) => e.resultingRevision > 0).map((e) => e.envelopeId);
    assert.deepEqual(envIds, ids);
    const out = await store.saveProject({
      owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(doc.snapshot().scenes),
      provenance: { actor: "human", saveOrigin: "autosave", envelopeIds: envIds, engineRevision: rev, historyLength: doc.status().historyLength },
    });
    assert.equal(out.status, "saved");
    const listed = await store.listRevisions({ owner: null, id: created.id });
    const save = listed.revisions.find((r) => r.revision === 1);
    assert.deepEqual(save.envelopeIds, ids);
    assert.equal(save.saveOrigin, "autosave");
    // The audit row carries ids and summaries only — nothing executable.
    const raw = historyRows(created.id).find((r) => r.revision === 1);
    const audit = JSON.parse(raw.audit);
    for (const k of ["forward", "inverse", "ops", "op", "slideId", "paragraphs", "priorChart", "priorRows"]) {
      assert.ok(!(k in audit), `audit must not carry executable key ${k}`);
    }
    assert.equal(typeof raw.payload, "string", "recoverable payload is the full snapshot");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("undo then save and redo then save each advance with honest provenance", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "P2", scenes: structuredClone(s) });
    const doc = await createDocument(structuredClone(s));
    const snap = doc.snapshot();
    const t0 = snap.scenes[0].elements.find((e) => e.kind === "text");
    const first = structuredClone(t0.paragraphs);
    first[0].runs[0].text = "first wording";
    const r1 = await doc.apply({ id: "p-undo-1", slideId: snap.scenes[0].id, op: { type: "element.updateText", id: t0.id, paragraphs: first }, baseRevision: 0, actor: "human" });
    assert.equal(r1.ok, true);
    await doc.undo();
    const undoneScenes = structuredClone(doc.snapshot().scenes);
    const s1 = await store.saveProject({
      owner: null, id: created.id, baseRevision: 0, scenes: undoneScenes,
      provenance: { actor: "human", saveOrigin: "manual", envelopeIds: [], engineRevision: doc.snapshot().revision, historyLength: doc.status().historyLength },
    });
    // Undo restored the exact saved state, so there is nothing new
    // to record — a no-op, not a fabricated revision.
    assert.equal(s1.status, "noop");
    assert.equal(s1.doc.revision, 0);
    await doc.redo();
    const redoneScenes = structuredClone(doc.snapshot().scenes);
    const s2 = await store.saveProject({
      owner: null, id: created.id, baseRevision: 0, scenes: redoneScenes,
      provenance: { actor: "human", saveOrigin: "manual", envelopeIds: ["p-undo-1"], engineRevision: doc.snapshot().revision, historyLength: doc.status().historyLength },
    });
    assert.equal(s2.status, "saved");
    const kept1 = (await store.getRevision({ owner: null, id: created.id, revision: 0 })).doc;
    assert.deepEqual(kept1.scenes, created.scenes);
    const kept2 = (await store.getRevision({ owner: null, id: created.id, revision: 1 })).doc;
    assert.ok(kept2.scenes[0].elements.find((e) => e.id === t0.id).paragraphs[0].runs[0].text === "first wording");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("unknown-origin saves store an honest empty envelope list", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "P3", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "no-provenance") });
    const listed = await store.listRevisions({ owner: null, id: created.id });
    const save = listed.revisions.find((r) => r.revision === 1);
    assert.deepEqual(save.envelopeIds, []);
    assert.equal(save.actor, null);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b retrieval and full round-trip", () => {
  it("prior revisions read back byte-identical with scene identity intact", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "R1", scenes: structuredClone(s), origin: { kind: "mixed" } });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "v1") });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 1, scenes: bumped(s, "v2") });
    const rev0 = (await store.getRevision({ owner: null, id: created.id, revision: 0 })).doc;
    assert.deepEqual(rev0, created);
    assert.deepEqual(rev0.scenes.map((x) => x.id), s.map((x) => x.id));
    const rev1 = (await store.getRevision({ owner: null, id: created.id, revision: 1 })).doc;
    assert.equal(rev1.scenes.find((x) => x.elements.some((e) => e.kind === "text")).elements.find((e) => e.kind === "text").paragraphs[0].runs[0].text, "v1");
    for (const scene of rev1.scenes) assert.equal((await validateScene(scene)).ok, true);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("unknown revisions 404 without leaking, malformed revisions 422", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: null, title: "R2", scenes: await scenes() });
    await assert.rejects(store.getRevision({ owner: null, id: created.id, revision: 99 }), /no such revision/);
    for (const bad of [-1, 1.5, "0", NaN]) {
      await assert.rejects(store.getRevision({ owner: null, id: created.id, revision: bad }), /non-negative integer/);
    }
    await assert.rejects(store.getRevision({ owner: null, id: "../evil", revision: 0 }), /invalid project id/);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("corrupt payloads refuse loudly while the current document stands", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "R3", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "good") });
    const db = _dbMod.getDb();
    db.prepare("UPDATE v2_project_revisions SET payload=? WHERE project_id=? AND revision=?").run("{not json", created.id, 1);
    await assert.rejects(store.getRevision({ owner: null, id: created.id, revision: 1 }), /corrupt|invalid/);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 1, "current document untouched by a corrupt history row");
    assert.deepEqual(kept.scenes, bumped(s, "good"));
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b safe restore", () => {
  it("restore advances the counter and preserves every row", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "S1", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "v1") });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 1, scenes: bumped(s, "v2") });
    const out = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 2, provenance: { actor: "human" } });
    assert.equal(out.status, "restored");
    assert.equal(out.restoredFrom, 0);
    assert.equal(out.doc.revision, 3, "restore creates rev 3 — the counter never rewinds");
    assert.deepEqual(out.doc.scenes, created.scenes, "historical scene state, byte-identical");
    assert.equal(out.doc.title, "S1", "current identity stands");
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 4);
    assert.equal(listed.revisions.find((r) => r.revision === 3).kind, "restore");
    assert.equal(listed.revisions.find((r) => r.revision === 3).restoredFrom, 0);
    const kept0 = (await store.getRevision({ owner: null, id: created.id, revision: 0 })).doc;
    assert.deepEqual(kept0.scenes, created.scenes, "the source row survives the restore");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("stale restores refuse with 409 shape and change nothing", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "S2", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "v1") });
    const rowsBefore = historyRows(created.id).length;
    const stale = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 0 });
    assert.equal(stale.status, "stale");
    assert.equal(stale.expected, 1);
    assert.equal(stale.actual, 0);
    assert.equal(historyRows(created.id).length, rowsBefore);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 1);
    await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: 99, baseRevision: 1 }), /no such revision/);
    await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: -1, baseRevision: 1 }), /non-negative integer/);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("concurrent restore versus save yields one winner and one stale", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "S3", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "v1") });
    const [a, b] = await Promise.all([
      store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 1 }),
      store.saveProject({ owner: null, id: created.id, baseRevision: 1, scenes: bumped(s, "racer") }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.equal(statuses.filter((x) => x === "stale").length, 1, `exactly one loser, got ${statuses}`);
    assert.ok(statuses.includes("restored") || statuses.includes("saved"), `exactly one winner, got ${statuses}`);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 2);
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 3, "exactly one new history row for one winner");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("restored documents reopen, edit, and save normally", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "S4", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "v1") });
    const out = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 1 });
    const doc = await createDocument(structuredClone(out.doc.scenes));
    assert.equal(doc.snapshot().revision, 0, "fresh engine session after restore");
    assert.equal(doc.status().canUndo, false, "durable history is not persistent undo");
    const snap = doc.snapshot();
    const t0 = snap.scenes[0].elements.find((e) => e.kind === "text");
    const draft = structuredClone(t0.paragraphs);
    draft[0].runs[0].text = "post-restore edit";
    const r = await doc.apply({ id: "s4-post", slideId: snap.scenes[0].id, op: { type: "element.updateText", id: t0.id, paragraphs: draft }, baseRevision: 0, actor: "human" });
    assert.equal(r.ok, true);
    const s3 = await store.saveProject({ owner: null, id: created.id, baseRevision: 2, scenes: structuredClone(doc.snapshot().scenes) });
    assert.equal(s3.status, "saved");
    assert.equal(s3.doc.revision, 3, "autosave resumes from the post-restore revision");
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b retention and compaction", () => {
  it("history stays bounded: 20 recoverable, audit-only beyond, current never pruned", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "C1", scenes: structuredClone(s) });
    for (let i = 1; i <= 25; i++) {
      const out = await store.saveProject({ owner: null, id: created.id, baseRevision: i - 1, scenes: bumped(s, `rev${i}`) });
      assert.equal(out.status, "saved");
    }
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.currentRevision, 25);
    assert.equal(listed.revisions.length, 26, "audit rows are kept (bounded separately)");
    const recoverable = listed.revisions.filter((r) => r.recoverable).map((r) => r.revision).sort((a, b) => a - b);
    assert.equal(recoverable.length, MAX_RECOVERABLE_REVISIONS);
    assert.deepEqual(recoverable, Array.from({ length: MAX_RECOVERABLE_REVISIONS }, (_, k) => 25 - k).sort((a, b) => a - b));
    const oldest = listed.revisions.find((r) => r.revision === 0);
    assert.equal(oldest.recoverable, false, "oldest compacted to audit-only");
    assert.ok(oldest.summary.length > 0, "audit summary survives compaction");
    const cur = await store.getRevision({ owner: null, id: created.id, revision: 25 });
    assert.equal(cur.pruned, false);
    await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 25 }), /pruned/);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 25, "restore of a pruned revision changes nothing");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("payload sizes stay small enough that snapshots need no compression", async () => {
    const s = await scenes();
    const one = JSON.stringify({ scenes: s }).length;
    assert.ok(one < 100 * 1024, `one full snapshot is ${one} chars — far below the 6MB cap`);
    assert.ok(one * MAX_RECOVERABLE_REVISIONS < 6 * 1024 * 1024, "20 snapshots fit the per-document budget");
  });
});

describe("v2-6b migration of pre-history projects", () => {
  it("a V2-6A row opens normally and gains a baseline on first history touch", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "M1", scenes: structuredClone(s) });
    // Simulate a pre-history row: strip every revision record.
    _dbMod.getDb().prepare("DELETE FROM v2_project_revisions WHERE project_id=?").run(created.id);
    const opened = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.deepEqual(opened, created, "legacy project opens byte-identical");
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 1, "no fabricated earlier revisions");
    assert.equal(listed.revisions[0].kind, "baseline");
    assert.equal(listed.revisions[0].revision, created.revision);
    assert.equal(listed.revisions[0].recoverable, true);
    const base = (await store.getRevision({ owner: null, id: created.id, revision: created.revision })).doc;
    assert.deepEqual(base.scenes, s, "baseline recovers the stored document");
    const still = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.deepEqual(still, created, "initializing history never rewrites the project");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("unknown future schema versions still refuse instead of migrating", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "M2", scenes: structuredClone(s) });
    const db = _dbMod.getDb();
    const row = db.prepare("SELECT payload FROM v2_projects WHERE id=?").get(created.id);
    const doc = JSON.parse(row.payload);
    doc.schemaVersion = 99;
    db.prepare("UPDATE v2_projects SET payload=? WHERE id=?").run(JSON.stringify(doc), created.id);
    _dbMod.getDb().prepare("DELETE FROM v2_project_revisions WHERE project_id=?").run(created.id);
    await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s) }), /schemaVersion/);
    await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 0 }), /schemaVersion/);
    db.prepare("UPDATE v2_projects SET payload=? WHERE id=?").run(row.payload, created.id);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b history survives process restart", () => {
  it("close/reopen keeps revisions, audits, and the current document", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "D1", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "durable") });
    const { closeDb } = await import("../src/db.js");
    closeDb();
    const listed = await store.listRevisions({ owner: null, id: created.id });
    assert.equal(listed.revisions.length, 2);
    const rev0 = (await store.getRevision({ owner: null, id: created.id, revision: 0 })).doc;
    assert.deepEqual(rev0.scenes, s);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 1);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b owner isolation for history", () => {
  it("cross-owner history reads refuse without leaking existence", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const a = (await store.createProject({ owner: ALICE, title: "Alice", scenes: structuredClone(s) })).doc;
    await assert.rejects(store.listRevisions({ owner: BOB, id: a.id }), /no such project/);
    await assert.rejects(store.getRevision({ owner: BOB, id: a.id, revision: 0 }), /no such project/);
    await assert.rejects(store.restoreRevision({ owner: BOB, id: a.id, targetRevision: 0, baseRevision: 0 }), /no such project/);
    assert.equal(historyRows(a.id).length, 1, "denied restore changed nothing");
    const adminList = await store.listRevisions({ owner: "someone@else.test", admin: true, id: a.id });
    assert.equal(adminList.revisions.length, 1, "admin keeps the established full-access policy");
    await store.deleteProject({ owner: ALICE, id: a.id });
  });

  it("ownerless rows serve history to local anonymous callers only", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const l = (await store.createProject({ owner: null, title: "Local", scenes: structuredClone(s) })).doc;
    await assert.rejects(store.listRevisions({ owner: ALICE, id: l.id }), /no such project/);
    const listed = await store.listRevisions({ owner: null, id: l.id });
    assert.equal(listed.revisions.length, 1);
    const out = await store.restoreRevision({ owner: null, id: l.id, targetRevision: 0, baseRevision: 0 });
    assert.equal(out.status, "restored");
    assert.equal(out.doc.revision, 1);
    await store.deleteProject({ owner: null, id: l.id });
  });

  it("delete removes revision rows with the project", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: null, title: "Gone", scenes: await scenes() });
    assert.equal(historyRows(created.id).length, 1);
    assert.equal((await store.deleteProject({ owner: null, id: created.id })).removed, true);
    assert.equal(historyRows(created.id).length, 0);
  });
});

describe("v2-6b internal command boundary", () => {
  it("restore-shaped envelopes face the same validators as forward edits", async () => {
    const s = await scenes();
    const doc = await createDocument(structuredClone(s));
    const snap = doc.snapshot();
    const chartSlide = snap.scenes.find((x) => x.elements.some((e) => e.kind === "chart"));
    if (chartSlide) {
      const chart = chartSlide.elements.find((e) => e.kind === "chart");
      const good = await doc.apply({
        id: "b-restore-good", slideId: chartSlide.id,
        op: { type: "element.setChartData", id: chart.id, priorChart: structuredClone(chart.chart) },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
      assert.equal(good.ok, true, "well-formed restore shape applies under identical rules");
      const bad = await doc.apply({
        id: "b-restore-bad", slideId: chartSlide.id,
        op: { type: "element.setChartData", id: chart.id, priorChart: { chartKind: "bar", categories: ["a", "b"], series: [{ name: "s", values: [1] }] } },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
      assert.equal(bad.ok, false, "length-mismatched restore shape refuses like any payload");
    }
    const tableSlide = doc.snapshot().scenes.find((x) => x.elements.some((e) => e.kind === "table"));
    if (tableSlide) {
      const table = tableSlide.elements.find((e) => e.kind === "table");
      const bad = await doc.apply({
        id: "b-table-bad", slideId: tableSlide.id,
        op: { type: "element.setTableData", id: table.id, priorRows: [["a"], ["b", "c"]] },
        baseRevision: doc.snapshot().revision, actor: "human",
      });
      assert.equal(bad.ok, false, "ragged restore matrix refuses");
    }
    const textSlide = doc.snapshot().scenes.find((x) => x.elements.some((e) => e.kind === "text"));
    const text = textSlide.elements.find((e) => e.kind === "text");
    const badText = await doc.apply({
      id: "b-text-bad", slideId: textSlide.id,
      op: { type: "element.setTextStyle", id: text.id, paragraphs: "not-an-array" },
      baseRevision: doc.snapshot().revision, actor: "human",
    });
    assert.equal(badText.ok, false);
    assert.equal(badText.code, "bad-envelope");
  });

  it("system chrome cannot be unlocked from any envelope path", async () => {
    const s = await scenes();
    const doc = await createDocument(structuredClone(s));
    const snap = doc.snapshot();
    const slide = snap.scenes[0];
    const el = slide.elements.find((e) => !e.locked);
    // Shape the element exactly as system chrome: locked,
    // compiler-owned, no authored block behind it.
    const working = structuredClone(snap.scenes);
    const target = working[0].elements.find((e) => e.id === el.id);
    target.locked = true;
    target.provenance = "compiler";
    delete target.semanticRef;
    // The refusal is proven through the public envelope: the
    // chrome-shaped element is loaded, then unlocked by id.
    const doc2 = await createDocument(working);
    const locked = doc2.snapshot().scenes[0].elements.find((e) => e.id === el.id);
    assert.equal(locked.locked, true);
    const attempt = await doc2.apply({
      id: "b-chrome-unlock", slideId: working[0].id,
      op: { type: "element.setLocked", id: el.id, locked: false },
      baseRevision: 0, actor: "human",
    });
    assert.equal(attempt.ok, false, "system chrome stays locked");
    assert.match(attempt.message, /system chrome/);
    const batch = await doc2.applyBatch({
      id: "b-chrome-batch", baseRevision: 0, actor: "agent", agentId: "audit-agent",
      ops: [{ slideId: working[0].id, op: { type: "element.setLocked", id: el.id, locked: false } }],
    });
    assert.equal(batch.ok, false, "batch path refuses identically");
    // The ordinary escape hatch still works on non-chrome locks.
    const doc3 = await createDocument(structuredClone(s));
    const plain = doc3.snapshot().scenes[0].elements.find((e) => !e.locked);
    const lock = await doc3.apply({
      id: "b-lock", slideId: doc3.snapshot().scenes[0].id,
      op: { type: "element.setLocked", id: plain.id, locked: true },
      baseRevision: 0, actor: "human",
    });
    assert.equal(lock.ok, true);
    const unlock = await doc3.apply({
      id: "b-unlock", slideId: doc3.snapshot().scenes[0].id,
      op: { type: "element.setLocked", id: plain.id, locked: false },
      baseRevision: 1, actor: "human",
    });
    assert.equal(unlock.ok, true, "ordinary locks keep the intentional toggle");
  });

  it("browser-supplied actor strings never authorize; audit is descriptive only", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const l = (await store.createProject({ owner: null, title: "Actor", scenes: structuredClone(s) })).doc;
    // An agent-attributed save to someone else's row still refuses.
    const a = (await store.createProject({ owner: ALICE, title: "Alice actor", scenes: structuredClone(s) })).doc;
    await assert.rejects(store.saveProject({
      owner: BOB, id: a.id, baseRevision: 0, scenes: structuredClone(s),
      provenance: { actor: "agent", agentId: "root" },
    }), /no such project/);
    await store.saveProject({
      owner: null, id: l.id, baseRevision: 0, scenes: bumped(s, "actor"),
      provenance: { actor: "agent", agentId: "agent-7" },
    });
    const listed = await store.listRevisions({ owner: null, id: l.id });
    assert.equal(listed.revisions.find((r) => r.revision === 1).actor, "agent");
    assert.equal(listed.revisions.find((r) => r.revision === 1).agentId, "agent-7");
    await store.deleteProject({ owner: null, id: l.id });
    await store.deleteProject({ owner: ALICE, id: a.id });
  });
});

describe("v2-6b native export after restore", () => {
  it("restored mixed decks export native, order-exact, identity-stable", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { renderPptx, preflightScenes } = await import("../packages/renderer-pptx/render.ts");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Export me", scenes: structuredClone(s) });
    await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "changed") });
    const out = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 1 });
    assert.deepEqual(await preflightScenes(out.doc.scenes), []);
    const bytes = await renderPptx(out.doc.scenes, { title: out.doc.title });
    const zip = await JSZip.loadAsync(bytes);
    const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f)).sort();
    assert.equal(parts.length, created.scenes.length, "exact slide count and order");
    if (created.scenes.some((x) => x.elements.some((e) => e.kind === "chart"))) {
      assert.ok(Object.keys(zip.files).some((f) => f.startsWith("ppt/charts/chart")), "native chart part emitted");
    }
    if (created.scenes.some((x) => x.elements.some((e) => e.kind === "table"))) {
      const tableXml = await Promise.all(parts.map((p) => zip.files[p].async("string")));
      assert.ok(tableXml.some((x) => x.includes("<a:tbl>")), "native table preserved");
    }
    assert.deepEqual(out.doc.scenes.map((x) => x.id), created.scenes.map((x) => x.id), "no identity regeneration");
    const rasterized = Object.keys(zip.files).filter((f) => /^ppt\/media\/.+\.(png|jpg|jpeg)$/.test(f));
    assert.equal(rasterized.length, 0, "no rasterized authored slides");
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6b HTTP history endpoints", () => {
  const ROOT = new URL("..", import.meta.url).pathname;
  const LOCAL_PORT = 5395;
  const HOSTED_PORT = 5396;
  let localApi = null;
  let hostedApi = null;

  async function spawnApi(port, cfgDir, extraEnv = {}) {
    const { spawn: sp } = await import("node:child_process");
    const api = sp("node", ["app/server/index.js"], {
      cwd: ROOT,
      env: { ...process.env, FORGE_API_PORT: String(port), FORGE_CONFIG_DIR: cfgDir, FORGE_DB_PATH: httpDb, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 25000);
      const onData = (d) => {
        if (String(d).includes(`localhost:${port}`)) {
          clearTimeout(t);
          resolve(true);
        }
      };
      api.stdout.on("data", onData);
      api.stderr.on("data", onData);
    });
    assert.equal(ready, true, `api on ${port} never reported listening`);
    return api;
  }

  const call = (port, method, p, token = null, body = undefined) =>
    fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  before(async function () {
    await useDb(httpDb);
    const localCfg = path.join(scratch, "hlocal");
    const hostedCfg = path.join(scratch, "hhosted");
    await mkdir(localCfg, { recursive: true });
    await mkdir(hostedCfg, { recursive: true });
    await writeFile(path.join(hostedCfg, "hosted.json"), JSON.stringify({ hosted: true }));
    const { closeDb } = await import("../src/db.js");
    closeDb();
    localApi = await spawnApi(LOCAL_PORT, localCfg, { FORGE_HOSTED: "0" });
    hostedApi = await spawnApi(HOSTED_PORT, hostedCfg);
  });

  after(async () => {
    for (const api of [localApi, hostedApi]) {
      if (api) {
        api.kill();
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  });

  it("list/get/restore round-trip over HTTP with consistent shapes", async function () {
    if (!localApi) {
      this.skip("api did not start");
      return;
    }
    const s = await scenes();
    const made = await (await call(LOCAL_PORT, "POST", "/api/v2/projects", null, { title: "HTTP history", scenes: structuredClone(s) })).json();
    assert.equal(made.ok, true);
    const id = made.project.id;
    const put = await (await call(LOCAL_PORT, "PUT", `/api/v2/projects/${id}`, null, {
      baseRevision: 0, scenes: bumped(s, "http-v1"),
      provenance: { actor: "human", saveOrigin: "manual", envelopeIds: ["http-e1"] },
    })).json();
    assert.equal(put.ok, true);
    assert.equal(put.project.revision, 1);
    const list = await (await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}/revisions`)).json();
    assert.equal(list.ok, true);
    assert.equal(list.currentRevision, 1);
    assert.equal(list.revisions.length, 2);
    assert.ok(!("payload" in list.revisions[0]) && !("scenes" in list.revisions[0]), "list carries audit only");
    const rev0 = await (await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}/revisions/0`)).json();
    assert.equal(rev0.ok, true);
    assert.deepEqual(rev0.project.scenes, s);
    const missing = await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}/revisions/99`);
    assert.equal(missing.status, 404);
    const malformed = await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}/revisions/-1`);
    assert.equal(malformed.status, 422);
    const stale = await call(LOCAL_PORT, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0, baseRevision: 0 });
    assert.equal(stale.status, 409);
    const staleBody = await stale.json();
    assert.equal(staleBody.code, "stale-revision");
    const restored = await (await call(LOCAL_PORT, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0, baseRevision: 1 })).json();
    assert.equal(restored.ok, true);
    assert.equal(restored.restoredFrom, 0);
    assert.equal(restored.project.revision, 2);
    assert.deepEqual(restored.project.scenes, s);
    const badRestore = await call(LOCAL_PORT, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0 });
    assert.equal(badRestore.status, 422);
    await call(LOCAL_PORT, "DELETE", `/api/v2/projects/${id}`);
  });

  it("history endpoints refuse traversal, oversize, disabled-host, and hosted anonymous", async function () {
    if (!localApi || !hostedApi) {
      this.skip("api did not start");
      return;
    }
    assert.equal((await call(LOCAL_PORT, "GET", "/api/v2/projects/..%2F..%2Fx/revisions")).status, 400);
    assert.equal((await call(HOSTED_PORT, "GET", "/api/v2/projects/p-abcdef/revisions")).status, 401);
    assert.equal((await call(HOSTED_PORT, "GET", "/api/v2/projects/p-abcdef/revisions/0")).status, 401);
    assert.equal((await call(HOSTED_PORT, "POST", "/api/v2/projects/p-abcdef/restore", null, { revision: 0, baseRevision: 0 })).status, 401);
    const s = await scenes();
    const made = await (await call(LOCAL_PORT, "POST", "/api/v2/projects", null, { title: "Guards", scenes: structuredClone(s) })).json();
    const huge = await call(LOCAL_PORT, "PUT", `/api/v2/projects/${made.project.id}`, null, {
      baseRevision: 0, scenes: structuredClone(s), provenance: { envelopeIds: Array.from({ length: 51 }, (_, i) => `e-${i}`) },
    });
    assert.equal(huge.status, 422, "provenance beyond bounds refuses without touching the document");
    await call(LOCAL_PORT, "DELETE", `/api/v2/projects/${made.project.id}`);
    const cfg = path.join(scratch, "hoff");
    await mkdir(cfg, { recursive: true });
    const off = await spawnApi(5397, cfg, { FORGE_HOSTED: "0", FORGE_V2_PROJECTS: "0" });
    try {
      assert.equal((await call(5397, "GET", "/api/v2/projects/p-abcdef/revisions")).status, 403);
    } finally {
      off.kill();
      await new Promise((r) => setTimeout(r, 800));
    }
  });
});
