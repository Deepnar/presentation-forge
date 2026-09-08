#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schema", "deck.schema.json");

const argv = process.argv.slice(2);
const capsFile = argv.find((a) => !a.startsWith("--"));
const APPLY = argv.includes("--apply");
const ti = argv.indexOf("--threshold");
const THRESHOLD = ti >= 0 && argv[ti + 1] ? Number(argv[ti + 1]) : 0.9;

if (!capsFile) {
  console.error("usage: node tools/capfit-apply.mjs <caps.json> [--apply] [--threshold 0.9]");
  process.exit(2);
}

const schema = JSON.parse(await readFile(SCHEMA, "utf8"));
const rows = JSON.parse(await readFile(path.resolve(capsFile), "utf8")).filter((r) => r.ratio < THRESHOLD);

const sharedProps = schema.definitions.slide.properties;

function thenFor(type, create = false) {
  schema.definitions.slide.allOf ??= [];
  for (const block of schema.definitions.slide.allOf) {
    if (block?.if?.properties?.type?.const === type) return block.then;
  }
  if (!create) return null;
  const block = { if: { properties: { type: { const: type } } }, then: { properties: {} } };
  schema.definitions.slide.allOf.push(block);
  return block.then;
}

function deref(node) {
  let n = node, guard = 0;
  while (n && typeof n.$ref === "string" && guard++ < 8) {
    const parts = n.$ref.replace(/^#\//, "").split("/");
    n = parts.reduce((acc, k) => acc?.[k], schema);
  }
  return n;
}

function resolve(container, fieldPath) {
  let node = deref(container);
  for (const raw of fieldPath.split(".")) {
    const name = raw.replace("[]", "");
    node = deref(node?.properties?.[name]);
    if (!node) return null;
    if (raw.endsWith("[]") || node.type === "array") node = deref(node.items);
    if (!node) return null;
  }
  return node.type === "array" ? deref(node.items) : node;
}

const edits = [], overrides = [], missed = [];

for (const r of rows) {
  const root = r.path.split(".")[0].replace("[]", "");
  if (sharedProps[root]) {
    const block = thenFor(r.type, true);
    if (!block.properties?.[root]) {
      overrides.push({ type: r.type, field: root, from: r.cap, to: r.fits, block });
      continue;
    }
  }

  const block = thenFor(r.type);
  if (!block) { missed.push({ ...r, why: "no conditional block for this type" }); continue; }

  const node = resolve(block, r.path);
  if (!node || typeof node.maxLength !== "number") { missed.push({ ...r, why: "no maxLength at that path" }); continue; }
  edits.push({ ...r, node, was: node.maxLength });
}

console.log(`caps below ${THRESHOLD * 100}% of what the layouts seat: ${rows.length}\n`);
console.log(`type-specific caps to correct (${edits.length}):`);
for (const e of edits) console.log(`  ${`${e.type}.${e.path}`.padEnd(42)} ${String(e.was).padStart(4)} -> ${String(e.fits).padStart(4)}`);
console.log(`\nshared fields to narrow for one type only (${overrides.length}):`);
for (const o of overrides) console.log(`  ${`${o.type}.${o.field}`.padEnd(42)} ${String(o.from).padStart(4)} -> ${String(o.to).padStart(4)}`);
if (missed.length) {
  console.log(`\ncould not place (${missed.length}):`);
  for (const m of missed) console.log(`  ${m.type}.${m.path} — ${m.why}`);
}

if (!APPLY) {
  console.log("\n--apply writes schema/deck.schema.json.");
  process.exit(missed.length ? 1 : 0);
}

for (const e of edits) {
  if (typeof e.node.maxLength === "number" && e.node.__set !== undefined && e.node.__set !== e.fits) {
    console.error(`  ! ${e.type}.${e.path} shares a node already set to ${e.node.__set}, wants ${e.fits} — taking the smaller`);
  }
  e.node.maxLength = e.node.__set === undefined ? e.fits : Math.min(e.node.__set, e.fits);
  Object.defineProperty(e.node, "__set", { value: e.node.maxLength, configurable: true, enumerable: false });
}
for (const o of overrides) {
  o.block.properties ??= {};
  o.block.properties[o.field] = { type: "string", maxLength: o.to };
}
const json = JSON.stringify(schema, null, 2)
  .replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
await writeFile(SCHEMA, `${json}\n`, "utf8");
console.log(`\nwrote ${path.relative(ROOT, SCHEMA)} — ${edits.length} corrected, ${overrides.length} narrowed.`);
console.log("Now: npm test, npm run themematrix, and re-run capstress to see the fit failures fall.");
