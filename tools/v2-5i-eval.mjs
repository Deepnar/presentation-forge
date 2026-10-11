// Visual slide-management evaluation driver: blank insert,
// duplicate, keyboard reorder, delete confirm, detach, and undo
// in Chrome over a committed fixture.
//   node tools/v2-5i-eval.mjs
// Outputs (gitignored): out/slide-management/eval-*.png,
// out/slide-management/eval-manifest.json. Curated shots land in
// docs/slide-management-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "slide-management");
const PORT = 5255;
const DECK = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0`;

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

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
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

async function slideOrder(page) {
  return page.evaluate(`[...document.querySelectorAll('[data-thumb]')].map((n) => n.getAttribute('data-thumb'))`);
}

async function clickThumb(page, id) {
  const pt = await page.evaluate(`(() => {
    const n = document.querySelector('[data-thumb="${id}"]');
    if (!n) return null;
    n.scrollIntoView({ block: 'nearest' });
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + Math.min(30, r.height / 2)];
  })()`);
  if (!pt) throw new Error(`thumb ${id} missing`);
  await page.click(pt[0], pt[1]);
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
  const page = await openViewer(DECK);
  try {
    await enterEdit(page);
    const before = await slideOrder(page);
    manifest.notes.push(`starting order: ${before.join(",")}`);
    // Blank slide.
    const add = await page.evaluate(clickText("+ Slide"));
    await page.click(add[0], add[1]);
    await waitFor(page, `(${EDIT}).rev === 1`);
    const blankId = (await page.evaluate(STATE)).slideId;
    manifest.notes.push(`blank slide id: ${blankId}`);
    await shot(page, "eval-blank.png", "new blank slide, navigated, empty stage");
    // Keyboard reorder: Alt+ArrowDown on the blank thumb moves it down.
    await page.evaluate(`(() => { const n = document.querySelector('[data-thumb="${blankId}"]'); n.focus(); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })); })()`);
    await waitFor(page, `(${EDIT}).rev === 2`);
    const moved = await slideOrder(page);
    manifest.notes.push(`after keyboard move: ${moved.join(",")}`);
    await shot(page, "eval-keyboard-reorder.png", "blank moved down by keyboard, identity followed");
    // Delete with inline confirm.
    await clickThumb(page, blankId);
    const menu = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu="${blankId}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await page.click(menu[0], menu[1]);
    await waitFor(page, `document.querySelector('[data-slide-menu="${blankId}"]') !== null`);
    const del = await page.evaluate(clickText("Delete…"));
    await page.click(del[0], del[1]);
    await shot(page, "eval-delete-confirm.png", "two-step delete confirmation, no native dialog");
    const confirm = await page.evaluate(clickText("Confirm delete"));
    await page.click(confirm[0], confirm[1]);
    await waitFor(page, `(${EDIT}).rev === 3`);
    assertOrder(await slideOrder(page), before, "delete restored the starting order");
    // Detach the second slide.
    const target = before[1];
    await clickThumb(page, target);
    const menu2 = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu="${target}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await page.click(menu2[0], menu2[1]);
    await waitFor(page, `document.querySelector('[data-slide-menu="${target}"]') !== null`);
    const detach = await page.evaluate(clickText("Detach from AI layout"));
    await page.click(detach[0], detach[1]);
    await waitFor(page, `(${EDIT}).rev === 4`);
    await shot(page, "eval-detached.png", "manual badge on the detached thumb");
    // Undo everything back.
    const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    for (let i = 0; i < 4; i++) {
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === ${5 + i}`);
    }
    assertOrder(await slideOrder(page), before, "four undos restored the starting deck");
    await shot(page, "eval-undone.png", "order, identities, and states restored");
    function assertOrder(got, want, why) {
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(`${why}: got ${got.join(",")} want ${want.join(",")}`);
      }
    }
  } finally {
    await page.close();
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
