// V2-5D evaluation driver: real Edit-panel flows in Chrome over
// committed fixtures — overlay fidelity, commit, rich-text refusal,
// chromed insertion, and undo restoration.
//   node tools/v2-5d-eval.mjs
// Outputs (gitignored): out/v2-5d/<shot>.png,
// out/v2-5d/eval-manifest.json. Curated shots land in
// docs/v2-5d-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5d");
const PORT = 5244;

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
const SIMPLE_IDS = `(() => {
  const stage = document.querySelector('[data-stage]');
  return [...stage.querySelectorAll('[data-el]')].filter((n) => {
    if (n.parentElement && n.parentElement.closest('[data-el]')) return false;
    if (n.getAttribute('data-locked') === 'true') return false;
    return true;
  }).map((n) => n.getAttribute('data-el'));
})()`;
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
  // 1. Overlay fidelity on a prose slide.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        return [...stage.querySelectorAll('[data-el]')].filter((n) => {
          if (n.parentElement && n.parentElement.closest('[data-el]')) return false;
          if (n.getAttribute('data-locked') === 'true') return false;
          return n.querySelectorAll('text').length === 1;
        }).map((n) => n.getAttribute('data-el'));
      })()`);
      const id = ids[0];
      console.log("simple ids:", JSON.stringify(ids));
      const c0 = await page.evaluate(centerOf(id));
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${id}"]') !== null`);
      const geom = await page.evaluate(`(() => {
        const ta = document.querySelector('[data-text-edit="${id}"]');
        const el = document.querySelector('[data-stage] [data-el="${id}"]');
        const a = ta.getBoundingClientRect(), b = el.getBoundingClientRect();
        return { dx: a.left - b.left, dy: a.top - b.top, dw: a.width - b.width, dh: a.height - b.height };
      })()`);
      manifest.notes.push(`overlay-vs-element px: ${JSON.stringify(geom)}`);
      console.log("overlay geometry", JSON.stringify(geom));
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${id}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
      await page.insertText(" (eval note)");
      await shot(page, "eval-overlay.png", "editing overlay positioned over the title box");
      const commit = await page.evaluate(clickText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      await shot(page, "eval-committed.png", "committed title with the eval note");
      // Multi-paragraph body: refused under V2-5D, editable since
      // V2-5F (uniform single-run paragraphs). Multi-run input stays
      // refused; fixtures carry none, so the driver records the new
      // behavior instead of asserting the old refusal.
      const rich = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const c = [...stage.querySelectorAll('[data-el]')].find((n) => n.querySelectorAll('text').length > 1);
        return c ? c.getAttribute('data-el') : null;
      })()`);
      if (rich) {
        const rc = await page.evaluate(centerOf(rich));
        if (rc) {
          await page.click(rc[0], rc[1]);
          await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
          await new Promise((r) => setTimeout(r, 1200));
          const opened = await page.evaluate(`document.querySelector('[data-text-edit]') !== null`);
          const err = await page.evaluate(`document.querySelector('[data-edit-error]')?.textContent ?? null`);
          manifest.notes.push(`multi-paragraph body ${rich}: editing opened=${opened}; refusal=${err ?? "(none — editable since V2-5F)"}`);
          console.log("multi-paragraph:", opened, err);
          await shot(page, "eval-rich-refusal.png", "multi-paragraph body now editable, per-paragraph styles kept");
          if (opened) {
            await page.evaluate(`document.querySelector('[data-text-edit]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          }
        }
      }
    } finally {
      await page.close();
    }
  }
  // 2. Insertion on a chromed slide.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`);
    try {
      await enterEdit(page);
      const addText = await page.evaluate(clickText("+ Text"));
      await page.click(addText[0], addText[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      const addRect = await page.evaluate(clickText("+ Rect"));
      await page.click(addRect[0], addRect[1]);
      await waitFor(page, `(${EDIT}).rev === 2`);
      await shot(page, "eval-chromed-inserts.png", "inserted text + rect centered on a chromed slide");
      const sel = (await page.evaluate(STATE)).selectedIds;
      manifest.notes.push(`chromed insert selected: ${JSON.stringify(sel)}`);
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
