// V2-4E selection evaluation driver: font-gated interactive
// Chrome sessions over the committed viewer fixtures (plus one
// temporary group deck), capturing selection screenshots and a
// machine-readable manifest.
//   node tools/v2-4e-eval.mjs [--browser-only]
// Outputs (gitignored): out/v2-4e/<shot>.png,
// out/v2-4e/eval-manifest.json. The group deck round-trips
// through app/web/src/scenes/ temporarily (reverted in
// `finally`, same guard as tools/v2-4d-eval.mjs); only the
// curated set lands in docs/v2-4e-evidence/ by hand after
// review. Clicks use trusted CDP input via openViewer
// (tools/chrome-shot.mjs).
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4e");
const PORT = 5216;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2",
};

const SCENES = path.join(ROOT, "app", "web", "src", "scenes");
const VIEWER = path.join(ROOT, "app", "web", "src", "components", "SceneViewer.jsx");

function serveDir(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      const file = join(dir, rel);
      if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end("no such file"); }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
}

async function withTempDecks(fixtures, fn) {
  const prev = await readFile(VIEWER, "utf8");
  const names = Object.keys(fixtures);
  for (const name of names) {
    if (!name.startsWith("v24e-")) throw new Error(`refusing non-temp fixture ${name}`);
  }
  for (const [name, data] of Object.entries(fixtures)) {
    await writeFile(path.join(SCENES, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
  }
  const imports = names.map((n, i) => `import tmpDeck${i} from "../scenes/${n}.json";`).join("\n");
  await writeFile(VIEWER, prev
    .replace('import decision from "../scenes/decision-warm-humanist-plain.json";',
      `import decision from "../scenes/decision-warm-humanist-plain.json";\n${imports}`)
    .replace("const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision];",
      `const DECKS = [mechPlain, mechChromed, sourceOfTruth, decision, ${names.map((_, i) => `tmpDeck${i}`).join(", ")}];`));
  try {
    await fn();
  } finally {
    for (const name of names) await rm(path.join(SCENES, `${name}.json`), { force: true });
    await writeFile(VIEWER, prev);
    build();
  }
}

function walkEls(els, out = []) {
  for (const el of els ?? []) {
    out.push(el);
    walkEls(el.group?.children ?? [], out);
  }
  return out;
}

// Slide index of the first slide containing an element kind.
function slideWithKind(scenes, kind) {
  return scenes.findIndex((s) => walkEls(s.elements).some((e) => e.kind === kind));
}

// First two top-level unlocked ids of a slide (authoritative units).
function firstUnits(scene) {
  return (scene.elements ?? []).filter((e) => !e.locked).slice(0, 2).map((e) => e.id);
}

// Verified hittable viewport point for a target: the resolved
// authoritative unit must equal expectId (group children resolve
// to their parent group, like the viewer does).
const POINT = (targetId, expectId) => `(() => {
  const stage = document.querySelector('[data-stage]');
  const svg = stage.querySelector('svg');
  const s = svg.getBoundingClientRect();
  const loX = Math.max(s.left, 0) + 2, hiX = Math.min(s.right, window.innerWidth) - 2;
  const loY = Math.max(s.top, 0) + 2, hiY = Math.min(s.bottom, window.innerHeight) - 2;
  if (hiX <= loX || hiY <= loY) return null;
  const n = stage.querySelector('[data-el="${targetId}"]');
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
      if (topId === '${expectId}' && top.getAttribute('data-locked') !== 'true') return [x, y];
    }
  }
  return null;
})()`;

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
const DELTA = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [a.left - b.left, a.top - b.top, a.right - b.right, a.bottom - b.bottom].map((v) => Math.round(v * 10) / 10); })()`;

const groupDeck = {
  name: "v24e-group-demo",
  theme: "warm-humanist",
  variant: "plain",
  scenes: [{
    id: "g-demo", width: 13.333, height: 7.5, background: { fill: "EBEBE6" },
    elements: [
      {
        id: "g-demo:title", kind: "text", x: 0.7, y: 0.4, w: 11.9, h: 1.2, z: 1,
        paragraphs: [{ runs: [{ text: "Grouped assembly", size: 36, color: "2D2D2A", family: "Merriweather", weight: 700 }] }],
      },
      {
        id: "g-demo:assembly", kind: "group", x: 0.7, y: 2, w: 6, h: 3, z: 2,
        group: {
          children: [
            { id: "g-demo:plate", kind: "shape", x: 0, y: 0, w: 6, h: 3, z: 1, shape: { fill: "D8D8D2" } },
            { id: "g-demo:label", kind: "text", x: 0.4, y: 1, w: 5.2, h: 1, z: 2, paragraphs: [{ runs: [{ text: "child label", size: 20, color: "2D2D2A", family: "Inter" }] }] },
          ],
        },
      },
      {
        id: "g-demo:lone", kind: "shape", x: 7.6, y: 2, w: 5, h: 3, z: 3, shape: { fill: "C96A54" },
      },
    ],
  }],
};

await mkdir(path.join(OUT), { recursive: true });
const manifest = { when: new Date().toISOString(), shots: [] };
const mech = JSON.parse(await readFile(path.join(SCENES, "mech-warm-humanist-plain.json"), "utf8"));

const { openViewer } = await import("./chrome-shot.mjs");
build();
const server = await serveDir(DIST, PORT);
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
  async function clickUnit(page, targetId, expectId = targetId, shift = false) {
    const pt = await page.evaluate(POINT(targetId, expectId));
    if (!pt) throw new Error(`no hittable point for ${targetId}`);
    await page.click(pt[0], pt[1], { shift });
    return (await page.evaluate(STATE)).selectedIds;
  }

  const proseIdx = 1;
  const [u0, u1] = firstUnits(mech.scenes[proseIdx]);
  const proseUrl = `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=${proseIdx}`;
  await shot("single-prose", proseUrl, async (page) => {
    const sel = await clickUnit(page, u0);
    if (JSON.stringify(sel) !== JSON.stringify([u0])) throw new Error(`single mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA(u0)) };
  });
  await shot("multi-prose", proseUrl, async (page) => {
    await clickUnit(page, u0);
    const sel = await clickUnit(page, u1, u1, true);
    if (JSON.stringify(sel) !== JSON.stringify([u0, u1])) throw new Error(`multi mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel };
  });

  const chartIdx = slideWithKind(mech.scenes, "chart");
  const chartId = walkEls(mech.scenes[chartIdx].elements).find((e) => e.kind === "chart").id;
  await shot("chart-select", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=${chartIdx}`, async (page) => {
    const sel = await clickUnit(page, chartId);
    if (JSON.stringify(sel) !== JSON.stringify([chartId])) throw new Error(`chart mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA(chartId)) };
  });

  const tableIdx = slideWithKind(mech.scenes, "table");
  const tableId = walkEls(mech.scenes[tableIdx].elements).find((e) => e.kind === "table").id;
  await shot("table-select", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=${tableIdx}`, async (page) => {
    const sel = await clickUnit(page, tableId);
    if (JSON.stringify(sel) !== JSON.stringify([tableId])) throw new Error(`table mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA(tableId)) };
  });

  const [d0] = firstUnits(mech.scenes[0]);
  await shot("zoomed-divider", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0&zoom=2`, async (page) => {
    const sel = await clickUnit(page, d0);
    if (JSON.stringify(sel) !== JSON.stringify([d0])) throw new Error(`zoomed mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA(d0)) };
  });

  await shot("locked-chromed", `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-chromed&slide=1`, async (page) => {
    const pt = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-locked="true"]'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!pt) throw new Error("no locked chrome found");
    await page.click(pt[0], pt[1]);
    const sel = (await page.evaluate(STATE)).selectedIds;
    if (sel.length !== 0) throw new Error(`locked selected ${JSON.stringify(sel)}`);
    return { selectedIds: sel };
  });

  await shot("narrow-prose", proseUrl, async (page) => {
    const sel = await clickUnit(page, u0);
    if (JSON.stringify(sel) !== JSON.stringify([u0])) throw new Error(`narrow mismatch ${JSON.stringify(sel)}`);
    return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA(u0)) };
  }, { w: 900, h: 1400 });

  await withTempDecks({ "v24e-group-demo": groupDeck }, async () => {
    build();
    await shot("nested-group", `http://127.0.0.1:${PORT}/scenes.html?deck=v24e-group-demo&slide=0`, async (page) => {
      const sel = await clickUnit(page, "g-demo:label", "g-demo:assembly");
      if (JSON.stringify(sel) !== JSON.stringify(["g-demo:assembly"])) {
        throw new Error(`nested mismatch ${JSON.stringify(sel)}`);
      }
      const inspector = await page.evaluate(`document.querySelector('[data-inspector]')?.textContent ?? ''`);
      if (!inspector.includes("g-demo:assembly")) throw new Error("inspector missing the group");
      return { selectedIds: sel, overlayDelta: await page.evaluate(DELTA("g-demo:assembly")), inspector: inspector.trim() };
    });
  });
} finally {
  await new Promise((r) => server.close(r));
}
manifest.shots = shots;
await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
console.log("manifest written");
