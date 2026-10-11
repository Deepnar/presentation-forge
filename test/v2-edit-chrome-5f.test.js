// V2-5F: multi-paragraph editing and text formatting in real
// Chrome — bullet-list editing with structural changes, per-style
// preservation on mixed bodies, format-panel commits, caret
// isolation, and double-click stability with the format bar below
// the stage. Behavioral detail lives in the headless 5f suites.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5f");
const PORT = 5247;
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

describe("v2-5f chrome paragraphs and formatting", () => {
  it("bullet list edits with an appended bullet in one revision", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const body = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const c = [...stage.querySelectorAll('[data-el]')].find((n) => n.querySelectorAll('text').length > 1);
        return c ? c.getAttribute('data-el') : null;
      })()`);
      assert.ok(body, "multi-paragraph body present");
      const c0 = await page.evaluate(centerOf(body));
      assert.ok(c0, "body hittable");
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${body}"]') !== null`, 60000);
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${body}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
      await page.screenshot(`${OUT}/multi-editing.png`);
      await page.insertText("\nEpsilon point");
      const commit = await page.evaluate(clickText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const stageText = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(stageText.includes("Epsilon point"), "appended bullet on the slide");
      assert.ok(stageText.includes("Alpha point"), "existing bullets kept");
      await page.screenshot(`${OUT}/multi-committed.png`);
    } finally {
      await page.close();
    }
  });

  it("mixed-style body keeps per-paragraph paint through a wording edit", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(`http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=2`);
    try {
      await enterEdit(page);
      // A comparison card body: label + text paragraphs, two styles.
      const target = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        for (const n of stage.querySelectorAll('[data-el]')) {
          if (n.parentElement && n.parentElement.closest('[data-el]')) continue;
          if (n.getAttribute('data-locked') === 'true') continue;
          if (n.querySelectorAll('text').length === 2) return n.getAttribute('data-el');
        }
        return null;
      })()`);
      assert.ok(target, "two-paragraph mixed body present");
      const c0 = await page.evaluate(centerOf(target));
      assert.ok(c0, "mixed body hittable");
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${target}"]') !== null`, 60000);
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${target}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
      await page.insertText("!");
      const commit = await page.evaluate(clickText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      // Label still renders bold display type and body still plain:
      // two text nodes with different weight families survive.
      const weights = await page.evaluate(`(() => {
        const n = document.querySelector('[data-stage] [data-el="${target}"]');
        return [...n.querySelectorAll('text')].map((x) => x.getAttribute('font-weight') ?? 'none').join(',');
      })()`);
      assert.ok(weights.includes("bold"), `label emphasis intact (got ${weights})`);
      await page.screenshot(`${OUT}/mixed-committed.png`);
    } finally {
      await page.close();
    }
  });

  it("format panel recolors one paragraph and undo refreshes it", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const body = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const c = [...stage.querySelectorAll('[data-el]')].find((n) => n.querySelectorAll('text').length > 1);
        return c ? c.getAttribute('data-el') : null;
      })()`);
      const c0 = await page.evaluate(centerOf(body));
      await page.click(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-format-panel]') !== null`, 60000);
      await page.screenshot(`${OUT}/format-panel.png`);
      await page.evaluate(`(() => {
        const input = document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]');
        input.focus();
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, '#c00000');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(`document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]').blur()`);
      await waitFor(page, `(${EDIT}).rev === 1`, 60000);
      const val = await page.evaluate(`document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]').value`);
      assert.equal(val.toLowerCase(), "#c00000", "panel reflects the committed color");
      const other = await page.evaluate(`document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 1 color"]').value`);
      assert.notEqual(other.toLowerCase(), "#c00000", "sibling paragraph untouched");
      await page.screenshot(`${OUT}/formatted.png`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      const back = await page.evaluate(`document.querySelector('[data-text-format-panel] input[aria-label="Paragraph 2 color"]').value`);
      assert.notEqual(back.toLowerCase(), "#c00000", `undo refreshes the row (got ${back})`);
    } finally {
      await page.close();
    }
  });

  it("caret keys stay in multi-line drafts and Escape cancels whole", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(PROSE);
    try {
      await enterEdit(page);
      const body = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const c = [...stage.querySelectorAll('[data-el]')].find((n) => n.querySelectorAll('text').length > 1);
        return c ? c.getAttribute('data-el') : null;
      })()`);
      const c0 = await page.evaluate(centerOf(body));
      const slideBefore = (await page.evaluate(STATE)).slideIndex;
      const before = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${body}"]') !== null`, 60000);
      await page.key(40, "ArrowDown");
      await page.key(38, "ArrowUp");
      await new Promise((r) => setTimeout(r, 800));
      assert.equal((await page.evaluate(STATE)).slideIndex, slideBefore, "arrows stay in the draft");
      assert.equal((await page.evaluate(EDIT)).rev, 0);
      await page.insertText("doomed");
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-text-edit="${body}"]') === null`, 60000);
      assert.equal((await page.evaluate(EDIT)).rev, 0);
      assert.equal(await page.evaluate(`document.querySelector('[data-stage]').textContent`), before);
    } finally {
      await page.close();
    }
  });

  it("double-click needs no stage jump with the format bar below", async (t) => {
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
      const beforePt = await page.evaluate(centerOf(ids[0]));
      assert.ok(beforePt, "hittable");
      await page.click(beforePt[0], beforePt[1]);
      await new Promise((r) => setTimeout(r, 800));
      const afterPt = await page.evaluate(centerOf(ids[0]));
      assert.ok(afterPt, "still hittable after selection");
      assert.ok(Math.hypot(afterPt[0] - beforePt[0], afterPt[1] - beforePt[1]) <= 1, "stage did not jump (format bar is below the viewport)");
      await page.dblclick(beforePt[0], beforePt[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') !== null`, 60000);
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-text-edit="${ids[0]}"]') === null`, 60000);
    } finally {
      await page.close();
    }
  });
});
