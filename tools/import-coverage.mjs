// Which decks on disk the deck → project converter still refuses, and why,
// grouped by slide type and field.
//
//   node tools/import-coverage.mjs            # convert every deck in decks/
//   node tools/import-coverage.mjs --import   # full import: compile, fit,
//                                             # content checks, preflight —
//                                             # into a throwaway database
//   node tools/import-coverage.mjs --decks <dir>
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const fullImport = process.argv.includes("--import");
const scratch = fullImport ? await mkdtemp(path.join(tmpdir(), "import-coverage-")) : null;
// The store opens its database on first use, so the throwaway path must be
// set before any store module loads.
if (scratch) { process.env.FORGE_DB_PATH = path.join(scratch, "forge.db"); process.env.FORGE_PROJECTS_BACKEND = "sqlite"; }
const { DECKS } = await import("../src/paths.js");
const { convertGeneratedDeck } = await import("../src/projects/legacy-conversion.js");
const { importGeneratedProject } = fullImport ? await import("../src/projects/import-generated.js") : {};

const at = process.argv.indexOf("--decks");
const root = at > 0 ? path.resolve(process.argv[at + 1]) : DECKS;
const reasons = new Map();
let total = 0, converted = 0;

for (const slug of (await readdir(root)).sort()) {
  if (slug.startsWith("_")) continue;
  let deck;
  try { deck = YAML.parse(await readFile(path.join(root, slug, "deck.yaml"), "utf8")); } catch { continue; }
  total++;
  try {
    if (fullImport) {
      const meta = YAML.parse(await readFile(path.join(root, slug, "meta.yaml"), "utf8")) ?? {};
      // A throwaway store has no hosted policy to honour, so ownerless decks
      // import as their (null) owner whatever mode this install is in.
      await importGeneratedProject({ slug, requestId: "import-coverage", principal: { email: meta.owner ?? null, verified: true } });
    } else await convertGeneratedDeck(deck);
    converted++;
  } catch (error) {
    const details = error.details?.length ? error.details : [{ path: "-", reason: `${error.code ?? "error"}: ${error.message}` }];
    for (const detail of details) {
      let key;
      if (typeof detail === "string") key = detail.replace(/slide \d+/, "slide N");
      else {
        const match = /^slides\[(\d+)\](.*)$/.exec(detail.path);
        key = match ? `${deck.slides?.[+match[1]]?.type ?? "?"}${match[2].replace(/\[\d+\]/g, "[]")}` : detail.path;
        key += ` — ${detail.reason}`;
      }
      const entry = reasons.get(key) ?? { count: 0, decks: new Set() };
      entry.count++; entry.decks.add(slug);
      reasons.set(key, entry);
    }
  }
}

console.log(`${converted} of ${total} decks ${fullImport ? "import" : "convert"}`);
for (const [key, { count, decks }] of [...reasons].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${String(count).padStart(4)}  ${key.slice(0, 110)}  (${decks.size} deck${decks.size === 1 ? "" : "s"})`);
}

if (scratch) {
  try { (await import("../src/db.js")).closeDb(); } catch { /* nothing opened */ }
  await rm(scratch, { recursive: true, force: true });
}
