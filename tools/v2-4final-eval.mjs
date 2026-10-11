// V2-4 final gate driver: identical live-compiled scenes to the
// browser (temporary fixture round-trip, reverted in `finally`)
// and to native PPTX rasters, across seven themes plus chromed.
//   node tools/v2-4final-eval.mjs
// Outputs (gitignored): out/v2-4final/browser/<tag>.png,
// out/v2-4final/pptx/<deck>/slide-*.png, out/v2-4final/eval-manifest.json.
// Curated pairs land in docs/v2-4-final-evidence/ by hand after
// review. The live-panel path itself is covered by tools/v2-4f-eval.mjs;
// this driver proves browser/PPTX parity on identical scenes per theme.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4final");
const PORT = 5236;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2",
};

const THEMES = [
  "warm-humanist", "swiss-international", "editorial-magazine",
  "high-contrast-mono", "sci-fi-hud", "glassmorphism", "gradient-mesh-dark",
];
// Divider (display type) + chart (geometry + labels) per theme;
// chromed warm-humanist adds the locked-chrome pair.
const SLIDES = [0, 6];
const VARIANTS = { "warm-humanist": ["plain", "chromed"] };

const { compileLiveDeck } = await import("../app/server/v2-scenes-routes.js");
import { setHostedForTest } from "../src/cloud.js";
setHostedForTest(false);
const { mechanismDeck } = await import("../test/v2-mechanism-fixture.js");
const { openViewer } = await import("./chrome-shot.mjs");

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
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

const SCENES = path.join(ROOT, "app", "web", "src", "scenes");
const VIEWER = path.join(ROOT, "app", "web", "src", "components", "SceneViewer.jsx");

const fixtures = {};
for (const theme of THEMES) {
  for (const variant of VARIANTS[theme] ?? ["plain"]) {
    const name = `v2final-${theme}-${variant}`;
    const intent = { id: "gate", title: "Mechanisms", slides: mechanismDeck().slides };
    const out = await compileLiveDeck({ intent, theme, variant });
    fixtures[name] = { name, theme, variant, scenes: out.scenes, findings: out.findings.length, fitDiagnostics: out.fitDiagnostics.length };
  }
}

await mkdir(path.join(OUT, "browser"), { recursive: true });
const manifest = { when: new Date().toISOString(), baseline: "c45a473", themes: Object.keys(fixtures) };

const prev = await readFile(VIEWER, "utf8");
const names = Object.keys(fixtures);
for (const name of names) {
  if (!name.startsWith("v2final-")) throw new Error(`refusing non-temp fixture ${name}`);
}
for (const [name, data] of Object.entries(fixtures)) {
  await writeFile(path.join(SCENES, `${name}.json`), JSON.stringify({ name, theme: data.theme, variant: data.variant, scenes: data.scenes }));
}
const imports = names.map((n, i) => `import tmpDeck${i} from "../scenes/${n}.json";`).join("\n");
await writeFile(VIEWER, prev
  .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
    `import decision from "../scenes/decision-warm-humanist-plain.json";\n${imports}`)
  .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
    `const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, ${names.map((_, i) => `tmpDeck${i}`).join(", ")}];`));
const shots = [];
try {
  build();
  const server = await serveDir(DIST, PORT);
  try {
    for (const [name, data] of Object.entries(fixtures)) {
      for (const i of SLIDES) {
        const tag = `${name.replace("v2final-", "")}-s${i}`;
        const png = path.join(OUT, "browser", `${tag}.png`);
        const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=${name}&slide=${i}`, { w: 1440, h: 900 });
        try {
          const miss = await page.evaluate(`document.querySelector('[data-missing-fonts]').dataset.missingFonts`);
          await page.screenshot(png);
          shots.push({ tag, deck: name, slide: i, missing: miss ? miss.split(",") : [] });
          console.log(`browser ${tag} (missing: ${miss || "none"})`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  manifest.pptx = [];
  for (const [name, data] of Object.entries(fixtures)) {
    const pptx = path.join(OUT, "pptx", `${name}.pptx`);
    await mkdir(path.join(OUT, "pptx"), { recursive: true });
    await renderPptxToFile(data.scenes, pptx);
    const p = await preview(pptx, { outDir: path.join(OUT, "pptx", name), dpi: 110 });
    manifest.pptx.push({ deck: name, slides: p.pages.map((f) => path.relative(OUT, f)) });
    console.log(`pptx ${name} done (${p.pages.length} slides)`);
  }
} finally {
  for (const name of names) await rm(path.join(SCENES, `${name}.json`), { force: true });
  await writeFile(VIEWER, prev);
  build();
}
manifest.browser = shots;
await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("manifest written");
setHostedForTest(null);
