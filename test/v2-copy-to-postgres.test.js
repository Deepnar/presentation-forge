// F9: an install's V2 projects move from SQLite to PostgreSQL whole — every
// table, bytes intact — and read back through the Postgres store exactly as
// the SQLite store wrote them. Needs an owned, isolated server.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const url = process.env.FORGE_COPY_TEST_PG_URL;
if (!url) {
  test("SQLite → PostgreSQL copy: backend unavailable, unexecuted", (t) => t.skip("Owned isolated FORGE_COPY_TEST_PG_URL required."));
} else {
  const scratch = await mkdtemp(path.join(tmpdir(), "forge-copy-pg-"));
  process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
  process.env.FORGE_PROJECTS_BACKEND = "sqlite";
  const database = `forge_copy_${process.pid}_${Date.now().toString(36)}`;
  const target = new URL(url);
  target.pathname = `/${database}`;
  const maintenance = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
  const sqlite = await import("../src/projects/store.js");
  const { blankSlide } = await import("../packages/editor/scene-text.js");
  const { extractFile } = await import("../src/projects/file-extract.js");
  const { copyProjectsToPostgres } = await import("../src/projects/copy-to-postgres.js");
  const { closeDb } = await import("../src/db.js");
  const owner = "owner@example.test";
  let doc;

  before(async () => {
    await maintenance.query(`CREATE DATABASE "${database}"`);
    ({ doc } = await sqlite.createProject({ owner, title: "Moving house", scenes: [blankSlide(), blankSlide()] }));
    const asset = { hash: "a".repeat(64), mime: "image/png", width: 1, height: 1, size: 4, bytes: new Uint8Array([0, 1, 254, 255]) };
    await sqlite.putProjectAsset({ owner, id: doc.id, asset });
    const file = await extractFile(new TextEncoder().encode("Truth: 91 percent retention."), "truth.md");
    await sqlite.putProjectFile({ owner, id: doc.id, file: { ...file, role: "source-of-truth" } });
    await sqlite.putProjectLayout({ owner, id: doc.id, layout: { id: "layout_1", name: "Mine", scene: blankSlide() } });
    await sqlite.putProjectDocument({ owner, id: doc.id, document: { id: "doc_1", kind: "report", title: "R", body: { title: "R", content: { Abstract: { paragraphs: ["x"] } } }, basisRevision: doc.revision } });
    await sqlite.putProjectIntent({ owner, id: doc.id, intent: { deck: { id: "d", title: "T", slides: [] }, chrome: null, style: null } });
  });
  after(async () => {
    const pgStore = await import("../src/projects/store-postgres.js");
    await pgStore.closeProjectStore();
    await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => {});
    await maintenance.end();
    closeDb();
    await rm(scratch, { recursive: true, force: true });
  });

  test("a dry run copies nothing, --apply copies every V2 table, and the Postgres store reads it back", async () => {
    const dry = await copyProjectsToPostgres({ sqlitePath: process.env.FORGE_DB_PATH, url: target.href });
    assert.equal(dry.applied, false);
    const probe = new pg.Pool({ connectionString: target.href });
    assert.equal(Number((await probe.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = 'v2_projects'")).rows[0].n), 0, "a dry run leaves the target as it was");
    await probe.end();

    const out = await copyProjectsToPostgres({ sqlitePath: process.env.FORGE_DB_PATH, url: target.href, apply: true });
    const rows = Object.fromEntries(out.tables.map((t) => [t.table, t.copied]));
    for (const t of ["v2_projects", "v2_project_revisions", "v2_project_assets", "v2_project_files", "v2_project_layouts", "v2_project_documents", "v2_project_intents"]) assert.ok(rows[t] >= 1, `${t} copied`);

    process.env.FORGE_PROJECTS_DATABASE_URL = target.href;
    const pgStore = await import("../src/projects/store-postgres.js");
    await pgStore.__testReset();
    const moved = (await pgStore.getProject({ owner, id: doc.id })).doc;
    assert.deepEqual(moved.scenes, doc.scenes);
    assert.equal(moved.revision, doc.revision);
    const assets = await pgStore.getProjectAssets({ owner, id: doc.id, hashes: ["a".repeat(64)] });
    assert.deepEqual([...assets.get("a".repeat(64)).bytes], [0, 1, 254, 255], "image bytes survive the move");
    assert.equal((await pgStore.readProjectFile({ owner, id: doc.id, fileId: (await pgStore.listProjectFiles({ owner, id: doc.id })).files[0].id })).file.text, "Truth: 91 percent retention.");
    assert.equal((await pgStore.listProjectLayouts({ owner, id: doc.id })).layouts[0].name, "Mine");
    assert.equal((await pgStore.getProjectDocument({ owner, id: doc.id, documentId: "doc_1" })).document.body.content.Abstract.paragraphs[0], "x");
    assert.equal((await pgStore.getProjectIntent({ owner, id: doc.id })).intent.deck.title, "T");
  });

  test("a target that already holds projects is refused unless merging, and a merge adds nothing twice", async () => {
    await assert.rejects(copyProjectsToPostgres({ sqlitePath: process.env.FORGE_DB_PATH, url: target.href, apply: true }), { code: "target-not-empty" });
    const merged = await copyProjectsToPostgres({ sqlitePath: process.env.FORGE_DB_PATH, url: target.href, apply: true, merge: true });
    assert.equal(merged.tables.reduce((n, t) => n + t.copied, 0), 0);
  });
}
