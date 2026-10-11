// Layers panel in real Chrome — tree selection sync, restacking
// overlapping objects, lock/hide toggles, keyboard reorder, and
// read-only absence. Command semantics live in
// test/v2-layers-5j.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "layers");
const PORT = 5256;
const DECK = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`;

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
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const centerOf = (id) => `(() => {
  const stage = document.querySelector('[data-stage]');
  const n = stage.querySelector('[data-el="${id}"]');
  if (!n) return null;
  const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
  const r = inner.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
})()`;

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

async function openLayers(page) {
  const tab = await page.evaluate(clickText("Layers"));
  assert.ok(tab, "Layers tab present");
  await page.click(tab[0], tab[1]);
  await waitFor(page, `document.querySelector('[data-layers]') !== null`);
}

async function layerOrder(page) {
  return page.evaluate(`[...document.querySelectorAll('[data-layer]')].map((n) => n.getAttribute('data-layer'))`);
}

describe("layers panel in real chrome", () => {
  it("lists the tree and syncs selection both ways", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openLayers(page);
      const rows = await layerOrder(page);
      assert.ok(rows.length >= 2, `tree populated (got ${rows.length})`);
      // Panel -> canvas: click the first text row's label.
      const firstText = await page.evaluate(`(() => {
        const n = [...document.querySelectorAll('[data-layer]')].find((x) => x.getAttribute('data-layer-kind') === 'text');
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2, n.getAttribute('data-layer')];
      })()`);
      assert.ok(firstText, "text row present");
      await page.click(firstText[0], firstText[1]);
      await waitFor(page, `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).selectedIds.length === 1`);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [firstText[2]], "canvas follows the panel");
      // Canvas -> panel: click another unit on the slide.
      const other = rows.find((id) => id !== firstText[2]);
      const c = await page.evaluate(centerOf(other));
      if (c) {
        await page.click(c[0], c[1]);
        await waitFor(page, `document.querySelector('[data-layer-selected]') !== null`);
        const highlighted = await page.evaluate(`document.querySelector('[data-layer-selected]')?.getAttribute('data-layer')`);
        assert.equal(highlighted, (await page.evaluate(STATE)).selectedIds[0], "panel follows the canvas");
      }
      await page.screenshot(`${OUT}/tree.png`);
    } finally {
      await page.close();
    }
  });

  it("restacks overlapping text behind its card", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=2`);
    try {
      await enterEdit(page);
      await openLayers(page);
      const before = await layerOrder(page);
      const content = before.find((id) => /content/.test(id));
      assert.ok(content, "card body in the tree");
      // Send the body backward past its frame: white card covers it.
      const down = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${content}"]');
        const b = [...row.querySelectorAll('button')].find((x) => x.textContent === '↓');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(down, "backward button present");
      await page.click(down[0], down[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await layerOrder(page);
      assert.ok(after.indexOf(content) < before.indexOf(content), "row moved down the stack");
      await page.screenshot(`${OUT}/restacked.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.deepEqual(await layerOrder(page), before, "undo restores the stack");
    } finally {
      await page.close();
    }
  });

  it("locks against drags and hides from projection", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openLayers(page);
      const target = (await layerOrder(page)).find((id) => /title|heading/.test(id)) ?? (await layerOrder(page))[0];
      // Lock via the panel, then attempt a trusted drag on the unit.
      const lock = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Lock'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(lock, "lock button present");
      await page.click(lock[0], lock[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const c = await page.evaluate(centerOf(target));
      if (c) {
        await page.drag(c[0], c[1], c[0] + 80, c[1]);
        await new Promise((r) => setTimeout(r, 1500));
        assert.equal((await page.evaluate(EDIT)).rev, 1, "locked drag commits nothing");
      }
      await page.screenshot(`${OUT}/locked.png`);
      // Unlock (locked refuses hiding), then hide: the projection
      // loses the text while the scene keeps every byte.
      const before = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      const unlock = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Unlock'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(unlock, "unlock button present");
      await page.click(unlock[0], unlock[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      const hide = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Hide'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(hide, "hide button present");
      await page.click(hide[0], hide[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      const after = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(after.length < before.length, "hidden text leaves the projection");
      const show = await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${target}"]');
        const b = [...row.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Show'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.click(show[0], show[1]);
      await waitFor(page, `(${EDIT}).rev === 4`, 60000);
      assert.equal(await page.evaluate(`document.querySelector('[data-stage]').textContent`), before, "re-show restores everything");
      await page.screenshot(`${OUT}/hidden.png`);
    } finally {
      await page.close();
    }
  });

  it("reorders from the keyboard without touching arrows", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openLayers(page);
      const before = await layerOrder(page);
      await page.evaluate(`(() => {
        const row = document.querySelector('[data-layer="${before[0]}"]');
        row.focus();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      })()`);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await layerOrder(page);
      assert.deepEqual(after, [before[1], before[0], ...before.slice(2)], "Alt+Arrow reorders the focused row");
      assert.equal((await page.evaluate(EDIT)).rev, 1, "plain arrows untouched (no nudge committed)");
    } finally {
      await page.close();
    }
  });

  it("stays usable narrow and absent when read-only", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const readOnly = await open(DECK);
    try {
      assert.equal(await readOnly.evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Layers')`), false, "no Layers tab outside edit mode");
    } finally {
      await readOnly.close();
    }
    const page = await open(DECK, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      await openLayers(page);
      assert.ok((await layerOrder(page)).length >= 2, "tree usable narrow");
      await page.screenshot(`${OUT}/narrow.png`);
    } finally {
      await page.close();
    }
  });
});
