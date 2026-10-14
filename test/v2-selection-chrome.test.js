// V2-4E: selection in real Chrome — trusted clicks, zoom hit
// testing, overlay alignment, locked exclusion, inspector, and
// deep links. Clicks dispatch through CDP input at viewport
// coordinates, so overlay transparency and true hit testing are
// exercised rather than bypassed. State transitions themselves
// run headless in test/v2-selection-4e.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const PORT = 5213;
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

function serveDir(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      const file = join(dir, rel);
      if (!file.startsWith(dir)) {
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
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
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
  server = await serveDir(DIST, PORT);
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

// Outermost unlocked units in DOM order.
const IDS = `[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`;

const centerOf = (id) => `(() => {
  const n = document.querySelector('[data-stage] [data-el="${id}"]');
  if (!n) return null;
  n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  const sc = document.querySelector('[data-scroll-container]').getBoundingClientRect();
  const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
  const r = inner.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + r.height / 2]];
  for (const [x, y] of pts) {
    if (x < sc.left + 2 || x > sc.right - 2 || y < sc.top + 2 || y > sc.bottom - 2) continue;
    const t = document.elementFromPoint(x, y);
    if (t && t.closest('[data-el]') && t.closest('[data-el]').getAttribute('data-el') === '${id}') return [x, y];
  }
  return null;
})()`;

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;

const EMPTY_POINT = `(() => { const svg = document.querySelector('[data-stage] svg'); const r = svg.getBoundingClientRect(); for (const fx of [0.04, 0.5, 0.96]) for (const fy of [0.94, 0.5, 0.06]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const t = document.elementFromPoint(x, y); if (t && !t.closest('[data-el]')) return [x, y]; } return null; })()`;

const overlayDelta = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom)]; })()`;

async function open(url, opts) {
  const { openViewer } = await import("../tools/chrome-shot.mjs");
  return openViewer(url, opts);
}

describe("v2-4e chrome selection", () => {
  it("trusted clicks select, shift-click multi-selects, background clears", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      assert.deepEqual(page.missing, [], "font gate clean before interacting");
      const ids = await page.evaluate(IDS);
      assert.ok(ids.length >= 2, `prose slide has units (${ids.length})`);
      const c0 = await page.evaluate(centerOf(ids[0]));
      await page.click(c0[0], c0[1]);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[0]], "click selects one");
      const c1 = await page.evaluate(centerOf(ids[1]));
      await page.click(c1[0], c1[1], { shift: true });
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[0], ids[1]], "shift-click adds");
      // Re-resolve: scrolling for c1 stales earlier coordinates.
      const c0b = await page.evaluate(centerOf(ids[0]));
      await page.click(c0b[0], c0b[1], { shift: true });
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[1]], "shift-click toggles off");
      const bg = await page.evaluate(EMPTY_POINT);
      assert.ok(bg, "an empty background point exists");
      await page.click(bg[0], bg[1]);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [], "background clears");
    } finally {
      await page.close();
    }
  });

  it("Escape clears and locked chrome never selects", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`);
    try {
      const ids = await page.evaluate(IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      await page.click(c0[0], c0[1]);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [ids[0]]);
      await page.evaluate(`document.querySelector('[data-stage]').parentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [], "Escape clears");
      const locked = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-locked="true"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(locked, "chromed slide exposes locked chrome");
      await page.click(locked[0], locked[1]);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [], "locked chrome excluded");
    } finally {
      await page.close();
    }
  });

  it("hit testing and overlays hold at 200% zoom", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    // At 200% the scaled stage overflows paint-only (the shell
    // centers it without layout scroll, a pre-existing V2-4A
    // behavior), so the test uses the centered divider slide,
    // whose title stays visible at any zoom, and clicks whatever
    // unit is actually under the cursor.
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0&zoom=2`);
    try {
      const hit = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const svg = stage.querySelector('svg');
        const s = svg.getBoundingClientRect();
        const sc = document.querySelector('[data-scroll-container]').getBoundingClientRect();
        const loX = Math.max(s.left, sc.left, 0) + 2, hiX = Math.min(s.right, sc.right, window.innerWidth) - 2;
        const loY = Math.max(s.top, sc.top, 0) + 2, hiY = Math.min(s.bottom, sc.bottom, window.innerHeight) - 2;
        if (hiX <= loX || hiY <= loY) return null;
        const units = [...stage.querySelectorAll('[data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true');
        const topId = (t) => {
          if (!stage.contains(t)) return null;
          let top = t.closest('[data-el]');
          if (!top) return null;
          let p = top.parentElement;
          while (p && stage.contains(p)) {
            const g = p.closest('[data-el]');
            if (!g) break;
            top = g;
            p = top.parentElement;
          }
          return top.getAttribute('data-locked') === 'true' ? null : top.getAttribute('data-el');
        };
        for (const u of units) {
          const id = u.getAttribute('data-el');
          const inner = u.querySelector('text, rect, ellipse, line, image') ?? u;
          const r = inner.getBoundingClientRect();
          if (r.right < loX || r.bottom < loY || r.left > hiX || r.top > hiY) continue;
          const cx = Math.min(Math.max(r.left + r.width / 2, loX), hiX);
          const cy = Math.min(Math.max(r.top + r.height / 2, loY), hiY);
          for (const [x, y] of [[cx, cy], [cx, Math.max(cy - 14, loY)], [cx, Math.min(cy + 14, hiY)]]) {
            const t = document.elementFromPoint(x, y);
            if (t && topId(t) === id) return { x, y, id };
          }
        }
        return null;
      })()`);
      assert.ok(hit, "a unit is hittable at 200% zoom");
      await page.click(hit.x, hit.y);
      assert.deepEqual((await page.evaluate(STATE)).selectedIds, [hit.id], "zoomed hit resolves");
      const delta = await page.evaluate(overlayDelta(hit.id));
      assert.ok(delta, "overlay present when zoomed");
      for (const d of delta) assert.ok(d <= 4, `zoomed overlay edge within 4px (got ${d})`);
    } finally {
      await page.close();
    }
  });

  it("overlays align without displacing content, inspector reports ground truth", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      const ids = await page.evaluate(IDS);
      const c0 = await page.evaluate(centerOf(ids[0]));
      const snapSvg = `(() => { const s = document.querySelector('[data-stage] svg'); const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, html: s.outerHTML.replace(/ data-selected="true"/g, ''), sel: s.querySelectorAll('[data-selected]').length }; })()`;
      const before = await page.evaluate(snapSvg);
      await page.click(c0[0], c0[1]);
      const delta = await page.evaluate(overlayDelta(ids[0]));
      assert.ok(delta, "overlay present");
      for (const d of delta) assert.ok(d <= 3, `overlay edge within 3px (got ${d})`);
      const after = await page.evaluate(snapSvg);
      assert.equal(after.sel, 1, "exactly one state marker, on the selection");
      assert.equal(after.html, before.html, "scene markup untouched apart from the state marker");
      assert.ok(Math.abs(after.w / after.h - before.w / before.h) < 1e-6, "slide aspect undistorted (the inspector row refits stage scale like any resize)");
      const panel = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      assert.ok(panel.includes(ids[0]), "inspector names the selection");
      assert.match(panel, /(text|shape|chart|table|image|line|group)/, "inspector reports the kind");
    } finally {
      await page.close();
    }
  });

  it("deep-link selection and narrow viewports keep working", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const probe = await open(PROSE);
    let first;
    try {
      first = (await probe.evaluate(IDS))[0];
    } finally {
      await probe.close();
    }
    const linked = await open(`${PROSE}&select=${encodeURIComponent(first)}`);
    try {
      assert.deepEqual((await linked.evaluate(STATE)).selectedIds, [first], "?select= honored");
    } finally {
      await linked.close();
    }
    const narrow = await open(PROSE, { w: 900, h: 1400 });
    try {
      const ids = await narrow.evaluate(IDS);
      const c0 = await narrow.evaluate(centerOf(ids[0]));
      await narrow.click(c0[0], c0[1]);
      assert.deepEqual((await narrow.evaluate(STATE)).selectedIds, [ids[0]], "narrow viewport selects");
      const delta = await narrow.evaluate(overlayDelta(ids[0]));
      assert.ok(delta && delta.every((d) => d <= 3), "narrow overlay aligns");
    } finally {
      await narrow.close();
    }
  });
});
