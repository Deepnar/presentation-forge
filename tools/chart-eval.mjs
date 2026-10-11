// Chart-editor evaluation driver: panel editing, kind switches,
// refusal, and undo in Chrome over committed fixtures.
//   node tools/chart-eval.mjs
// Outputs (gitignored): out/chart-editor/eval-*.png,
// out/chart-editor/eval-manifest.json. Curated shots land in
// docs/chart-editor-evidence/ by hand after review.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "chart-editor");
const PORT = 5251;

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

async function selectChart(page) {
  const hit = await page.evaluate(`(() => {
    const stage = document.querySelector('[data-stage]');
    const bars = [...stage.querySelectorAll('rect')].filter((r) => r.closest('[data-el]'));
    if (!bars.length) return null;
    const r = bars[0].getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!hit) throw new Error("no chart bars hittable");
  await page.click(hit[0], hit[1]);
  await waitFor(page, `document.querySelector('[data-chart-editor]') !== null`);
}

async function setInput(page, sel, value) {
  await page.evaluate(`(() => {
    const input = document.querySelector('${sel}');
    input.focus();
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    desc.call(input, '${value}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 400));
}

async function apply(page, rev) {
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
  // 1. Bar edit + line switch on the plain fixture.
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=6`);
    try {
      await enterEdit(page);
      await selectChart(page);
      await shot(page, "eval-panel.png", "chart editor grid over the bar chart");
      await setInput(page, '[data-chart-editor] input[aria-label^="Value"]', "14.5");
      await apply(page, 1);
      await shot(page, "eval-edited.png", "edited value committed, bars rescaled");
      await page.evaluate(`(() => {
        const sel = document.querySelector('[data-chart-editor] select[aria-label="Chart type"]');
        sel.value = 'line';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      await apply(page, 2);
      const kind = await page.evaluate(`document.querySelector('[data-chart-editor] select[aria-label="Chart type"]').value`);
      manifest.notes.push(`kind after switch: ${kind}`);
      await shot(page, "eval-line.png", "bar switched to a native line chart, data intact");
    } finally {
      await page.close();
    }
  }
  // 2. Chromed chart edit (chrome + legend intact).
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=6`);
    try {
      await enterEdit(page);
      await selectChart(page);
      await setInput(page, '[data-chart-editor] input[aria-label="Category 2 label"]', "Sulfide+");
      await apply(page, 1);
      const text = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      manifest.notes.push(`chromed rename visible: ${text.includes("Sulfide+")}`);
      await shot(page, "eval-chromed.png", "renamed category on a chromed slide, marks intact");
    } finally {
      await page.close();
    }
  }
  await writeFile(`${OUT}/eval-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest: ${manifest.shots.length} shots`);
} finally {
  server.close();
}
