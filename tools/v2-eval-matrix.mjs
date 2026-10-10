// Reproducible V2-3F visual evaluation matrix. Renders the
// twelve composition families (mechanism fixture plus the escape
// slide, which planning never selects) and the committed stress
// decks on every requested theme, plain and chromed, producing
// native PPTX, per-slide SVG, raster PNGs, per-deck contact sheets,
// and a machine-readable manifest. Everything derives from
// committed deterministic fixtures; the manifest carries tool
// versions but no timestamps, so reruns are byte-comparable apart
// from PNG metadata.
//
//   node tools/v2-eval-matrix.mjs --out out/v2-eval [--themes a,b] [--plain|--chromed] [--skip-raster]
//
// Requires LibreOffice (`soffice`) for rasters; plate themes also
// require headless Chrome. Missing tools fail loudly up front.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { compilePlannedSlide } from "../packages/compiler/mechanisms.ts";
import { planDeckChrome, chromePlanForSlide } from "../packages/compiler/chrome.ts";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { preview } from "../src/preview.js";
import { benchmarkChrome } from "./v2-benchmark.mjs";
import { resolvePlateBackgrounds, slideBackgrounds } from "../src/v2-plates.js";
import { mechanismDeck, escapeSlide, escapeComp, stressDecks } from "../test/v2-eval-stress-fixture.js";

export const EVAL_THEMES = [
  "warm-humanist",
  "swiss-international",
  "editorial-magazine",
  "high-contrast-mono",
  "sci-fi-hud",
  "glassmorphism",
  "gradient-mesh-dark",
];

const PLATE_THEMES = ["glassmorphism", "gradient-mesh-dark", "aurora-mesh", "chalkboard", "claymorphism", "isometric-dark", "neumorphism", "retro-crt", "soft-glass-light", "sunset"];

function need(cmd, why) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error(`v2-eval-matrix requires ${why} (ran \`${cmd}\`)`);
  }
}

async function contactSheet(pngs, outFile) {
  const { default: sharp } = await import("sharp");
  const metas = await Promise.all(pngs.map((f) => sharp(f).metadata()));
  const w = Math.max(...metas.map((m) => m.width));
  const h = Math.max(...metas.map((m) => m.height));
  const cols = Math.min(3, pngs.length);
  const rows = Math.ceil(pngs.length / cols);
  const composites = await Promise.all(pngs.map(async (f, i) => ({
    input: await sharp(f).resize(w, h, { fit: "contain", background: "#888888" }).toBuffer(),
    left: (i % cols) * w, top: Math.floor(i / cols) * h,
  })));
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: "#888888" } })
    .composite(composites).png().toFile(outFile);
}

function parseArgs(argv) {
  const args = { out: "out/v2-eval", themes: EVAL_THEMES, variants: ["plain", "chromed"], raster: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--themes") args.themes = argv[++i].split(",");
    else if (argv[i] === "--plain") args.variants = ["plain"];
    else if (argv[i] === "--chromed") args.variants = ["chromed"];
    else if (argv[i] === "--skip-raster") args.raster = false;
  }
  return args;
}

export async function evaluateMatrix({ outDir = "out/v2-eval", themes = EVAL_THEMES, variants = ["plain", "chromed"], raster = true } = {}) {
  const soffice = need("soffice --version", "LibreOffice for PNG rasters");
  let chrome = null;
  if (themes.some((t) => PLATE_THEMES.includes(t))) {
    chrome = need("google-chrome-stable --version", "headless Chrome for plate themes");
  }
  const versions = {
    node: process.version,
    soffice: soffice.split("\n")[0],
    ...(chrome ? { chrome: chrome.split("\n")[0] } : {}),
  };
  await mkdir(outDir, { recursive: true });
  const manifest = { tool: "tools/v2-eval-matrix.mjs", versions, decks: [] };

  const decks = {
    "family-matrix": { id: "mech", title: "Mechanisms", slides: mechanismDeck().slides },
    ...Object.fromEntries(Object.entries(stressDecks()).map(([name, slides]) => [name, { id: name, title: name, slides }])),
  };

  for (const themeName of themes) {
    const design = normalizeDesign({ theme: await loadThemeDocument(themeName), mode: "light" });
    const backgrounds = await resolvePlateBackgrounds({ themeName, mode: "light", design });
    const seam = slideBackgrounds(backgrounds);
    for (const variant of variants) {
      for (const [deckName, intent] of Object.entries(decks)) {
        const { plan } = planDeckComposition(intent, design);
        const chromeInput = variant === "chromed" ? benchmarkChrome(intent, design, { backgrounds, plan }) : null;
        const { scenes } = compileDeckDetailed(intent, design, chromeInput, seam);
        const stem = `${deckName}--${themeName}-${variant}`;
        const dir = path.join(outDir, stem);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${stem}.pptx`), await renderPptx(scenes, {}));
        const entry = {
          deck: deckName, theme: themeName, variant,
          families: plan.slides.map((s) => s.family),
          fixture: deckName === "family-matrix" ? "test/v2-mechanism-fixture.js" : "test/v2-eval-stress-fixture.js",
          slides: [],
        };
        const pngs = [];
        for (const scene of scenes) {
          await writeFile(path.join(dir, `${scene.id}.svg`), sceneToSvg(scene));
          entry.slides.push({ id: scene.id, svg: `${scene.id}.svg` });
        }
        if (raster) {
          const { pages } = await preview(path.join(dir, `${stem}.pptx`), { outDir: path.join(dir, "png") });
          pages.forEach((p, i) => entry.slides[i] && (entry.slides[i].png = path.relative(dir, p)));
          pngs.push(...pages);
          await contactSheet(pages, path.join(outDir, `contact-${stem}.png`));
          entry.contact = `contact-${stem}.png`;
        }
        manifest.decks.push(entry);
      }
      // Escape family: planned-direct (planning never selects it).
      const escIntent = { id: "e", title: "E", slides: [escapeSlide()] };
      const { plan: escPlan } = planDeckComposition(escIntent, design);
      const escChromeInput = variant === "chromed" ? benchmarkChrome(escIntent, design, { backgrounds, plan: escPlan }) : null;
      const escChromePlan = planDeckChrome(escIntent.slides, escChromeInput);
      const escScene = compilePlannedSlide(
        escapeSlide(), escapeComp(), design, [],
        chromePlanForSlide(escChromePlan, "x1"), seam,
      );
      const escScenes = [escScene];
      const escStem = `family-escape--${themeName}-${variant}`;
      const escDir = path.join(outDir, escStem);
      await mkdir(escDir, { recursive: true });      await writeFile(path.join(escDir, `${escStem}.pptx`), await renderPptx(escScenes, {}));
      const escEntry = {
        deck: "family-escape", theme: themeName, variant, families: ["escape"],
        fixture: "test/v2-eval-stress-fixture.js", slides: [],
      };
      for (const s of escScenes) {
        await writeFile(path.join(escDir, `${s.id}.svg`), sceneToSvg(s));
        escEntry.slides.push({ id: s.id, svg: `${s.id}.svg` });
      }
      if (raster) {
        const { pages } = await preview(path.join(escDir, `${escStem}.pptx`), { outDir: path.join(escDir, "png") });
        pages.forEach((p, i) => escEntry.slides[i] && (escEntry.slides[i].png = path.relative(escDir, p)));
        await contactSheet(pages, path.join(outDir, `contact-${escStem}.png`));
        escEntry.contact = `contact-${escStem}.png`;
      }
      manifest.decks.push(escEntry);
    }
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

const run = process.argv[1] ? import.meta.url.endsWith((process.argv[1] ?? "").split("/").pop() ?? "") : false;
if (run) {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await evaluateMatrix({ outDir: args.out, themes: args.themes, variants: args.variants, raster: args.raster });
  console.log(`decks: ${manifest.decks.length}, wrote ${args.out}/manifest.json`);
}
