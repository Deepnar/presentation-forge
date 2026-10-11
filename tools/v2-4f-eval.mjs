// V2-4F live evaluation driver: real UI compiles through the
// new server integration in Chrome (no fixture JSON), plus
// PPTX equivalence from the identical live scenes.
//   node tools/v2-4f-eval.mjs
// Outputs (gitignored): out/v2-4f/live-*.png,
// out/v2-4f/pptx-*.png, out/v2-4f/eval-manifest.json. Only the
// curated set lands in docs/v2-4f-evidence/ by hand after
// review. API error-contract samples are recorded into the
// manifest via direct POSTs (the panel only offers valid
// examples, so its error row is loader-tested, not shot here).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import express from "express";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4f");
const PORT = 5218;

const { registerV2ScenesRoutes, liveExamples, compileLiveDeck } = await import("../app/server/v2-scenes-routes.js");
const { openViewer } = await import("./chrome-shot.mjs");

// Dev-only driver: opt into live compilation in case the host
// carries a hosted flag (the endpoint denies hosted by default).
if (process.env.FORGE_V2_LIVE === undefined) process.env.FORGE_V2_LIVE = "1";

function build() {
  execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
}

let delayCompileMs = 0;
async function serve() {
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
  return new Promise((resolve, reject) => {
    const s = app.listen(PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
}

const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
const DELTA = (id) => `(() => { const o = document.querySelector('[data-overlay="${id}"]'); const t = document.querySelector('[data-stage] [data-el="${id}"]'); if (!o || !t) return null; const a = o.getBoundingClientRect(), b = t.getBoundingClientRect(); return [a.left - b.left, a.top - b.top, a.right - b.right, a.bottom - b.bottom].map((v) => Math.round(v * 10) / 10); })()`;
const FIRST_HIT = `(() => {
  const stage = document.querySelector('[data-stage]');
  const svg = stage.querySelector('svg');
  const s = svg.getBoundingClientRect();
  const loX = Math.max(s.left, 0) + 2, hiX = Math.min(s.right, window.innerWidth) - 2;
  const loY = Math.max(s.top, 0) + 2, hiY = Math.min(s.bottom, window.innerHeight) - 2;
  if (hiX <= loX || hiY <= loY) return null;
  const units = [...stage.querySelectorAll('[data-el]')].filter((n) => !(n.parentElement && n.parentElement.closest('[data-el]')) && n.getAttribute('data-locked') !== 'true');
  for (const n of units) {
    const id = n.getAttribute('data-el');
    n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
    const r = inner.getBoundingClientRect();
    if (r.right < loX || r.bottom < loY || r.left > hiX || r.top > hiY) continue;
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
        if (topId === id && top.getAttribute('data-locked') !== 'true') return { id, x, y };
      }
    }
  }
  return null;
})()`;

async function waitFor(page, expr, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function clickButton(page, text) {
  const pt = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (!pt) throw new Error(`button unavailable: ${text}`);
  await page.click(pt[0], pt[1]);
}

async function openLive(page) {
  await clickButton(page, "Live");
  await waitFor(page, `document.querySelector('[data-live-panel]') !== null`);
  await waitFor(page, `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === 'Compile live'); return b && !b.disabled; })()`);
}

async function setSelect(page, label, value) {
  await page.evaluate(`(() => { const s = document.querySelector('[aria-label="${label}"]'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}

async function compileThroughPanel(page, { example, theme = null, variant = null }) {
  await setSelect(page, "Live example", example);
  if (theme) await setSelect(page, "Live theme", theme);
  if (variant) await setSelect(page, "Live variant", variant);
  await clickButton(page, "Compile live");
}

await mkdir(OUT, { recursive: true });
build();
const server = await serve();
const shots = [];
try {
  // Loading state with a slowed compile.
  delayCompileMs = 2500;
  {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html`);
    try {
      await openLive(page);
      await setSelect(page, "Live example", "mechanism");
      await clickButton(page, "Compile live");
      await waitFor(page, `document.body.textContent.includes('compiling')`);
      await page.screenshot(path.join(OUT, "live-loading.png"));
      shots.push({ tag: "live-loading", state: "loading-indicator" });
      console.log("live-loading done");
    } finally {
      await page.close();
    }
  }
  delayCompileMs = 0;

  async function liveShot(tag, { example, theme = null, variant = null, selectFirst = false, slide = 0, viewport = null }) {
    const page = await openViewer(`http://127.0.0.1:${PORT}/scenes.html`, viewport ?? {});
    try {
      await openLive(page);
      await compileThroughPanel(page, { example, theme, variant });
      const want = liveExamples().find((e) => e.id === example);
      await waitFor(page, `document.querySelector('[aria-label="Deck"]').value.includes('${want.intent.id}')`);
      if (slide > 0) {
        await page.evaluate(`(() => { const bs = [...document.querySelectorAll('aside[aria-label="Slides"] button')]; (bs[${slide}] ?? null)?.click(); })()`);
        await waitFor(page, `${STATE}.slideIndex === ${slide}`);
      }
      const info = { tag, example, theme: theme ?? want.theme, variant: variant ?? want.variant };
      if (selectFirst) {
        const hit = await page.evaluate(FIRST_HIT);
        if (!hit) throw new Error(`no hittable unit on ${tag}`);
        await page.click(hit.x, hit.y);
        info.selectedIds = (await page.evaluate(STATE)).selectedIds;
        if (JSON.stringify(info.selectedIds) !== JSON.stringify([hit.id])) {
          throw new Error(`selection mismatch on ${tag}: ${JSON.stringify(info.selectedIds)}`);
        }
        info.overlayDelta = await page.evaluate(DELTA(hit.id));
      } else {
        info.selectedIds = (await page.evaluate(STATE)).selectedIds;
      }
      const miss = await page.evaluate(`document.querySelector('[data-missing-fonts]').dataset.missingFonts`);
      info.missing = miss ? miss.split(",") : [];
      await page.screenshot(path.join(OUT, `${tag}.png`));
      shots.push(info);
      console.log(`${tag} done`, JSON.stringify({ selectedIds: info.selectedIds, missing: info.missing }));
    } finally {
      await page.close();
    }
  }

  await liveShot("live-mechanism", { example: "mechanism", selectFirst: true });
  await liveShot("live-decision", { example: "decision", slide: 1 });
  await liveShot("live-data-chart", { example: "data", selectFirst: true });
  await liveShot("live-status", { example: "status", selectFirst: true });
  await liveShot("live-chromed", { example: "mechanism", variant: "chromed", selectFirst: true });
  await liveShot("live-dark-plate", { example: "mechanism", theme: "gradient-mesh-dark", selectFirst: true });
  await liveShot("live-narrow", { example: "decision", viewport: { w: 900, h: 1400 } });

  // Error contract samples via direct POSTs (panel only offers
  // valid examples).
  const bad = await (await fetch(`http://127.0.0.1:${PORT}/api/v2/scenes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: { id: "x", title: "x" }, theme: "warm-humanist" }),
  })).json();
  const badTheme = await (await fetch(`http://127.0.0.1:${PORT}/api/v2/scenes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: liveExamples()[0].intent, theme: "nope" }),
  })).json();
  shots.push({ tag: "api-error-contract", invalidIntent: bad, unknownTheme: badTheme });

  // PPTX equivalence from the identical live scenes.
  const { renderPptxToFile } = await import("../packages/renderer-pptx/node.ts");
  const { preview } = await import("../src/preview.js");
  const mech = await compileLiveDeck({ intent: liveExamples().find((e) => e.id === "mechanism").intent, theme: "warm-humanist", variant: "plain" });
  const pptxPath = path.join(OUT, "live-mechanism.pptx");
  await renderPptxToFile(mech.scenes, pptxPath);
  const pages = await preview(pptxPath, { outDir: path.join(OUT, "pptx"), dpi: 110 });
  shots.push({ tag: "pptx-equivalence", slides: pages.pages.length, rasters: pages.pages.map((p) => path.relative(OUT, p)) });
  console.log(`pptx done (${pages.pages.length} slides)`);
} finally {
  await new Promise((r) => server.close(r));
}
await writeFile(path.join(OUT, "eval-manifest.json"), `${JSON.stringify({ when: new Date().toISOString(), shots }, null, 1)}\n`);
console.log("manifest written");
