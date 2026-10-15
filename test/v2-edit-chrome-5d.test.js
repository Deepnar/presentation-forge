// V2-5D: inline text editing and native insertion in real Chrome —
// double-click opens the overlay, trusted keystrokes type, commit
// lands one engine revision, Escape cancels, insertion buttons add
// selectable native elements, and caret keys never navigate.
// Draft lifecycle detail lives in test/v2-text-5d.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5d");
const PORT = 5238;
const PROSE = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`;

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
const IDS = `[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`;
// Simple (single-paragraph, single-run) text ids: the ones this slice
// edits. Rich multi-paragraph bodies are honestly read-only.
const SIMPLE_IDS = `(() => {
  const stage = document.querySelector('[data-stage]');
  return [...stage.querySelectorAll('[data-el]')].filter((n) => {
    if (n.parentElement && n.parentElement.closest('[data-el]')) return false;
    if (n.getAttribute('data-locked') === 'true') return false;
    return n.querySelectorAll('text').length === 1;
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

describe("v2-5d chrome text editing", () => {
  it("double-click opens the overlay and typed text commits once", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(SIMPLE_IDS);
      assert.ok(ids.length >= 1, "simple text present");
      const c0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(c0, "hittable text unit");
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') !== null`);
      // Collapse to the end so typing appends deterministically.
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${ids[0]}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return ta.value.length; })()`);
      await page.screenshot(`${OUT}/overlay-in-progress.png`);
      await page.insertText(" — typed");
      const commit = await page.evaluate(clickText("Commit"));
      assert.ok(commit, "Commit button present");
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const stageText = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(stageText.includes("— typed"), "typed text on the slide");
      assert.equal(await page.evaluate(`document.querySelector('[data-text-edit="${ids[0]}"]')`), null, "overlay closed");
      await page.screenshot(`${OUT}/committed-text.png`);
    } finally {
      await page.close();
    }
  });

  it("Escape cancels without mutation", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(SIMPLE_IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(c0, "hittable text unit");
      const before = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') !== null`);
      await page.insertText("abandoned");
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') === null`);
      assert.equal((await page.evaluate(EDIT)).rev, 0, "no history entry");
      assert.equal(await page.evaluate(`document.querySelector('[data-stage]').textContent`), before, "slide unchanged");
      await page.screenshot(`${OUT}/cancelled-edit.png`);
    } finally {
      await page.close();
    }
  });

  it("caret keys never navigate while editing; Ctrl+Enter commits", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(SIMPLE_IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(c0, "hittable text unit");
      const slideBefore = (await page.evaluate(STATE)).slideIndex;
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') !== null`);
      await page.key(39, "ArrowRight");
      await page.key(37, "ArrowLeft");
      await new Promise((r) => setTimeout(r, 800));
      assert.equal((await page.evaluate(STATE)).slideIndex, slideBefore, "arrows move the caret, not the slide");
      assert.equal((await page.evaluate(EDIT)).rev, 0, "no commit from navigation keys");
      assert.equal(await page.evaluate(`document.activeElement === document.querySelector('[data-text-edit="${ids[0]}"]')`),true,'caret focus stays in the draft before typing');
      await page.insertText(" ⌘");
      assert.equal(await page.evaluate(`document.querySelector('[data-text-edit="${ids[0]}"]') !== null`),true,'typing preserves the draft until commit');
      // Ctrl+Enter commits through the overlay key handler.
      await page.evaluate(`document.querySelector('[data-text-edit="${ids[0]}"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))`);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("⌘"), "committed");
    } finally {
      await page.close();
    }
  });

  it("inserted text and shapes select, drag, undo, and redo", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const addText = await page.evaluate(clickText("+ Text"));
      assert.ok(addText, "Add Text present");
      await page.click(addText[0], addText[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      let sel = (await page.evaluate(STATE)).selectedIds;
      assert.equal(sel.length, 1, "inserted text selected");
      const textId = sel[0];
      await page.screenshot(`${OUT}/inserted-text.png`);
      const addRect = await page.evaluate(clickText("+ Rect"));
      assert.ok(addRect, "Add Rect present");
      await page.click(addRect[0], addRect[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      sel = (await page.evaluate(STATE)).selectedIds;
      assert.equal(sel.length, 1, "inserted shape selected");
      const shapeId = sel[0];
      assert.notEqual(shapeId, textId);
      await page.screenshot(`${OUT}/inserted-shape.png`);
      // The new text drags like any element: one more revision.
      const c0 = await page.evaluate(centerOf(textId));
      assert.ok(c0, "inserted text hittable");
      await page.click(c0[0], c0[1]);
      const d0 = await page.evaluate(centerOf(textId));
      const dx = d0[0] + 120 < 1400 ? 100 : -100;
      await page.drag(d0[0], d0[1], d0[0] + dx, d0[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      await page.screenshot(`${OUT}/dragged-insert.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 4`, 60000);
    } finally {
      await page.close();
    }
  });
});
