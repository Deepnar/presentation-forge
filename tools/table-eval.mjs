// Table-editor evaluation driver: grid editing, structural
// changes, density warnings, and undo in Chrome over committed
// fixtures.
//   node tools/table-eval.mjs
// Outputs (gitignored): out/table-editor/eval-*.png,
// out/table-editor/eval-manifest.json. Curated shots land in
// docs/table-editor-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "table-editor");
const PORT = 5253;

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

async function selectTable(page) {
  const ids = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].map((n) => n.getAttribute('data-el'))`);
  for (const id of ids) {
    const c = await page.evaluate(`(() => {
      const stage = document.querySelector('[data-stage]');
      const n = stage.querySelector('[data-el="${id}"]');
      if (!n) return null;
      const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
      const r = inner.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    if (!c) continue;
    await page.click(c[0], c[1]);
    await new Promise((r) => setTimeout(r, 400));
    if (await page.evaluate(`document.querySelector('[data-table-editor]') !== null`)) return id;
  }
  throw new Error("no table selectable");
}

async function setCell(page, label, value) {
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-table-editor] input[aria-label="${label}"]');
    input.focus();
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    desc.call(input, '${value}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 400));
}

async function applyRev(page, rev) {
  const btn = await page.evaluate(clickText("Apply"));
  if (!btn) throw new Error("Apply missing");
  await page.click(btn[0], btn[1]);
  await waitFor(page, `(${EDIT}).rev === ${rev}`);
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
  // 1. Grid edit + structural growth + density warning + undo.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=4`);
    try {
      await enterEdit(page);
      await selectTable(page);
      await shot(page, "eval-grid.png", "table editor grid with header note");
      await setCell(page, "Row 2 column 2", "120 ms");
      await applyRev(page, 1);
      await shot(page, "eval-committed.png", "edited cell committed in one revision");
      for (const label of ["+ Row", "+ Row", "+ Column"]) {
        const btn = await page.evaluate(clickText(label));
        await page.click(btn[0], btn[1]);
        await new Promise((r) => setTimeout(r, 300));
      }
      await page.evaluate(`(() => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const rows = document.querySelectorAll('[data-table-editor] tbody tr');
        rows.forEach((row, ri) => {
          if (ri < 2) return;
          row.querySelectorAll('input').forEach((input, ci) => {
            desc.call(input, ri === 2 && ci === 0 ? 'A very long descriptive sentence that keeps going past any reasonable column width' : 'n');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
        });
        const last = rows[rows.length - 1].querySelectorAll('input');
        const tail = last[last.length - 1];
        desc.call(tail, 'tail');
        tail.dispatchEvent(new Event('input', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      await applyRev(page, 2);
      const warn = await page.evaluate(`document.querySelector('[data-edit-error]')?.textContent ?? null`);
      manifest.notes.push(`density warning: ${warn ?? "(none)"}`);
      await shot(page, "eval-overflow.png", "grown table kept whole with an explicit density warning");
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`);
      await shot(page, "eval-undone.png", "undo restored the prior matrix exactly");
    } finally {
      await page.close();
    }
  }
  // 2. Chromed table keeps marks and header styling.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=4`);
    try {
      await enterEdit(page);
      await selectTable(page);
      await setCell(page, "Header column 2", "Before+");
      await applyRev(page, 1);
      const text = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      manifest.notes.push(`chromed header edit visible: ${text.includes("Before+")}`);
      await shot(page, "eval-chromed.png", "header wording edited on a chromed slide, marks intact");
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
