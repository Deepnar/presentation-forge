// V2-6C contract against SQLite: the accepted local backend must
// satisfy the shared suite unchanged. Fails on 0ec8aa4 at import
// (the contract module and backend boundary are new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runContractSuite, assertInterfaceParity } from "./v2-projects-contract-6c.js";

let scratch = null;
let prevDbPath = process.env.FORGE_DB_PATH ?? null;

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "forge-6c-sqlite-"));
  process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
});

after(async () => {
  const { closeDb } = await import("../src/db.js");
  closeDb();
  if (prevDbPath === null) delete process.env.FORGE_DB_PATH;
  else process.env.FORGE_DB_PATH = prevDbPath;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function hooks() {
  const stashed = new Map();
  return {
    async historyCount(projectId) {
      const { getDb } = await import("../src/db.js");
      return getDb().prepare("SELECT COUNT(*) AS n FROM v2_project_revisions WHERE project_id=?").get(projectId).n;
    },
    async stripHistory(projectId) {
      const { getDb } = await import("../src/db.js");
      getDb().prepare("DELETE FROM v2_project_revisions WHERE project_id=?").run(projectId);
    },
    async corruptRevision(projectId, revision) {
      const { getDb } = await import("../src/db.js");
      getDb().prepare("UPDATE v2_project_revisions SET payload=? WHERE project_id=? AND revision=?").run("{not json", projectId, revision);
    },
    async setStoredVersion(projectId, version) {
      const { getDb } = await import("../src/db.js");
      const row = getDb().prepare("SELECT payload FROM v2_projects WHERE id=?").get(projectId);
      stashed.set(projectId, row.payload);
      const doc = JSON.parse(row.payload);
      doc.schemaVersion = version;
      getDb().prepare("UPDATE v2_projects SET payload=? WHERE id=?").run(JSON.stringify(doc), projectId);
    },
    async restoreStored(projectId) {
      const { getDb } = await import("../src/db.js");
      const original = stashed.get(projectId);
      if (original !== undefined) {
        getDb().prepare("UPDATE v2_projects SET payload=? WHERE id=?").run(original, projectId);
        stashed.delete(projectId);
      }
    },
  };
}

describe("v2-6c contract over sqlite", () => {
  it("adapter surfaces match the shared interface", async () => {
    const sqlite = await import("../src/projects/store.js");
    const pg = await import("../src/projects/store-postgres.js");
    assertInterfaceParity([sqlite, pg]);
  });
});

runContractSuite("sqlite", await import("../src/projects/store.js"), hooks());
