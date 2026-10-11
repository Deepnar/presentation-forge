// V2-5C: editing in real Chrome — trusted drags through the CDP
// input pipeline, keyboard nudge/delete, undo/redo buttons,
// locked rejection, and cleanup. Coordinate conversion across
// zoom/scroll/narrow viewports is asserted against overlay
// alignment, never screenshots alone. Headless behavioral detail
// lives in test/v2-edit-5c.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const PORT = 5237;
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
  } catch (err) {
    skipped = `vite build failed: ${String(err.message).slice(0, 200)}`;
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
// Verified hittable viewport point for a stage unit.
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
const overlayDelta = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom)]; })()`;
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

async function dragDelta(page, x, y, dx) {
  await page.drag(x, y, x + dx, y);
}

describe("v2-5c chrome editing", () => {
  it("trusted drag moves through one engine command", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(c0, "hittable unit");
      await page.click(c0[0], c0[1]);
      // Re-resolve: selecting reveals the inspector, which refits
      // the stage and shifts coordinates by a few px.
      const d0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(d0, "still hittable after selection");
      const dx = d0[0] + 150 < 1400 ? 120 : -120;
      await dragDelta(page, d0[0], d0[1], dx);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[0]], "selection kept");
      const delta = await page.evaluate(overlayDelta(ids[0]));
      assert.ok(delta && delta.every((d) => d <= 4), "overlay follows committed geometry");
      const insp = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      assert.ok(insp.includes(ids[0]), "inspector tracks the moved unit");
    } finally {
      await page.close();
    }
  });

  it("zoomed and scrolled drags convert coordinates", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0&zoom=2`);
    try {
      await enterEdit(page);
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
            if (!top) continue;
            let p = top.parentElement, topId = top.getAttribute('data-el');
            while (p && stage.contains(p)) {
              const g = p.closest('[data-el]');
              if (!g) break;
              top = g; topId = top.getAttribute('data-el'); p = top.parentElement;
            }
            if (topId === id) return { x: cx, y: cy, id };
          }
        }
        return null;
      })()`);
      assert.ok(hit, "hittable unit at 200%");
      await page.click(hit.x, hit.y);
      // Scroll the stage, then drag: projection must include scroll offsets.
      await page.evaluate(`document.querySelector('[data-scroll-container]').scrollBy(60, 40)`);
      const c1 = await page.evaluate(centerOf(hit.id));
      assert.ok(c1, "unit still hittable after scroll");
      const dx = c1[0] + 120 < 1400 ? 100 : -100;
      await page.drag(c1[0], c1[1], c1[0] + dx, c1[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const delta = await page.evaluate(overlayDelta(hit.id));
      assert.ok(delta && delta.every((d) => d <= 5), "scrolled zoomed overlay aligns");
    } finally {
      await page.close();
    }
  });

  it("keyboard nudge, multiselect batch, delete, and undo buttons", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const ids = await page.evaluate(IDS);
      assert.ok(ids.length >= 2, "two units to work with");
      const c0 = await page.evaluate(centerOf(ids[0]));
      await page.click(c0[0], c0[1]);
      await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const c1 = await page.evaluate(centerOf(ids[1]));
      await page.click(c1[0], c1[1], { shift: true });
      await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))`);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [], "delete reconciles selection");
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 4`, 60000);
      // Undo restores elements but does not reselect (documented):
      // re-select the pair and confirm both are back with content.
      const r0 = await page.evaluate(centerOf(ids[0]));
      await page.click(r0[0], r0[1]);
      const r1 = await page.evaluate(centerOf(ids[1]));
      await page.click(r1[0], r1[1], { shift: true });
      const insp = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      assert.ok(insp.includes(ids[0]) && insp.includes(ids[1]), "inspector tracks the restored pair");
    } finally {
      await page.close();
    }
  });

  it("locked chrome rejects drags and Done restores navigation", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`);
    try {
      await enterEdit(page);
      const locked = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-locked="true"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(locked, "locked chrome present");
      await page.drag(locked[0], locked[1], locked[0] + 80, locked[1]);
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal((await page.evaluate(EDIT)).rev, 0, "locked drag commits nothing");
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [], "locked click clears");
      const done = await page.evaluate(clickText("Done"));
      await page.click(done[0], done[1]);
      await waitFor(page, `document.querySelector('[data-editing="true"]') === null`);
      const before = (await page.evaluate(STATE)).slideIndex;
      await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
      assert.equal((await page.evaluate(STATE)).slideIndex, before + 1, "read-only arrows navigate after Done");
    } finally {
      await page.close();
    }
  });

  it("narrow viewport editing holds", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE, { w: 900, h: 1400 });
    try {
      await enterEdit(page);
      const ids = await page.evaluate(IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(c0, "hittable at narrow size");
      await page.click(c0[0], c0[1]);
      const d0 = await page.evaluate(centerOf(ids[0]));
      assert.ok(d0, "still hittable after selection");
      const dx = d0[0] + 120 < 850 ? 100 : -100;
      await page.drag(d0[0], d0[1], d0[0] + dx, d0[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const delta = await page.evaluate(overlayDelta(ids[0]));
      assert.ok(delta && delta.every((d) => d <= 4), "narrow overlay aligns");
    } finally {
      await page.close();
    }
  });

  it("pointer displacement converts to scene displacement at every scale", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    // For each viewport/zoom: record scene x/y (inspector), record
    // the rendered client box, drag a known client delta, then
    // assert the scene delta equals client delta divided by the
    // live rendered scale — and the visual displacement equals the
    // pointer displacement within 4px. k is always read live, never
    // assumed, so fit and zoomed paths prove the same equation.
    const cases = [
      { name: "fit-1440", url: PROSE, opts: { w: 1440, h: 900 } },
      { name: "zoom-200", url: `${PROSE}&zoom=2`, opts: { w: 1440, h: 900 } },
      { name: "narrow", url: PROSE, opts: { w: 900, h: 1400 } },
    ];
    for (const c of cases) {
      const page = await open(c.url, c.opts);
      try {
        await enterEdit(page);
        const ids = await page.evaluate(IDS);
        const id = ids[0];
        const c0 = await page.evaluate(centerOf(id));
        assert.ok(c0, `${c.name}: hittable unit`);
        await page.click(c0[0], c0[1]);
        const d0 = await page.evaluate(centerOf(id));
        const before = await page.evaluate(`(() => {
          const m = (document.querySelector('[data-inspector]')?.textContent ?? '').match(/@ ([\\d.]+),([\\d.]+)/);
          const svg = document.querySelector('[data-stage] svg').getBoundingClientRect();
          const r = document.querySelector('[data-stage] [data-el="${id}"]').getBoundingClientRect();
          return m ? { x: Number(m[1]), y: Number(m[2]), k: svg.width / 1280, left: r.left, top: r.top } : null;
        })()`);
        assert.ok(before, `${c.name}: inspector reports scene position`);
        const dx = d0[0] + 140 < (c.opts.w - 40) ? 120 : -120;
        const dy = 60;
        await page.drag(d0[0], d0[1], d0[0] + dx, d0[1] + dy);
        await waitFor(page, `(${EDIT}).rev === 1`, 60000);
        const after = await page.evaluate(`(() => {
          const m = (document.querySelector('[data-inspector]')?.textContent ?? '').match(/@ ([\\d.]+),([\\d.]+)/);
          const r = document.querySelector('[data-stage] [data-el="${id}"]').getBoundingClientRect();
          return m ? { x: Number(m[1]), y: Number(m[2]), left: r.left, top: r.top } : null;
        })()`);
        assert.ok(Math.abs((after.x - before.x) - dx / before.k / 96) < 0.003, `${c.name}: scene dx follows the equation (got ${after.x - before.x}, want ${dx / before.k / 96})`);
        assert.ok(Math.abs((after.y - before.y) - dy / before.k / 96) < 0.003, `${c.name}: scene dy follows the equation`);
        assert.ok(Math.abs((after.left - before.left) - dx) < 4, `${c.name}: visual dx matches pointer dx`);
        assert.ok(Math.abs((after.top - before.top) - dy) < 4, `${c.name}: visual dy matches pointer dy`);
      } finally {
        await page.close();
      }
    }
  });

  it("chart elements displace by the pointer delta on both axes", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=6`);
    try {
      await enterEdit(page);
      const id = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const units = [...stage.querySelectorAll('svg > g[data-el]')].filter((n) => n.getAttribute('data-locked') !== 'true');
        units.sort((a, b) => b.querySelectorAll('rect').length - a.querySelectorAll('rect').length);
        return units[0]?.getAttribute('data-el') ?? null;
      })()`);
      assert.ok(id, "chart unit identified by geometry");
      // Click a bar body, not a hairline axis: zero-height line
      // rects round-trip unreliably through CDP integer
      // coordinates, while bars are stable area targets.
      const c0 = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const unit = stage.querySelector('[data-el="${id}"]');
        const bars = [...unit.querySelectorAll('rect')].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 10 && b.height > 10; });
        if (!bars.length) return null;
        const r = bars[0].getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const t = document.elementFromPoint(x, y);
        if (!t || !stage.contains(t)) return null;
        let top = t.closest('[data-el]');
        if (!top) return null;
        let p = top.parentElement, topId = top.getAttribute('data-el');
        while (p && stage.contains(p)) {
          const g = p.closest('[data-el]');
          if (!g) break;
          top = g; topId = top.getAttribute('data-el'); p = top.parentElement;
        }
        return topId === '${id}' ? [x, y] : null;
      })()`);
      assert.ok(c0, "bar body hittable");
      await page.click(c0[0], c0[1]);
      const d0 = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const unit = stage.querySelector('[data-el="${id}"]');
        const bars = [...unit.querySelectorAll('rect')].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 10 && b.height > 10; });
        if (!bars.length) return null;
        const r = bars[0].getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      assert.ok(d0, "bar body hittable after selection");
      const before = await page.evaluate(`(() => {
        const m = (document.querySelector('[data-inspector]')?.textContent ?? '').match(/@ ([\\d.]+),([\\d.]+)/);
        const svg = document.querySelector('[data-stage] svg').getBoundingClientRect();
        const r = document.querySelector('[data-stage] [data-el="${id}"]').getBoundingClientRect();
        return m ? { x: Number(m[1]), y: Number(m[2]), k: svg.width / 1280, left: r.left, top: r.top } : null;
      })()`);
      await page.drag(d0[0], d0[1], d0[0] + 80, d0[1] + 40);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const after = await page.evaluate(`(() => {
        const m = (document.querySelector('[data-inspector]')?.textContent ?? '').match(/@ ([\\d.]+),([\\d.]+)/);
        const r = document.querySelector('[data-stage] [data-el="${id}"]').getBoundingClientRect();
        return m ? { x: Number(m[1]), y: Number(m[2]), left: r.left, top: r.top } : null;
      })()`);
      assert.ok(Math.abs((after.x - before.x) - 80 / before.k / 96) < 0.003, "chart scene dx follows the equation");
      assert.ok(Math.abs((after.y - before.y) - 40 / before.k / 96) < 0.003, "chart scene dy follows the equation");
      assert.ok(Math.abs((after.left - before.left) - 80) < 4, "chart visual dx matches pointer");
      assert.ok(Math.abs((after.top - before.top) - 40) < 4, "chart visual dy matches pointer");
    } finally {
      await page.close();
    }
  });
});
