// V2-6C multi-instance concurrency: independent connections and
// independent server processes against one shared database. The
// no-lost-update guarantee must come from the database (row locks +
// compare-and-swap), never from a per-process queue. Fails on
// 0ec8aa4 at import (postgres adapter + backend boundary are new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { contractScenes, bumped, ALICE, BOB } from "./v2-projects-contract-6c.js";

const MAINT_URL = process.env.TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:5544/postgres";
const DB_NAME = `forge_6c_conc_${Date.now().toString(36)}`;
const TEST_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const PORT_A = 5398;
const PORT_B = 5399;

let scratch = null;
let reachable = false;
let probeError = "";

async function maintQuery(text) {
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: MAINT_URL, connectionTimeoutMillis: 5000 });
  try {
    return await p.query(text);
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

async function spawnApi(port, cfgDir, dbFile, extraEnv = {}) {
  const { spawn } = await import("node:child_process");
  const ROOT = new URL("..", import.meta.url).pathname;
  const api = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, FORGE_API_PORT: String(port), FORGE_CONFIG_DIR: cfgDir, FORGE_DB_PATH: dbFile, FORGE_HOSTED: "0", ...extraEnv },
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

async function seedToken(dbFile, name, email) {
  const db = await import("../src/db.js");
  db.setDbPathForTest(dbFile);
  const auth = await import("../src/auth.js");
  const user = await auth.register({ name, email, password: "password-123" });
  const token = await auth.startSession(user);
  db.closeDb();
  return token;
}

if (!reachable) {
  describe("v2-6c multi-instance concurrency", () => {
    it("postgres unavailable — concurrency not executed", (t) => {
      t.skip(`no reachable postgres at TEST_PG_URL: ${probeError}`);
    });
  });
} else {
  let pg = null;
  let servers = [];
  let tokens = null;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "forge-6c-conc-"));
    await maintQuery(`CREATE DATABASE "${DB_NAME}"`);
    process.env.FORGE_PROJECTS_DATABASE_URL = TEST_URL;
    pg = await import("../src/projects/store-postgres.js");
    await pg.__testReset();
    const cfgA = path.join(scratch, "cfgA");
    const cfgB = path.join(scratch, "cfgB");
    await mkdir(cfgA, { recursive: true });
    await mkdir(cfgB, { recursive: true });
    const dbA = path.join(scratch, "a.db");
    const dbB = path.join(scratch, "b.db");
    const pgEnv = { FORGE_PROJECTS_BACKEND: "postgres", FORGE_PROJECTS_DATABASE_URL: TEST_URL };
    // Same owner email seeded independently per instance: the email
    // string is the owner key, so matching emails prove cross-
    // instance ownership without sharing auth state. Seeded
    // sequentially: the auth module holds one connection.
    const tokA = await seedToken(dbA, "Alice", ALICE);
    const tokB = await seedToken(dbB, "Alice", ALICE);
    const bobB = await seedToken(dbB, "Bob", BOB);
    tokens = { aliceA: tokA, aliceB: tokB, bobB };
    const { closeDb } = await import("../src/db.js");
    closeDb();
    servers = [
      await spawnApi(PORT_A, cfgA, dbA, pgEnv),
      await spawnApi(PORT_B, cfgB, dbB, pgEnv),
    ];
  });

  after(async () => {
    for (const api of servers) {
      try {
        api.kill();
      } catch { /* teardown only */ }
    }
    await new Promise((r) => setTimeout(r, 800));
    try {
      await pg.__testReset();
    } catch { /* teardown only */ }
    delete process.env.FORGE_PROJECTS_DATABASE_URL;
    if (scratch) {
      try {
        const { closeDb } = await import("../src/db.js");
        closeDb();
      } catch { /* teardown only */ }
      await rm(scratch, { recursive: true, force: true });
    }
    try {
      await maintQuery(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    } catch { /* teardown only */ }
  });

  describe("v2-6c two processes, one postgres", () => {
    it("same-base saves across instances yield one 200 and one 409", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X1", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [r1, r2] = await Promise.all([
        call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "a-wins") }),
        call(PORT_B, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "b-stale") }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
      const kept = await (await call(PORT_A, "GET", `/api/v2/projects/${id}`)).json();
      assert.equal(kept.project.revision, 1);
      const hist = await (await call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`)).json();
      assert.equal(hist.revisions.length, 2, "loser wrote no project or history data");
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("save versus rename across instances keeps one winner", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X2", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [r1, r2] = await Promise.all([
        call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "x") }),
        call(PORT_B, "PATCH", `/api/v2/projects/${id}`, null, { title: "Renamed", baseRevision: 0 }),
      ]);
      assert.equal([r1.status, r2.status].filter((x) => x === 409).length, 1);
      const hist = await (await call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`)).json();
      assert.equal(hist.revisions.length, 2);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("save versus restore across instances keeps one winner", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X3", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      await call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "x") });
      const [r1, r2] = await Promise.all([
        call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 1, scenes: bumped(s, "y") }),
        call(PORT_B, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0, baseRevision: 1 }),
      ]);
      const codes = [r1.status, r2.status].sort();
      assert.ok(codes.includes(409), `one side stale, got ${codes}`);
      const kept = await (await call(PORT_A, "GET", `/api/v2/projects/${id}`)).json();
      assert.equal(kept.project.revision, 2);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("restore versus restore across instances keeps one winner", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X4", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      await call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "x") });
      const [r1, r2] = await Promise.all([
        call(PORT_A, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0, baseRevision: 1 }),
        call(PORT_B, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 1, baseRevision: 1 }),
      ]);
      assert.equal([r1.status, r2.status].filter((x) => x === 409).length, 1);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("rename versus rename across instances keeps one winner", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X5", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [r1, r2] = await Promise.all([
        call(PORT_A, "PATCH", `/api/v2/projects/${id}`, null, { title: "R1", baseRevision: 0 }),
        call(PORT_B, "PATCH", `/api/v2/projects/${id}`, null, { title: "R2", baseRevision: 0 }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("delete during a concurrent save leaves exactly one consistent outcome", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X6", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [delRes, saveRes] = await Promise.all([
        call(PORT_B, "DELETE", `/api/v2/projects/${id}`),
        call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "x") }),
      ]);
      const getRes = await call(PORT_A, "GET", `/api/v2/projects/${id}`);
      if (getRes.status === 404) {
        assert.equal(delRes.status, 200, "deleted — the save lost or landed first and was removed");
      } else {
        const kept = await getRes.json();
        assert.equal(kept.project.revision, 1);
        const hist = await (await call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`)).json();
        assert.equal(hist.revisions.length, 2, "saved — history matches the surviving revision");
        await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
      }
      assert.ok(saveRes.status === 200 || saveRes.status === 404, `save either won or met a missing row, got ${saveRes.status}`);
    });

    it("history initialization racing with saves yields one baseline", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X7", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      await pg.__testQuery("DELETE FROM v2_project_revisions WHERE project_id=$1", [id]);
      const lists = await Promise.all([
        call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`),
        call(PORT_B, "GET", `/api/v2/projects/${id}/revisions`),
        call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`),
        call(PORT_B, "GET", `/api/v2/projects/${id}/revisions`),
      ]);
      for (const r of lists) {
        const body = await r.json();
        assert.equal(body.revisions.length, 1);
        assert.equal(body.revisions[0].kind, "baseline");
      }
      const count = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [id]);
      assert.equal(Number(count.rows[0].n), 1, "ON CONFLICT deduplicated the racing baselines");
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("concurrent mixed mutations keep prune accounting exact", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", null, { title: "X8", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [a, b, c] = await Promise.all([
        call(PORT_A, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "a") }),
        call(PORT_B, "PATCH", `/api/v2/projects/${id}`, null, { title: "B", baseRevision: 0 }),
        call(PORT_A, "POST", `/api/v2/projects/${id}/restore`, null, { revision: 0, baseRevision: 0 }),
      ]);
      assert.equal([a.status, b.status, c.status].filter((x) => x === 409).length, 2, "exactly one winner under triple contention");
      const kept = await (await call(PORT_A, "GET", `/api/v2/projects/${id}`)).json();
      assert.equal(kept.project.revision, 1);
      const hist = await (await call(PORT_A, "GET", `/api/v2/projects/${id}/revisions`)).json();
      assert.equal(hist.revisions.length, 2);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });

    it("same owner email works across instances; cross-owner denied", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_A, "POST", "/api/v2/projects", tokens.aliceA, { title: "Owned", scenes: structuredClone(s) })).json();
      assert.equal(made.ok, true);
      const id = made.project.id;
      // Same email, other instance: full access.
      const viaB = await (await call(PORT_B, "GET", `/api/v2/projects/${id}`, tokens.aliceB)).json();
      assert.equal(viaB.ok, true);
      const savedB = await (await call(PORT_B, "PUT", `/api/v2/projects/${id}`, tokens.aliceB, { baseRevision: 0, scenes: bumped(s, "b-side") })).json();
      assert.equal(savedB.ok, true);
      assert.equal(savedB.project.revision, 1);
      // Different owner, other instance: nothing leaks, nothing changes.
      assert.equal((await call(PORT_B, "GET", `/api/v2/projects/${id}`, tokens.bobB)).status, 404);
      assert.equal((await call(PORT_B, "GET", `/api/v2/projects/${id}/revisions`, tokens.bobB)).status, 404);
      assert.equal((await call(PORT_B, "POST", `/api/v2/projects/${id}/restore`, tokens.bobB, { revision: 0, baseRevision: 1 })).status, 404);
      const kept = await (await call(PORT_A, "GET", `/api/v2/projects/${id}`, tokens.aliceA)).json();
      assert.equal(kept.project.revision, 1);
      await call(PORT_A, "DELETE", `/api/v2/projects/${id}`, tokens.aliceA);
    });

    it("rapid creates mint distinct ids across instances", async () => {
      const s = await contractScenes();
      const makes = [];
      for (let i = 0; i < 10; i++) {
        makes.push(call(i % 2 ? PORT_A : PORT_B, "POST", "/api/v2/projects", null, { title: `Bulk ${i}`, scenes: structuredClone(s) }).then((r) => r.json()));
      }
      const docs = await Promise.all(makes);
      const ids = docs.map((d) => d.project.id);
      assert.equal(new Set(ids).size, 10);
      for (const id of ids) await call(PORT_A, "DELETE", `/api/v2/projects/${id}`);
    });
  });

  describe("v2-6c two processes, one sqlite file", () => {
    // The SQLite correctness boundary is BEGIN IMMEDIATE plus the
    // compare-and-swap UPDATE — both file-level, both cross-process.
    // The JS lane is a per-process accommodation for the single
    // open transaction, never the thing that prevents lost updates.
    const PORT_C = 5401;
    const PORT_D = 5402;
    let pair = [];
    let sharedFile = null;

    before(async () => {
      sharedFile = path.join(scratch, "shared.db");
      const cfgC = path.join(scratch, "cfgC");
      const cfgD = path.join(scratch, "cfgD");
      await mkdir(cfgC, { recursive: true });
      await mkdir(cfgD, { recursive: true });
      pair = [
        await spawnApi(PORT_C, cfgC, sharedFile, { FORGE_PROJECTS_BACKEND: "sqlite" }),
        await spawnApi(PORT_D, cfgD, sharedFile, { FORGE_PROJECTS_BACKEND: "sqlite" }),
      ];
    });

    after(async () => {
      for (const api of pair) {
        try {
          api.kill();
        } catch { /* teardown only */ }
      }
      await new Promise((r) => setTimeout(r, 800));
    });

    it("same-base saves across sqlite processes yield one 200 and one 409", async () => {
      const s = await contractScenes();
      const made = await (await call(PORT_C, "POST", "/api/v2/projects", null, { title: "Shared", scenes: structuredClone(s) })).json();
      const id = made.project.id;
      const [r1, r2] = await Promise.all([
        call(PORT_C, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "c-wins") }),
        call(PORT_D, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 0, scenes: bumped(s, "d-stale") }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
      const kept = await (await call(PORT_C, "GET", `/api/v2/projects/${id}`)).json();
      assert.equal(kept.project.revision, 1);
      await call(PORT_C, "DELETE", `/api/v2/projects/${id}`);
    });
  });
}
