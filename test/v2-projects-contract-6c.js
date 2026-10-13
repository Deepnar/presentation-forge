// V2-6C shared ProjectStore contract: runs unmodified against the
// SQLite adapter and the PostgreSQL adapter. Any behavioral drift
// between backends fails here, not in production.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { validateProjectDocument } from "../packages/projects/document.js";
import { validateScene } from "../packages/model/scene.ts";
import { createDocument } from "../packages/model/engine.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

export const ALICE = "alice.6c@example.test";
export const BOB = "bob.6c@example.test";

let cachedScenes = null;
export async function contractScenes() {
  if (!cachedScenes) {
    const design = await warmDesign();
    cachedScenes = compileDeck(sampleDeckIntent(), design);
  }
  return structuredClone(cachedScenes);
}

export function bumped(scenes, word) {
  const next = structuredClone(scenes);
  const slide = next.find((s) => s.elements.some((e) => e.kind === "text"));
  slide.elements.find((e) => e.kind === "text").paragraphs[0].runs[0].text = word;
  return next;
}

// Both adapters must expose the same surface; policy helpers are
// shared by import (canAccessProject, buildAudit, computePrunePlan,
// validateProvenance), so drift can only hide in SQL/transaction
// behavior — which the suite below pins down.
export function assertInterfaceParity(namespaces) {
  const keys = namespaces.map((ns) => Object.keys(ns).filter((k) => !k.startsWith("__") && !k.startsWith("_")).sort());
  for (let i = 1; i < keys.length; i++) {
    assert.deepEqual(keys[i], keys[0], "adapter export sets must match exactly");
  }
  for (const k of ["createProject", "getProject", "listProjects", "saveProject", "renameProject", "deleteProject", "listRevisions", "getRevision", "restoreRevision", "canAccessProject"]) {
    assert.ok(keys[0].includes(k), `missing export ${k}`);
  }
}

export function runContractSuite(label, store, hooks) {
  const tag = (name) => `[${label}] ${name}`;

  describe(tag("CRUD and summaries"), () => {
    it("creates, loads, lists without scene bytes, renames, deletes", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Contract", scenes: structuredClone(s) });
      assert.equal(created.revision, 0);
      assert.deepEqual((await store.getProject({ owner: null, id: created.id })).doc, created);
      const { projects } = await store.listProjects({ owner: null });
      const row = projects.find((p) => p.id === created.id);
      assert.ok(row && !("scenes" in row) && !("payload" in row));
      const renamed = await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "Contract 2" });
      assert.equal(renamed.status, "saved");
      assert.equal(renamed.doc.revision, 1);
      assert.equal((await store.deleteProject({ owner: null, id: created.id })).removed, true);
      assert.equal((await store.getProject({ owner: null, id: created.id })).doc, null);
      assert.equal((await store.deleteProject({ owner: null, id: created.id })).removed, false);
    });

    it("no-op saves and renames advance nothing and record nothing", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Noop", scenes: structuredClone(s) });
      assert.equal((await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s) })).status, "noop");
      assert.equal((await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "Noop" })).status, "noop");
      assert.equal(await hooks.historyCount(created.id), 1);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("schema validation"), () => {
    it("refuses malformed ids, titles, scenes, and provenance", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Valid", scenes: structuredClone(s) });
      for (const bad of ["../x", "a/b", "", "x".repeat(200)]) {
        await assert.rejects(store.getProject({ owner: null, id: bad }), /invalid project id/);
        await assert.rejects(store.deleteProject({ owner: null, id: bad }), /invalid project id/);
      }
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: [] }), /scenes must be/);
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: -1, scenes: structuredClone(s) }), /baseRevision/);
      const bad = structuredClone(s);
      bad[0].elements[0].w = -5;
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bad }));
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s), provenance: { actor: "robot" } }), /provenance.actor/);
      await assert.rejects(store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "  " }), /title must be/);
      const kept = (await store.getProject({ owner: null, id: created.id })).doc;
      assert.equal(kept.revision, 0);
      assert.equal(await hooks.historyCount(created.id), 1);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("owner isolation"), () => {
    it("exact-match reads, lists, writes, and history without leaks", async () => {
      const s = await contractScenes();
      const a = (await store.createProject({ owner: ALICE, title: "A", scenes: structuredClone(s) })).doc;
      const b = (await store.createProject({ owner: BOB, title: "B", scenes: structuredClone(s) })).doc;
      const l = (await store.createProject({ owner: null, title: "L", scenes: structuredClone(s) })).doc;
      assert.equal((await store.getProject({ owner: ALICE, id: a.id })).doc?.id, a.id);
      assert.equal((await store.getProject({ owner: BOB, id: a.id })).doc, null);
      assert.equal((await store.getProject({ owner: ALICE, id: l.id })).doc, null);
      assert.equal((await store.getProject({ owner: null, id: a.id })).doc, null);
      assert.deepEqual((await store.listProjects({ owner: ALICE })).projects.map((p) => p.id), [a.id]);
      assert.deepEqual((await store.listProjects({ owner: null })).projects.map((p) => p.id), [l.id]);
      await assert.rejects(store.saveProject({ owner: BOB, id: a.id, baseRevision: 0, scenes: structuredClone(s) }), /no such project/);
      await assert.rejects(store.renameProject({ owner: BOB, id: a.id, baseRevision: 0, title: "X" }), /no such project/);
      assert.equal((await store.deleteProject({ owner: BOB, id: a.id })).removed, false);
      await assert.rejects(store.listRevisions({ owner: BOB, id: a.id }), /no such project/);
      await assert.rejects(store.getRevision({ owner: BOB, id: a.id, revision: 0 }), /no such project/);
      await assert.rejects(store.restoreRevision({ owner: BOB, id: a.id, targetRevision: 0, baseRevision: 0 }), /no such project/);
      assert.equal(await hooks.historyCount(a.id), 1, "denied writes changed no history");
      assert.deepEqual((await store.getProject({ owner: ALICE, id: a.id })).doc, a);
      const adminList = await store.listProjects({ owner: "admin.6c@example.test", admin: true });
      assert.ok(adminList.projects.some((p) => p.id === a.id) && adminList.projects.some((p) => p.id === b.id));
      await store.deleteProject({ owner: ALICE, id: a.id });
      await store.deleteProject({ owner: BOB, id: b.id });
      await store.deleteProject({ owner: null, id: l.id });
    });
  });

  describe(tag("revision conflicts"), () => {
    it("same-base saves serialize to one winner and one stale", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Race", scenes: structuredClone(s) });
      const [r1, r2] = await Promise.all([
        store.saveProject({ owner: null, id: created.id, baseRevision: 0, title: "R1", scenes: bumped(s, "r1") }),
        store.saveProject({ owner: null, id: created.id, baseRevision: 0, title: "R2", scenes: bumped(s, "r2") }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort(), ["saved", "stale"]);
      const kept = (await store.getProject({ owner: null, id: created.id })).doc;
      assert.equal(kept.revision, 1);
      assert.equal(await hooks.historyCount(created.id), 2, "exactly one new history row");
      await store.deleteProject({ owner: null, id: created.id });
    });

    it("save versus rename on one base keeps exactly one winner", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Mix", scenes: structuredClone(s) });
      const [a, b] = await Promise.all([
        store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "mix") }),
        store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "Mixed" }),
      ]);
      assert.equal([a.status, b.status].filter((x) => x === "stale").length, 1);
      const kept = (await store.getProject({ owner: null, id: created.id })).doc;
      assert.equal(kept.revision, 1);
      assert.equal(await hooks.historyCount(created.id), 2);
      await store.deleteProject({ owner: null, id: created.id });
    });

    it("concurrent same-base renames yield one winner and one stale", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "RR", scenes: structuredClone(s) });
      const [r1, r2] = await Promise.all([
        store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "R1" }),
        store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "R2" }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort(), ["saved", "stale"]);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("atomic history"), () => {
    it("every committed revision has a validated history row; failures add none", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Atom", scenes: structuredClone(s) });
      const out = await store.saveProject({
        owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "atom1"),
        provenance: { actor: "human", saveOrigin: "manual", envelopeIds: ["a1", "a2"] },
      });
      assert.equal(out.status, "saved");
      const listed = await store.listRevisions({ owner: null, id: created.id });
      assert.equal(listed.currentRevision, 1);
      assert.deepEqual(listed.retention, { maxRecoverable: 20, maxAudit: 100 });
      assert.equal(listed.revisions.length, 2);
      assert.deepEqual(listed.revisions.find((r) => r.revision === 1).envelopeIds, ["a1", "a2"]);
      const got = await store.getRevision({ owner: null, id: created.id, revision: 1 });
      assert.equal(got.pruned, false);
      assert.equal((await validateProjectDocument(got.doc)).ok, true);
      assert.deepEqual(got.doc.scenes, out.doc.scenes);
      const bad = structuredClone(s);
      bad[1].elements[0].w = 0;
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 1, scenes: bad }));
      assert.equal(await hooks.historyCount(created.id), 2);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("retention"), () => {
    it("stays bounded: newest 20 recoverable, older audit-only, pruned unrestorable", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Ret", scenes: structuredClone(s) });
      for (let i = 1; i <= 25; i++) {
        const out = await store.saveProject({ owner: null, id: created.id, baseRevision: i - 1, scenes: bumped(s, `ret${i}`) });
        assert.equal(out.status, "saved");
      }
      const listed = await store.listRevisions({ owner: null, id: created.id });
      assert.equal(listed.currentRevision, 25);
      assert.equal(listed.revisions.length, 26);
      const recoverable = listed.revisions.filter((r) => r.recoverable).map((r) => r.revision).sort((a, b) => a - b);
      assert.equal(recoverable.length, 20);
      assert.deepEqual(recoverable, Array.from({ length: 20 }, (_, k) => 25 - k).sort((a, b) => a - b));
      assert.equal(listed.revisions.find((r) => r.revision === 0).recoverable, false);
      await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 25 }), /pruned/);
      assert.equal((await store.getProject({ owner: null, id: created.id })).doc.revision, 25);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("restore"), () => {
    it("restores as a new revision, preserves rows, refuses stale", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Res", scenes: structuredClone(s) });
      await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "w1") });
      await store.saveProject({ owner: null, id: created.id, baseRevision: 1, scenes: bumped(s, "w2") });
      const stale = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 0 });
      assert.equal(stale.status, "stale");
      assert.equal(stale.expected, 2);
      const out = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 2, provenance: { actor: "human" } });
      assert.equal(out.status, "restored");
      assert.equal(out.doc.revision, 3);
      assert.deepEqual(out.doc.scenes, created.scenes);
      const listed = await store.listRevisions({ owner: null, id: created.id });
      assert.equal(listed.revisions.length, 4);
      assert.equal(listed.revisions.find((r) => r.revision === 3).restoredFrom, 0);
      await assert.rejects(store.restoreRevision({ owner: null, id: created.id, targetRevision: 77, baseRevision: 3 }), /no such revision/);
      await store.deleteProject({ owner: null, id: created.id });
    });

    it("restore versus restore on one base keeps one winner", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "ResR", scenes: structuredClone(s) });
      await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "w1") });
      const [a, b] = await Promise.all([
        store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 1 }),
        store.restoreRevision({ owner: null, id: created.id, targetRevision: 1, baseRevision: 1 }),
      ]);
      assert.equal([a.status, b.status].filter((x) => x === "stale").length, 1);
      assert.equal((await store.getProject({ owner: null, id: created.id })).doc.revision, 2);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("migration and corruption"), () => {
    it("history-less projects gain exactly one baseline without rewrites", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Mig", scenes: structuredClone(s) });
      await hooks.stripHistory(created.id);
      assert.deepEqual((await store.getProject({ owner: null, id: created.id })).doc, created);
      const listed = await store.listRevisions({ owner: null, id: created.id });
      assert.equal(listed.revisions.length, 1);
      assert.equal(listed.revisions[0].kind, "baseline");
      assert.deepEqual((await store.getRevision({ owner: null, id: created.id, revision: created.revision })).doc.scenes, s);
      assert.deepEqual((await store.getProject({ owner: null, id: created.id })).doc, created);
      await store.deleteProject({ owner: null, id: created.id });
    });

    it("future schema versions refuse; corrupt rows refuse with current intact", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Fut", scenes: structuredClone(s) });
      await hooks.setStoredVersion(created.id, 99);
      await assert.rejects(store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: structuredClone(s) }), /schemaVersion/);
      await hooks.restoreStored(created.id);
      await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "good") });
      await hooks.corruptRevision(created.id, 1);
      await assert.rejects(store.getRevision({ owner: null, id: created.id, revision: 1 }), /corrupt|invalid/);
      assert.equal((await store.getProject({ owner: null, id: created.id })).doc.revision, 1);
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("round-trip and export"), () => {
    it("mixed decks survive byte-identical with identity intact", async () => {
      const s = await contractScenes();
      const doc = await createDocument(structuredClone(s));
      const snap = doc.snapshot();
      const t0 = snap.scenes[0].elements.find((e) => e.kind === "text");
      const draft = structuredClone(t0.paragraphs);
      draft[0].runs[0].text = "Contract heading";
      const r = await doc.apply({ id: "c6c-1", slideId: snap.scenes[0].id, op: { type: "element.updateText", id: t0.id, paragraphs: draft }, baseRevision: 0, actor: "human" });
      assert.equal(r.ok, true);
      const edited = structuredClone(doc.snapshot().scenes);
      const { doc: created } = await store.createProject({ owner: null, title: "Round", scenes: edited, origin: { kind: "mixed" } });
      const loaded = (await store.getProject({ owner: null, id: created.id })).doc;
      assert.deepEqual(loaded.scenes, edited);
      assert.deepEqual(loaded.scenes.map((x) => x.id), edited.map((x) => x.id));
      for (const scene of loaded.scenes) assert.equal((await validateScene(scene)).ok, true);
      await store.deleteProject({ owner: null, id: created.id });
    });

    it("stored and restored documents export native and order-exact", async () => {
      const { renderPptx, preflightScenes } = await import("../packages/renderer-pptx/render.ts");
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Export contract", scenes: structuredClone(s) });
      await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "exp") });
      const out = await store.restoreRevision({ owner: null, id: created.id, targetRevision: 0, baseRevision: 1 });
      assert.deepEqual(await preflightScenes(out.doc.scenes), []);
      const bytes = await renderPptx(out.doc.scenes, { title: out.doc.title });
      const zip = await JSZip.loadAsync(bytes);
      const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f)).sort();
      assert.equal(parts.length, created.scenes.length);
      if (created.scenes.some((x) => x.elements.some((e) => e.kind === "chart"))) {
        assert.ok(Object.keys(zip.files).some((f) => f.startsWith("ppt/charts/chart")));
      }
      assert.deepEqual(out.doc.scenes.map((x) => x.id), created.scenes.map((x) => x.id));
      await store.deleteProject({ owner: null, id: created.id });
    });
  });

  describe(tag("deletion"), () => {
    it("delete removes the project and its history together", async () => {
      const s = await contractScenes();
      const { doc: created } = await store.createProject({ owner: null, title: "Del", scenes: structuredClone(s) });
      await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "del") });
      assert.equal(await hooks.historyCount(created.id), 2);
      assert.equal((await store.deleteProject({ owner: null, id: created.id })).removed, true);
      assert.equal((await store.getProject({ owner: null, id: created.id })).doc, null);
      assert.equal(await hooks.historyCount(created.id), 0);
    });
  });
}
