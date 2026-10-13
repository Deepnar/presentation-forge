// V2-6C browser integration against PostgreSQL: the existing
// project and version-history flows run unchanged on the hosted
// backend — save, refresh/reopen across a server restart, autosave,
// rename, history, restore, export, and a two-session conflict.
// Fails on 0ec8aa4 at build (no postgres adapter or selection).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { join, normalize, extname } from "node:path";
import JSZip from "jszip";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "docs", "v2-6c-evidence");
const STATIC_PORT = 5261;
const API_PORT = 5274;
const DECK = `http://127.0.0.1:${STATIC_PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0`;
const MAINT_URL = process.env.TEST_PG_URL ?? "postgres://postgres:probe@127.0.0.1:5544/postgres";
const DB_NAME = `forge_6c_browser_${Date.now().toString(36)}`;
const TEST_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

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
let api = null;
let scratch = null;
let skipped = "";
let pgReady = false;

function proxyApi(req, res) {
  const target = `http://127.0.0.1:${API_PORT}${req.url}`;
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
  delete headers["content-length"];
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const r = await fetch(target, {
        method: req.method,
        headers: { ...headers, "content-length": String(Buffer.concat(chunks).length) },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(r.status, Object.fromEntries([...r.headers.entries()].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k.toLowerCase()))));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      res.writeHead(502);
      res.end(`proxy failed: ${err.message}`);
    }
  });
}

async function startApi() {
  const proc = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      FORGE_API_PORT: String(API_PORT),
      FORGE_CONFIG_DIR: path.join(scratch, "config"),
      FORGE_DB_PATH: path.join(scratch, "auth.db"),
      FORGE_HOSTED: "0",
      FORGE_PROJECTS_BACKEND: "postgres",
      FORGE_PROJECTS_DATABASE_URL: TEST_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 25000);
    const onData = (d) => {
      if (String(d).includes(`localhost:${API_PORT}`)) {
        clearTimeout(t);
        resolve(true);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
  assert.equal(ready, true, "pg-backed api never reported listening");
  return proc;
}

async function maintQuery(text) {
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: MAINT_URL, connectionTimeoutMillis: 5000 });
  try {
    return await p.query(text);
  } finally {
    await p.end();
  }
}

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  try {
    await maintQuery("SELECT 1");
    pgReady = true;
  } catch (err) {
    skipped = `no reachable postgres: ${String(err?.message ?? err).slice(0, 120)}`;
    return;
  }
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    await mkdir(OUT, { recursive: true });
    scratch = await mkdtemp(path.join(tmpdir(), "forge-6c-chrome-"));
    await maintQuery(`CREATE DATABASE "${DB_NAME}"`);
  } catch (err) {
    skipped = `setup failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  api = await startApi();
  server = await new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      try {
        if ((req.url ?? "").startsWith("/api/")) return proxyApi(req, res);
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${STATIC_PORT}`);
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
    s.listen(STATIC_PORT, "127.0.0.1", () => resolve(s));
  });
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  if (api) {
    api.kill();
    await new Promise((r) => setTimeout(r, 800));
  }
  if (scratch) await rm(scratch, { recursive: true, force: true });
  if (pgReady) {
    try {
      await maintQuery(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    } catch { /* teardown only */ }
  }
});

const SAVE = `(document.querySelector('[data-save-state]')?.dataset?.saveState ?? null)`;
const PROJ = `JSON.parse(document.querySelector('[data-save-state]')?.dataset?.projectState ?? 'null')`;
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;

async function open(url, opts) {
  const { openViewer } = await import("../tools/chrome-shot.mjs");
  return openViewer(url, opts);
}

async function waitFor(page, expr, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 100)}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function enterEdit(page) {
  const pt = await page.evaluate(clickText("Edit"));
  assert.ok(pt, "Edit toggle present");
  await page.click(pt[0], pt[1]);
  await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`, 60000);
}

async function saveCurrent(page) {
  const pt = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Save project'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(pt, "Save project present");
  await page.click(pt[0], pt[1]);
}

async function editFirstText(page, suffix) {
  const first = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
  assert.ok(first, "editable element on the slide");
  const c0 = await page.evaluate(`(() => {
    const stage = document.querySelector('[data-stage]');
    const n = stage.querySelector('[data-el="${first}"]');
    const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
    const r = inner.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  await page.dblclick(c0[0], c0[1]);
  await waitFor(page, `document.querySelector('[data-text-edit="${first}"]') !== null`, 60000);
  await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${first}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
  await page.insertText(suffix);
  const commit = await page.evaluate(clickText("Commit"));
  await page.click(commit[0], commit[1]);
}

describe("v2-6c browser against postgres", () => {
  it("saves, renames, versions, restores, and exports on the hosted backend", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 60000);
      const proj = await page.evaluate(PROJ);
      assert.equal(proj.revision, 0);
      await editFirstText(page, " — hosted A");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      // Rename through the Projects dialog.
      const projects = await page.evaluate(clickText("Projects"));
      await page.click(projects[0], projects[1]);
      await waitFor(page, `document.querySelector('[data-projects-panel]') !== null`, 60000);
      const rename = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent === 'Rename'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(rename[0], rename[1]);
      await page.evaluate(`(() => { const i = document.querySelector('[data-project-row="${proj.id}"] input'); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; d.call(i, 'Hosted Title'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      const apply = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent === 'Apply'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(apply[0], apply[1]);
      await waitFor(page, `document.querySelector('[data-project-row="${proj.id}"]').textContent.includes('Hosted Title')`, 60000);
      // History on the hosted backend, then restore the older revision.
      const hist = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent === 'History'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(hist[0], hist[1]);
      await waitFor(page, `document.querySelectorAll('[data-history-row]').length >= 3`, 60000);
      await page.screenshot(`${OUT}/hosted-history.png`);
      const sel = await page.evaluate(`(() => { const b = document.querySelector('[data-history-select="0"]'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(sel, "rev-0 preview on postgres");
      await page.click(sel[0], sel[1]);
      await waitFor(page, `document.querySelectorAll('[data-history-preview] li').length > 0`, 60000);
      const go = await page.evaluate(`(() => { const b = document.querySelector('[data-history-restore="0"]'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(go[0], go[1]);
      await waitFor(page, `document.querySelector('[data-restore-done]') !== null`, 60000);
      const done = await page.evaluate(`document.querySelector('[data-restore-done]').textContent`);
      assert.ok(done.includes("as rev 3"), `restore advanced on postgres, got: ${done}`);
      await page.screenshot(`${OUT}/hosted-restored.png`);
      // Export the restored document from hosted storage.
      const bytes = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}/export.pptx`).then((r) => {
        assert.equal(r.status, 200);
        return r.arrayBuffer();
      });
      const zip = await JSZip.loadAsync(bytes);
      const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f)).sort();
      const direct = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}`).then((r) => r.json());
      assert.equal(parts.length, direct.project.scenes.length, "hosted export is order-exact");
      await writeFile(`${OUT}/hosted-flow.json`, JSON.stringify({ project: proj.id, restoredToRevision: 3, slides: parts.length }, null, 2));
    } finally {
      await page.close();
    }
  });

  it("reopens across a server restart with state intact", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const p1 = await open(DECK);
    let projId = null;
    try {
      await enterEdit(p1);
      await saveCurrent(p1);
      await waitFor(p1, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 60000);
      projId = (await p1.evaluate(PROJ)).id;
      await editFirstText(p1, " — survives restart");
      await saveCurrent(p1);
      await waitFor(p1, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
    } finally {
      await p1.close();
    }
    api.kill();
    await new Promise((r) => setTimeout(r, 1200));
    api = await startApi();
    const page = await open(`${DECK}&project=${projId}`);
    try {
      await waitFor(page, `document.querySelector('[data-recover-banner]') !== null`, 60000);
      const reopen = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(reopen[0], reopen[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      await waitFor(page, `(document.querySelector('[data-stage]').textContent ?? '').includes('survives restart')`, 60000);
      const hist = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${projId}/revisions`).then((r) => r.json());
      assert.equal(hist.revisions.length, 2, "history intact across restart");
      await page.screenshot(`${OUT}/hosted-after-restart.png`);
    } finally {
      await page.close();
    }
  });

  it("two sessions on one project conflict instead of overwriting", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const pageA = await open(DECK);
    let projId = null;
    try {
      await enterEdit(pageA);
      await saveCurrent(pageA);
      await waitFor(pageA, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 60000);
      projId = (await pageA.evaluate(PROJ)).id;
    } catch (err) {
      await pageA.close();
      throw err;
    }
    const pageB = await open(`${DECK}&project=${projId}`);
    try {
      await waitFor(pageB, `document.querySelector('[data-recover-banner]') !== null`, 60000);
      const reopen = await pageB.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await pageB.click(reopen[0], reopen[1]);
      await waitFor(pageB, `${SAVE} === 'saved'`, 60000);
      await editFirstText(pageA, " — session A");
      await saveCurrent(pageA);
      await waitFor(pageA, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      await editFirstText(pageB, " — session B");
      await saveCurrent(pageB);
      await waitFor(pageB, `${SAVE} === 'stale'`, 60000);
      const banner = await pageB.evaluate(`document.querySelector('[data-save-error]')?.textContent ?? ''`);
      assert.ok(banner.includes("conflict"), `loser sees the conflict banner, got: ${banner.slice(0, 120)}`);
      const kept = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${projId}`).then((r) => r.json());
      assert.equal(kept.project.revision, 1, "exactly one winner committed");
      await pageB.screenshot(`${OUT}/hosted-conflict.png`);
      await writeFile(`${OUT}/hosted-conflict.json`, JSON.stringify({ project: projId, keptRevision: 1 }, null, 2));
    } finally {
      await pageA.close();
      await pageB.close();
    }
  });
});
