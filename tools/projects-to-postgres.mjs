// Copy this install's V2 projects from SQLite to PostgreSQL.
//   npm run projects:to-postgres                 # dry run: what would be copied
//   npm run projects:to-postgres -- --apply      # copy, in one transaction
//   ... --from <forge.db> --to <postgres-url> --merge
// Defaults: FORGE_DB_PATH (or config/forge.db) and FORGE_PROJECTS_DATABASE_URL.
// Afterwards set FORGE_PROJECTS_BACKEND=postgres and restart the app.
import path from "node:path";
import { CONFIG } from "../src/paths.js";
import { copyProjectsToPostgres } from "../src/projects/copy-to-postgres.js";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const sqlitePath = opt("--from") ?? process.env.FORGE_DB_PATH ?? path.join(CONFIG, "forge.db");
const url = opt("--to") ?? process.env.FORGE_PROJECTS_DATABASE_URL;
const apply = args.includes("--apply");
try {
  const out = await copyProjectsToPostgres({ sqlitePath, url, apply, merge: args.includes("--merge"), log: (l) => console.log(`  ${l}`) });
  const total = out.tables.reduce((n, t) => n + t.copied, 0);
  console.log(apply
    ? `Copied ${total} rows. Set FORGE_PROJECTS_BACKEND=postgres and restart the app; keep ${path.basename(sqlitePath)} — accounts stay in it.`
    : `Dry run: ${total} rows would be copied. Run again with --apply to copy them.`);
} catch (err) {
  console.error(`Not copied: ${err.message}`);
  process.exit(1);
}
