// V2-5E: resize handles, styling, cascade, and stable double-click
// in real Chrome — trusted pointer drags on handles at 100%/200%,
// preview/commit parity against the V2-5C-1 equation, inspector
// style commits, cascade placement, and dblclick without a stage
// jump. Behavioral detail lives in the headless 5e suites.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5e");
const PORT = 5245;
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

describe("v2-5e chrome resize and style", () => {
  it("handles align and an se drag resizes through one command", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(`(${STATE}).selectedIds.length ? (${STATE}).selectedIds : null`);
      assert.equal(ids, null, "starts unselected");
      const all = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`);
      const c0 = await page.evaluate(centerOf(all[0]));
      assert.ok(c0, "hittable unit");
      await page.click(c0[0], c0[1]);
      await waitFor(page, `document.querySelectorAll('[data-resize-handle]').length === 8`);
      const before = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      // Handle alignment: se handle sits on the authoritative box
      // corner (inspector inches through the live transform) — not
      // on the ink extent, which is narrower for short titles.
      const align = await page.evaluate(`(() => {
        const hb = document.querySelector('[data-handle-layer] [data-resize-handle="se"]').getBoundingClientRect();
        const svg = document.querySelector('[data-stage] svg').getBoundingClientRect();
        const k = svg.width / (13.333 * 96);
        const m = (document.querySelector('[data-inspector]')?.textContent ?? '').match(/([\\d.]+)×([\\d.]+) @ ([\\d.]+),([\\d.]+)/);
        if (!m) return null;
        const ex = svg.left + (parseFloat(m[3]) + parseFloat(m[1])) * 96 * k;
        const ey = svg.top + (parseFloat(m[4]) + parseFloat(m[2])) * 96 * k;
        return [hb.left + hb.width / 2 - ex, hb.top + hb.height / 2 - ey];
      })()`);
      assert.ok(align && Math.abs(align[0]) <= 2 && Math.abs(align[1]) <= 2, `se handle on the box corner (got ${align})`);
      await page.screenshot(`${OUT}/handles.png`);
      const hp = await page.evaluate(handlePoint(all[0], "se"));
      assert.ok(hp, "se handle hittable");
      // Trusted se drag: +96 client px right and down.
      await page.mouseDown(hp[0], hp[1]);
      await page.mouseMove(hp[0] + 48, hp[1] + 24);
      await page.screenshot(`${OUT}/resize-preview.png`);
      await page.mouseMove(hp[0] + 96, hp[1] + 48);
      await page.mouseUp(hp[0] + 96, hp[1] + 48);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      assert.notEqual(after, before, "inspector tracks the new geometry");
      // V2-5C-1 equation at ~fit scale: read k live and check inches.
      const check = await page.evaluate(`(() => {
        const svg = document.querySelector('[data-stage] svg');
        const s = svg.getBoundingClientRect();
        return { k: s.width / (13.333 * 96) };
      })()`);
      const m = after.match(/([\d.]+)×([\d.]+) @ ([\d.]+),([\d.]+)/);
      assert.ok(m, `inspector geometry readable (got ${after.slice(0, 80)})`);
      const b = before.match(/([\d.]+)×([\d.]+) @ ([\d.]+),([\d.]+)/);
      const dwIn = 96 / (check.k * 96);
      const dhIn = 48 / (check.k * 96);
      assert.ok(Math.abs(parseFloat(m[1]) - parseFloat(b[1]) - dwIn) < 0.02, `width grew per the equation (k=${check.k})`);
      assert.ok(Math.abs(parseFloat(m[2]) - parseFloat(b[2]) - dhIn) < 0.02, "height grew per the equation");
      await page.screenshot(`${OUT}/resized.png`);
    } finally {
      await page.close();
    }
  });

  it("zoomed scrolled resize converts on both axes", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1&zoom=2`);
    try {
      await enterEdit(page);
      const all = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`);
      const c0 = await page.evaluate(centerOf(all[0]));
      assert.ok(c0, "hittable at 200%");
      await page.click(c0[0], c0[1]);
      await waitFor(page, `document.querySelectorAll('[data-resize-handle]').length === 8`);
      await page.evaluate(`document.querySelector('[data-scroll-container]').scrollBy(60, 40)`);
      const hp = await page.evaluate(handlePoint(all[0], "nw"));
      assert.ok(hp, "nw handle hittable after scroll");
      const before = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      const b = before.match(/([\d.]+)×([\d.]+) @ ([\d.]+),([\d.]+)/);
      assert.ok(b, "baseline geometry readable");
      await page.drag(hp[0], hp[1], hp[0] - 60, hp[1] - 30);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      const m = after.match(/([\d.]+)×([\d.]+) @ ([\d.]+),([\d.]+)/);
      assert.ok(m, "resized geometry readable");
      const check = await page.evaluate(`(() => {
        const svg = document.querySelector('[data-stage] svg');
        const s = svg.getBoundingClientRect();
        return { kx: s.width / (13.333 * 96), ky: s.height / (7.5 * 96) };
      })()`);
      const wantX = parseFloat(b[3]) - 60 / (check.kx * 96);
      const wantY = parseFloat(b[4]) - 30 / (check.ky * 96);
      assert.ok(Math.abs(parseFloat(m[3]) - wantX) < 0.03, `nw origin follows the equation (got ${m[3]}, want ${wantX})`);
      assert.ok(Math.abs(parseFloat(m[4]) - wantY) < 0.03, "nw y follows the equation");
      assert.ok(Math.abs(parseFloat(m[1]) - parseFloat(b[1]) - 60 / (check.kx * 96)) < 0.03, "width grew as the origin moved");
    } finally {
      await page.close();
    }
  });

  it("style panel commits a fill and refreshes on undo", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const addRect = await page.evaluate(clickText("+ Rect"));
      assert.ok(addRect, "Add Rect present");
      await page.click(addRect[0], addRect[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      await waitFor(page, `document.querySelector('[data-style-panel]') !== null`);
      await page.screenshot(`${OUT}/style-panel.png`);
      // React state settles between tasks: set the value first, blur
      // in a later task so the commit reads settled state.
      await page.evaluate(`(() => {
        const input = document.querySelector('[data-style-panel] input[aria-label="Shape fill"]');
        input.focus();
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, '#112233');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input.value;
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(`document.querySelector('[data-style-panel] input[aria-label="Shape fill"]').blur()`);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      const fillValue = await page.evaluate(`document.querySelector('[data-style-panel] input[aria-label="Shape fill"]').value`);
      assert.equal(fillValue.toLowerCase(), "#112233", "panel reflects the committed fill");
      await page.screenshot(`${OUT}/styled-shape.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      const back = await page.evaluate(`(() => {
        const input = document.querySelector('[data-style-panel] input[aria-label="Shape fill"]');
        return input ? input.value : null;
      })()`);
      assert.ok(back && back.toLowerCase() !== "#112233", `undo refreshes the panel (got ${back})`);
    } finally {
      await page.close();
    }
  });

  it("repeated inserts cascade without stacking", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const centers = [];
      for (let i = 0; i < 3; i++) {
        const add = await page.evaluate(clickText("+ Text"));
        await page.click(add[0], add[1]);
        await waitFor(page, `(${EDIT}).rev === ${i + 1}`, 60000);
        const c = await page.evaluate(`(() => {
          const sel = JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).selectedIds;
          const n = document.querySelector('[data-stage] [data-el="' + sel[0] + '"]');
          const r = n.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2, sel[0]];
        })()`);
        centers.push(c);
      }
      assert.ok(Math.hypot(centers[1][0] - centers[0][0], centers[1][1] - centers[0][1]) > 10, "second insert offset");
      assert.ok(Math.hypot(centers[2][0] - centers[1][0], centers[2][1] - centers[1][1]) > 10, "third insert offset");
      assert.notEqual(new Set(centers.map((c) => c[2])).size, 1, "distinct identities");
      await page.screenshot(`${OUT}/cascade.png`);
    } finally {
      await page.close();
    }
  });

  it("double-click needs no stage jump after selection", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => {
        if (n.parentElement && n.parentElement.closest('[data-el]')) return false;
        if (n.getAttribute('data-locked') === 'true') return false;
        return n.querySelectorAll('text').length === 1;
      }).map((n) => n.getAttribute('data-el'))`);
      assert.ok(ids.length >= 1, "simple text present");
      const before = await page.evaluate(centerOf(ids[0]));
      assert.ok(before, "hittable");
      await page.click(before[0], before[1]);
      await new Promise((r) => setTimeout(r, 800));
      const after = await page.evaluate(centerOf(ids[0]));
      assert.ok(after, "still hittable after selection");
      assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) <= 1, `stage did not jump (moved ${Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1)}px)`);
      // Double-click at the ORIGINAL coordinates still reaches the text.
      await page.dblclick(before[0], before[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') !== null`, 60000);
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') === null`, 60000);
    } finally {
      await page.close();
    }
  });
});
