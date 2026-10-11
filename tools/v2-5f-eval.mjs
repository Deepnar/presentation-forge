// V2-5F evaluation driver: multi-paragraph editing, mixed-style
// preservation, per-paragraph formatting, and undo in Chrome over
// committed fixtures.
//   node tools/v2-5f-eval.mjs
// Outputs (gitignored): out/v2-5f/<shot>.png,
// out/v2-5f/eval-manifest.json. Curated shots land in
// docs/v2-5f-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5f");
const PORT = 5248;

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
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const multiBody = `(() => {
  const stage = document.querySelector('[data-stage]');
  const c = [...stage.querySelectorAll('[data-el]')].find((n) => {
    if (n.parentElement && n.parentElement.closest('[data-el]')) return false;
    if (n.getAttribute('data-locked') === 'true') return false;
    return n.querySelectorAll('text').length > 1;
  });
  return c ? c.getAttribute('data-el') : null;
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
  // 1. Bullet-list edit with structural change + per-para format.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`);
    try {
      await enterEdit(page);
      const body = await page.evaluate(multiBody);
      if (!body) throw new Error("no multi-paragraph body on slide 1");
      const c0 = await page.evaluate(centerOf(body));
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${body}"]') !== null`);
      const geom = await page.evaluate(`(() => {
        const ta = document.querySelector('[data-text-edit="${body}"]');
        const el = document.querySelector('[data-stage] [data-el="${body}"]');
        const a = ta.getBoundingClientRect(), b = el.getBoundingClientRect();
        return { dx: a.left - b.left, dy: a.top - b.top };
      })()`);
      manifest.notes.push(`multi overlay-vs-element px: ${JSON.stringify(geom)}`);
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${body}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
      await page.insertText("\nEpsilon point");
      await shot(page, "eval-multi-editing.png", "four-bullet draft plus appended fifth line");
      const commit = await page.evaluate(clickText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      await shot(page, "eval-multi-committed.png", "five bullets committed in one revision");
      // Recolor the second bullet through the format bar.
      await waitFor(page, `document.querySelector('[data-text-format-panel]') !== null`);
      await page.evaluate(`(() => {
        const input = document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]');
        input.focus();
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, '#1F5FA8');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(`document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]').blur()`);
      await waitFor(page, `(${EDIT}).rev === 2`);
      await shot(page, "eval-formatted.png", "second bullet native blue, siblings untouched");
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`);
      await shot(page, "eval-format-undone.png", "undo restored the compiler bullet color");
    } finally {
      await page.close();
    }
  }
  // 2. Mixed-style comparison body on a chromed narrow slide.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=3`, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      const target = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        for (const n of stage.querySelectorAll('[data-el]')) {
          if (n.parentElement && n.parentElement.closest('[data-el]')) continue;
          if (n.getAttribute('data-locked') === 'true') continue;
          if (n.querySelectorAll('text').length === 2) return n.getAttribute('data-el');
        }
        return null;
      })()`);
      if (target) {
        const c0 = await page.evaluate(centerOf(target));
        if (c0) {
          await page.dblclick(c0[0], c0[1]);
          await waitFor(page, `document.querySelector('[data-text-edit="${target}"]') !== null`);
          await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${target}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
          await page.insertText("!");
          const commit = await page.evaluate(clickText("Commit"));
          await page.click(commit[0], commit[1]);
          await waitFor(page, `(${EDIT}).rev === 1`);
          await shot(page, "eval-mixed-committed.png", "mixed label+body reworded, per-paragraph paint intact on chrome");
        } else {
          manifest.notes.push("mixed body not hittable at narrow size — skipped");
        }
      } else {
        manifest.notes.push("no two-paragraph body on chromed slide 3 — skipped");
      }
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
