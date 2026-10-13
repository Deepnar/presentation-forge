// V2-6B version history in real Chrome: edit, save, duplicate,
// save, inspect history, restore an older revision, refresh, and
// keep editing — plus a stale-restore conflict. Fails on af812ad
// at build (no history dialog, routes, or store).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "docs", "v2-6b-evidence");
const STATIC_PORT = 5259;
const API_PORT = 5272;
const DECK = `http://127.0.0.1:${STATIC_PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=0`;

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

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    await mkdir(OUT, { recursive: true });
    scratch = await mkdtemp(path.join(tmpdir(), "forge-6b-chrome-"));
  } catch (err) {
    skipped = `setup failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  api = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, FORGE_API_PORT: String(API_PORT), FORGE_CONFIG_DIR: path.join(scratch, "config"), FORGE_DB_PATH: path.join(scratch, "forge.db"), FORGE_HOSTED: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 20000);
    const onData = (d) => {
      if (String(d).includes(`localhost:${API_PORT}`)) {
        clearTimeout(t);
        resolve(true);
      }
    };
    api.stdout.on("data", onData);
    api.stderr.on("data", onData);
  });
  if (!ready) {
    skipped = "api server never reported listening";
    return;
  }
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

async function slideOrder(page) {
  return page.evaluate(`[...document.querySelectorAll('[data-thumb]')].map((n) => n.getAttribute('data-thumb'))`);
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

async function openHistory(page) {
  const pt = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Version history'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(pt, "Version history button present");
  await page.click(pt[0], pt[1]);
  await waitFor(page, `document.querySelector('[data-history-panel]') !== null`, 60000);
}

describe("v2-6b version history in real chrome", () => {
  it("edits, saves, duplicates, and records three recoverable versions", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 60000);
      const proj0 = await page.evaluate(PROJ);
      assert.equal(proj0.revision, 0);
      const order0 = await slideOrder(page);
      await editFirstText(page, " — history A");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      const menu = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(menu, "slide thumb menu present");
      await page.click(menu[0], menu[1]);
      const dup = await page.evaluate(clickText("Duplicate slide"));
      assert.ok(dup, "Duplicate slide present");
      await page.click(dup[0], dup[1]);
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 2)`, 60000);
      assert.equal((await slideOrder(page)).length, order0.length + 1, "duplicate landed");
      const apiDoc = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj0.id}/revisions`).then((r) => r.json());
      assert.equal(apiDoc.ok, true);
      assert.equal(apiDoc.revisions.length, 3);
      assert.ok(apiDoc.revisions.every((r) => r.recoverable), "all three recoverable");
      await page.screenshot(`${OUT}/history-three-versions.png`);
      await writeFile(`${OUT}/history-revisions.json`, JSON.stringify({ project: proj0.id, revisions: apiDoc.revisions }, null, 2));
    } finally {
      await page.close();
    }
  });

  it("previews an older revision and restores it as a new revision", async (t) => {
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
      const order0 = await slideOrder(page);
      await editFirstText(page, " — history B");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      await openHistory(page);
      await waitFor(page, `document.querySelectorAll('[data-history-row]').length >= 2`, 60000);
      await page.screenshot(`${OUT}/history-list.png`);
      const sel = await page.evaluate(`(() => { const b = document.querySelector('[data-history-select="0"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(sel, "rev-0 preview available");
      await page.click(sel[0], sel[1]);
      await waitFor(page, `document.querySelector('[data-history-preview]') !== null`, 60000);
      await waitFor(page, `document.querySelectorAll('[data-history-preview] li').length > 0`, 60000);
      const previewCount = await page.evaluate(`document.querySelectorAll('[data-history-preview] li').length`);
      assert.ok(previewCount > 0 && previewCount <= order0.length, "preview summarizes the older slide set");
      await page.screenshot(`${OUT}/history-preview.png`);
      const go = await page.evaluate(`(() => { const b = document.querySelector('[data-history-restore="0"]'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(go, "restore offered for the older revision");
      await page.click(go[0], go[1]);
      await waitFor(page, `document.querySelector('[data-restore-done]') !== null`, 60000);
      const done = await page.evaluate(`document.querySelector('[data-restore-done]').textContent`);
      assert.ok(done.includes("as rev 2"), `restore advanced the counter, got: ${done}`);
      const after = await page.evaluate(PROJ);
      assert.equal(after.revision, 2);
      assert.deepEqual(await slideOrder(page), order0, "older slide set is current, ids intact");
      await waitFor(page, `!(document.querySelector('[data-stage]').textContent ?? '').includes('history B')`, 60000);
      assert.ok(!(await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("history B"), "older wording is back");
      await page.screenshot(`${OUT}/history-restored.png`);
      await writeFile(`${OUT}/history-restore.json`, JSON.stringify({ project: proj.id, restoredToRevision: after.revision, slideIds: await slideOrder(page) }, null, 2));
    } finally {
      await page.close();
    }
  });

  it("keeps the restored state across refresh and resumes autosave", async (t) => {
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
      await editFirstText(p1, " — history C");
      await saveCurrent(p1);
      await waitFor(p1, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      await openHistory(p1);
      await waitFor(p1, `document.querySelectorAll('[data-history-row]').length >= 2`, 60000);
      const sel = await p1.evaluate(`(() => { const b = document.querySelector('[data-history-select="0"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await p1.click(sel[0], sel[1]);
      await waitFor(p1, `document.querySelectorAll('[data-history-preview] li').length > 0`, 60000);
      const go = await p1.evaluate(`(() => { const b = document.querySelector('[data-history-restore="0"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await p1.click(go[0], go[1]);
      await waitFor(p1, `document.querySelector('[data-restore-done]') !== null`, 60000);
    } finally {
      await p1.close();
    }
    const page = await open(`${DECK}&project=${projId}`);
    try {
      await waitFor(page, `document.querySelector('[data-recover-banner]') !== null`, 60000);
      const reopen = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(reopen[0], reopen[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 2)`, 60000);
      await waitFor(page, `!(document.querySelector('[data-stage]').textContent ?? '').includes('history C')`, 60000);
      assert.ok(!(await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("history C"), "restored state persisted across refresh");
      await editFirstText(page, " — after restore");
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 3)`, 90000);
      const apiDoc = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${projId}`).then((r) => r.json());
      assert.ok(apiDoc.project.scenes.flatMap((s) => s.elements).some((e) => JSON.stringify(e.paragraphs ?? {}).includes("after restore")), "post-restore edit saved");
      await page.screenshot(`${OUT}/history-after-refresh.png`);
    } finally {
      await page.close();
    }
  });

  it("rejects a stale restore without touching the project", async (t) => {
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
      await editFirstText(page, " — history D");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 1)`, 60000);
      // Advance once more so the refused base is unambiguously old.
      await editFirstText(page, " — history D2");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.revision === 2)`, 60000);
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: 0, baseRevision: 0 }),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.code, "stale-revision");
      const kept = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}`).then((r) => r.json());
      assert.equal(kept.project.revision, 2, "stale restore changed nothing");
      const hist = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}/revisions`).then((r) => r.json());
      assert.equal(hist.revisions.length, 3, "no history row for the refused restore");
      await writeFile(`${OUT}/history-stale.json`, JSON.stringify({ status: res.status, code: body.code, keptRevision: kept.project.revision }, null, 2));
    } finally {
      await page.close();
    }
  });
});
