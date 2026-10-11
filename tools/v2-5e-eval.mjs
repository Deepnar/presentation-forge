// V2-5E evaluation driver: resize handles, committed geometry,
// style edits, cascade placement, and undo restoration in Chrome
// over committed fixtures.
//   node tools/v2-5e-eval.mjs
// Outputs (gitignored): out/v2-5e/<shot>.png,
// out/v2-5e/eval-manifest.json. Curated shots land in
// docs/v2-5e-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5e");
const PORT = 5246;

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
const centerOf = (id) => `(() => {
  const stage = document.querySelector('[data-stage]');
  const svg = stage.querySelector('svg');
  const s = svg.getBoundingClientRect();
  const loX = Math.max(s.left, 0) + 2, hiX = Math.min(s.right, window.innerWidth) - 2;
  const loY = Math.max(s.top, 0) + 2, hiY = Math.min(s.bottom, window.innerHeight) - 2;
  if (hiX <= loX || hiY <= loY) return null;
  const n = stage.querySelector('[data-el="${id}"]');
  if (!n) return null;
  n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
  const r = inner.getBoundingClientRect();
  if (r.right < loX || r.bottom < loY || r.left > hiX || r.top > hiY) return null;
  const cx = Math.min(Math.max(r.left + r.width / 2, loX), hiX);
  const cy = Math.min(Math.max(r.top + r.height / 2, loY), hiY);
  for (const [x, y] of [[cx, cy], [cx, Math.max(cy - 14, loY)], [cx, Math.min(cy + 14, hiY)]]) {
    const t = document.elementFromPoint(x, y);
    if (t && stage.contains(t)) {
      let top = t.closest('[data-el]');
      if (!top) continue;
      let p = top.parentElement, topId = top.getAttribute('data-el');
      while (p && stage.contains(p)) {
        const g = p.closest('[data-el]');
        if (!g) break;
        top = g; topId = top.getAttribute('data-el'); p = top.parentElement;
      }
      if (topId === '${id}' && top.getAttribute('data-locked') !== 'true') return [x, y];
    }
  }
  return null;
})()`;
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const handlePoint = (id, handle) => `(() => {
  const n = document.querySelector('[data-handle-layer] [data-handle-for="${id}"][data-resize-handle="${handle}"]');
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
})()`;

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
  // 1. Handles + se resize on a shape, with preview/commit numbers.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=2`);
    try {
      await enterEdit(page);
      const shapes = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`);
      // Pick the first shape: a bare rect/ellipse data-el node or a
      // group containing one.
      const target = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        for (const n of stage.querySelectorAll('[data-el]')) {
          if (n.parentElement && n.parentElement.closest('[data-el]')) continue;
          if (n.getAttribute('data-locked') === 'true') continue;
          const tag = n.tagName.toLowerCase();
          if (tag === 'rect' || tag === 'ellipse' || n.querySelector('rect, ellipse')) {
            return n.getAttribute('data-el');
          }
        }
        return null;
      })()`);
      if (!target) throw new Error("no shape on slide 2");
      const c0 = await page.evaluate(centerOf(target));
      await page.click(c0[0], c0[1]);
      await waitFor(page, `document.querySelectorAll('[data-resize-handle]').length === 8`);
      await shot(page, "eval-handles.png", `eight handles on ${target}`);
      const hp = await page.evaluate(handlePoint(target, "se"));
      const before = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      await page.mouseDown(hp[0], hp[1]);
      await page.mouseMove(hp[0] + 60, hp[1] + 40);
      const preview = await page.evaluate(`(() => { const n = document.querySelector('[data-resize-preview]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      manifest.notes.push(`resize preview client rect: ${JSON.stringify(preview)}`);
      await shot(page, "eval-resize-preview.png", "dashed preview at the candidate geometry");
      await page.mouseMove(hp[0] + 120, hp[1] + 60);
      await page.mouseUp(hp[0] + 120, hp[1] + 60);
      await waitFor(page, `(${EDIT}).rev === 1`);
      const after = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      manifest.notes.push(`resize inspector before: ${before.trim()} / after: ${after.trim()}`);
      await shot(page, "eval-resized.png", "committed resize with handles rebuilt");
      // Style the same shape through the panel.
      await waitFor(page, `document.querySelector('[data-style-panel]') !== null`);
      await page.evaluate(`(() => {
        const input = document.querySelector('[data-style-panel] input[aria-label="Shape fill"]');
        input.focus();
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, '#7A2E1F');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(`document.querySelector('[data-style-panel] input[aria-label="Shape fill"]').blur()`);
      await waitFor(page, `(${EDIT}).rev === 2`);
      await shot(page, "eval-styled.png", "human fill 7A2E1F on the resized card");
      // Undo restores geometry and paint.
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`);
      const restored = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      manifest.notes.push(`after undo inspector: ${restored.trim()}`);
      await shot(page, "eval-undo.png", "undo restored geometry and compiler paint");
    } finally {
      await page.close();
    }
  }
  // 2. Cascade + narrow viewport.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      for (let i = 0; i < 3; i++) {
        const add = await page.evaluate(clickText("+ Text"));
        await page.click(add[0], add[1]);
        await waitFor(page, `(${EDIT}).rev === ${i + 1}`);
      }
      await shot(page, "eval-cascade.png", "three inserts stepped diagonally on a chromed narrow slide");
      const sel = await page.evaluate(STATE);
      manifest.notes.push(`cascade selected: ${JSON.stringify(sel.selectedIds)} at rev ${(await page.evaluate(EDIT)).rev}`);
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
