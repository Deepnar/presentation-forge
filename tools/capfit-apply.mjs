#!/usr/bin/env node
/**
 * Move the schema's caps to what the layouts can actually seat.
 *
 *   node tools/capfit.mjs --json .themeaudit/caps.json   # measure first
 *   node tools/capfit-apply.mjs .themeaudit/caps.json    # show the edit
 *   node tools/capfit-apply.mjs .themeaudit/caps.json --apply
 *
 * `capfit` reports and deliberately does not edit, because which caps to move
 * is a judgement. This is that judgement written down: a cap the renderer
 * cannot honour at the readable floor is not a cap, it is a promise to run a
 * rewrite pass on every generation. So every field whose measured fit is under
 * `--threshold` (default 0.9) of its declared cap moves to the measured value.
 *
 * Two kinds of field, handled differently:
 *
 *   type-specific   `venn.sets[].label` lives in that type's own `then` block
 *                   and the maxLength there is simply corrected.
 *   shared          `headline` and `standfirst` are declared once for every
 *                   slide. Six types cannot seat 80 characters of headline and
 *                   most types can, so the cap is NOT cut globally — a
 *                   narrowing override is added to the `then` block of the type
 *                   that needs it, which JSON Schema composes with the base.
 *
 * The measured value is the worst case across every theme, because a cap has to
 * hold in the theme the user actually picked.
 */

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

/**
 * The `then` block for one slide type, creating it when the type has none.
 *
 * `title` carries no conditional block at all — it needs nothing beyond the
 * shared fields — so narrowing its headline means introducing one. An `if/then`
 * that matches a single type and narrows a single property composes with the
 * base declaration and leaves every other type untouched.
 */
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

/** Follow a local $ref, so `before`/`after` reach the shared `ba` shape. */
function deref(node) {
  let n = node, guard = 0;
  while (n && typeof n.$ref === "string" && guard++ < 8) {
    const parts = n.$ref.replace(/^#\//, "").split("/");
    n = parts.reduce((acc, k) => acc?.[k], schema);
  }
  return n;
}

/**
 * Walk a capfit path ("sets[].items", "phases[].items[].body") to the node that
 * carries the maxLength. A segment marked `[]`, or one that resolves to an
 * array, descends into `items` — and a bare array of strings carries its cap on
 * the item, not on the array.
 */
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
  // A shared field is narrowed for this type only, never cut for every type —
  // and the type may not have a block yet, so this one is allowed to make one.
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

// before.body and after.body are the same $ref node; writing the same value
// twice is harmless, but a disagreement would mean the measurement did not.
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
// The committed schema escapes non-ASCII (\u2014 rather than a literal em
// dash). JSON.stringify does not, so re-escaping keeps the diff to the caps
// that actually moved instead of every line carrying punctuation.
const json = JSON.stringify(schema, null, 2)
  .replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
await writeFile(SCHEMA, `${json}\n`, "utf8");
console.log(`\nwrote ${path.relative(ROOT, SCHEMA)} — ${edits.length} corrected, ${overrides.length} narrowed.`);
console.log("Now: npm test, npm run themematrix, and re-run capstress to see the fit failures fall.");
