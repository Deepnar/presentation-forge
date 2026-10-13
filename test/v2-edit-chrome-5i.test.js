// Visual slide management in real Chrome — filmstrip menus,
// drag reorder with markers, multiselect bulk ops, detach badges,
// narrow viewport, and undo/redo. Command semantics live in
// test/v2-slides-5i.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "slide-management");
const PORT = 5254;
const DECK = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0`;

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

async function slideOrder(page) {
  return page.evaluate(`[...document.querySelectorAll('[data-thumb]')].map((n) => n.getAttribute('data-thumb'))`);
}

async function clickThumb(page, id, { shift = false } = {}) {
  const pt = await page.evaluate(`(() => {
    const n = document.querySelector('[data-thumb="${id}"]');
    if (!n) return null;
    n.scrollIntoView({ block: 'nearest' });
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + Math.min(30, r.height / 2)];
  })()`);
  assert.ok(pt, `thumb ${id} visible`);
  await page.click(pt[0], pt[1], { shift });
}

describe("slide management in real chrome", () => {
  it("adds a blank slide and navigates to it", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      const add = await page.evaluate(clickText("+ Slide ▾"));
      assert.ok(add, "+ Slide present");
      await page.click(add[0], add[1]);
      await waitFor(page, `document.querySelector('[data-new-slide-chooser]') !== null`, 60000);
      const blank = await page.evaluate(clickText("Blank slide"));
      assert.ok(blank, "Blank slide action present");
      await page.click(blank[0], blank[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await slideOrder(page);
      assert.equal(after.length, before.length + 1, "filmstrip grew by one");
      assert.equal(after[1], (await page.evaluate(STATE)).slideId, "navigated to the new slide after the active one");
      await page.screenshot(`${OUT}/blank.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.deepEqual(await slideOrder(page), before, "undo removes the blank slide");
    } finally {
      await page.close();
    }
  });

  it("duplicates a slide with content preserved", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      await clickThumb(page, before[1]);
      const menu = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu="${before[1]}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(menu, "thumb menu present");
      await page.click(menu[0], menu[1]);
      await waitFor(page, `document.querySelector('[data-slide-menu="${before[1]}"]') !== null`);
      const dup = await page.evaluate(clickText("Duplicate slide"));
      assert.ok(dup, "Duplicate action present");
      await page.click(dup[0], dup[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await slideOrder(page);
      assert.equal(after.length, before.length + 1);
      assert.ok(after[2] !== before[1] && after[1] === before[1], "copy sits right after its source with a fresh id");
      await page.screenshot(`${OUT}/duplicated.png`);
    } finally {
      await page.close();
    }
  });

  it("drags to reorder with a marker and commits once", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      // Adjacent swap: short drags stay clear of strip autoscroll,
      // which long synthetic drags fight (documented limitation).
      const a = await page.evaluate(`(() => { const n = document.querySelector('[data-thumb="${before[0]}"]'); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      const b = await page.evaluate(`(() => { const n = document.querySelector('[data-thumb="${before[1]}"]'); n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height - 4]; })()`);
      assert.ok(a && b, "adjacent drag endpoints hittable");
      await page.mouseDown(a[0], a[1]);
      await page.mouseMove(b[0], b[1]);
      await new Promise((r) => setTimeout(r, 500));
      const marker = await page.evaluate(`document.querySelector('[data-drop-marker]') !== null`);
      assert.ok(marker, "insertion marker shown mid-gesture");
      await page.screenshot(`${OUT}/reorder-preview.png`);
      await page.mouseUp(b[0], b[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await slideOrder(page);
      assert.deepEqual(after, [before[1], before[0], ...before.slice(2)], "adjacent swap committed in one revision");
      assert.equal((await page.evaluate(STATE)).slideId, before[0], "active identity followed the drag");
      await page.screenshot(`${OUT}/reordered.png`);
    } finally {
      await page.close();
    }
  });

  it("multiselects and bulk-deletes with two-step confirm", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      await clickThumb(page, before[0]);
      await clickThumb(page, before[2], { shift: true });
      await waitFor(page, `document.querySelector('[data-bulk-bar]') !== null`);
      const del = await page.evaluate(clickText("Delete…"));
      assert.ok(del, "bulk delete present");
      await page.click(del[0], del[1]);
      const confirm = await page.evaluate(clickText("Confirm"));
      assert.ok(confirm, "two-step confirm present");
      await page.click(confirm[0], confirm[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await slideOrder(page);
      assert.equal(after.length, before.length - 3, "contiguous range deleted atomically");
      assert.ok(!after.includes(before[0]) && !after.includes(before[2]), "members gone");
      await page.screenshot(`${OUT}/multiselect.png`);
    } finally {
      await page.close();
    }
  });

  it("detaches a slide with a visible manual state", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      await clickThumb(page, before[1]);
      const menu = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu="${before[1]}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(menu[0], menu[1]);
      await waitFor(page, `document.querySelector('[data-slide-menu="${before[1]}"]') !== null`);
      const detach = await page.evaluate(clickText("Detach from AI layout"));
      assert.ok(detach, "detach action present");
      await page.click(detach[0], detach[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const caption = await page.evaluate(`(() => {
        const n = document.querySelector('[data-thumb="${before[1]}"]').parentElement;
        return n ? n.textContent : null;
      })()`);
      assert.ok(caption && /Manual/.test(caption), `manual badge on the thumb (got ${String(caption).slice(0, 60)})`);
      await page.screenshot(`${OUT}/detached.png`);
    } finally {
      await page.close();
    }
  });

  it("holds on a narrow viewport", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      await clickThumb(page, before[0]);
      const add = await page.evaluate(clickText("+ Slide ▾"));
      assert.ok(add, "+ Slide reachable narrow");
      await page.click(add[0], add[1]);
      await waitFor(page, `document.querySelector('[data-new-slide-chooser]') !== null`, 60000);
      const blank = await page.evaluate(clickText("Blank slide"));
      await page.click(blank[0], blank[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      assert.equal((await slideOrder(page)).length, before.length + 1);
      await page.screenshot(`${OUT}/narrow.png`);
    } finally {
      await page.close();
    }
  });
});
