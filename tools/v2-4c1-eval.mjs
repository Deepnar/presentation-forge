// V2-4C-1 visual evidence driver: compiles a two-slide chart
// intent (micro-scale bar, multi-series pie) through the real
// compiler, renders native PPTX (LibreOffice raster) and
// screenshots the identical scenes in the browser viewer.
//   node tools/v2-4c1-eval.mjs
// Outputs (gitignored): out/v2-4c1/browser/*.png,
// out/v2-4c1/pptx/*.png, out/v2-4c1/eval-manifest.json. The
// curated set lands in docs/v2-4c1-evidence/ by hand after
// review; fixtures round-trip temporarily (reverted in `finally`).
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
const OUT = path.join(ROOT, "out", "v2-4c1");
const PORT = 5214;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

function intent() {
  return {
    id: "micro", title: "Micro-scale and multi-series honesty",
    slides: [
      {
        id: "mc-micro", purpose: "Show micro-scale drift", title: "Drift in microvolts",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "mc-micro-c1", kind: "chart", chartKind: "bar", unit: "uV",
          categories: ["run A", "run B", "run C"],
          series: [{ name: "drift", values: [1e-6, 3e-6, 2e-6] }],
          emphasis: "primary",
        }],
      },
      {
        id: "mc-pie2", purpose: "Show two datasets in one pie", title: "Share and spare",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "mc-pie2-c1", kind: "chart", chartKind: "pie",
          categories: ["x", "y"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }],
          emphasis: "primary",
        }],
      },
      {
        id: "mc-ring2", purpose: "Show two datasets in one doughnut", title: "Ring and spare",
        rhetoricalRole: "evidence",
        blocks: [{
          id: "mc-ring2-c1", kind: "chart", chartKind: "doughnut",
          categories: ["x", "y"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [30, 40] }],
          emphasis: "primary",
        }],
      },
    ],
  };
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

await mkdir(OUT, { recursive: true });
const { loadThemeDocument } = await import("../src/theme-loader.js");
const { normalizeDesign } = await import("../packages/core/design.ts");
const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
const { planDeckComposition } = await import("../packages/compiler/composition.ts");
const { resolvePlateBackgrounds, slideBackgrounds } = await import("../src/v2-plates.js");
const design = normalizeDesign({ theme: await loadThemeDocument("warm-humanist"), mode: "light" });
const backgrounds = await resolvePlateBackgrounds({ themeName: "warm-humanist", mode: "light", design });
const deck = intent();
const { plan } = planDeckComposition(deck, design);
const { scenes } = compileDeckDetailed(deck, design, null, slideBackgrounds(backgrounds));
const fixture = { name: "micro-warm-humanist-plain", theme: "warm-humanist", variant: "plain", scenes };

const prev = await readFile(VIEWER, "utf8");
await writeFile(path.join(SCENES, `${fixture.name}.json`), `${JSON.stringify(fixture, null, 1)}\n`);
await writeFile(VIEWER, prev
  .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
    `import decision from "../scenes/decision-warm-humanist-plain.json";\nimport tmpMicro from "../scenes/${fixture.name}.json";`)
  .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
    "const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, tmpMicro];"));
try {
  build();
  const server = await serveDir(DIST, PORT);
  try {
    for (const [i, scene] of scenes.entries()) {
      const png = path.join(OUT, "browser", `${scene.id}.png`);
      await mkdir(path.dirname(png), { recursive: true });
      await chrome([`--screenshot=${png}`, `http://127.0.0.1:${PORT}/scenes.html?deck=${fixture.name}&slide=${i}`]);
      console.log(`browser ${scene.id} done`);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  const pptx = path.join(OUT, "pptx", `${fixture.name}.pptx`);
  await renderPptxToFile(scenes, pptx);
  const p = await preview(pptx, { outDir: path.join(OUT, "pptx", fixture.name), dpi: 110 });
  console.log(`pptx done (${p.pages.length} slides)`);
  await writeFile(path.join(OUT, "eval-manifest.json"), JSON.stringify({ when: new Date().toISOString(), deck: fixture.name, slides: scenes.map((s) => s.id) }, null, 1) + "\n");
} finally {
  await rm(path.join(SCENES, `${fixture.name}.json`), { force: true });
  await writeFile(VIEWER, prev);
  build();
}
console.log("manifest written");
