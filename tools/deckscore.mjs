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
  console.error("usage: npm run deckscore <slug|deck.yaml>\n"
    + "       npm run deckscore -- --history [slug]   what previous runs scored");
  process.exit(2);
}

// `--history` answers the question a single score cannot: did this get worse?
if (process.argv.includes("--history")) {
  const { readScores, regression } = await import("../src/scorelog.js");
  const only = arg && !arg.startsWith("--") ? arg : null;
  const rows = await readScores({ slug: only });
  if (!rows.length) {
    console.log("\n  no scored generations recorded yet — they are written as decks finalize\n");
    process.exit(0);
  }
  console.log(`\n  ${rows.length} recorded generation(s)${only ? ` for ${only}` : ""}\n`);
  console.log("  when                 score  slides  backend    deck");
  for (const r of rows.slice(-25)) {
    console.log(
      `  ${String(r.at ?? "").slice(0, 16).padEnd(20)} ` +
      `${String(r.score ?? "n/a").padStart(5)}  ${String(r.slides ?? "").padStart(6)}  ` +
      `${String(r.transport ?? r.model ?? "?").slice(0, 9).padEnd(9)}  ${String(r.slug ?? "").slice(0, 34)}`,
    );
  }
  const reg = regression(rows);
  if (reg) {
    console.log(
      `\n  latest ${reg.score} against a median of ${reg.median} over the previous ${reg.over}` +
      (reg.regressed ? ` — DOWN ${Math.abs(reg.delta)}, look at what changed` : " — within normal variation"),
    );
  } else {
    console.log("\n  not enough history to say whether that is a regression");
  }
  console.log("");
  process.exit(0);
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
if (!process.argv.includes("--no-record")) {
  const { recordScore } = await import("../src/scorelog.js");
  await recordScore({ ...r, slug: path.basename(dir), kind: "manual" });
}

if (r.findings.length) {
  console.log(`\n  ${r.findings.length} finding(s):`);
  for (const f of r.findings.slice(0, 12)) console.log(`    - ${f}`);
  if (r.findings.length > 12) console.log(`    … and ${r.findings.length - 12} more`);
}
console.log("");
