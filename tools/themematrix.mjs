#!/usr/bin/env node
/**
 * Render every slide type in every theme and report what will not fit.
 *
 *   node tools/themematrix.mjs                          # 38 themes x 75 types
 *   node tools/themematrix.mjs --themes flow-heavy,a,b
 *   node tools/themematrix.mjs --types flow,branching-flow
 *   node tools/themematrix.mjs --mode both              # light and dark
 *   node tools/themematrix.mjs --deck decks/<slug>/deck.yaml
 *   node tools/themematrix.mjs --notes                  # every slide with a note bar
 *   node tools/themematrix.mjs --save .themeaudit/base.json
 *   node tools/themematrix.mjs --against .themeaudit/base.json
 *
 * `--against` is the gate: it exits non-zero when a change introduces a
 * theme/type failure the saved run did not have, which is the failure mode a
 * layout change actually causes — a narrower measure somewhere costs an
 * unrelated theme its body text, and the .pptx still writes.
 *
 * Nothing here rasterises. It proves text fits at a legible size and nothing
 * more; use tools/themeaudit.mjs to look at the slides.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { themeMatrix, byType, signature } from "../src/themematrix.js";
import { loadDeck } from "../src/validate.js";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const modeFlag = arg("--mode", "light");
const modes = modeFlag === "both" ? ["light", "dark"] : [modeFlag];
const quiet = process.argv.includes("--quiet");

const deckFile = arg("--deck");
const result = await themeMatrix({
  themes: list(arg("--themes")),
  types: list(arg("--types")),
  deck: deckFile ? await loadDeck(deckFile) : undefined,
  notes: process.argv.includes("--notes"),
  modes,
  onRun: quiet ? undefined : (r) => {
    const tag = `${r.theme}${modes.length > 1 ? `/${r.mode}` : ""}`;
    const verdict = r.failed ? "RENDER FAILED" : r.problems.length ? `${r.problems.length} problem(s)` : "ok";
    console.log(`  ${tag.padEnd(28)} ${String(r.slides).padStart(3)} slides  ${verdict}`);
  },
});

if (result.unknown.length) console.error(`  unknown slide type(s): ${result.unknown.join(", ")}`);

const grouped = byType(result);
if (grouped.length) {
  console.log(`\n  ${result.total} problem(s) across ${grouped.length} slide type(s):\n`);
  for (const [type, hits] of grouped) {
    console.log(`  ${type}  (${hits.length})`);
    for (const h of hits) console.log(`      ${h.theme}${h.mode === "light" ? "" : `/${h.mode}`}: ${h.detail}`);
  }
} else {
  console.log(`\n  no problems across ${result.runs.length} run(s).`);
}

const save = arg("--save");
if (save) {
  await mkdir(path.dirname(save), { recursive: true });
  await writeFile(save, JSON.stringify({ runs: result.runs, total: result.total }, null, 2), "utf8");
  console.log(`\n  saved -> ${save}`);
}

const against = arg("--against");
if (against) {
  const before = signature(JSON.parse(await readFile(against, "utf8")));
  const now = signature(result);
  const count = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
  const b = count(before), n = count(now);
  const added = [...n].filter(([k, v]) => v > (b.get(k) ?? 0));
  const gone = [...b].filter(([k, v]) => v > (n.get(k) ?? 0));

  console.log("");
  for (const [k] of gone) console.log(`  fixed  ${k}`);
  for (const [k] of added) console.log(`  NEW    ${k}`);
  if (!added.length && !gone.length) console.log(`  unchanged against ${path.basename(against)}`);
  if (added.length) process.exitCode = 1;
}
