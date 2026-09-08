#!/usr/bin/env node
import { drawCheck } from "../src/drawcheck.js";

const ACCEPTED = new Map([
  ["quote:headline", "the quote is the whole surface"],
  ["quote:standfirst", "the quote is the whole surface"],
  ["epigraph:headline", "the quote is the whole surface"],
  ["epigraph:standfirst", "the quote is the whole surface"],
  ["freeform:headline", "the slide is the html"],
  ["freeform:standfirst", "the slide is the html"],
  ["hero-image:standfirst", "subtitle carries the role and takes precedence"],
  ["split-screen:left", "an image reference, not prose"],
  ["split-screen:right", "an image reference, not prose"],
  ["chart:chart.categories", "the specimen's only chart is a scatter"],
]);

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const rows = await drawCheck({
  types: list(arg("--types")),
  themes: list(arg("--themes")) ?? undefined,
});

const key = (r) => `${r.type}:${r.path}`;
const allDropped = rows.filter((r) => r.verdict === "dropped");
const dropped = allDropped.filter((r) => !ACCEPTED.has(key(r)));
const accepted = allDropped.filter((r) => ACCEPTED.has(key(r)));
const unpopulated = rows.filter((r) => r.verdict === "unpopulated");
const checked = new Set(rows.map((r) => r.type));
const stale = [...ACCEPTED.keys()].filter(
  (k) => checked.has(k.split(":")[0]) && !allDropped.some((r) => key(r) === k),
);

if (dropped.length) {
  console.log(`\n  ${dropped.length} field(s) the schema offers and the layout never draws:\n`);
  for (const r of dropped) console.log(`  ${r.type.padEnd(22)} ${r.path}`);
} else {
  console.log("\n  every populated field the schema declares reaches the page.");
}

if (accepted.length) {
  console.log(`\n  ${accepted.length} accepted:\n`);
  for (const r of accepted) console.log(`  ${r.type.padEnd(22)} ${r.path.padEnd(20)} ${ACCEPTED.get(key(r))}`);
}

if (stale.length) {
  console.log(`\n  ${stale.length} accepted entr(ies) no longer dropped — remove them:\n`);
  for (const k of stale) console.log(`  ${k}`);
}

if (unpopulated.length) {
  console.log(`\n  ${unpopulated.length} field(s) the specimen does not carry — never rendered by anything:\n`);
  for (const r of unpopulated) console.log(`  ${r.type.padEnd(22)} ${r.path}`);
}

console.log(`\n  ${rows.length} field(s) across ${new Set(rows.map((r) => r.type)).size} type(s).\n`);
process.exitCode = dropped.length || stale.length ? 1 : 0;
