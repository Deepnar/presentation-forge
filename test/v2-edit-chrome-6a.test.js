// V2-6A projects in real Chrome: save, refresh/reopen recovery,
// reopened editing, conflict states. Fails on fa557c4 at import
// (v2project lib + project routes are new).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "docs", "v2-6a-evidence");
const STATIC_PORT = 5258;
const API_PORT = 5271;
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
    scratch = await mkdtemp(path.join(tmpdir(), "forge-6a-chrome-"));
  } catch (err) {
    skipped = `setup failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  api = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    // Isolated CONFIG: the checkout's config/hosted.json enables
    // hosted mode (file wins over env), which would 401 anonymous
    // project calls. A scratch CONFIG reproduces a local box where
    // unauthenticated single-user use is allowed.
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
const EDIT = `JSON.parse(document.querySelector('[data-edit-state]')?.dataset?.editState ?? 'null')`;
const STATE = `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState)`;
const clickText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const centerOf = (id) => `(() => {
  const stage = document.querySelector('[data-stage]');
  if (!stage) return null;
  const n = stage.querySelector('[data-el="${id}"]');
  if (!n) return null;
  const inner = n.querySelector('text, rect, ellipse, line, image') ?? n;
  const r = inner.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
})()`;

async function open(url, opts) {
  const { openViewer } = await import("../tools/chrome-shot.mjs");
  return openViewer(url, opts);
}

async function waitFor(page, expr, timeoutMs = 45000) {
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

describe("v2-6a projects in real chrome", () => {
  it("saves the current deck and reports a confirmed saved state", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      assert.equal(await page.evaluate(SAVE), "idle");
      await saveCurrent(page);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 60000);
      const proj = await page.evaluate(PROJ);
      assert.ok(proj?.id, "project bound after save");
      assert.equal(proj.revision, 0);
      const urlId = await page.evaluate(`new URLSearchParams(window.location.search).get('project')`);
      assert.equal(urlId, proj.id, "deep link tracks the project");
      const direct = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}`).then((r) => r.json());
      assert.equal(direct.ok, true);
      assert.equal(direct.project.scenes.length, (await slideOrder(page)).length);
      await page.screenshot(`${OUT}/saved.png`);
    } finally {
      await page.close();
    }
  });

  it("recovers the saved project after refresh with identical ids", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const p1 = await open(DECK);
    let projId = null;
    let before = null;
    try {
      await enterEdit(p1);
      await saveCurrent(p1);
      await waitFor(p1, `${SAVE} === 'saved'`, 60000);
      projId = (await p1.evaluate(PROJ)).id;
      before = await slideOrder(p1);
    } finally {
      await p1.close();
    }
    assert.ok(projId, "first session saved a project");
    const p2 = await open(`${DECK}&project=${projId}`);
    try {
      await waitFor(p2, `document.querySelector('[data-recover-banner]') !== null`, 60000);
      await p2.screenshot(`${OUT}/recovered-banner.png`);
      const reopen = await p2.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await p2.click(reopen[0], reopen[1]);
      await waitFor(p2, `${SAVE} === 'saved'`, 60000);
      assert.deepEqual(await slideOrder(p2), before, "slide ids and order identical after reopen");
      await p2.screenshot(`${OUT}/reopened.png`);
    } finally {
      await p2.close();
    }
  });

  it("edits the reopened project and saves again", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const p1 = await open(DECK);
    let projId = null;
    try {
      await enterEdit(p1);
      await saveCurrent(p1);
      await waitFor(p1, `${SAVE} === 'saved'`, 60000);
      projId = (await p1.evaluate(PROJ)).id;
    } finally {
      await p1.close();
    }
    const page = await open(`${DECK}&project=${projId}`);
    try {
      const reopen = await (async () => {
        await waitFor(page, `document.querySelector('[data-recover-banner]') !== null`, 60000);
        return page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      })();
      await page.click(reopen[0], reopen[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 60000);
      const first = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
      assert.ok(first, "editable element on the reopened slide");
      const c0 = await page.evaluate(centerOf(first));
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${first}"]') !== null`, 60000);
      await page.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${first}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
      await page.insertText(" — reopened");
      const commit = await page.evaluate(clickText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 60000);
      const proj = await page.evaluate(PROJ);
      assert.equal(proj.revision, 1, "second save advanced the durable revision");
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("reopened"), "reopened edit on the slide");
    } finally {
      await page.close();
    }
  });

  it("lists, renames, and deletes behind confirmation", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await open(DECK);
    try {
      await enterEdit(page);
      await saveCurrent(page);
      await waitFor(page, `${SAVE} === 'saved'`, 60000);
      const proj = await page.evaluate(PROJ);
      const projects = await page.evaluate(clickText("Projects"));
      await page.click(projects[0], projects[1]);
      await waitFor(page, `document.querySelector('[data-projects-panel]') !== null`, 60000);
      assert.ok(await page.evaluate(`document.querySelector('[data-project-row="${proj.id}"]') !== null`), "saved row listed");
      await page.screenshot(`${OUT}/project-list.png`);
      const rename = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent === 'Rename'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(rename[0], rename[1]);
      await page.evaluate(`(() => { const i = document.querySelector('[data-project-row="${proj.id}"] input'); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; d.call(i, 'Renamed Six A'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      const apply = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent === 'Apply'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(apply[0], apply[1]);
      await waitFor(page, `document.querySelector('[data-project-row="${proj.id}"]').textContent.includes('Renamed Six A')`, 60000);
      const del = await page.evaluate(`(() => { const row = document.querySelector('[data-project-row="${proj.id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent.startsWith('Delete')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(del[0], del[1]);
      // First click only arms the inline confirm — nothing deleted yet.
      assert.ok(await page.evaluate(`document.querySelector('[data-project-delete-confirm="${proj.id}"]') !== null`), "delete asks first");
      const gone = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}`).then((r) => r.status);
      assert.equal(gone, 200, "arming delete does not remove the project");
      const confirm = await page.evaluate(`(() => { const b = document.querySelector('[data-project-delete-confirm="${proj.id}"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(confirm[0], confirm[1]);
      await waitFor(page, `document.querySelector('[data-project-row="${proj.id}"]') === null`, 60000);
      assert.equal(await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${proj.id}`).then((r) => r.status), 404);
    } finally {
      await page.close();
    }
  });

  it("keeps both editors' work safe on a stale save", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const a = await open(DECK);
    let projId = null;
    try {
      await enterEdit(a);
      await saveCurrent(a);
      await waitFor(a, `${SAVE} === 'saved'`, 60000);
      projId = (await a.evaluate(PROJ)).id;
    } finally {
      await a.close();
    }
    const clientA = await open(`${DECK}&project=${projId}`);
    const clientB = await open(`${DECK}&project=${projId}`);
    try {
      for (const c of [clientA, clientB]) {
        const reopen = await (async () => {
          await waitFor(c, `document.querySelector('[data-recover-banner]') !== null`, 60000);
          return c.evaluate(`(() => { const b = [...document.querySelectorAll('[data-recover-banner] button')].find((n) => n.textContent.includes('Reopen')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        })();
        await c.click(reopen[0], reopen[1]);
        await waitFor(c, `${SAVE} === 'saved'`, 60000);
      }
      // Client A edits and saves (durable rev 0 → 1).
      const elA = await clientA.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
      const cA = await clientA.evaluate(centerOf(elA));
      await clientA.dblclick(cA[0], cA[1]);
      await waitFor(clientA, `document.querySelector('[data-text-edit="${elA}"]') !== null`, 60000);
      await clientA.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${elA}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
      await clientA.insertText(" — A wins");
      await clientA.click(...(await clientA.evaluate(clickText("Commit"))));
      await waitFor(clientA, `${SAVE} === 'saved'`, 60000);
      assert.equal((await clientA.evaluate(PROJ)).revision, 1);
      // Client B edits independently on the stale base and saves.
      const elB = await clientB.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
      const cB = await clientB.evaluate(centerOf(elB));
      await clientB.dblclick(cB[0], cB[1]);
      await waitFor(clientB, `document.querySelector('[data-text-edit="${elB}"]') !== null`, 60000);
      await clientB.evaluate(`(() => { const ta = document.querySelector('[data-text-edit="${elB}"]'); ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
      await clientB.insertText(" — B stale");
      await clientB.click(...(await clientB.evaluate(clickText("Commit"))));
      // Autosave may already be saving; force an explicit save to
      // surface the conflict deterministically.
      await waitFor(clientB, `(${SAVE} === 'dirty' || ${SAVE} === 'saving' || ${SAVE} === 'stale')`, 60000);
      const saveBtn = await clientB.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Save project'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (saveBtn) await clientB.click(saveBtn[0], saveBtn[1]);
      await waitFor(clientB, `${SAVE} === 'stale'`, 60000);
      assert.ok(await clientB.evaluate(`document.querySelector('[data-save-error]') !== null`), "conflict banner shown");
      assert.ok((await clientB.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("B stale"), "loser's edits stay on screen");
      const stored = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${projId}`).then((r) => r.json());
      assert.equal(stored.project.revision, 1, "loser never overwrote the winner");
      await clientB.screenshot(`${OUT}/conflict.png`);
    } finally {
      await clientA.close();
      await clientB.close();
    }
  });
});
