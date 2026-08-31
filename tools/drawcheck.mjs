#!/usr/bin/env node
/**
 * Does the layout draw what the schema promises?
 *
 *   node tools/drawcheck.mjs                       # every type
 *   node tools/drawcheck.mjs --types image,compare
 *   node tools/drawcheck.mjs --themes warm-humanist,sci-fi-hud
 *
 * The fit sweep asks whether the text fits and the text check asks whether it
 * survived the render. Neither can see a field that is never drawn: text that
 * is not drawn is not fitted, and never reaches the raster to be missed. So a
 * layout can discard content the model wrote, on every theme, with every
 * instrument reporting clean — and four of them did.
 *
 * `unpopulated` is the other half of the answer and the more important one: the
 * specimen carries nothing for that field, so nothing here or anywhere else has
 * ever rendered it. Enumerate what the fixture does not cover.
 */
import { drawCheck } from "../src/drawcheck.js";

/**
 * Fields a layout is known not to draw, and why.
 *
 * A debt list, not a configuration — the same contract `test/themematrix.test.js`
 * holds. Adding a line is a decision that a field the schema offers will be
 * discarded; removing one is the point. Everything not listed here fails the
 * run, so a layout that starts dropping content says so.
 */
const ACCEPTED = new Map([
  // Full-bleed quotation surfaces: the quote is the slide. Giving them a
  // headline is a design decision about the surface, not a defect to fix.
  ["quote:headline", "the quote is the whole surface"],
  ["quote:standfirst", "the quote is the whole surface"],
  ["epigraph:headline", "the quote is the whole surface"],
  ["epigraph:standfirst", "the quote is the whole surface"],
  // The escape hatch is its own html, by definition.
  ["freeform:headline", "the slide is the html"],
  ["freeform:standfirst", "the slide is the html"],
  // `subtitle` is this type's name for the standfirst's job and wins where both
  // are given, so the marker lands on the field that is correctly not drawn.
  ["hero-image:standfirst", "subtitle carries the role and takes precedence"],
  // Two image references the schema declares as plain strings, so nothing about
  // the field says it is an asset rather than prose.
  ["split-screen:left", "an image reference, not prose"],
  ["split-screen:right", "an image reference, not prose"],
  // A scatter plot's categories are X VALUES, not labels — and the specimen's
  // only chart is a scatter, so no fixture anywhere exercises a bar or line
  // chart's category labels.
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
// Only entries for types this run actually checked: a --types run says nothing
// about the rest of the gallery, and must not claim their entries are stale.
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

// A stale entry is a claim about the product that is no longer true — the same
// failure the theme matrix's allow-list guards against.
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
