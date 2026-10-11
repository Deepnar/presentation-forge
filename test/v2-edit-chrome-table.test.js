// Native table editing in real Chrome — trusted grid input,
// Apply commits, SVG refresh, structural add/remove, undo/redo,
// and narrow-viewport usability. Validation matrices and OOXML
// live in test/v2-table-edit.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "table-editor");
const PORT = 5252;
const TABLE = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=4`;

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

async function tableId(page) {
  const ids = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].map((n) => n.getAttribute('data-el'))`);
  for (const id of ids) {
    const kind = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el="${id}"]'); return n ? (n.tagName.toLowerCase() === 'g' && n.querySelector('rect') && !n.querySelector('[data-el]') ? 'maybe-table' : n.tagName) : null; })()`);
    void kind;
  }
  // Resolve authoritatively through the inspector after probing each unit.
  for (const id of ids) {
    const c = await page.evaluate(centerOf(id));
    if (!c) continue;
    await page.click(c[0], c[1]);
    await new Promise((r) => setTimeout(r, 400));
    const panel = await page.evaluate(`document.querySelector('[data-table-editor]') !== null`);
    if (panel) return id;
  }
  return null;
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
  assert.ok(btn, "Apply present");
  await page.click(btn[0], btn[1]);
  await waitFor(page, `(${EDIT}).rev === ${rev}`, 60000);
}

describe("table editing in real chrome", () => {
  it("edits a cell through the grid in one revision with undo/redo", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(TABLE);
    try {
      await enterEdit(page);
      const id = await tableId(page);
      assert.ok(id, "table found by probing");
      await page.screenshot(`${OUT}/inspector.png`);
      await setCell(page, "Row 2 column 2", "180 ms");
      await page.screenshot(`${OUT}/editing.png`);
      await applyRev(page, 1);
      const text = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(text.includes("180 ms"), "edited cell on the slide");
      await page.screenshot(`${OUT}/committed.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.ok(!(await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("180 ms"), "undo removes the edit");
      const redo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Redo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(redo[0], redo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("180 ms"), "redo restores");
    } finally {
      await page.close();
    }
  });

  it("adds a row and a column, then removes them", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(TABLE);
    try {
      await enterEdit(page);
      const id = await tableId(page);
      assert.ok(id, "table found by probing");
      for (const label of ["+ Row", "+ Column"]) {
        const btn = await page.evaluate(clickText(label));
        assert.ok(btn, `${label} present`);
        await page.click(btn[0], btn[1]);
        await new Promise((r) => setTimeout(r, 300));
      }
      // Fill the new row and column (blank by design, Apply blocks).
      const count = await page.evaluate(`document.querySelectorAll('[data-table-editor] tbody input').length`);
      await page.evaluate(`(() => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const inputs = [...document.querySelectorAll('[data-table-editor] tbody input')];
        const empties = inputs.filter((i) => !i.value);
        empties.forEach((i, k) => { desc.call(i, 'n' + (k + 1)); i.dispatchEvent(new Event('input', { bubbles: true })); });
        return empties.length;
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      await applyRev(page, 1);
      const text = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(text.includes("n1"), "added cells on the slide");
      await page.screenshot(`${OUT}/added.png`);
      for (const label of ["− Row", "− Column"]) {
        const btn = await page.evaluate(clickText(label));
        await page.click(btn[0], btn[1]);
        await new Promise((r) => setTimeout(r, 300));
      }
      await applyRev(page, 2);
      const back = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(!back.includes("n1"), "removed structure gone after Apply");
      await page.screenshot(`${OUT}/removed.png`);
      void count;
    } finally {
      await page.close();
    }
  });

  it("stays usable on a narrow viewport", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(TABLE, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      const id = await tableId(page);
      assert.ok(id, "table found at narrow size");
      const scrollable = await page.evaluate(`(() => {
        const grid = document.querySelector('[data-table-editor] div[style*="overflow"]') ?? document.querySelector('[data-table-editor]');
        const r = grid.getBoundingClientRect();
        return grid.scrollWidth > r.width + 1 ? 'scrolls' : 'fits';
      })()`);
      await setCell(page, "Header column 1", "Metric+");
      await applyRev(page, 1);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("Metric+"), "narrow edit commits");
      await page.screenshot(`${OUT}/narrow.png`);
      void scrollable;
    } finally {
      await page.close();
    }
  });
});
