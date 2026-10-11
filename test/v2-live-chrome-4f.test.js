// V2-4F: live compiler-to-browser integration in real Chrome.
// One origin serves the API and the built viewer; tests drive
// the actual Live panel (trusted button clicks, real compiles)
// and assert fixtures and live decks share one viewer path.
// Unit-level contract coverage lives in test/v2-live-4f.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const PORT = 5217;
const VIEWER = `http://127.0.0.1:${PORT}/scenes.html`;

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
let delayCompileMs = 0;

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  // Pin the local signal so the compile endpoint serves on boxes
  // carrying a hosted flag file; restored in after().
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(false);
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
  } catch (err) {
    skipped = `vite build failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  const { registerV2ScenesRoutes } = await import("../app/server/v2-scenes-routes.js");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(async (req, _res, next) => {
    if (req.path === "/api/v2/scenes" && delayCompileMs > 0) {
      await new Promise((r) => setTimeout(r, delayCompileMs));
    }
    next();
  });
  registerV2ScenesRoutes(app);
  app.use(express.static(DIST));
  await new Promise((resolve, reject) => {
    server = app.listen(PORT, "127.0.0.1", resolve);
    server.on("error", reject);
  });
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  try {
    const { setHostedForTest } = await import("../src/cloud.js");
    setHostedForTest(null);
  } catch { /* teardown only */ }
});

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
const THUMBS = `document.querySelectorAll('aside[aria-label="Slides"] button').length`;
const clickText = (tag, text) => `(() => { const b = [...document.querySelectorAll('${tag}')].find((n) => n.textContent.trim() === '${text}'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const overlayDelta = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom)]; })()`;
// Verified hittable point for a stage unit (stage-scoped,
// viewport-clamped; null when genuinely unreachable).
const POINT = (id) => `(() => {
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
        top = g;
        topId = top.getAttribute('data-el');
        p = top.parentElement;
      }
      if (topId === '${id}' && top.getAttribute('data-locked') !== 'true') return [x, y];
    }
  }
  return null;
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
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function openLivePanel(page) {
  const pt = await page.evaluate(clickText("button", "Live"));
  assert.ok(pt, "Live toggle present");
  await page.click(pt[0], pt[1]);
  await waitFor(page, `document.querySelector('[data-live-panel]') !== null`);
}

async function compileExample(page, { theme = null, waitDeck = null } = {}) {
  if (theme) {
    await page.evaluate(`(() => { const s = document.querySelector('[aria-label="Live theme"]'); s.value = '${theme}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  // The button reads "Compile live" while disabled too — wait for
  // the catalog to land, or the click silently no-ops.
  await waitFor(page, `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === 'Compile live'); return b && !b.disabled; })()`);
  const pt = await page.evaluate(clickText("button", "Compile live"));
  assert.ok(pt, "Compile control present");
  await page.click(pt[0], pt[1]);
  if (waitDeck) {
    await waitFor(page, `document.querySelector('[aria-label="Deck"]').value.includes('${waitDeck}')`, 60000);
  } else {
    await waitFor(page, `${THUMBS} === 3`, 60000);
  }
}

describe("v2-4f live browser integration", () => {
  it("compiles a live deck and selects through the shared viewer path", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(VIEWER);
    try {
      assert.deepEqual(page.missing, [], "fixture fonts ready first");
      await openLivePanel(page);
      await compileExample(page);
      const st = await page.evaluate(STATE);
      assert.equal(st.slideCount, 3, "live mechanism deck mounted");
      assert.deepEqual(page.missing, [], "no missing faces at gate");
      const ids = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`);
      assert.ok(ids.length >= 1, "live units present");
      const pt = await page.evaluate(POINT(ids[0]));
      assert.ok(pt, "live unit hittable");
      await page.click(pt[0], pt[1]);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[0]], "live selection works");
      const delta = await page.evaluate(overlayDelta(ids[0]));
      assert.ok(delta && delta.every((d) => d <= 3), "live overlay aligns");
      const panel = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      assert.ok(panel.includes(ids[0]), "live inspector reports");
    } finally {
      await page.close();
    }
  });

  it("theme change recompiles, clears selection, and loads new faces", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(VIEWER);
    try {
      await openLivePanel(page);
      await compileExample(page);
      const ids = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`);
      const pt = await page.evaluate(POINT(ids[0]));
      await page.click(pt[0], pt[1]);
      assert.equal((await page.evaluate(STATE)).selectedIds.length, 1);
      await compileExample(page, { theme: "sci-fi-hud", waitDeck: "sci-fi-hud" });
      const st = await page.evaluate(STATE);
      assert.equal(st.slideCount, 3);
      assert.deepEqual(st.selectedIds, [], "recompilation reconciles selection by clearing");
      const header = await page.evaluate(`document.querySelector('[aria-label="Deck"] option:checked')?.textContent ?? ''`);
      assert.match(header, /sci-fi-hud/, "deck picker follows the live deck");
      // New faces for the new theme resolve through the same gate.
      const missing = await page.evaluate(`document.querySelector('[data-missing-fonts]').dataset.missingFonts`);
      assert.equal(missing, "", "sci-fi faces loaded, nothing missing");
    } finally {
      await page.close();
    }
  });

  it("loading indicator shows while compiling, ready replaces it", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    delayCompileMs = 2000;
    const page = await open(VIEWER);
    try {
      await openLivePanel(page);
      const before = await page.evaluate(`document.querySelector('[aria-label="Deck"] option:checked')?.textContent ?? ''`);
      await waitFor(page, `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === 'Compile live'); return b && !b.disabled; })()`);
      const go = await page.evaluate(clickText("button", "Compile live"));
      await page.click(go[0], go[1]);
      await waitFor(page, `document.body.textContent.includes('compiling')`);
      await waitFor(page, `${THUMBS} === 3`, 60000);
      const after = await page.evaluate(`document.querySelector('[aria-label="Deck"] option:checked')?.textContent ?? ''`);
      assert.notEqual(after, before, "ready deck replaces the fixture");
      assert.ok(!(await page.evaluate(`document.body.textContent.includes('compiling')`)), "loading indicator clears");
    } finally {
      delayCompileMs = 0;
      await page.close();
    }
  });

  it("zoomed live slides scroll and keep overlays aligned", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`${VIEWER}?zoom=2`);
    try {
      await openLivePanel(page);
      await compileExample(page);
      const scrollable = await page.evaluate(`(() => { const sc = document.querySelector('[data-scroll-container]'); return sc.scrollWidth > sc.clientWidth + 1; })()`);
      assert.equal(scrollable, true, "zoomed stage scrolls instead of overflowing paint-only");
      const hit = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const svg = stage.querySelector('svg');
        const s = svg.getBoundingClientRect();
        const loX = Math.max(s.left, 0) + 2, hiX = Math.min(s.right, window.innerWidth) - 2;
        const loY = Math.max(s.top, 0) + 2, hiY = Math.min(s.bottom, window.innerHeight) - 2;
        const units = [...stage.querySelectorAll('[data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true');
        for (const u of units) {
          const id = u.getAttribute('data-el');
          const inner = u.querySelector('text, rect, ellipse, line, image') ?? u;
          const r = inner.getBoundingClientRect();
          if (r.right < loX || r.bottom < loY || r.left > hiX || r.top > hiY) continue;
          const cx = Math.min(Math.max(r.left + r.width / 2, loX), hiX);
          const cy = Math.min(Math.max(r.top + r.height / 2, loY), hiY);
          const t = document.elementFromPoint(cx, cy);
          if (t && stage.contains(t)) {
            let top = t.closest('[data-el]');
            if (top) {
              let p = top.parentElement, topId = top.getAttribute('data-el');
              while (p && stage.contains(p)) {
                const g = p.closest('[data-el]');
                if (!g) break;
                top = g; topId = top.getAttribute('data-el'); p = top.parentElement;
              }
              if (topId === id) return { x: cx, y: cy, id };
            }
          }
        }
        return null;
      })()`);
      assert.ok(hit, "a live unit is hittable at 200%");
      await page.click(hit.x, hit.y);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [hit.id]);
      const delta = await page.evaluate(overlayDelta(hit.id));
      assert.ok(delta && delta.every((d) => d <= 4), "zoomed live overlay aligns");
    } finally {
      await page.close();
    }
  });

  it("narrow viewports and fixture return keep working", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(VIEWER, { w: 900, h: 1400 });
    try {
      await openLivePanel(page);
      await compileExample(page);
      const st = await page.evaluate(STATE);
      assert.equal(st.slideCount, 3, "live deck at narrow size");
      await page.evaluate(`(() => { const s = document.querySelector('[aria-label="Deck"]'); s.value = 'mech-warm-humanist-plain'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await waitFor(page, `${THUMBS} === 12`);
      const back = await page.evaluate(STATE);
      assert.equal(back.slideCount, 12, "fixture return restores fixtures");
      assert.deepEqual(back.selectedIds, [], "replacement clears selection");
    } finally {
      await page.close();
    }
  });
});
