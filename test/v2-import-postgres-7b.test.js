import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";
import YAML from "yaml";
import { IMPORT_DECK } from "./v2-import-fixture.js";

const maintenance = process.env.TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:5544/postgres";
const database = `forge_7b_import_${process.pid}_${Date.now().toString(36)}`;
const url = new URL(maintenance); url.pathname = `/${database}`;
const exec = promisify(execFile);
const maint = new Pool({ connectionString: maintenance, connectionTimeoutMillis: 3000 });
let reachable = false;
try { await maint.query("SELECT 1"); reachable = true; } catch { await maint.end(); }

if (!reachable) {
  test("PostgreSQL import contracts unavailable — not executed", t => t.skip("no dedicated PostgreSQL test service"));
} else {
  let scratch, store, importer, serial = 0;
  before(async () => {
    await maint.query(`CREATE DATABASE "${database}"`);
    scratch = await mkdtemp(path.join(tmpdir(), "forge-import-pg-"));
    process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
    process.env.FORGE_DB_PATH = path.join(scratch, "auth.db");
    process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
    process.env.FORGE_HOSTED = "0";
    process.env.FORGE_PROJECTS_BACKEND = "postgres";
    process.env.FORGE_PROJECTS_DATABASE_URL = url.href;
    process.env.FORGE_PROJECTS_PG_POOL_MAX = "4";
    store = await import("../src/projects/store-postgres.js");
    importer = (await import("../src/projects/import-generated.js")).importGeneratedProject;
  });
  after(async () => {
    await store?.closeProjectStore();
    await maint.query(`DROP DATABASE IF EXISTS "${database}"`);
    await maint.end();
    if (scratch) await rm(scratch, { recursive: true, force: true });
  });
  async function source() {
    const slug = `pg-source-${++serial}`, dir = path.join(process.env.FORGE_DECKS_DIR, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(IMPORT_DECK));
    await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ status: "ready" }));
    return { slug, dir, requestId: "request-one", principal: null, localOperator: true };
  }
  const count = async table => Number((await store.__testQuery(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);

  test("cold cross-process creation races initialize safely and commit one project/history/receipt", async () => {
    const args = await source();
    const commands = Array.from({ length: 4 }, () => exec(process.execPath, ["src/projects/import-cli.js", args.slug, "--request-id", args.requestId], { env: { ...process.env, FORGE_IMPORT_TOKEN: "" }, timeout: 30000 }));
    const results = (await Promise.all(commands)).map(result => JSON.parse(result.stdout));
    assert.equal(new Set(results.map(result => result.project.id)).size, 1);
    assert.equal(results.filter(result => !result.reused).length, 1);
    assert.equal(await count("v2_projects"), 1);
    assert.equal(await count("v2_project_revisions"), 1);
    assert.equal(await count("v2_project_imports"), 1);
  });

  test("same-process concurrent imports return one current project without extra history", async () => {
    const args = await source();
    const results = await Promise.all(Array.from({ length: 6 }, () => importer(args)));
    assert.equal(new Set(results.map(result => result.project.id)).size, 1);
    const created = results[0].project;
    assert.equal((await store.listRevisions({ owner: null, id: created.id })).revisions.length, 1);
    await store.renameProject({ owner: null, id: created.id, baseRevision: 0, title: "Human PG title" });
    const replay = await importer(args);
    assert.equal(replay.reused, true); assert.equal(replay.project.title, "Human PG title");
    assert.equal(replay.project.revision, 1); assert.equal(replay.timings.compileMs, undefined);
  });

  test("changed sources, deleted targets and owner mismatches refuse without overwrites", async () => {
    const args = await source(); const first = await importer(args);
    await assert.rejects(importer({ ...args, principal: { email: "other@example.test" }, localOperator: false }), { code: "not-found" });
    await writeFile(path.join(args.dir, "deck.yaml"), YAML.stringify({ ...IMPORT_DECK, title: "Changed" }));
    await assert.rejects(importer(args), { code: "import-source-changed" });
    const next = await importer({ ...args, requestId: "request-two" });
    assert.notEqual(next.project.id, first.project.id);
    await store.deleteProject({ owner: null, id: next.project.id });
    await assert.rejects(importer({ ...args, requestId: "request-two" }), { code: "import-target-deleted" });
  });

  test("a history trigger fault rolls back reservation and project; retry can create", async () => {
    const args = await source();
    const before = await Promise.all([count("v2_projects"), count("v2_project_imports")]);
    await store.__testQuery("CREATE FUNCTION fail_import_history() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'import history fault'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER fail_import_history BEFORE INSERT ON v2_project_revisions FOR EACH ROW EXECUTE FUNCTION fail_import_history()");
    try { await assert.rejects(importer(args), { code: "storage-unavailable" }); }
    finally { await store.__testQuery("DROP TRIGGER fail_import_history ON v2_project_revisions; DROP FUNCTION fail_import_history()"); }
    assert.deepEqual(await Promise.all([count("v2_projects"), count("v2_project_imports")]), before);
    assert.equal((await importer(args)).reused, false);
  });

  test("a lost response and pool restart replay the committed current project", async () => {
    const args = await source(); const original = await importer(args);
    await store.closeProjectStore();
    const result = await importer(args);
    assert.equal(result.reused, true); assert.deepEqual(result.project, original.project);
  });

  test("a terminated backend during history insertion rolls back every creation row", async () => {
    const args = await source();
    const before = await Promise.all([count("v2_projects"), count("v2_project_imports")]);
    await store.__testQuery("CREATE FUNCTION delay_import_history() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(10); RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER delay_import_history BEFORE INSERT ON v2_project_revisions FOR EACH ROW EXECUTE FUNCTION delay_import_history()");
    const pending = importer(args).then(() => null, error => error);
    try {
      let pid = null;
      const deadline = Date.now() + 5000;
      while (!pid && Date.now() < deadline) {
        const result = await maint.query("SELECT pid FROM pg_stat_activity WHERE datname=$1 AND state='active' AND query LIKE 'INSERT INTO v2_project_revisions%'", [database]);
        pid = result.rows[0]?.pid;
        if (!pid) await new Promise(resolve => setTimeout(resolve, 30));
      }
      assert.ok(pid, "owned import history writer was observed");
      await maint.query("SELECT pg_terminate_backend($1)", [pid]);
      assert.equal((await pending)?.code, "storage-unavailable");
    } finally { await store.__testQuery("DROP TRIGGER delay_import_history ON v2_project_revisions; DROP FUNCTION delay_import_history()"); }
    assert.deepEqual(await Promise.all([count("v2_projects"), count("v2_project_imports")]), before);
    assert.equal((await importer(args)).reused, false);
  });
}
