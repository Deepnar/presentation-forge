// Which decks on disk the deck → project converter still refuses, and why,
// grouped by slide type and field. Converts only; nothing is stored.
//
//   node tools/import-coverage.mjs            # every deck in decks/
//   node tools/import-coverage.mjs --decks <dir>
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS } from "../src/paths.js";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";

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
    await convertGeneratedDeck(deck);
    converted++;
  } catch (error) {
    for (const detail of error.details ?? [{ path: "-", reason: error.message }]) {
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

console.log(`${converted} of ${total} decks convert`);
for (const [key, { count, decks }] of [...reasons].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`${String(count).padStart(4)}  ${key.slice(0, 110)}  (${decks.size} deck${decks.size === 1 ? "" : "s"})`);
}
