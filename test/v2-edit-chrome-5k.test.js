// Layout gallery in real Chrome — chooser, category browsing,
// truthful previews, template insertion with navigation, heading
// edits, shape restyle, chart-data edits, undo/redo, reorder,
// cancel-as-no-op, and narrow-viewport use. Command semantics live
// in test/v2-layouts-5k.test.js.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "layout-gallery");
const PORT = 5257;
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
const centerOf = (id) => `(() => {
  const stage = document.querySelector('[data-stage]');
  const svg = stage.querySelector('svg');
  const s = svg.getBoundingClientRect();
  const sc = document.querySelector('[data-scroll-container]').getBoundingClientRect();
  const loX = Math.max(s.left, sc.left, 0) + 2, hiX = Math.min(s.right, sc.right, window.innerWidth) - 2;
  const loY = Math.max(s.top, sc.top, 0) + 2, hiY = Math.min(s.bottom, sc.bottom, window.innerHeight) - 2;
  if (hiX <= loX || hiY <= loY) return null;
  const n = stage.querySelector('[data-el="${id}"]');
  if (!n) return null;
  n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  // Prefer a painted descendant with real area: the first match can
  // be a zero-height axis line whose center rounds onto background
  // at some scales, and CDP clicks rounded coordinates.
  const cands = [...n.querySelectorAll('text, rect, ellipse, line, image')];
  const inner = cands.find((c) => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4; }) ?? n;
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

async function openChooser(page) {
  const btn = await page.evaluate(`(() => { const b = document.querySelector('[data-new-slide]'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(btn, "+ Slide chooser present");
  await page.click(btn[0], btn[1]);
  await waitFor(page, `document.querySelector('[data-new-slide-chooser]') !== null`);
}

async function openGallery(page) {
  await openChooser(page);
  const layout = await page.evaluate(`(() => { const b = document.querySelector('[data-new-slide-layout]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(layout, "Choose layout action present");
  await page.click(layout[0], layout[1]);
  await waitFor(page, `document.querySelector('[data-gallery]') !== null`);
}

async function insertTemplate(page, id) {
  const before = await slideOrder(page);
  const card = await page.evaluate(`(() => { const b = document.querySelector('[data-gallery-card="${id}"]'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(card, `gallery card ${id} hittable`);
  const rev = (await page.evaluate(EDIT)).rev;
  await page.click(card[0], card[1]);
  await waitFor(page, `(${EDIT}).rev === ${rev + 1}`, 60000);
  await waitFor(page, `document.querySelector('[data-gallery]') === null`, 60000);
  const after = await slideOrder(page);
  assert.equal(after.length, before.length + 1, "filmstrip grew by one");
  const active = (await page.evaluate(STATE)).slideId;
  assert.ok(!before.includes(active), "navigated to the inserted slide");
  return { before, after, id: active };
}

describe("layout gallery in real chrome", () => {
  it("opens the chooser with blank, layout, and duplicate actions", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openChooser(page);
      for (const sel of ["[data-new-slide-blank]", "[data-new-slide-layout]", "[data-new-slide-duplicate]"]) {
        assert.ok(await page.evaluate(`document.querySelector('${sel}') !== null`), `${sel} offered`);
      }
      await page.screenshot(`${OUT}/chooser.png`);
    } finally {
      await page.close();
    }
  });

  it("browses categories with truthful previews for all 15 templates", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-gallery-card]').length`), 15, "full catalog on open");
      for (const c of ["all", "essentials", "comparison", "process", "data"]) {
        assert.ok(await page.evaluate(`document.querySelector('[data-gallery-cat="${c}"]') !== null`), `category ${c} offered`);
      }
      // Every preview renders authored placeholder wording, not a blank frame.
      const blanks = await page.evaluate(`[...document.querySelectorAll('[data-gallery-preview]')].filter((n) => (n.textContent ?? '').trim().length < 8).length`);
      assert.equal(blanks, 0, "no blank previews");
      assert.ok(await page.evaluate(`document.querySelector('[data-gallery-preview="title"]').textContent.includes('Presentation title')`), "title preview shows its placeholder");
      await page.screenshot(`${OUT}/gallery-all.png`);
      const data = await page.evaluate(`(() => { const b = document.querySelector('[data-gallery-cat="data"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(data[0], data[1]);
      await waitFor(page, `document.querySelectorAll('[data-gallery-card]').length === 4`, 60000);
      await page.screenshot(`${OUT}/gallery-data.png`);
      // Search reaches legacy aliases: "kpi" is not a template name.
      await page.evaluate(`(() => { const i = document.querySelector('[data-gallery-search]'); i.focus(); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; d.call(i, 'kpi'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await waitFor(page, `document.querySelectorAll('[data-gallery-card]').length === 1`, 60000);
      assert.ok(await page.evaluate(`document.querySelector('[data-gallery-card="metrics-3up"]') !== null`), "alias search finds the metric layout");
    } finally {
      await page.close();
    }
  });

  it("inserts a title layout and edits its heading", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      const { id } = await insertTemplate(page, "title");
      const stageText = await page.evaluate(`document.querySelector('[data-stage]').textContent`);
      assert.ok(stageText.includes("Presentation title"), "placeholder on the inserted slide");
      // First text unit is the single-run display title: directly editable.
      const first = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
      assert.ok(first, "inserted text hittable");
      const c0 = await page.evaluate(centerOf(first));
      assert.ok(c0, "heading center hittable");
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${first}"]') !== null`, 60000);
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${first}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
      await page.insertText(" — live");
      const commit = await page.evaluate(clickText("Commit"));
      assert.ok(commit, "Commit present");
      await page.click(commit[0], commit[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("Presentation title — live"), "edited heading on the slide");
      await page.screenshot(`${OUT}/title-edited.png`);
      void id;
    } finally {
      await page.close();
    }
  });

  it("inserts a comparison layout and restyles a card", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      await insertTemplate(page, "compare-2col");
      // Select the first card through the Layers tree (geometry-free
      // and exact — canvas points there sit under overlaid text).
      const layers = await page.evaluate(clickText("Layers"));
      assert.ok(layers, "Layers tab present");
      await page.click(layers[0], layers[1]);
      await waitFor(page, `document.querySelector('[data-layer]') !== null`, 60000);
      const shape = await page.evaluate(`(() => {
        const row = [...document.querySelectorAll('[data-layer]')].find((n) => (n.textContent ?? '').includes('Rounded rectangle'));
        return row ? row.getAttribute('data-layer') : null;
      })()`);
      assert.ok(shape, "card row in the Layers tree");
      const rowPt = await page.evaluate(`(() => { const n = document.querySelector('[data-layer="${shape}"] button[title^="Select"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(rowPt, "card row clickable");
      await page.click(rowPt[0], rowPt[1]);
      await waitFor(page, `document.querySelector('[data-style-panel]') !== null`, 60000);
      await page.evaluate(`(() => {
        const input = document.querySelector('[data-style-panel] input[aria-label="Shape fill"]');
        input.focus();
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
        desc.call(input, '#123456');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const apply = await page.evaluate(clickText("Apply style"));
      assert.ok(apply, "Apply style present");
      await page.click(apply[0], apply[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      const fill = await page.evaluate(`document.querySelector('[data-stage] [data-el="${shape}"]').getAttribute('fill')`);
      assert.ok(String(fill).toLowerCase().includes("123456"), `card restyled, got ${fill}`);
      await page.screenshot(`${OUT}/comparison-styled.png`);
    } finally {
      await page.close();
    }
  });

  it("inserts a chart template and edits its values", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      await insertTemplate(page, "chart-insight");
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("Example A"), "starter categories on the slide");
      const chart = await page.evaluate(`(() => {
        const stage = document.querySelector('[data-stage]');
        const hit = [...stage.querySelectorAll('[data-el]')].find((n) => n.textContent.includes('Example A'));
        return hit ? hit.getAttribute('data-el') : null;
      })()`);
      assert.ok(chart, "chart hittable");
      const c0 = await page.evaluate(centerOf(chart));
      assert.ok(c0, "chart center hittable");
      await page.click(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-chart-editor]') !== null`, 60000);
      await page.evaluate(`(() => {
        const set = (sel, v) => {
          const input = document.querySelector(sel);
          input.focus();
          const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
          desc.call(input, v);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('[data-chart-editor] input[aria-label="Category 1 label"]', 'North');
        set('[data-chart-editor] input[aria-label^="Value"]', '42');
        return true;
      })()`);
      const apply = await page.evaluate(clickText("Apply"));
      assert.ok(apply, "chart Apply present");
      await page.click(apply[0], apply[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("North"), "edited category on the slide");
      await page.screenshot(`${OUT}/chart-edited.png`);
    } finally {
      await page.close();
    }
  });

  it("undoes and redoes a template insertion exactly", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      const { before, id } = await insertTemplate(page, "timeline");
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.deepEqual(await slideOrder(page), before, "undo deletes the template slide");
      const redo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Redo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(redo[0], redo[1]);
      await waitFor(page, `(${EDIT}).rev === 3`, 60000);
      const restored = await slideOrder(page);
      assert.equal(restored.length, before.length + 1, "redo restores the slide");
      assert.ok(restored.includes(id), "redo restores the identical slide id");
    } finally {
      await page.close();
    }
  });

  it("reorders a template slide with the filmstrip drag", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await openGallery(page);
      const { before, id } = await insertTemplate(page, "key-findings");
      assert.ok((await slideOrder(page)).includes(id));
      const a = await page.evaluate(`(() => { const n = document.querySelector('[data-thumb="${id}"]'); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      const b = await page.evaluate(`(() => { const n = document.querySelector('[data-thumb="${before[0]}"]'); n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + 4]; })()`);
      await page.mouseDown(a[0], a[1]);
      await page.mouseMove(b[0], b[1]);
      await new Promise((r) => setTimeout(r, 500));
      await page.mouseUp(b[0], b[1]);
      await waitFor(page, `(${EDIT}).rev === 2`, 60000);
      assert.equal((await slideOrder(page))[0], id, "template slide moved first");
      await page.screenshot(`${OUT}/reordered.png`);
    } finally {
      await page.close();
    }
  });

  it("cancelling the gallery mutates nothing", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      const before = await slideOrder(page);
      await openGallery(page);
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-gallery]') === null`, 60000);
      assert.equal((await page.evaluate(EDIT)).rev, 0, "no history entry");
      assert.deepEqual(await slideOrder(page), before, "filmstrip untouched");
    } finally {
      await page.close();
    }
  });

  it("stays usable on a narrow viewport", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK, { w: 480, h: 900 });
    try {
      await enterEdit(page);
      // Narrow viewports collapse the slides rail into a toggleable
      // overlay; open it before using rail controls.
      const rail = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Show slides rail'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (rail) await page.click(rail[0], rail[1]);
      await openGallery(page);
      const box = await page.evaluate(`(() => { const p = document.querySelector('[data-gallery-panel], [role="dialog"]'); const r = p.getBoundingClientRect(); return { w: r.width, vw: window.innerWidth }; })()`);
      assert.ok(box.w <= box.vw, `panel ${box.w}px fits ${box.vw}px viewport`);
      const { id } = await insertTemplate(page, "two-column");
      assert.ok((await slideOrder(page)).includes(id), "insert works narrow");
      await page.screenshot(`${OUT}/narrow.png`);
    } finally {
      await page.close();
    }
  });
});
