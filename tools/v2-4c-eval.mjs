// V2-4C chart evaluation driver: compiles a chart-focused intent
// through the real compiler on three themes, renders native PPTX
// (LibreOffice rasters) and screenshots the same scenes in the
// read-only browser viewer, for fidelity review.
//   node tools/v2-4c-eval.mjs [--browser-only] [--pptx-only]
// Outputs (gitignored): out/v2-4c/browser/<tag>.png,
// out/v2-4c/pptx/<deck>/slide-*.png, out/v2-4c/eval-manifest.json.
// Chart fixtures round-trip through app/web/src/scenes/ temporarily
// (reverted in `finally`); only the curated set lands in
// docs/v2-4c-evidence/ by hand after review.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { mkdtemp, rm as rmDir } from "node:fs/promises";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4c");
const PORT = 5213;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

// Explicit chartKind without measure passes straight through
// composition (no HONEST fallback): this is the real Layer-C
// path for hbar/pie/area/multi-series/negative datasets.
function chartIntent() {
  const chart = (id, title, chartKind, categories, series, extra = {}) => ({
    id, purpose: `Show ${title}`, title, rhetoricalRole: "evidence",
    blocks: [{ id: `${id}-c1`, kind: "chart", chartKind, categories, series, emphasis: "primary", ...extra }],
  });
  return {
    id: "charts", title: "Chart fidelity",
    slides: [
      chart("ch-bar", "Two chemistries, twice", "bar",
        ["Oxide", "Sulfide", "Polymer", "Garnet"],
        [{ name: "mS/cm", values: [1.2, 12.5, 0.4, 3.1] }, { name: "target", values: [2, 2, 2, 2] }],
        { unit: "mS/cm" }),
      chart("ch-neg", "Losses and gains", "bar",
        ["Q1", "Q2", "Q3", "Q4"], [{ name: "delta", values: [3, -2, 0, 1.5] }]),
      chart("ch-hbar", "Throughput by line", "hbar",
        ["Alpha line", "Beta line", "Gamma line"], [{ name: "units", values: [42, 17, 29] }]),
      chart("ch-line", "Drift over runs", "line",
        ["r1", "r2", "r3", "r4", "r5", "r6"],
        [{ name: "oxide", values: [1.1, 1.3, 1.2, 1.6, 1.5, 1.9] }, { name: "sulfide", values: [12.1, 11.8, 12.5, 12.2, 12.9, 12.4] }]),
      chart("ch-area", "Coverage growth", "area",
        ["w1", "w2", "w3", "w4"], [{ name: "share", values: [0.2, 0.5, 0.45, 0.9] }]),
      chart("ch-pie", "Mix by chemistry", "pie",
        ["Oxide", "Sulfide", "Polymer"], [{ name: "share", values: [1, 3, 2] }]),
      chart("ch-ring", "Capacity share", "doughnut",
        ["Oxide", "Sulfide", "Polymer", "Garnet"], [{ name: "share", values: [4, 1, 0, 2] }]),
      chart("ch-dense", "Dense detector readout with long names", "bar",
        ["North detector array", "South detector array", "East detector array", "West detector array",
          "Central detector array", "Spare detector array", "Lab detector array", "Field detector array"],
        [{ name: "hourly mean event rate", values: [3, 7, 2, 9, 5, 1, 8, 4] }]),
    ],
  };
}

const DECKS = [
  { theme: "warm-humanist", variant: "plain", slides: null },
  { theme: "warm-humanist", variant: "chromed", slides: null },
  { theme: "high-contrast-mono", variant: "plain", slides: ["ch-bar", "ch-line"] },
  { theme: "gradient-mesh-dark", variant: "plain", slides: ["ch-bar", "ch-ring"] },
];

async function compileDecks() {
  const { loadThemeDocument } = await import("../src/theme-loader.js");
  const { normalizeDesign } = await import("../packages/core/design.ts");
  const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
  const { planDeckComposition } = await import("../packages/compiler/composition.ts");
  const { resolvePlateBackgrounds, slideBackgrounds } = await import("../src/v2-plates.js");
  const { benchmarkChrome } = await import("./v2-benchmark.mjs");
  const out = {};
  for (const deck of DECKS) {
    const intent = chartIntent();
    if (deck.slides) intent.slides = intent.slides.filter((s) => deck.slides.includes(s.id));
    const name = `charts-${deck.theme}-${deck.variant}`;
    const design = normalizeDesign({ theme: await loadThemeDocument(deck.theme), mode: "light" });
    const backgrounds = await resolvePlateBackgrounds({ themeName: deck.theme, mode: "light", design });
    const { plan } = planDeckComposition(intent, design);
    const chrome = deck.variant === "chromed" ? benchmarkChrome(intent, design, { backgrounds, plan }) : null;
    const { scenes } = compileDeckDetailed(intent, design, chrome, slideBackgrounds(backgrounds));
    out[name] = { name, theme: deck.theme, variant: deck.variant, scenes };
  }
  return out;
}

async function chrome(args, timeout = 60000) {
  const profile = await mkdtemp(join(tmpdir(), "opencode-eval-"));
  try {
    await execFileAsync("google-chrome-stable", [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
      "--no-first-run", `--user-data-dir=${profile}`, "--hide-scrollbars",
      "--window-size=1440,900", "--ozone-override-screen-size=1440,900", ...args,
    ], { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  } finally {
    await rmDir(profile, { recursive: true, force: true });
  }
}

function serveDir(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      const file = join(dir, rel);
      if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end("no such file"); }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
}

const SCENES = path.join(ROOT, "app", "web", "src", "scenes");
const VIEWER = path.join(ROOT, "app", "web", "src", "components", "SceneViewer.jsx");

// Temporary viewer round-trip (as in v2-4a-eval): fixtures are too
// large and too eval-specific to commit; revert in `finally`.
async function withTempDecks(fixtures, fn) {
  const prev = await readFile(VIEWER, "utf8");
  const names = Object.keys(fixtures);
  for (const [name, data] of Object.entries(fixtures)) {
    await writeFile(path.join(SCENES, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
  }
  const imports = names.map((n, i) => `import tmpDeck${i} from "../scenes/${n}.json";`).join("\n");
  await writeFile(VIEWER, prev
    .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
      `import decision from "../scenes/decision-warm-humanist-plain.json";\n${imports}`)
    .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
      `const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, ${names.map((_, i) => `tmpDeck${i}`).join(", ")}];`));
  try {
    await fn();
  } finally {
    for (const name of names) await rm(path.join(SCENES, `${name}.json`), { force: true });
    await writeFile(VIEWER, prev);
    build();
  }
}

const args = new Set(process.argv.slice(2));
await mkdir(OUT, { recursive: true });
const fixtures = await compileDecks();
const manifest = { when: new Date().toISOString(), decks: Object.keys(fixtures) };

if (!args.has("--pptx-only")) {
  await withTempDecks(fixtures, async () => {
    build();
    const server = await serveDir(DIST, PORT);
    const shots = [];
    try {
      for (const [name, data] of Object.entries(fixtures)) {
        for (const [i, scene] of data.scenes.entries()) {
          const tag = `${name.replace("charts-", "").replace("-plain", "").replace("-chromed", "-chromed")}-${scene.id}`;
          const png = path.join(OUT, "browser", `${tag}.png`);
          await mkdir(path.dirname(png), { recursive: true });
          await chrome([`--screenshot=${png}`, `http://127.0.0.1:${PORT}/scenes.html?deck=${name}&slide=${i}`]);
          shots.push({ tag, deck: name, slide: i });
          console.log(`browser ${tag} done`);
        }
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
    manifest.browser = shots;
  });
}

if (!args.has("--browser-only")) {
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  manifest.pptx = [];
  for (const [name, data] of Object.entries(fixtures)) {
    const pptx = path.join(OUT, "pptx", `${name}.pptx`);
    await renderPptxToFile(data.scenes, pptx);
    const p = await preview(pptx, { outDir: path.join(OUT, "pptx", name), dpi: 110 });
    manifest.pptx.push({ deck: name, slides: p.pages.map((f) => path.relative(OUT, f)) });
    console.log(`pptx ${name} done (${p.pages.length} slides)`);
  }
}

await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("manifest written");
