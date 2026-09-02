#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { scoreDeck } from "../src/deckscore.js";
import { DECKS } from "../src/paths.js";

/**
 * Score one generated deck, deterministically.
 *
 *   npm run deckscore <slug|path/to/deck.yaml>
 *
 * Prints a number so two runs can be compared — the same brief on Auto and on
 * local, a deck before and after a prompt change. It measures what can be
 * measured without a model; it does not claim the deck is any good.
 */
const arg = process.argv[2];
if (!arg) {
  console.error("usage: npm run deckscore <slug|deck.yaml>");
  process.exit(2);
}

const file = arg.endsWith(".yaml") ? arg : path.join(DECKS, arg, "deck.yaml");
const dir = path.dirname(file);
const deck = YAML.parse(await readFile(file, "utf8"));

let research = "";
try {
  research = await readFile(path.join(dir, "research", "notes.md"), "utf8");
} catch { /* a deck may have been written without a research pass */ }

const r = await scoreDeck(deck, { research, deckDir: dir });

const bar = (v) => (v == null ? "  n/a" : `${String(Math.round(v * 100)).padStart(4)}%`);
console.log(`\n  ${path.basename(dir)} — ${r.counts.slides} slides\n`);
console.log(`  SCORE  ${r.score == null ? "n/a" : r.score}/100\n`);
for (const [k, v] of Object.entries(r.components)) {
  console.log(`    ${k.padEnd(10)} ${bar(v)}${v == null ? "   (not measurable here)" : ""}`);
}
if (r.findings.length) {
  console.log(`\n  ${r.findings.length} finding(s):`);
  for (const f of r.findings.slice(0, 12)) console.log(`    - ${f}`);
  if (r.findings.length > 12) console.log(`    … and ${r.findings.length - 12} more`);
}
console.log("");
