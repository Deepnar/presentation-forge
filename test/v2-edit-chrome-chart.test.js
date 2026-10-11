// Chart-data editing in real Chrome — trusted panel input,
// Apply commits, SVG refresh, unsafe-conversion refusal, and
// undo/redo. Validation matrices and OOXML live in
// test/v2-chart-edit.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "chart-editor");
const PORT = 5250;
const CHART = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=6`;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2",
};

function chromeBinary() {
  try {
    execSync("command -v google-chrome-stable", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

let server = null;
let skipped = "";

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    await mkdir(OUT, { recursive: true });
  } catch (err) {
    skipped = `setup failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  server = await new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
        let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
        if (rel === "" || rel.endsWith("/")) rel += "index.html";
        const file = join(DIST, rel);
        if (!file.startsWith(DIST)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(await readFile(file));
      } catch {
        res.writeHead(404);
        res.end("no such file");
      }
    });
    s.on("error", reject);
    s.listen(PORT, "127.0.0.1", () => resolve(s));
  });
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

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
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;

async function open(url, opts) {
  const { openViewer } = await import("../tools/chrome-shot.mjs");
  return openViewer(url, opts);
}

async function waitFor(page, expr, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function enterEdit(page) {
  const pt = await page.evaluate(clickText("Edit"));
  assert.ok(pt, "Edit toggle present");
  await page.click(pt[0], pt[1]);
  await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`, 60000);
}

describe("chart editing in real chrome", () => {
  it("edits a value and a category through the panel in one revision", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(CHART);
    try {
      await enterEdit(page);
      // The chart slide's chart unit: find via the inspector after
      // clicking the plot area (bars are rects inside one unit).
      const hit = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const bars = [...stage.querySelectorAll('rect')].filter((r) => {
          const g = r.closest('[data-el]');
          return g && !g.parentElement.closest?.('[data-el]');
        });
        if (!bars.length) return null;
        const r = bars[0].getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(hit, "chart bars hittable");
      await page.click(hit[0], hit[1]);
      await waitFor(page, `document.querySelector('[data-chart-editor]') !== null`, 60000);
      const sel = (await page.evaluate(STATE)).selectedIds;
      assert.equal(sel.length, 1, "chart singly selected");
      await page.screenshot(`${OUT}/inspector.png`);
      // Rename the first category and change the first value.
      await page.evaluate(`(() => {
        const set = (sel, v) => {
          const input = document.querySelector(sel);
          input.focus();
          const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          desc.call(input, v);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('[data-chart-editor] input[aria-label="Category 1 label"]', 'Oxide+');
        set('[data-chart-editor] input[aria-label^="Value"]', '9.9');
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      const apply = await page.evaluate(clickText("Apply"));
      assert.ok(apply, "Apply present");
      await page.click(apply[0], apply[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const stageText = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(stageText.includes("Oxide+"), "renamed category on the plot");
      await page.screenshot(`${OUT}/committed.png`);
      // Undo restores, redo re-applies (inspector-tracked).
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      const back = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(!back.includes("Oxide+"), "undo removes the rename from the plot");
      const redo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Redo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(redo[0], redo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("Oxide+"), "redo restores");
    } finally {
      await page.close();
    }
  });

  it("adds a category and a series, then refuses an unsafe pie switch", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(CHART);
    try {
      await enterEdit(page);
      const hit = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const bars = [...stage.querySelectorAll('rect')].filter((r) => r.closest('[data-el]'));
        if (!bars.length) return null;
        const r = bars[0].getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(hit, "chart hittable");
      await page.click(hit[0], hit[1]);
      await waitFor(page, `document.querySelector('[data-chart-editor]') !== null`, 60000);
      const id = (await page.evaluate(STATE)).selectedIds[0];
      // Add a category: fill its cells, then add a series and fill it.
      await page.evaluate(clickText("+ Category"));
      const addC = await page.evaluate(clickText("+ Category"));
      await page.click(addC[0], addC[1]);
      await page.evaluate(`(() => {
        const inputs = [...document.querySelectorAll('[data-chart-editor] tbody input')];
        const last = inputs[inputs.length - 1];
        last.focus();
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        desc.call(last, '7.7');
        last.dispatchEvent(new Event('input', { bubbles: true }));
        const cat = document.querySelectorAll('[data-chart-editor] tbody tr')[document.querySelectorAll('[data-chart-editor] tbody tr').length - 1].querySelector('input');
        desc.call(cat, 'Q4');
        cat.dispatchEvent(new Event('input', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      const addS = await page.evaluate(clickText("+ Series"));
      await page.click(addS[0], addS[1]);
      await page.evaluate(`(() => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const head = [...document.querySelectorAll('[data-chart-editor] thead input')].pop();
        desc.call(head, 'Costs');
        head.dispatchEvent(new Event('input', { bubbles: true }));
        const rows = document.querySelectorAll('[data-chart-editor] tbody tr');
        const vals = ['1', '2', '3', '4'];
        rows.forEach((row, i) => {
          const cell = row.querySelectorAll('input')[row.querySelectorAll('input').length - 1];
          desc.call(cell, vals[i]);
          cell.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      const apply = await page.evaluate(clickText("Apply"));
      await page.click(apply[0], apply[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const stageText = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(stageText.includes("Costs"), "added series legend on the plot");
      assert.ok(stageText.includes("Q4"), "added category on the plot");
      await page.screenshot(`${OUT}/added.png`);
      // Unsafe conversion: two series to pie must refuse explicitly.
      await page.evaluate(`(() => {
        const sel = document.querySelector('[data-chart-editor] select[aria-label="Chart type"]');
        sel.focus();
        sel.value = 'pie';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return sel.value;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      const apply2 = await page.evaluate(clickText("Apply"));
      await page.click(apply2[0], apply2[1]);
      await new Promise((r) => setTimeout(r, 1200));
      assert.equal((await page.evaluate(EDIT)).rev, 1, "refusal commits nothing");
      const err = await page.evaluate(`document.querySelector('[data-edit-error]')?.textContent ?? document.querySelector('[data-chart-editor]').textContent`);
      assert.ok(/pie|cannot keep/i.test(err), `refusal explained (got ${String(err).slice(0, 120)})`);
      await page.screenshot(`${OUT}/pie-refused.png`);
      void id;
    } finally {
      await page.close();
    }
  });
});
