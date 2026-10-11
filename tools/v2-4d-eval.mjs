// V2-4D font-fidelity evaluation driver: compiles the mechanism
// deck through the real compiler on seven themes (plain + one
// chromed), renders native PPTX (LibreOffice rasters) and captures
// font-gated browser screenshots of the identical scenes.
//   node tools/v2-4d-eval.mjs [--browser-only] [--pptx-only]
// Outputs (gitignored): out/v2-4d/browser/<tag>.png,
// out/v2-4d/pptx/<deck>/slide-*.png, out/v2-4d/eval-manifest.json.
// Fixtures round-trip through app/web/src/scenes/ temporarily
// (reverted in `finally`); only the curated set lands in
// docs/v2-4d-evidence/ by hand after review. Screenshots use the
// shared CDP font gate (tools/chrome-shot.mjs): captures throw on
// missing faces instead of screenshotting substitutions.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4d");
const PORT = 5215;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

const DECKS = [
  { theme: "warm-humanist", variant: "plain" },
  { theme: "warm-humanist", variant: "chromed" },
  { theme: "swiss-international", variant: "plain" },
  { theme: "editorial-magazine", variant: "plain" },
  { theme: "high-contrast-mono", variant: "plain" },
  { theme: "sci-fi-hud", variant: "plain" },
  { theme: "glassmorphism", variant: "plain" },
  { theme: "gradient-mesh-dark", variant: "plain" },
];

// Representative typography specimens per deck.
const SLIDES = [0, 1, 2, 4, 5, 6];

async function compileDecks() {
  const { loadThemeDocument } = await import("../src/theme-loader.js");
  const { normalizeDesign } = await import("../packages/core/design.ts");
  const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
  const { planDeckComposition } = await import("../packages/compiler/composition.ts");
  const { resolvePlateBackgrounds, slideBackgrounds } = await import("../src/v2-plates.js");
  const { benchmarkChrome } = await import("./v2-benchmark.mjs");
  const { mechanismDeck } = await import("../test/v2-mechanism-fixture.js");
  const out = {};
  for (const deck of DECKS) {
    const intent = { id: "mech", title: "Mechanisms", slides: mechanismDeck().slides };
    // v24d- prefix: temp fixtures must never collide with the
    // committed viewer fixtures (a past run overwrote and deleted
    // two of them on revert). withTempDecks refuses non-temp paths.
    const name = `v24d-${deck.theme}-${deck.variant}`;
    const design = normalizeDesign({ theme: await loadThemeDocument(deck.theme), mode: "light" });
    const backgrounds = await resolvePlateBackgrounds({ themeName: deck.theme, mode: "light", design });
    const { plan } = planDeckComposition(intent, design);
    const chrome = deck.variant === "chromed" ? benchmarkChrome(intent, design, { backgrounds, plan }) : null;
    const { scenes } = compileDeckDetailed(intent, design, chrome, slideBackgrounds(backgrounds));
    out[name] = { name, theme: deck.theme, variant: deck.variant, scenes };
  }
  return out;
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

async function withTempDecks(fixtures, fn) {
  const prev = await readFile(VIEWER, "utf8");
  const names = Object.keys(fixtures);
  for (const name of names) {
    if (!name.startsWith("v24d-")) throw new Error(`refusing non-temp fixture ${name}`);
  }
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
  const { fontGatedScreenshot } = await import("./chrome-shot.mjs");
  await withTempDecks(fixtures, async () => {
    build();
    const server = await serveDir(DIST, PORT);
    const shots = [];
    try {
      for (const [name, data] of Object.entries(fixtures)) {
        for (const i of SLIDES) {
          if (i >= data.scenes.length) continue;
          const tag = `${name.replace("mech-", "").replace("-plain", "")}-${data.scenes[i].id}`;
          const png = path.join(OUT, "browser", `${tag}.png`);
          await mkdir(path.dirname(png), { recursive: true });
          const r = await fontGatedScreenshot(
            `http://127.0.0.1:${PORT}/scenes.html?deck=${name}&slide=${i}`, png, { w: 1440, h: 900 });
          shots.push({ tag, deck: name, slide: i, missing: r.missing });
          console.log(`browser ${tag} done (missing: ${r.missing.join(",") || "none"})`);
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
