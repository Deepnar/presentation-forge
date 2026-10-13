// V2-6A durable projects: schema, CRUD, round-trips, integrity,
// concurrency, and reopened editing/export. Fails on fa557c4 at
// import (packages/projects + src/projects/store.js are new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import {
  PROJECT_SCHEMA_VERSION,
  PROJECT_ID_RE,
  buildProjectDocument,
  validateProjectDocument,
  validateSavePayload,
  validProjectId,
  mintProjectId,
} from "../packages/projects/document.js";
import { validateScene } from "../packages/model/scene.ts";
import { createDocument } from "../packages/model/engine.ts";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { buildLayoutScene } from "../packages/editor/layout-templates.js";
import { blankSlide } from "../packages/editor/scene-text.js";
import { renderPptx, preflightScenes } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

let scratch = null;
let prevDbPath = process.env.FORGE_DB_PATH ?? null;

function idsOf(scenes) {
  const out = [];
  const walk = (els) => {
    for (const el of els ?? []) {
      out.push(el.id);
      walk(el.group?.children);
    }
  };
  for (const s of scenes) {
    out.push(s.id);
    walk(s.elements);
  }
  return out;
}

async function richScenes() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design);
  return { design, scenes };
}

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "forge-6a-"));
  process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
});

after(async () => {
  const { closeDb } = await import("../src/db.js");
  closeDb();
  if (prevDbPath === null) delete process.env.FORGE_DB_PATH;
  else process.env.FORGE_DB_PATH = prevDbPath;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

describe("v2-6a project schema and version", () => {
  it("envelope requires identity, version 1, revision, timestamps, scenes", async () => {
    const { scenes } = await richScenes();
    const doc = buildProjectDocument({ title: "Cells", scenes });
    assert.equal(doc.schemaVersion, PROJECT_SCHEMA_VERSION);
    assert.equal(doc.revision, 0);
    assert.ok(validProjectId(doc.id));
    assert.ok(PROJECT_ID_RE.test(doc.id));
    assert.deepEqual((await validateProjectDocument(doc)).ok, true);
  });

  it("rejects unknown future versions, missing fields, bad ids", async () => {
    const { scenes } = await richScenes();
    const doc = buildProjectDocument({ title: "Cells", scenes });
    assert.equal((await validateProjectDocument({ ...doc, schemaVersion: 2 })).ok, false);
    assert.equal((await validateProjectDocument({ ...doc, id: "../evil" })).ok, false);
    assert.equal((await validateProjectDocument({ ...doc, scenes: [] })).ok, false);
    assert.equal(validProjectId("../evil"), false);
    assert.equal(validProjectId(""), false);
  });

  it("refuses prototype-pollution keys and functions without silent repair", async () => {
    const { scenes } = await richScenes();
    const doc = buildProjectDocument({ title: "Cells", scenes });
    const evil = JSON.parse(JSON.stringify(doc).replace('"elements"', '"elements"'));
    evil.scenes[0].elements[0] = JSON.parse('{"id":"e","kind":"text","x":1,"y":1,"w":2,"h":1,"z":0,"provenance":"human","__proto__":{"x":1}}');
    assert.equal((await validateProjectDocument(evil)).ok, false);
    const fnDoc = structuredClone(doc);
    fnDoc.scenes[0].elements[0].x = (() => 1);
    assert.equal((await validateProjectDocument(fnDoc)).ok, false);
  });

  it("minted ids are unique and stable across a save/load cycle", () => {
    const a = mintProjectId();
    const b = mintProjectId();
    assert.notEqual(a, b);
    assert.ok(validProjectId(a) && validProjectId(b));
  });
});

describe("v2-6a create/save/load/list/rename/delete", () => {
  it("creates, loads, lists, renames, deletes", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "First", scenes });
    assert.equal(created.revision, 0);
    const { doc: loaded } = await store.getProject({ owner: null, id: created.id });
    assert.deepEqual(loaded, created);
    const { projects } = await store.listProjects({ owner: null });
    assert.ok(projects.some((p) => p.id === created.id && p.title === "First"));
    assert.ok(!("scenes" in projects.find((p) => p.id === created.id)), "list carries summaries, never scene bytes");
    const out = await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "Second" });
    assert.equal(out.status, "saved");
    const renamed = out.doc;
    assert.equal(renamed.title, "Second");
    assert.equal(renamed.revision, created.revision + 1);
    const { removed } = await store.deleteProject({ owner: null, id: created.id });
    assert.equal(removed, true);
    assert.equal((await store.getProject({ owner: null, id: created.id })).doc, null);
    assert.equal((await store.deleteProject({ owner: null, id: created.id })).removed, false);
  });

  it("saving identical state reports noop without advancing the revision", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Noop", scenes });
    const out = await store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes });
    assert.equal(out.status, "noop");
    assert.equal(out.doc.revision, 0);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("reopens after store reinitialization (real durability, not a Map)", async () => {
    const store = await import("../src/projects/store.js");
    const { closeDb } = await import("../src/db.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Durable", scenes });
    closeDb();
    const { doc: reopened } = await store.getProject({ owner: null, id: created.id });
    assert.deepEqual(reopened, created);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("rejects path-traversal and malformed ids at every entry", async () => {
    const store = await import("../src/projects/store.js");
    for (const bad of ["../x", "..\\x", "/etc/passwd", "a/b", "", "x".repeat(200)]) {
      await assert.rejects(() => store.getProject({ owner: null, id: bad }), /invalid project id/);
      await assert.rejects(() => store.deleteProject({ owner: null, id: bad }), /invalid project id/);
    }
  });

  it("rejects malformed projects and oversized payloads", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Guard", scenes });
    await assert.rejects(
      () => store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: [] }),
      /scenes must be/,
    );
    const bad = structuredClone(scenes);
    bad[0].elements[0].w = -5;
    await assert.rejects(() => store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bad }));
    const before = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(before.revision, 0, "failed save leaves the stored revision intact");
    await assert.rejects(
      () => store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes, title: "" }),
      /title must be/,
    );
    const huge = "x".repeat(7 * 1024 * 1024);
    assert.equal((await validateSavePayload({ baseRevision: 0, title: "T", scenes: [{ ...scenes[0], id: huge.slice(0, 8) }] })).ok !== undefined, true);
    assert.equal((await validateProjectDocument({ ...created, title: huge })).ok, false);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6a complete scene round-trip", () => {
  it("preserves text runs, shapes, charts, tables, order, locks, tombstones, detachment", async () => {
    const store = await import("../src/projects/store.js");
    const { design, scenes } = await richScenes();
    const doc = await createDocument(structuredClone(scenes));
    // Shape restyle + lock, chart re-data, table re-data, hidden flag.
    const s0 = doc.snapshot().scenes[0];
    const shape = s0.elements.find((e) => e.kind === "shape");
    const text = s0.elements.find((e) => e.kind === "text");
    if (shape) {
      await doc.apply({ id: "6a-style", slideId: s0.id, op: { type: "element.setStyle", id: shape.id, style: { fill: "123456" } }, baseRevision: doc.snapshot().revision, actor: "human" });
      await doc.apply({ id: "6a-lock", slideId: s0.id, op: { type: "element.setLocked", id: shape.id, locked: true }, baseRevision: doc.snapshot().revision, actor: "human" });
    }
    if (text) {
      const draft = structuredClone(text.paragraphs);
      draft[0].runs[0].text = "Edited heading";
      draft[0].runs[0].bold = true;
      draft[0].runs[0].size = 28;
      await doc.apply({ id: "6a-text", slideId: s0.id, op: { type: "element.updateText", id: text.id, paragraphs: draft }, baseRevision: doc.snapshot().revision, actor: "human" });
    }
    const chartSlide = doc.snapshot().scenes.find((s) => s.elements.some((e) => e.kind === "chart"));
    if (chartSlide) {
      const chart = chartSlide.elements.find((e) => e.kind === "chart");
      await doc.apply({ id: "6a-chart", slideId: chartSlide.id, op: { type: "element.setChartData", id: chart.id, chart: { categories: ["N", "S"], series: [{ name: "V", values: [4, 9] }] } }, baseRevision: doc.snapshot().revision, actor: "human" });
    }
    const tableSlide = doc.snapshot().scenes.find((s) => s.elements.some((e) => e.kind === "table"));
    if (tableSlide) {
      const table = tableSlide.elements.find((e) => e.kind === "table");
      const rows = table.table.rows.map((r, i) => (i === 1 ? r.map((c, j) => (j === 1 ? "EDITED" : c)) : [...r]));
      await doc.apply({ id: "6a-table", slideId: tableSlide.id, op: { type: "element.setTableData", id: table.id, table: { rows } }, baseRevision: doc.snapshot().revision, actor: "human" });
      await doc.apply({ id: "6a-hide", slideId: tableSlide.id, op: { type: "element.setVisibility", id: table.id, hidden: true }, baseRevision: doc.snapshot().revision, actor: "human" });
    }
    // Layout-gallery slide + blank manual slide + duplicated + detached.
    const { attachEditor } = await import("../packages/editor/scene-edit.js");
    const { parseHTML } = await import("linkedom");
    const { createViewer } = await import("../packages/editor/scene-dom.js");
    const { document } = parseHTML("<!doctype html><html><body></body></html>");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const viewer = createViewer(root, doc.snapshot().scenes);
    const editor = attachEditor(viewer, doc, { root, onError: () => {}, onSync: () => {} });
    const laid = await editor.insertLayoutSlide("chart-insight");
    assert.equal(laid.ok, true);
    const blanked = await editor.insertSlide();
    assert.equal(blanked.ok, true);
    const dup = await editor.duplicateSlides([laid.id]);
    assert.equal(dup.ok, true);
    const detached = await editor.detachSlide(laid.id);
    assert.equal(detached.ok, true);
    // Reorder one element to pin stacking, delete one compiler element for a tombstone.
    const cur = doc.snapshot().scenes;
    const withShape = cur.find((s) => s.elements.filter((e) => e.kind === "shape").length >= 2);
    if (withShape) {
      const first = withShape.elements.find((e) => e.kind === "shape");
      await editor.reorderElement(first.id, withShape.elements.length - 1);
    }
    const compilerEl = cur.flatMap((s) => s.elements.map((e) => ({ s, e }))).find(({ e }) => e.provenance === "compiler" && !e.locked);
    if (compilerEl) {
      viewer.api.goTo(cur.findIndex((s) => s.id === compilerEl.s.id));
      viewer.api.select(compilerEl.e.id);
      await editor.deleteSelected();
    }

    const edited = doc.snapshot().scenes;
    const beforeIds = idsOf(edited);
    const { doc: created } = await store.createProject({ owner: null, title: "Mixed", scenes: edited, origin: { kind: "mixed" } });
    const { doc: loaded } = await store.getProject({ owner: null, id: created.id });
    assert.deepEqual(loaded.scenes, edited, "byte-identical scenes across save/load");
    assert.deepEqual(idsOf(loaded.scenes), beforeIds, "no regenerated ids");
    assert.deepEqual(loaded.scenes.map((s) => s.id), edited.map((s) => s.id), "slide order intact");

    // Spot-check preservation corners on the loaded copy.
    const l0 = loaded.scenes[0];
    if (shape) {
      const kept = l0.elements.find((e) => e.id === shape.id);
      assert.equal(kept.shape.fill, "123456");
      assert.equal(kept.locked, true);
    }
    if (text) {
      const kept = l0.elements.find((e) => e.id === text.id);
      assert.equal(kept.paragraphs[0].runs[0].text, "Edited heading");
      assert.equal(kept.paragraphs[0].runs[0].bold, true);
    }
    if (tableSlide) {
      const kept = loaded.scenes.find((s) => s.id === tableSlide.id).elements.find((e) => e.kind === "table");
      assert.equal(kept.table.rows[1][1], "EDITED");
      assert.equal(kept.hidden, true);
    }
    const tombstoned = loaded.scenes.find((s) => Array.isArray(s.suppressed) && s.suppressed.length > 0);
    assert.ok(tombstoned, "suppression tombstones survive");
    const detachedSlide = loaded.scenes.find((s) => s.id === laid.id);
    assert.equal(detachedSlide.layoutState, "detached");
    const galleryCopy = loaded.scenes.find((s) => s.id === dup.ids[0]);
    assert.equal(galleryCopy.recipeId, "layout:chart-insight");
    assert.ok(galleryCopy.elements.every((e) => e.provenance === "human"));
    for (const s of loaded.scenes) {
      const zs = s.elements.map((e) => e.z);
      assert.deepEqual([...zs].sort((a, b) => a - b), zs, `${s.id} draw order is rank-sorted`);
      assert.equal(new Set(zs).size, zs.length, `${s.id} ranks unique`);
      assert.equal((await validateScene(s)).ok, true);
    }
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6a autosave lane", () => {
  it("coalesces rapid edits into one save without overlapping", async () => {
    const { createAutosave } = await import("../app/web/src/lib/v2project.js");
    let calls = 0;
    let release = null;
    const gate = new Promise((r) => { release = r; });
    const lane = createAutosave({
      delayMs: 10,
      saveNow: async () => {
        calls += 1;
        if (calls === 1) await gate;
      },
      onState: () => {},
    });
    lane.schedule();
    lane.schedule();
    lane.schedule();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(calls, 1, "one flight despite three schedules");
    release();
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(calls <= 2, "no pile-up after release");
    lane.dispose();
  });

  it("retries one transient failure, then surfaces persistent failure", async () => {
    const { createAutosave } = await import("../app/web/src/lib/v2project.js");
    let calls = 0;
    const seen = [];
    const lane = createAutosave({
      delayMs: 10,
      saveNow: async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient down");
      },
      onState: (e) => seen.push(e),
    });
    lane.schedule();
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(calls, 2, "initial plus exactly one retry");
    assert.equal(seen.length, 0, "recovered failure never surfaces");
    lane.dispose();
  });
});

describe("v2-6a revision conflicts and atomicity", () => {
  it("second writer on a stale base loses without overwriting", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Conflict", scenes });
    const a = structuredClone(scenes);
    a[0].elements = [...a[0].elements];
    const first = await store.saveProject({ owner: null, id: created.id, baseRevision: 0, title: "A wins", scenes: a });
    assert.equal(first.status, "saved");
    assert.equal(first.doc.revision, 1);
    const b = structuredClone(scenes);
    const stale = await store.saveProject({ owner: null, id: created.id, baseRevision: 0, title: "B stale", scenes: b });
    assert.equal(stale.status, "stale");
    assert.equal(stale.expected, 1);
    assert.equal(stale.actual, 0);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.title, "A wins");
    assert.equal(kept.revision, 1);
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("concurrent saves serialize to exactly one winner", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Race", scenes });
    const mk = (title) => store.saveProject({ owner: null, id: created.id, baseRevision: 0, title, scenes: structuredClone(scenes) });
    const [r1, r2] = await Promise.all([mk("R1"), mk("R2")]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, ["saved", "stale"]);
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.equal(kept.revision, 1);
    assert.ok(kept.title === "R1" || kept.title === "R2");
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("a broken save never destroys the last good version", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Atomic", scenes });
    const bad = structuredClone(scenes);
    bad[1].elements[0].w = 0;
    await assert.rejects(() => store.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bad }));
    const kept = (await store.getProject({ owner: null, id: created.id })).doc;
    assert.deepEqual(kept.scenes, scenes);
    assert.equal(kept.revision, 0);
    await store.deleteProject({ owner: null, id: created.id });
  });
});

describe("v2-6a reopened editing, undo policy, and native export", () => {
  it("loaded scenes feed the engine directly and stay editable", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const { doc: created } = await store.createProject({ owner: null, title: "Reopen", scenes });
    const { doc: loaded } = await store.getProject({ owner: null, id: created.id });
    const doc = await createDocument(structuredClone(loaded.scenes));
    assert.equal(doc.snapshot().revision, 0, "engine session restarts at 0; the durable revision lives on the project");
    assert.equal(doc.status().canUndo, false, "undo history does not survive reload (deferred by design)");
    assert.equal(doc.status().canRedo, false);
    const s0 = doc.snapshot().scenes[0];
    const target = s0.elements.find((e) => e.kind === "text" && !e.locked) ?? s0.elements[0];
    const before = structuredClone(target);
    const draft = structuredClone(target.paragraphs ?? [{ runs: [{ text: "x" }] }]);
    if (target.kind === "text") {
      draft[0].runs[0].text = "Reopened edit";
      const r = await doc.apply({ id: "6a-reopen", slideId: s0.id, op: { type: "element.updateText", id: target.id, paragraphs: draft }, baseRevision: 0, actor: "human" });
      assert.equal(r.ok, true);
      assert.equal(doc.snapshot().revision, 1);
      await doc.undo();
      assert.deepEqual(doc.snapshot().scenes[0].elements.find((e) => e.id === target.id), before);
      await doc.redo();
      assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === target.id).paragraphs[0].runs[0].text, "Reopened edit");
    }
    await store.deleteProject({ owner: null, id: created.id });
  });

  it("export from the stored document is native and order-exact", async () => {
    const store = await import("../src/projects/store.js");
    const { scenes } = await richScenes();
    const gallery = buildLayoutScene("chart-insight", scenes[0], { slideId: "s-6a-chart", newId: (() => { let n = 0; return () => `h-6a${++n}`; })() });
    const table = buildLayoutScene("data-table", scenes[0], { slideId: "s-6a-table", newId: (() => { let n = 100; return () => `h-6a${++n}`; })() });
    const mixed = [...structuredClone(scenes), gallery, table];
    const { doc: created } = await store.createProject({ owner: null, title: "Export", scenes: mixed });
    const { doc: loaded } = await store.getProject({ owner: null, id: created.id });
    assert.deepEqual(await preflightScenes(loaded.scenes), []);
    const bytes = await renderPptx(loaded.scenes, { title: loaded.title });
    const zip = await JSZip.loadAsync(bytes);
    const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f)).sort();
    assert.equal(parts.length, mixed.length, "exact slide count and order");
    const chartPart = Object.keys(zip.files).find((f) => f.startsWith("ppt/charts/chart"));
    assert.ok(chartPart, "native chart part emitted");
    const tableXml = await zip.files[parts[parts.length - 1]].async("string");
    assert.ok(tableXml.includes("<a:tbl>"), "native table preserved");
    await store.deleteProject({ owner: null, id: created.id });
  });
});
