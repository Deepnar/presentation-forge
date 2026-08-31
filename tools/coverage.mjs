#!/usr/bin/env node
/**
 * What does the visual sweep cover, and what would deleting a theme cost?
 *
 *   node tools/coverage.mjs                          # the covering set's report
 *   node tools/coverage.mjs --without minimal-muji   # what deleting it costs
 *   node tools/coverage.mjs --without a,b,c
 *
 * The gallery is deliberately large and a theme that does not earn its place
 * should go. The only thing deletion can break that is not obvious from looking
 * is COVERAGE: the layouts branch on composition axes, and a theme may be the
 * last one carrying a frame, an opening or a list treatment. Delete that and
 * the branch is never rendered by any sweep again — it does not fail, it simply
 * stops being looked at.
 *
 * So: run this before deleting, not after. It answers only that question.
 * Whether a theme is any good is a matter of taste and is not machine-decidable.
 */
import { loadTheme } from "../src/theme.js";
import { COVERING_THEMES, themeTraits, allThemeNames, coverageReport } from "../src/coverage.js";

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const doomed = list(arg("--without"));
const names = await allThemeNames();

if (!doomed) {
  const { missing, redundant, values, themes } = await coverageReport();
  console.log(`\n  ${COVERING_THEMES.length} covering themes carry ${values} axis values across ${themes} themes.\n`);
  for (const t of COVERING_THEMES) console.log(`  ${t}`);
  if (missing.length) {
    console.log(`\n  NOT COVERED — a branch no sweep renders:\n`);
    for (const m of missing) console.log(`  ${m.trait.padEnd(24)} only on ${m.theme}`);
  }
  if (redundant.length) console.log(`\n  redundant: ${redundant.join(", ")}`);
  console.log();
  process.exit(missing.length ? 1 : 0);
}

const unknown = doomed.filter((d) => !names.includes(d));
if (unknown.length) {
  console.error(`\n  no such theme: ${unknown.join(", ")}\n`);
  process.exit(2);
}

const traits = new Map();
for (const n of names) {
  try { traits.set(n, themeTraits(await loadTheme(n))); } catch { /* the loader's problem */ }
}

const survivors = names.filter((n) => !doomed.includes(n));
const left = new Set(survivors.flatMap((n) => [...(traits.get(n) ?? [])]));

const lost = [];
for (const d of doomed) {
  for (const t of traits.get(d) ?? []) if (!left.has(t)) lost.push({ trait: t, theme: d });
}

console.log(`\n  deleting ${doomed.length} theme(s) leaves ${survivors.length} of ${names.length}.\n`);

if (lost.length) {
  console.log(`  THIS DELETES A LAYOUT BRANCH — no remaining theme exercises:\n`);
  for (const l of lost) console.log(`  ${l.trait.padEnd(24)} was only on ${l.theme}`);
  console.log(`\n  Either keep one of those themes, or delete the branch from`);
  console.log(`  src/composition.js too — an axis value no theme selects is dead code.\n`);
} else {
  console.log(`  no axis value is lost; every branch stays covered.\n`);
}

const hitCovering = doomed.filter((d) => COVERING_THEMES.includes(d));
if (hitCovering.length) {
  console.log(`  ${hitCovering.join(", ")} ${hitCovering.length > 1 ? "are" : "is"} in COVERING_THEMES.`);
  console.log(`  Update src/coverage.js and re-run test/coverage.test.js.\n`);
}

process.exitCode = lost.length ? 1 : 0;
