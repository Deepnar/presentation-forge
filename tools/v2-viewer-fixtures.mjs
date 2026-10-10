// Generate committed V2 viewer fixtures: real compiler output for
// the read-only scene viewer and its tests. Deterministic — reruns
// produce byte-identical JSON (asserted by test/v2-viewer-4a).
//   node tools/v2-viewer-fixtures.mjs [--check]
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { benchmarkChrome, BENCHMARK_THEMES } from "./v2-benchmark.mjs";
import { resolvePlateBackgrounds, slideBackgrounds } from "../src/v2-plates.js";
import { mechanismDeck } from "../test/v2-mechanism-fixture.js";
import { benchmarkIntents } from "../test/v2-benchmark-intents.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "web", "src", "scenes");

export const PLATE_FIXTURES = ["mech-gradient-mesh-dark-plain"];

export async function viewerFixtures({ includePlates = true } = {}) {
  const intents = benchmarkIntents();
  const sets = [
    { name: "mech-warm-humanist-plain", intent: { id: "mech", title: "Mechanisms", slides: mechanismDeck().slides }, theme: "warm-humanist", variant: "plain" },
    { name: "mech-warm-humanist-chromed", intent: { id: "mech", title: "Mechanisms", slides: mechanismDeck().slides }, theme: "warm-humanist", variant: "chromed" },
    { name: "source-of-truth-warm-humanist-plain", intent: intents["source-of-truth-project"], theme: "warm-humanist", variant: "plain" },
    { name: "decision-warm-humanist-plain", intent: intents["decision-recommendation"], theme: "warm-humanist", variant: "plain" },
  ];
  // Plate scenes embed multi-MB raster backgrounds per slide: never
  // committed. Generate locally for visual review; the drift check
  // skips them by default (pass --plates to include).
  if (includePlates) {
    sets.push({ name: "mech-gradient-mesh-dark-plain", intent: { id: "mech", title: "Mechanisms", slides: mechanismDeck().slides }, theme: "gradient-mesh-dark", variant: "plain" });
  }
  const out = {};
  for (const set of sets) {
    const design = normalizeDesign({ theme: await loadThemeDocument(set.theme), mode: "light" });
    const backgrounds = await resolvePlateBackgrounds({ themeName: set.theme, mode: "light", design });
    const seam = slideBackgrounds(backgrounds);
    const { plan } = planDeckComposition(set.intent, design);
    const chrome = set.variant === "chromed" ? benchmarkChrome(set.intent, design, { backgrounds, plan }) : null;
    const { scenes } = compileDeckDetailed(set.intent, design, chrome, seam);
    out[set.name] = { name: set.name, theme: set.theme, variant: set.variant, scenes };
  }
  return out;
}

const check = process.argv.includes("--check");
const includePlates = process.argv.includes("--plates");
const fixtures = await viewerFixtures({ includePlates });
await mkdir(OUT, { recursive: true });
if (check) {
  let drift = 0;
  for (const [name, data] of Object.entries(fixtures)) {
    if (!includePlates && PLATE_FIXTURES.includes(name)) continue;
    let prev;
    try {
      prev = JSON.parse(await readFile(path.join(OUT, `${name}.json`), "utf8"));
    } catch {
      console.error(`missing ${name}.json — regenerate with tools/v2-viewer-fixtures.mjs`);
      drift++;
      continue;
    }
    if (JSON.stringify(prev) !== JSON.stringify(data)) {
      console.error(`drift in ${name}.json — regenerate with tools/v2-viewer-fixtures.mjs`);
      drift++;
    }
  }
  if (drift) process.exit(1);
  console.log(`fixtures stable (${Object.keys(fixtures).length} sets)`);
} else {
  for (const [name, data] of Object.entries(fixtures)) {
    if (!includePlates && PLATE_FIXTURES.includes(name)) continue;
    await writeFile(path.join(OUT, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
  }
  console.log(`wrote fixtures to ${OUT} (plates ${includePlates ? "included" : "skipped"})`);
}
