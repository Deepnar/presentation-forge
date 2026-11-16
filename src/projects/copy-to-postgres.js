// Moving an install's V2 projects from its SQLite file to PostgreSQL — the
// step between a single-box install and the hosted default. Every V2 table
// (projects, history, assets, sources, intents, files, layouts, documents,
// and the Assistant's runs and conversations) is copied in one transaction,
// parents before children, and the counts are checked before it commits.
// Accounts, sessions and keys are not projects: they stay in the SQLite file,
// which the app keeps using for them.
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { createV2Schema } from "./store-postgres.js";

// Foreign-key order: a child is copied after every table it references.
export const V2_TABLES = [
  "v2_projects", "v2_project_imports", "v2_project_revisions",
  "v2_project_source_catalog", "v2_project_sources", "v2_project_assets",
  "v2_project_intents", "v2_project_files", "v2_project_layouts", "v2_project_documents",
  "v2_agent_runs", "v2_agent_receipts", "v2_agent_conversations",
  "v2_agent_turns", "v2_agent_proposals", "v2_agent_attempts",
];

const refuse = (code, message) => Object.assign(new Error(message), { code });
const BATCH = 200;

// SQLite hands back BLOBs as Uint8Array; pg wants a Buffer for BYTEA.
const value = (v) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v);

// { tables: [{ table, rows, copied }], applied } — a dry run unless `apply`.
// `merge` copies into a target that already holds projects, skipping rows
// whose key is already there; without it such a target is refused, so two
// installs are never mixed by accident.
export async function copyProjectsToPostgres({ sqlitePath, url, apply = false, merge = false, log = () => {} }) {
  if (!sqlitePath) throw refuse("invalid-request", "name the SQLite file to copy from");
  if (!url) throw refuse("invalid-request", "name the PostgreSQL database to copy to (FORGE_PROJECTS_DATABASE_URL)");
  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000, max: 1 });
  const client = await pool.connect();
  try {
    const present = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    const tables = V2_TABLES.filter((t) => present.has(t));
    if (!tables.includes("v2_projects")) throw refuse("empty-source", `${sqlitePath} holds no V2 projects`);
    await client.query("BEGIN");
    await createV2Schema(client);
    const existing = Number((await client.query("SELECT COUNT(*) AS n FROM v2_projects")).rows[0].n);
    if (existing > 0 && !merge) throw refuse("target-not-empty", `the target already holds ${existing} project(s); pass --merge to add to them`);
    const report = [];
    for (const table of tables) {
      const columns = source.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      const target = new Set((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1", [table])).rows.map((r) => r.column_name));
      const missing = columns.filter((c) => !target.has(c));
      if (missing.length) throw refuse("schema-mismatch", `${table}: the target has no column ${missing.join(", ")} — update the app on both sides first`);
      const rows = source.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(",")} FROM ${table}`).all();
      const before = Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const params = [];
        const tuples = chunk.map((row) => `(${columns.map((c) => { params.push(value(row[c])); return `$${params.length}`; }).join(",")})`);
        await client.query(`INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`, params);
      }
      const after = Number((await client.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
      const copied = after - before;
      // Without --merge the target started empty, so every row must land.
      if (!merge && copied !== rows.length) throw refuse("count-mismatch", `${table}: ${rows.length} rows read, ${copied} written`);
      report.push({ table, rows: rows.length, copied });
      log(`${table}: ${rows.length} rows${merge && copied !== rows.length ? ` (${rows.length - copied} already there)` : ""}`);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { tables: report, applied: apply };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
    source.close();
  }
}
