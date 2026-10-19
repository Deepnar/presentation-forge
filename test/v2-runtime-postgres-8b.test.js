import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { Pool } from "pg";
import * as store from "../src/projects/store-postgres.js";
import { scenario } from "./v2-runtime-fixture.js";
import { runtimeContract } from "./v2-runtime-contract.js";
import { processContract } from "./v2-runtime-process-contract.js";
const maintenance = new Pool({
  connectionString:
    process.env.TEST_PG_URL ??
    "postgres://postgres:probe@127.0.0.1:5544/postgres",
  connectionTimeoutMillis: 3000,
});
const database = `forge_8b_${crypto.randomUUID().replaceAll("-", "")}`;
const listenerWarnings = [];
const onWarning = (w) => {
  if (w.name === "MaxListenersExceededWarning") listenerWarnings.push(w);
};
process.on("warning", onWarning);
const previous = process.env.FORGE_PROJECTS_DATABASE_URL;
let available = false;
try {
  await maintenance.query("SELECT 1");
  available = true;
} catch {}
if (!available) {
  await maintenance.end();
  test("PostgreSQL unavailable; durable runtime contracts/process checks unexecuted", (t) =>
    t.skip("isolated PostgreSQL required"));
} else {
  before(async () => {
    await maintenance.query(`CREATE DATABASE "${database}"`);
    process.env.FORGE_PROJECTS_DATABASE_URL = (
      process.env.TEST_PG_URL ??
      "postgres://postgres:probe@127.0.0.1:5544/postgres"
    ).replace(/\/[^/]*$/, `/${database}`);
  });
  after(async () => {
    await store.closeProjectStore();
    if (previous === undefined) delete process.env.FORGE_PROJECTS_DATABASE_URL;
    else process.env.FORGE_PROJECTS_DATABASE_URL = previous;
    await maintenance.query(`DROP DATABASE "${database}"`);
    await maintenance.end();
    process.removeListener("warning", onWarning);
    assert.equal(
      listenerWarnings.length,
      0,
      "transaction listeners must be released with pooled clients",
    );
  });
  const setup = (t) => scenario(t, store);
  runtimeContract("PostgreSQL", setup);
  processContract("PostgreSQL", setup);
}
