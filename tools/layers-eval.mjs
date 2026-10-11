// Layers evaluation driver: tree, restack, lock/hide cycle,
// and undo in Chrome over committed fixtures. No fixture deck
// carries groups, so group expansion is proven headlessly
// (flattenLayers/applyCollapse units), not here.
//   node tools/layers-eval.mjs
// Outputs (gitignored): out/layers/eval-*.png,
// out/layers/eval-manifest.json. Curated shots land in
// docs/layers-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "layers");
const PORT = 5257;

const { openViewer } = await import("./chrome-shot.mjs");

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
}

async function serve() {
  const app = express();
  app.use(express.static(DIST));
  return new Promise((resolve, reject) => {
    const s = app.listen(PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
}

const EDIT = `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState)`;
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;

async function waitFor(page, expr, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 100)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function enterEdit(page) {
  const pt = await page.evaluate(clickText("Edit"));
  if (!pt) throw new Error("Edit toggle missing");
  await page.click(pt[0], pt[1]);
  await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`);
}

async function openLayers(page) {
  const tab = await page.evaluate(clickText("Layers"));
  if (!tab) throw new Error("Layers tab missing");
  await page.click(tab[0], tab[1]);
  await waitFor(page, `document.querySelector('[data-layers]') !== null`);
}

async function layerOrder(page) {
  return page.evaluate(`[...document.querySelectorAll('[data-layer]')].map((n) => n.getAttribute('data-layer'))`);
}

const manifest = { shots: [], notes: [] };
async function shot(page, name, note) {
  await page.screenshot(`${OUT}/${name}`);
  manifest.shots.push(name);
  if (note) manifest.notes.push(`${name}: ${note}`);
  console.log(`shot ${name}${note ? ` — ${note}` : ""}`);
}

build();
await mkdir(OUT, { recursive: true });
const server = await serve();
try {
  // 1. Tree + restack + undo on the cards slide.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=2`);
    try {
      await enterEdit(page);
      await openLayers(page);
      const before = await layerOrder(page);
      manifest.notes.push(`cards tree: ${before.join(",")}`);
      await shot(page, "eval-tree.png", "layer tree with readable labels over the cards slide");
      const content = before.find((id) => /content/.test(id));
      const down = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${content}"]');
        const b = [...row.querySelectorAll('button')].find((x) => x.textContent === '↓');
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.click(down[0], down[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      await shot(page, "eval-restacked.png", "card body sent behind its frame, text covered");
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`);
      assertOrder(await layerOrder(page), before, "undo restored the stack");
    } finally {
      await page.close();
    }
  }
  // 2. Lock/hide cycle on a chromed slide (marks intact).
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`);
    try {
      await enterEdit(page);
      await openLayers(page);
      const target = (await layerOrder(page)).find((id) => !/chrome|banner/i.test(id));
      const lock = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Lock'));
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.click(lock[0], lock[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      await shot(page, "eval-locked.png", "locked row with chrome marks intact");
      const hide = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Unlock'));
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      // Unlock first (locked refuses hiding), then hide.
      await page.click(hide[0], hide[1]);
      await waitFor(page, `(${EDIT}).rev === 2`);
      const eye = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Hide'));
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.click(eye[0], eye[1]);
      await waitFor(page, `(${EDIT}).rev === 3`);
      await shot(page, "eval-hidden.png", "hidden row dimmed, projection without it, chrome intact");
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
  function assertOrder(got, want, why) {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`${why}: got ${got.join(",")} want ${want.join(",")}`);
    }
  }
} finally {
  server.close();
}
