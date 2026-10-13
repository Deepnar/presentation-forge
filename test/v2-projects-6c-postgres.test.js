// V2-6C contract against PostgreSQL: the hosted adapter must
// satisfy the shared suite unchanged. Needs a reachable Postgres
// (TEST_PG_URL, defaulting to the isolated local test instance);
// skips honestly when none is available. Fails on 0ec8aa4 at import
// (the postgres adapter and contract module are new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { runContractSuite } from "./v2-projects-contract-6c.js";

const MAINT_URL = process.env.TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:5544/postgres";
const DB_NAME = `forge_6c_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const TEST_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

let prevUrl = process.env.FORGE_PROJECTS_DATABASE_URL ?? null;

async function maintQuery(text) {
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: MAINT_URL, connectionTimeoutMillis: 5000 });
  try {
    return await p.query(text);
  } finally {
    await p.end();
  }
}

// Collection-time probe: contract subtests register only when a
// database is actually reachable, so an absent service reads as a
// skip with a reason, never as a failure or a false pass.
let reachable = false;
let probeError = "";
try {
  await maintQuery("SELECT 1");
  reachable = true;
} catch (err) {
  probeError = String(err?.message ?? err).slice(0, 160);
}

if (!reachable) {
  describe("v2-6c contract over postgres", () => {
    it("postgres unavailable — contract not executed", (t) => {
      t.skip(`no reachable postgres at TEST_PG_URL: ${probeError}`);
    });
  });
} else {
  before(async () => {
    await maintQuery(`CREATE DATABASE "${DB_NAME}"`);
    process.env.FORGE_PROJECTS_DATABASE_URL = TEST_URL;
    const pg = await import("../src/projects/store-postgres.js");
    await pg.__testReset();
  });

  after(async () => {
    try {
      const pg = await import("../src/projects/store-postgres.js");
      await pg.__testReset();
    } catch { /* teardown only */ }
    if (prevUrl === null) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = prevUrl;
    try {
      await maintQuery(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    } catch { /* teardown only */ }
  });

  const hooks = (() => {
    const stashed = new Map();
    return {
      async historyCount(projectId) {
        const pg = await import("../src/projects/store-postgres.js");
        const r = await pg.__testQuery("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=$1", [projectId]);
        return Number(r.rows[0].n);
      },
      async stripHistory(projectId) {
        const pg = await import("../src/projects/store-postgres.js");
        await pg.__testQuery("DELETE FROM v2_project_revisions WHERE project_id=$1", [projectId]);
      },
      async corruptRevision(projectId, revision) {
        const pg = await import("../src/projects/store-postgres.js");
        await pg.__testQuery("UPDATE v2_project_revisions SET payload=$1 WHERE project_id=$2 AND revision=$3", ["{not json", projectId, revision]);
      },
      async setStoredVersion(projectId, version) {
        const pg = await import("../src/projects/store-postgres.js");
        const r = await pg.__testQuery("SELECT payload FROM v2_projects WHERE id=$1", [projectId]);
        stashed.set(projectId, r.rows[0].payload);
        const doc = JSON.parse(r.rows[0].payload);
        doc.schemaVersion = version;
        await pg.__testQuery("UPDATE v2_projects SET payload=$1 WHERE id=$2", [JSON.stringify(doc), projectId]);
      },
      async restoreStored(projectId) {
        const original = stashed.get(projectId);
        if (original !== undefined) {
          const pg = await import("../src/projects/store-postgres.js");
          await pg.__testQuery("UPDATE v2_projects SET payload=$1 WHERE id=$2", [original, projectId]);
          stashed.delete(projectId);
        }
      },
    };
  })();

  describe("v2-6c contract over postgres", () => {
    it("adapter answers before the shared suite runs", async () => {
      const pg = await import("../src/projects/store-postgres.js");
      const r = await pg.__testQuery("SELECT 1 AS one");
      assert.equal(r.rows[0].one, 1);
    });
  });

  const pg = await import("../src/projects/store-postgres.js");
  runContractSuite("postgres", pg, hooks);
}
