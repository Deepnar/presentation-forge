// V2-5C editing evaluation driver: real Edit-panel flows in
// Chrome over committed fixtures plus one temporary group deck —
// drag (trusted CDP input), preview, nudge, delete/undo, locked
// rejection, zoomed/scrolled drags, and group moves.
//   node tools/v2-5c-eval.mjs
// Outputs (gitignored): out/v2-5c/<shot>.png,
// out/v2-5c/eval-manifest.json. Curated shots land in
// docs/v2-5c-evidence/ by hand after review.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-5c");
const PORT = 5240;

const { openViewer } = await import("./chrome-shot.mjs");

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
}

async function serve() {
  const app = express();
  app.use(express.static(DIST));
  return new Promise((resolve, reject) => {
    const s = app.listen(PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
}

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
const EDIT = `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState)`;
const IDS = `[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))`;
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
        top = g; topId = top.getAttribute('data-el'); p = top.parentElement;
      }
      if (topId === '${id}' && top.getAttribute('data-locked') !== 'true') return [x, y];
    }
  }
  return null;
})()`;
const DELTA = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [a.left - b.left, a.top - b.top, a.right - b.right, a.bottom - b.bottom].map((v) => Math.round(v * 10) / 10); })()`;

async function waitFor(page, expr, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function clickButton(page, text) {
  const pt = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (!pt) throw new Error(`button unavailable: ${text}`);
  await page.click(pt[0], pt[1]);
}

async function enterEdit(page) {
  await clickButton(page, "Edit");
  await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`, 60000);
}

async function freshPoint(page, id) {
  const pt = await page.evaluate(POINT(id));
  if (!pt) throw new Error(`no hittable point for ${id}`);
  return pt;
}

const SCENES = path.join(ROOT, "app", "web", "src", "scenes");
const VIEWER = path.join(ROOT, "app", "web", "src", "components", "SceneViewer.jsx");
const groupDeck = {
  name: "v25c-group-demo", theme: "warm-humanist", variant: "plain",
  scenes: [{
    id: "g-demo", width: 13.333, height: 7.5, background: { fill: "EBEBE6" }, layoutState: "managed",
    elements: [
      { id: "g-demo:title", kind: "text", x: 0.7, y: 0.4, w: 11.9, h: 1.2, z: 1, provenance: "compiler", paragraphs: [{ runs: [{ text: "Grouped assembly", size: 36, color: "2D2D2A", family: "Merriweather", weight: 700 }] }] },
      {
        id: "g-demo:assembly", kind: "group", x: 0.7, y: 2, w: 6, h: 3, z: 2, provenance: "compiler",
        group: {
          children: [
            { id: "g-demo:plate", kind: "shape", x: 0, y: 0, w: 6, h: 3, z: 1, provenance: "compiler", shape: { fill: "D8D8D2" } },
            { id: "g-demo:label", kind: "text", x: 0.4, y: 1, w: 5.2, h: 1, z: 2, provenance: "compiler", paragraphs: [{ runs: [{ text: "child label", size: 20, color: "2D2D2A", family: "Inter" }] }] },
          ],
        },
      },
    ],
  }],
};

await mkdir(OUT, { recursive: true });
build();
const server = await serve();
const shots = [];
try {
  async function shot(tag, url, fn, opts) {
    const page = await openViewer(url, opts);
    try {
      const info = await fn(page);
      await page.screenshot(path.join(OUT, `${tag}.png`));
      shots.push({ tag, ...info });
      console.log(`${tag} done`, JSON.stringify(info));
    } finally {
      await page.close();
    }
  }

  // Prose: select, trusted drag, committed ring.
  await shot("drag-prose", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`, async (page) => {
    await enterEdit(page);
    const ids = await page.evaluate(IDS);
    let pt = await freshPoint(page, ids[0]);
    await page.click(pt[0], pt[1]);
    pt = await freshPoint(page, ids[0]);
    const dx = pt[0] + 140 < 1400 ? 120 : -120;
    await page.drag(pt[0], pt[1], pt[0] + dx, pt[1]);
    await waitFor(page, `(${EDIT}).rev === 1`);
    return { selectedIds: (await page.evaluate(STATE)).selectedIds, overlayDelta: await page.evaluate(DELTA(ids[0])) };
  });

  // Preview mid-gesture via synthetic partial drag, then release.
  await shot("drag-preview", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`, async (page) => {
    await enterEdit(page);
    const ids = await page.evaluate(IDS);
    const pt = await freshPoint(page, ids[0]);
    await page.click(pt[0], pt[1]);
    const q = await freshPoint(page, ids[0]);
    const ex = q[0] + 150 < 1400 ? q[0] + 150 : q[0] - 150;
    await page.mouseDown(q[0], q[1]);
    await page.mouseMove(q[0] + (ex - q[0]) / 2, q[1]);
    await page.mouseMove(ex, q[1]);
    await new Promise((r) => setTimeout(r, 600));
    const pre = await page.evaluate(`(() => {
      const g = document.querySelector('[data-stage] [data-el="${ids[0]}"]');
      const o = document.querySelector('[data-overlay="${ids[0]}"]');
      void g.getBoundingClientRect();
      return { transform: g.getAttribute('transform'), overlayLeft: o?.style?.left ?? null };
    })()`);
    await page.screenshot(path.join(OUT, "drag-preview-mid.png"));
    shots.push({ tag: "drag-preview-mid", midGesturePreview: true, preShotDom: pre });
    console.log("drag-preview-mid done (mid-gesture)");
    await page.mouseUp(ex, q[1]);
    await waitFor(page, `(${EDIT}).rev === 1`);
    return { selectedIds: (await page.evaluate(STATE)).selectedIds };
  });

  // Chart drag as a unit.
  await shot("drag-chart", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=6`, async (page) => {
    await enterEdit(page);
    const id = await page.evaluate(`[...document.querySelectorAll('[data-stage] [data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true').map((n) => n.getAttribute('data-el'))[0]`);
    const pt = await freshPoint(page, id);
    await page.click(pt[0], pt[1]);
    const q = await freshPoint(page, id);
    const dx = q[0] + 120 < 1400 ? 100 : -100;
    await page.drag(q[0], q[1], q[0] + dx, q[1]);
    await waitFor(page, `(${EDIT}).rev === 1`);
    return { selectedIds: (await page.evaluate(STATE)).selectedIds, overlayDelta: await page.evaluate(DELTA(id)) };
  });

  // Nudge, delete, undo sequence.
  await shot("nudge-delete-undo", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`, async (page) => {
    await enterEdit(page);
    const ids = await page.evaluate(IDS);
    const pt = await freshPoint(page, ids[0]);
    await page.click(pt[0], pt[1]);
    const mount = `document.querySelector('[data-stage]').parentElement`;
    await page.evaluate(`${mount}.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    await waitFor(page, `(${EDIT}).rev === 1`);
    await page.evaluate(`${mount}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))`);
    await waitFor(page, `(${EDIT}).rev === 2`);
    const cleared = (await page.evaluate(STATE)).selectedIds;
    await page.evaluate(`${mount}.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, ctrlKey: true }))`);
    await waitFor(page, `(${EDIT}).rev === 3`);
    return { clearedAfterDelete: cleared, rev: 3 };
  });

  // Locked chromed slide: drag attempt commits nothing.
  await shot("locked-reject", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`, async (page) => {
    await enterEdit(page);
    const pt = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-locked="true"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!pt) throw new Error("no locked chrome found");
    await page.drag(pt[0], pt[1], pt[0] + 80, pt[1]);
    await new Promise((r) => setTimeout(r, 1500));
    return { rev: (await page.evaluate(EDIT)).rev, selectedIds: (await page.evaluate(STATE)).selectedIds };
  });

  // Zoomed divider drag with overlay check.
  await shot("zoomed-drag", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0&zoom=2`, async (page) => {
    await enterEdit(page);
    const id = await page.evaluate(IDS).then((ids) => ids[0]);
    const pt = await freshPoint(page, id);
    await page.click(pt[0], pt[1]);
    const q = await freshPoint(page, id);
    const dx = q[0] + 120 < 1400 ? 100 : -100;
    await page.drag(q[0], q[1], q[0] + dx, q[1]);
    await waitFor(page, `(${EDIT}).rev === 1`);
    return { selectedIds: (await page.evaluate(STATE)).selectedIds, overlayDelta: await page.evaluate(DELTA(id)) };
  });

  // Group deck round-trip: child drag moves the parent.
  const prev = await readFile(VIEWER, "utf8");
  await writeFile(path.join(SCENES, "v25c-group-demo.json"), JSON.stringify(groupDeck));
  await writeFile(VIEWER, prev
    .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
      'import decision from "../scenes/decision-warm-humanist-plain.json";\nimport tmpDeck0 from "../scenes/v25c-group-demo.json";')
    .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
      "const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, tmpDeck0];"));
  try {
    build();
    await shot("group-drag", `http://127.0.0.1:${PORT}/scenes.html?deck=v25c-group-demo&slide=0`, async (page) => {
      await enterEdit(page);
      const pt = await page.evaluate(`(() => {
        const n = document.querySelector('[data-stage] [data-el="g-demo:label"]');
        const r = (n.querySelector('text') ?? n).getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.click(pt[0], pt[1]);
      const st = await page.evaluate(STATE);
      if (JSON.stringify(st.selectedIds) !== JSON.stringify(["g-demo:assembly"])) {
        throw new Error(`parent not selected: ${JSON.stringify(st.selectedIds)}`);
      }
      const q = await page.evaluate(`(() => {
        const n = document.querySelector('[data-stage] [data-el="g-demo:label"]');
        const r = (n.querySelector('text') ?? n).getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      })()`);
      await page.drag(q[0], q[1], q[0] + 96, q[1]);
      await waitFor(page, `(${EDIT}).rev === 1`);
      return { selectedIds: (await page.evaluate(STATE)).selectedIds, overlayDelta: await page.evaluate(DELTA("g-demo:assembly")) };
    });
  } finally {
    await rm(path.join(SCENES, "v25c-group-demo.json"), { force: true });
    await writeFile(VIEWER, prev);
    build();
  }
} finally {
  await new Promise((r) => server.close(r));
}
await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify({ when: new Date().toISOString(), shots }, null, 1)}\n`);
console.log("manifest written");
