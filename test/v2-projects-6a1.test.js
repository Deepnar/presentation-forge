// V2-6A-1 corrections: C1 owner-isolation and C2 revision-safe rename.
// Store matrix over alice/bob/null/admin, rename preconditions and
// races, plus real-HTTP hosted/local isolation with seeded sessions.
// Fail-first on a5fa83b: cross-owner reads succeed there (C1) and
// same-base renames both commit (C2).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateScene } from "../packages/model/scene.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

const ALICE = "alice@example.test";
const BOB = "bob@example.test";

let scratch = null;
let storeDb = null;
let httpDb = null;
let httpCfg = null;

async function scenes() {
  const design = await warmDesign();
  return compileDeck(sampleDeckIntent(), design);
}

async function useDb(file) {
  const { setDbPathForTest } = await import("../src/db.js");
  setDbPathForTest(file);
}

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "forge-6a1-"));
  storeDb = path.join(scratch, "store.db");
  httpDb = path.join(scratch, "http.db");
  httpCfg = path.join(scratch, "httpcfg");
  await mkdir(httpCfg, { recursive: true });
  process.env.FORGE_DB_PATH = storeDb;
});

after(async () => {
  try {
    const { closeDb } = await import("../src/db.js");
    closeDb();
  } catch { /* teardown only */ }
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

describe("v2-6a1 C1 owner isolation at the store boundary", () => {
  let A = null;
  let B = null;
  let L = null;

  before(async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    A = (await store.createProject({ owner: ALICE, title: "Alice deck", scenes: structuredClone(s) })).doc;
    B = (await store.createProject({ owner: BOB, title: "Bob deck", scenes: structuredClone(s) })).doc;
    L = (await store.createProject({ owner: null, title: "Local deck", scenes: structuredClone(s) })).doc;
  });

  it("the canonical predicate matches ownership exactly", async () => {
    const { canAccessProject } = await import("../src/projects/store.js");
    assert.equal(canAccessProject({ owner: ALICE }, { owner: ALICE }), true);
    assert.equal(canAccessProject({ owner: null }, { owner: null }), true);
    assert.equal(canAccessProject({ owner: null }, { owner: ALICE }), false);
    assert.equal(canAccessProject({ owner: ALICE }, { owner: null }), false);
    assert.equal(canAccessProject({ owner: BOB }, { owner: ALICE }), false);
    assert.equal(canAccessProject({ owner: BOB }, { owner: null }), false);
    assert.equal(canAccessProject({ owner: BOB }, { owner: ALICE, admin: true }), true);
    assert.equal(canAccessProject({ owner: null }, { owner: BOB, admin: true }), true);
  });

  it("reads cross no boundary, including into ownerless rows", async () => {
    const store = await import("../src/projects/store.js");
    assert.equal((await store.getProject({ owner: ALICE, id: A.id })).doc?.id, A.id);
    assert.equal((await store.getProject({ owner: BOB, id: B.id })).doc?.id, B.id);
    assert.equal((await store.getProject({ owner: null, id: L.id })).doc?.id, L.id);
    assert.equal((await store.getProject({ owner: ALICE, id: B.id })).doc, null);
    assert.equal((await store.getProject({ owner: BOB, id: A.id })).doc, null);
    assert.equal((await store.getProject({ owner: ALICE, id: L.id })).doc, null);
    assert.equal((await store.getProject({ owner: BOB, id: L.id })).doc, null);
    assert.equal((await store.getProject({ owner: null, id: A.id })).doc, null);
    assert.equal((await store.getProject({ owner: null, id: B.id })).doc, null);
    assert.equal((await store.getProject({ owner: ALICE, id: A.id, admin: true })).doc?.id, A.id);
    assert.equal((await store.getProject({ owner: ALICE, id: B.id, admin: true })).doc?.id, B.id);
    assert.equal((await store.getProject({ owner: ALICE, id: L.id, admin: true })).doc?.id, L.id);
  });

  it("lists leak no foreign rows", async () => {
    const store = await import("../src/projects/store.js");
    const ids = (ps) => ps.map((p) => p.id).sort();
    assert.deepEqual(ids((await store.listProjects({ owner: ALICE })).projects), [A.id]);
    assert.deepEqual(ids((await store.listProjects({ owner: BOB })).projects), [B.id]);
    assert.deepEqual(ids((await store.listProjects({ owner: null })).projects), [L.id]);
    assert.deepEqual(ids((await store.listProjects({ owner: ALICE, admin: true })).projects), [A.id, B.id, L.id].sort());
  });

  it("writes cross no boundary and change nothing", async () => {
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const beforeB = (await store.getProject({ owner: BOB, id: B.id })).doc;
    await assert.rejects(
      store.saveProject({ owner: ALICE, id: B.id, baseRevision: 0, scenes: structuredClone(s) }),
      /no such project/,
    );
    await assert.rejects(
      store.renameProject({ owner: ALICE, id: B.id, baseRevision: 0, title: "Taken" }),
      /no such project/,
    );
    assert.equal((await store.deleteProject({ owner: ALICE, id: B.id })).removed, false);
    const afterB = (await store.getProject({ owner: BOB, id: B.id })).doc;
    assert.deepEqual(afterB, beforeB);
    // Ownerless rows are not public either: Alice's writes fail there too.
    await assert.rejects(
      store.saveProject({ owner: ALICE, id: L.id, baseRevision: 0, scenes: structuredClone(s) }),
      /no such project/,
    );
    await assert.rejects(
      store.renameProject({ owner: BOB, id: L.id, baseRevision: 0, title: "Taken" }),
      /no such project/,
    );
    assert.equal((await store.deleteProject({ owner: BOB, id: L.id })).removed, false);
    const afterL = (await store.getProject({ owner: null, id: L.id })).doc;
    assert.equal(afterL.title, "Local deck");
    assert.equal(afterL.revision, 0);
  });
});

describe("v2-6a1 C2 revision-safe rename", () => {
  it("rename requires a well-formed base revision and changes nothing otherwise", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: ALICE, title: "Rename target", scenes: await scenes() });
    for (const bad of [undefined, null, -1, 1.5, "0", NaN, {}, []]) {
      await assert.rejects(
        store.renameProject({ owner: ALICE, id: created.id, baseRevision: bad, title: "X" }),
        /baseRevision must be/,
      );
    }
    const kept = (await store.getProject({ owner: ALICE, id: created.id })).doc;
    assert.equal(kept.title, "Rename target");
    assert.equal(kept.revision, 0);
    await assert.rejects(
      store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "   " }),
      /title must be/,
    );
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("stale rename loses without touching title, scenes, or revision", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: ALICE, title: "Original", scenes: structuredClone(s) });
    const first = await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "First wins" });
    assert.equal(first.status, "saved");
    assert.equal(first.doc.revision, 1);
    const stale = await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "Second stale" });
    assert.equal(stale.status, "stale");
    assert.equal(stale.expected, 1);
    assert.equal(stale.actual, 0);
    const kept = (await store.getProject({ owner: ALICE, id: created.id })).doc;
    assert.equal(kept.title, "First wins");
    assert.equal(kept.revision, 1);
    assert.deepEqual(kept.scenes, s);
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("identical title is a documented no-op without advancing", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: ALICE, title: "Same", scenes: await scenes() });
    const out = await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "Same" });
    assert.equal(out.status, "noop");
    assert.equal(out.doc.revision, 0);
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("a successful rename advances exactly once and preserves scenes", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: ALICE, title: "Before", scenes: structuredClone(s) });
    const out = await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "After" });
    assert.equal(out.status, "saved");
    assert.equal(out.doc.title, "After");
    assert.equal(out.doc.revision, 1);
    assert.deepEqual(out.doc.scenes, s);
    for (const scene of out.doc.scenes) assert.equal((await validateScene(scene)).ok, true);
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("concurrent same-base renames yield one winner and one stale", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: ALICE, title: "Race", scenes: await scenes() });
    const [r1, r2] = await Promise.all([
      store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "R1" }),
      store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "R2" }),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), ["saved", "stale"]);
    const kept = (await store.getProject({ owner: ALICE, id: created.id })).doc;
    assert.equal(kept.revision, 1);
    assert.ok(kept.title === "R1" || kept.title === "R2");
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("rename-then-stale-save keeps the new title and old scenes", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: ALICE, title: "T", scenes: structuredClone(s) });
    await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "Renamed" });
    const edited = structuredClone(s);
    edited[0] = { ...edited[0], elements: [...edited[0].elements] };
    const stale = await store.saveProject({ owner: ALICE, id: created.id, baseRevision: 0, scenes: edited });
    assert.equal(stale.status, "stale");
    const kept = (await store.getProject({ owner: ALICE, id: created.id })).doc;
    assert.equal(kept.title, "Renamed");
    assert.equal(kept.revision, 1);
    assert.deepEqual(kept.scenes, s);
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("save-then-stale-rename keeps the saved title and scenes", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const s = await scenes();
    const { doc: created } = await store.createProject({ owner: ALICE, title: "T", scenes: structuredClone(s) });
    const saved = await store.saveProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "Saved title", scenes: structuredClone(s) });
    assert.equal(saved.status, "saved");
    const stale = await store.renameProject({ owner: ALICE, id: created.id, baseRevision: 0, title: "Stale rename" });
    assert.equal(stale.status, "stale");
    const kept = (await store.getProject({ owner: ALICE, id: created.id })).doc;
    assert.equal(kept.title, "Saved title");
    assert.equal(kept.revision, 1);
    await store.deleteProject({ owner: ALICE, id: created.id });
  });

  it("reopening the database afterward shows only committed state", async () => {
    await useDb(storeDb);
    const store = await import("../src/projects/store.js");
    const { doc: created } = await store.createProject({ owner: BOB, title: "Persist", scenes: await scenes() });
    await store.renameProject({ owner: BOB, id: created.id, baseRevision: 0, title: "Persisted" });
    const { closeDb } = await import("../src/db.js");
    closeDb();
    const reopened = (await store.getProject({ owner: BOB, id: created.id })).doc;
    assert.equal(reopened.title, "Persisted");
    assert.equal(reopened.revision, 1);
    await store.deleteProject({ owner: BOB, id: created.id });
  });
});

describe("v2-6a1 HTTP hosted and local isolation", () => {
  const ROOT = new URL("..", import.meta.url).pathname;
  let tokens = null;
  let localApi = null;
  let hostedApi = null;
  const LOCAL_PORT = 5291;
  const HOSTED_PORT = 5292;

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
    const auth = await import("../src/auth.js");
    const mk = async (name, email) => {
      const user = await auth.register({ name, email, password: "password-123" });
      const token = await auth.startSession(user);
      return { user, token };
    };
    const alice = await mk("Alice", ALICE);
    const bob = await mk("Bob", BOB);
    const admin = await mk("Admin", "admin@example.test");
    await auth.setUserRole("admin@example.test", "admin");
    tokens = { alice: alice.token, bob: bob.token, admin: admin.token };
    const localCfg = path.join(scratch, "localcfg");
    const hostedCfg = path.join(scratch, "hostedcfg");
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

  it("hosted anonymous callers get 401 before the store", async (t) => {
    if (!hostedApi) {
      t.skip("api did not start");
      return;
    }
    for (const [method, p] of [["GET", "/api/v2/projects"], ["POST", "/api/v2/projects"], ["GET", "/api/v2/projects/p-abc"], ["PUT", "/api/v2/projects/p-abc"], ["PATCH", "/api/v2/projects/p-abc"], ["DELETE", "/api/v2/projects/p-abc"]]) {
      const res = await call(HOSTED_PORT, method, p, null, method === "GET" || method === "DELETE" ? undefined : {});
      assert.equal(res.status, 401, `${method} ${p} denies anonymous hosted callers`);
    }
  });

  it("hosted Alice cannot reach Bob's or ownerless projects", async (t) => {
    if (!hostedApi) {
      t.skip("api did not start");
      return;
    }
    const s = await scenes();
    const bobMade = await (await call(HOSTED_PORT, "POST", "/api/v2/projects", tokens.bob, { title: "Bob hosted", owner: ALICE, scenes: structuredClone(s) })).json();
    assert.equal(bobMade.ok, true);
    const bobId = bobMade.project.id;
    // A user-supplied owner field never authorizes: the stamp comes
    // from the session, so this row belongs to Bob, not Alice.
    assert.equal(bobMade.project.owner ?? null, null, "documents carry no owner claim to forge");
    for (const p of [`/api/v2/projects/${bobId}`, `/api/v2/projects/${bobId}/export.pptx`]) {
      const res = await call(HOSTED_PORT, "GET", p, tokens.alice);
      assert.equal(res.status, 404, `Alice sees no Bob row at ${p}`);
      const text = await res.text();
      assert.ok(!text.includes("Bob hosted"), "no title leak");
    }
    const put = await call(HOSTED_PORT, "PUT", `/api/v2/projects/${bobId}`, tokens.alice, { baseRevision: 0, scenes: structuredClone(s) });
    assert.equal(put.status, 404);
    const patch = await call(HOSTED_PORT, "PATCH", `/api/v2/projects/${bobId}`, tokens.alice, { title: "Taken", baseRevision: 0 });
    assert.equal(patch.status, 404);
    const del = await call(HOSTED_PORT, "DELETE", `/api/v2/projects/${bobId}`, tokens.alice);
    assert.equal(del.status, 404);
    const kept = await (await call(HOSTED_PORT, "GET", `/api/v2/projects/${bobId}`, tokens.bob)).json();
    assert.equal(kept.project.title, "Bob hosted");
    assert.equal(kept.project.revision, 0);
    const list = await (await call(HOSTED_PORT, "GET", "/api/v2/projects", tokens.alice)).json();
    assert.ok(!(list.projects ?? []).some((p) => p.id === bobId), "list hides foreign rows");
    // Ownerless local rows are not public to hosted accounts either.
    const localMade = await (await call(LOCAL_PORT, "POST", "/api/v2/projects", null, { title: "Local row", scenes: structuredClone(s) })).json();
    assert.equal(localMade.ok, true);
    const anon = await call(HOSTED_PORT, "GET", `/api/v2/projects/${localMade.project.id}`, tokens.alice);
    assert.equal(anon.status, 404, "hosted Alice cannot open the ownerless row");
  });

  it("hosted rename is revision-gated with 409 and 422 shapes", async (t) => {
    if (!hostedApi) {
      t.skip("api did not start");
      return;
    }
    const s = await scenes();
    const made = await (await call(HOSTED_PORT, "POST", "/api/v2/projects", tokens.alice, { title: "Rename me", scenes: structuredClone(s) })).json();
    const id = made.project.id;
    for (const bad of [undefined, -1, 1.5, "0"]) {
      const res = await call(HOSTED_PORT, "PATCH", `/api/v2/projects/${id}`, tokens.alice, bad === undefined ? { title: "X" } : { title: "X", baseRevision: bad });
      assert.equal(res.status, 422, `malformed baseRevision ${String(bad)} refuses`);
    }
    const first = await (await call(HOSTED_PORT, "PATCH", `/api/v2/projects/${id}`, tokens.alice, { title: "First", baseRevision: 0 })).json();
    assert.equal(first.ok, true);
    assert.equal(first.project.revision, 1);
    const stale = await call(HOSTED_PORT, "PATCH", `/api/v2/projects/${id}`, tokens.alice, { title: "Stale", baseRevision: 0 });
    assert.equal(stale.status, 409);
    const body = await stale.json();
    assert.equal(body.code, "stale-revision");
    assert.equal(body.expectedRevision, 1);
    assert.equal(body.actualRevision, 0);
    const kept = await (await call(HOSTED_PORT, "GET", `/api/v2/projects/${id}`, tokens.alice)).json();
    assert.equal(kept.project.title, "First");
    const same = await (await call(HOSTED_PORT, "PATCH", `/api/v2/projects/${id}`, tokens.alice, { title: "First", baseRevision: 1 })).json();
    assert.equal(same.ok, true);
    assert.equal(same.noop, true);
    assert.equal(same.project.revision, 1);
  });

  it("local anonymous single-user flow keeps working on ownerless rows", async (t) => {
    if (!localApi) {
      t.skip("api did not start");
      return;
    }
    const s = await scenes();
    const made = await (await call(LOCAL_PORT, "POST", "/api/v2/projects", null, { title: "Anon deck", scenes: structuredClone(s) })).json();
    assert.equal(made.ok, true);
    const id = made.project.id;
    assert.equal((await (await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}`, null)).json()).project.title, "Anon deck");
    const renamed = await (await call(LOCAL_PORT, "PATCH", `/api/v2/projects/${id}`, null, { title: "Anon renamed", baseRevision: 0 })).json();
    assert.equal(renamed.project.revision, 1);
    const saved = await (await call(LOCAL_PORT, "PUT", `/api/v2/projects/${id}`, null, { baseRevision: 1, scenes: structuredClone(s) })).json();
    assert.equal(saved.noop, true);
    // Anonymous local callers cannot reach account-owned rows, and
    // accounts cannot reach ownerless ones: exact match both ways.
    const aliceMade = await (await call(LOCAL_PORT, "POST", "/api/v2/projects", tokens.alice, { title: "Alice local", scenes: structuredClone(s) })).json();
    assert.equal(aliceMade.ok, true);
    assert.equal((await call(LOCAL_PORT, "GET", `/api/v2/projects/${aliceMade.project.id}`, null)).status, 404);
    assert.equal((await call(LOCAL_PORT, "GET", `/api/v2/projects/${id}`, tokens.alice)).status, 404);
    const del = await call(LOCAL_PORT, "DELETE", `/api/v2/projects/${id}`, null);
    assert.equal(del.status, 200);
  });

  it("traversal, size, and disabled-surface gates still hold", async (t) => {
    if (!localApi || !hostedApi) {
      t.skip("api did not start");
      return;
    }
    assert.equal((await call(HOSTED_PORT, "GET", "/api/v2/projects/..%2F..%2Fx", tokens.alice)).status, 400);
    const huge = { title: "t", scenes: [], junk: "x".repeat(7 * 1024 * 1024) };
    assert.equal((await call(LOCAL_PORT, "POST", "/api/v2/projects", null, huge)).status, 413);
  });

  it("FORGE_V2_PROJECTS=0 disables the surface", async () => {
    const cfg = path.join(scratch, "offcfg");
    await mkdir(cfg, { recursive: true });
    const off = await spawnApi(5293, cfg, { FORGE_HOSTED: "0", FORGE_V2_PROJECTS: "0" });
    try {
      assert.equal((await call(5293, "GET", "/api/v2/projects", null)).status, 403);
    } finally {
      off.kill();
      await new Promise((r) => setTimeout(r, 800));
    }
  });
});
