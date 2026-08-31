#!/usr/bin/env node
/**
 * What length can each field actually be, in every theme?
 *
 *   node tools/capfit.mjs                  # every type
 *   node tools/capfit.mjs --types cards,takeaway
 *   node tools/capfit.mjs --json .themeaudit/caps.json
 *
 * The schema's `maxLength` is the instruction the model writes to, and it was
 * never derived from what the layouts can seat: `cards[].body` accepts 320
 * characters and the type accepts four of them, which no theme can hold. A cap
 * the renderer cannot honour guarantees a rewrite pass on every generation.
 *
 * This grows each type's own specimen payload — one valid slide per type — until
 * some theme can no longer seat it at the readable floor, and reports the
 * largest length every theme clears. It reports; it does not edit the schema.
 * Which caps to move, and to what, is a judgement about the product.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { capFit } from "../src/capfit.js";
import { specimenDeck } from "../src/specimens.js";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const deck = await specimenDeck();
const types = list(arg("--types")) ?? [...new Set(deck.slides.map((s) => s.type))];

const rows = [];
for (const type of types) {
  const r = await capFit(type);
  if (!r || !r.caps.length) continue;
  for (const c of r.caps) rows.push({ type, path: c.path, cap: c.cap, fits: c.fits, ratio: c.fits / c.cap });
  const binding = r.caps.filter((c) => c.binds).length;
  console.log(`  ${type.padEnd(22)} ${(r.scale * 100).toFixed(0)}% together · ${binding}/${r.caps.length} field(s) below their own cap`);
}

const over = rows.filter((r) => r.ratio < 0.9).sort((a, b) => a.ratio - b.ratio);
console.log(`\n  ${over.length} field(s) whose schema cap the layouts cannot seat:\n`);
for (const r of over) {
  console.log(`  ${`${r.type}.${r.path}`.padEnd(42)} cap ${String(r.cap).padStart(4)}  fits ${String(r.fits).padStart(4)}   ${(r.ratio * 100).toFixed(0)}%`);
}

const json = arg("--json");
if (json) {
  await mkdir(path.dirname(json), { recursive: true });
  await writeFile(json, JSON.stringify(rows, null, 2), "utf8");
  console.log(`\n  saved -> ${json}`);
}
