// V2-6C fault injection against PostgreSQL: failures during any
// transaction phase must roll back fully and never report "Saved".
// The last confirmed version stays recoverable throughout. Fails on
// 0ec8aa4 at import (postgres adapter is new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { contractScenes, bumped } from "./v2-projects-contract-6c.js";

const MAINT_URL = process.env.TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:5544/postgres";
const DB_NAME = `forge_6c_fault_${Date.now().toString(36)}`;
const TEST_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const FAULT_PORT = 5403;

let scratch = null;
let reachable = false;
let probeError = "";
let prevUrl = process.env.FORGE_PROJECTS_DATABASE_URL ?? null;
let prevPoolMax = process.env.FORGE_PROJECTS_PG_POOL_MAX ?? null;
let prevBackend = process.env.FORGE_PROJECTS_BACKEND ?? null;

async function maintQuery(text, params = []) {
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: MAINT_URL, connectionTimeoutMillis: 5000 });
  try {
    return await p.query(text, params);
  } finally {
    await p.end();
  }
}

try {
  await maintQuery("SELECT 1");
  reachable = true;
} catch (err) {
  probeError = String(err?.message ?? err).slice(0, 160);
}

async function useTestDb() {
  process.env.FORGE_PROJECTS_DATABASE_URL = TEST_URL;
  const pg = await import("../src/projects/store-postgres.js");
  await pg.__testReset();
  return pg;
}

if (!reachable) {
  describe("v2-6c fault injection", () => {
    it("postgres unavailable — faults not executed", (t) => {
      t.skip(`no reachable postgres at TEST_PG_URL: ${probeError}`);
    });
  });
} else {
  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "forge-6c-fault-"));
    await maintQuery(`CREATE DATABASE "${DB_NAME}"`);
    await useTestDb();
  });

  after(async () => {
    try {
      const pg = await import("../src/projects/store-postgres.js");
      await pg.__testReset();
    } catch { /* teardown only */ }
    if (prevUrl === null) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = prevUrl;
    if (prevPoolMax === null) delete process.env.FORGE_PROJECTS_PG_POOL_MAX;
    else process.env.FORGE_PROJECTS_PG_POOL_MAX = prevPoolMax;
    if (prevBackend === null) delete process.env.FORGE_PROJECTS_BACKEND;
    else process.env.FORGE_PROJECTS_BACKEND = prevBackend;
    if (scratch) await rm(scratch, { recursive: true, force: true });
    try {
      await maintQuery(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    } catch { /* teardown only */ }
  });

  describe("v2-6c transaction faults", () => {
    it("terminated backend mid-transaction rolls back with nothing saved", async () => {
      const pg = await useTestDb();
      const s = await contractScenes();
      const { doc: created } = await pg.createProject({ owner: null, title: "Kill", scenes: structuredClone(s) });
      // Independent locker holds the row lock in an open transaction.
      const { Pool } = await import("pg");
      const lockerPool = new Pool({ connectionString: TEST_URL });
      const locker = await lockerPool.connect();
      await locker.query("BEGIN");
      await locker.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [created.id]);
      const saver = pg.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "doomed") });
      // The saver is now blocked on the row lock: terminate it.
      let saverPid = null;
      for (let i = 0; i < 50 && !saverPid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const found = await locker.query(
          "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND query LIKE '%FOR UPDATE%' AND pid <> pg_backend_pid()",
        );
        if (found.rows.length > 0) saverPid = found.rows[0].pid;
      }
      assert.ok(saverPid, "saver backend visible and blocked");
      await locker.query("SELECT pg_terminate_backend($1)", [saverPid]);
      await assert.rejects(saver, /storage unavailable/);
      await locker.query("ROLLBACK");
      locker.release();
      await lockerPool.end();
      // Pool recovered; last confirmed version intact and recoverable.
      const kept = (await pg.getProject({ owner: null, id: created.id })).doc;
      assert.equal(kept.revision, 0);
      assert.deepEqual(kept.scenes, s);
      const listed = await pg.listRevisions({ owner: null, id: created.id });
      assert.equal(listed.revisions.length, 1);
      await pg.deleteProject({ owner: null, id: created.id });
    });

    it("history-insert failure rolls back the project write", async () => {
      const pg = await useTestDb();
      const s = await contractScenes();
      const { doc: created } = await pg.createProject({ owner: null, title: "HistFail", scenes: structuredClone(s) });
      await pg.__testQuery(`CREATE OR REPLACE FUNCTION v2_fail_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected history failure'; END; $$ LANGUAGE plpgsql`);
      await pg.__testQuery(`CREATE TRIGGER v2_rev_fail BEFORE INSERT ON v2_project_revisions FOR EACH ROW WHEN (NEW.project_id = '${created.id}') EXECUTE FUNCTION v2_fail_insert()`);
      try {
        await assert.rejects(
          pg.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "x") }),
          /storage unavailable/,
        );
        const kept = (await pg.getProject({ owner: null, id: created.id })).doc;
        assert.equal(kept.revision, 0, "project row rolled back with the history row");
        assert.deepEqual(kept.scenes, s);
        const count = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [created.id]);
        assert.equal(Number(count.rows[0].n), 1, "no partial history row");
      } finally {
        await pg.__testQuery("DROP TRIGGER IF EXISTS v2_rev_fail ON v2_project_revisions");
        await pg.__testQuery("DROP FUNCTION IF EXISTS v2_fail_insert()");
      }
      await pg.deleteProject({ owner: null, id: created.id });
    });

    it("prune failure rolls back the whole save", async () => {
      const pg = await useTestDb();
      const s = await contractScenes();
      const { doc: created } = await pg.createProject({ owner: null, title: "PruneFail", scenes: structuredClone(s) });
      for (let i = 1; i <= 21; i++) {
        await pg.saveProject({ owner: null, id: created.id, baseRevision: i - 1, scenes: bumped(s, `p${i}`) });
      }
      await pg.__testQuery(`CREATE OR REPLACE FUNCTION v2_fail_prune() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected prune failure'; END; $$ LANGUAGE plpgsql`);
      await pg.__testQuery("CREATE TRIGGER v2_prune_fail BEFORE UPDATE ON v2_project_revisions FOR EACH ROW WHEN (OLD.payload IS NOT NULL AND NEW.payload IS NULL) EXECUTE FUNCTION v2_fail_prune()");
      try {
        await assert.rejects(
          pg.saveProject({ owner: null, id: created.id, baseRevision: 21, scenes: bumped(s, "p22") }),
          /storage unavailable/,
        );
        const kept = (await pg.getProject({ owner: null, id: created.id })).doc;
        assert.equal(kept.revision, 21, "failed prune left the stored revision alone");
        const count = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [created.id]);
        assert.equal(Number(count.rows[0].n), 22, "no half-pruned history");
      } finally {
        await pg.__testQuery("DROP TRIGGER IF EXISTS v2_prune_fail ON v2_project_revisions");
        await pg.__testQuery("DROP FUNCTION IF EXISTS v2_fail_prune()");
      }
      await pg.deleteProject({ owner: null, id: created.id });
    });

    it("unreachable database reports storage-unavailable and never saved", async () => {
      process.env.FORGE_PROJECTS_DATABASE_URL = "postgres://postgres:probe@127.0.0.1:5599/nodb";
      const pg = await import("../src/projects/store-postgres.js");
      await pg.__testReset();
      try {
        const s = await contractScenes();
        await assert.rejects(pg.createProject({ owner: null, title: "Down", scenes: structuredClone(s) }), /storage unavailable/);
        await assert.rejects(pg.getProject({ owner: null, id: "p-abcdef0123456789abcdef" }), /storage unavailable/);
      } finally {
        await useTestDb();
      }
    });

    it("pool exhaustion fails loudly instead of hanging or half-writing", async () => {
      process.env.FORGE_PROJECTS_PG_POOL_MAX = "1";
      const pg = await useTestDb();
      const s = await contractScenes();
      const { doc: created } = await pg.createProject({ owner: null, title: "Pool", scenes: structuredClone(s) });
      const { Pool } = await import("pg");
      const lockerPool = new Pool({ connectionString: TEST_URL, max: 5 });
      const locker = await lockerPool.connect();
      await locker.query("BEGIN");
      await locker.query("SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE", [created.id]);
      try {
        // First save occupies the pool's only slot, blocked on the
        // row lock; the second save must time out loudly.
        const first = pg.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "first") });
        await new Promise((r) => setTimeout(r, 500));
        await assert.rejects(
          pg.saveProject({ owner: null, id: created.id, baseRevision: 0, scenes: bumped(s, "second") }),
          /storage unavailable/,
          "exhausted pool refuses instead of queuing forever",
        );
        await locker.query("ROLLBACK");
        const won = await first;
        assert.equal(won.status, "saved");
        assert.equal(won.doc.revision, 1);
      } finally {
        try {
          locker.release();
        } catch { /* already released */ }
        await lockerPool.end();
        delete process.env.FORGE_PROJECTS_PG_POOL_MAX;
        await pg.__testReset();
      }
      await pg.deleteProject({ owner: null, id: created.id });
    });

    it("killed writer processes leave consistent history", async () => {
      const pg = await useTestDb();
      const { spawn } = await import("node:child_process");
      const ROOT = new URL("..", import.meta.url).pathname;
      const s = await contractScenes();
      const { doc: created } = await pg.createProject({ owner: null, title: "Victim", scenes: structuredClone(s) });
      const worker = spawn("node", ["--input-type=module", "-e", `
        const pg = await import(${JSON.stringify(ROOT + "src/projects/store-postgres.js")});
        const scenes = ${JSON.stringify(bumped(s, "worker")).replace(/</g, "\\u003c")};
        for (let i = 0; ; i++) {
          const cur = await pg.getProject({ owner: null, id: ${JSON.stringify(created.id)} });
          if (!cur.doc) break;
          await pg.saveProject({ owner: null, id: ${JSON.stringify(created.id)}, baseRevision: cur.doc.revision, scenes }).catch(() => {});
        }
      `], {
        cwd: ROOT,
        env: { ...process.env, FORGE_PROJECTS_DATABASE_URL: TEST_URL },
        stdio: "ignore",
      });
      await new Promise((r) => setTimeout(r, 1500));
      worker.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 500));
      const kept = (await pg.getProject({ owner: null, id: created.id })).doc;
      assert.ok(kept, "project survives a killed writer");
      const { validateProjectDocument } = await import("../packages/projects/document.js");
      assert.equal((await validateProjectDocument(kept)).ok, true);
      const count = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [created.id]);
      assert.equal(Number(count.rows[0].n), kept.revision + 1, "one history row per committed revision, no partials");
      const rows = await pg.__testQuery("SELECT payload FROM v2_project_revisions WHERE project_id=$1 AND payload IS NOT NULL", [created.id]);
      for (const r of rows.rows) {
        const verdict = await (await import("../packages/projects/document.js")).validateProjectDocument(JSON.parse(r.payload));
        assert.equal(verdict.ok, true, "every retained payload validates");
      }
      await pg.deleteProject({ owner: null, id: created.id });
    });
  });

  describe("v2-6c misconfiguration over HTTP", () => {
    let api = null;

    after(async () => {
      if (api) {
        api.kill();
        await new Promise((r) => setTimeout(r, 800));
      }
    });

    it("postgres selected without a URL answers 503 honestly, never sqlite", async () => {
      const { spawn } = await import("node:child_process");
      const ROOT = new URL("..", import.meta.url).pathname;
      const cfg = path.join(scratch, "misconfig");
      await mkdir(cfg, { recursive: true });
      // The child must not inherit this file's test-database URL:
      // without it the server has no store, which is the case under
      // test. Restored once the server reports listening.
      delete process.env.FORGE_PROJECTS_DATABASE_URL;
      api = spawn("node", ["app/server/index.js"], {
        cwd: ROOT,
        env: {
          ...process.env,
          FORGE_API_PORT: String(FAULT_PORT),
          FORGE_CONFIG_DIR: cfg,
          FORGE_DB_PATH: path.join(scratch, "misconfig.db"),
          FORGE_HOSTED: "0",
          FORGE_PROJECTS_BACKEND: "postgres",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      delete process.env.FORGE_PROJECTS_DATABASE_URL;
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("api never reported listening")), 20000);
        const onData = (d) => {
          if (String(d).includes(`localhost:${FAULT_PORT}`)) {
            clearTimeout(t);
            resolve(true);
          }
        };
        api.stdout.on("data", onData);
        api.stderr.on("data", onData);
      });
      // Restore the test database URL for later suites in this file.
      process.env.FORGE_PROJECTS_DATABASE_URL = TEST_URL;
      const check = async (method, p, body) => {
        const res = await fetch(`http://127.0.0.1:${FAULT_PORT}${p}`, {
          method,
          headers: body !== undefined ? { "Content-Type": "application/json" } : {},
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      };
      // NOTE: the spawned server inherited the env above (no URL),
      // so every project route must refuse as misconfigured.
      const list = await check("GET", "/api/v2/projects");
      assert.equal(list.status, 503);
      assert.equal(list.body.code, "store-misconfigured");
      const get = await check("GET", "/api/v2/projects/p-abcdef0123456789abcdef");
      assert.equal(get.status, 503);
      const { contractScenes } = await import("./v2-projects-contract-6c.js");
      const s = await contractScenes();
      const create = await check("POST", "/api/v2/projects", { title: "X", scenes: structuredClone(s) });
      assert.equal(create.status, 503);
      assert.equal(create.body.code, "store-misconfigured");
      assert.match(create.body.error, /not configured/, "honest status, no silent sqlite fallback");
    });

    it("aborted HTTP saves leave consistent history", async () => {
      const { spawn } = await import("node:child_process");
      const ROOT = new URL("..", import.meta.url).pathname;
      const cfg = path.join(scratch, "abortcfg");
      await mkdir(cfg, { recursive: true });
      const srv = spawn("node", ["app/server/index.js"], {
        cwd: ROOT,
        env: {
          ...process.env,
          FORGE_API_PORT: String(FAULT_PORT + 1),
          FORGE_CONFIG_DIR: cfg,
          FORGE_DB_PATH: path.join(scratch, "abort.db"),
          FORGE_HOSTED: "0",
          FORGE_PROJECTS_BACKEND: "postgres",
          FORGE_PROJECTS_DATABASE_URL: TEST_URL,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("api never reported listening")), 20000);
          const onData = (d) => {
            if (String(d).includes(`localhost:${FAULT_PORT + 1}`)) {
              clearTimeout(t);
              resolve(true);
            }
          };
          srv.stdout.on("data", onData);
          srv.stderr.on("data", onData);
        });
        const pg = await useTestDb();
        const s = await contractScenes();
        const made = await (await fetch(`http://127.0.0.1:${FAULT_PORT + 1}/api/v2/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Abort", scenes: structuredClone(s) }),
        })).json();
        const id = made.project.id;
        // Fire a save and destroy the socket immediately: the server
        // must commit or roll back atomically either way.
        await new Promise((resolve) => {
          const req = http.request({
            host: "127.0.0.1",
            port: FAULT_PORT + 1,
            path: `/api/v2/projects/${id}`,
            method: "PUT",
            headers: { "Content-Type": "application/json" },
          });
          req.on("error", () => resolve(true));
          req.write(JSON.stringify({ baseRevision: 0, scenes: bumped(s, "aborted?") }));
          setTimeout(() => {
            req.destroy();
            resolve(true);
          }, 20);
        });
        await new Promise((r) => setTimeout(r, 1500));
        const kept = (await pg.getProject({ owner: null, id })).doc;
        assert.ok(kept.revision === 0 || kept.revision === 1, "at most one outcome committed");
        const count = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [id]);
        assert.equal(Number(count.rows[0].n), kept.revision + 1, "history matches the committed revision");
        await pg.deleteProject({ owner: null, id });
      } finally {
        srv.kill();
        await new Promise((r) => setTimeout(r, 800));
      }
    });
  });
}
