// V2-4A visual evaluation driver: renders representative fixture
// slides to PPTX (native path) and screenshots the same slides in
// the read-only browser viewer, for side-by-side fidelity review.
//   node tools/v2-4a-eval.mjs [--browser-only] [--pptx-only]
// Outputs (gitignored): out/v2-4a/browser/<tag>.png,
// out/v2-4a/pptx/<deck>/slide-<NN>.png, out/v2-4a/eval-manifest.json.
// Curated evidence is copied to docs/v2-4a-evidence/ by hand after
// review — this driver never writes outside out/ except for a
// temporary plate-fixture round-trip (reverted in `finally`).
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
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
const OUT = path.join(ROOT, "out", "v2-4a");
const PORT = 5212;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

// deck fixture, slide index, evidence tag.
const TARGETS = [
  ["mech-warm-humanist-plain", 0, "divider"],
  ["mech-warm-humanist-plain", 1, "prose"],
  ["mech-warm-humanist-plain", 2, "cards"],
  ["mech-warm-humanist-plain", 3, "compare"],
  ["mech-warm-humanist-plain", 4, "table"],
  ["mech-warm-humanist-plain", 5, "metric"],
  ["mech-warm-humanist-plain", 6, "chart"],
  ["source-of-truth-warm-humanist-plain", 2, "status"],
  ["mech-warm-humanist-chromed", 1, "chromed"],
  ["mech-gradient-mesh-dark-plain", 0, "plate-dark"],
];

const PPTX_DECKS = [
  "mech-warm-humanist-plain",
  "source-of-truth-warm-humanist-plain",
  "mech-warm-humanist-chromed",
  "mech-gradient-mesh-dark-plain",
];

async function chrome(args, timeout = 60000) {
  const profile = await mkdtemp(join(tmpdir(), "opencode-eval-"));
  try {
    const { stdout } = await execFileAsync("google-chrome-stable", [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
      "--no-first-run", `--user-data-dir=${profile}`, "--hide-scrollbars",
      "--window-size=1440,900", "--ozone-override-screen-size=1440,900", ...args,
    ], { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
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

async function browserCaptures() {
  build();
  const server = await serveDir(DIST, PORT);
  const shots = [];
  try {
    for (const [deck, slide, tag] of TARGETS) {
      const url = `http://127.0.0.1:${PORT}/scenes.html?deck=${deck}&slide=${slide}`;
      const png = path.join(OUT, "browser", `${tag}.png`);
      await mkdir(path.dirname(png), { recursive: true });
      await chrome([`--screenshot=${png}`, url]);
      shots.push({ tag, deck, slide, png: path.relative(OUT, png) });
      console.log(`browser ${tag} done`);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  return shots;
}

async function pptxRasters() {
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  const out = [];
  for (const deck of PPTX_DECKS) {
    const fixture = JSON.parse(await readFile(path.join(ROOT, "app", "web", "src", "scenes", `${deck}.json`), "utf8"));
    const pptx = path.join(OUT, "pptx", `${deck}.pptx`);
    await renderPptxToFile(fixture.scenes, pptx);
    const p = await preview(pptx, { outDir: path.join(OUT, "pptx", deck), dpi: 110 });
    out.push({ deck, slides: p.pages.map((f) => path.relative(OUT, f)) });
    console.log(`pptx ${deck} done (${p.pages.length} slides)`);
  }
  return out;
}

// The plate fixture (25MB of embedded plate rasters) is never
// committed: generate locally, screenshot, then remove + rebuild.
async function withPlateFixture(fn) {
  const { viewerFixtures } = await import("./v2-viewer-fixtures.mjs");
  const fixtures = await viewerFixtures({ includePlates: true });
  const plate = fixtures["mech-gradient-mesh-dark-plain"];
  const dest = path.join(ROOT, "app", "web", "src", "scenes", "mech-gradient-mesh-dark-plain.json");
  const viewerPath = path.join(ROOT, "app", "web", "src", "components", "SceneViewer.jsx");
  const prev = await readFile(viewerPath, "utf8");
  await writeFile(dest, `${JSON.stringify(plate, null, 1)}\n`);
  await writeFile(viewerPath, prev
    .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
      'import decision from "../scenes/decision-warm-humanist-plain.json";\nimport plateDark from "../scenes/mech-gradient-mesh-dark-plain.json";')
    .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
      "const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, plateDark];"));
  try {
    await fn();
  } finally {
    await rm(dest, { force: true });
    await writeFile(viewerPath, prev);
    build();
  }
}

const args = new Set(process.argv.slice(2));
const manifest = { when: new Date().toISOString(), targets: TARGETS.map(([deck, slide, tag]) => ({ deck, slide, tag })) };
if (!args.has("--pptx-only")) {
  manifest.browser = await withPlateFixture(browserCaptures);
}
if (!args.has("--browser-only")) {
  // Plate scenes for the PPTX path come from the generator (never
  // committed); the rest load from the checked-in fixtures.
  const { viewerFixtures } = await import("./v2-viewer-fixtures.mjs");
  const fixtures = await viewerFixtures({ includePlates: true });
  manifest.pptx = await pptxRastersWithPlates(fixtures);
}

async function pptxRastersWithPlates(fixtures) {
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  const out = [];
  for (const deck of PPTX_DECKS) {
    let scenes;
    if (deck === "mech-gradient-mesh-dark-plain") {
      scenes = fixtures[deck].scenes;
    } else {
      scenes = JSON.parse(await readFile(path.join(ROOT, "app", "web", "src", "scenes", `${deck}.json`), "utf8")).scenes;
    }
    const pptx = path.join(OUT, "pptx", `${deck}.pptx`);
    await renderPptxToFile(scenes, pptx);
    const p = await preview(pptx, { outDir: path.join(OUT, "pptx", deck), dpi: 110 });
    out.push({ deck, slides: p.pages.map((f) => path.relative(OUT, f)) });
    console.log(`pptx ${deck} done (${p.pages.length} slides)`);
  }
  return out;
}

await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("manifest written");
