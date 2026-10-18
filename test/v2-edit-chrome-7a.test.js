// V2-7A unified workspace in real Chrome: dashboard, creation,
// editor shell, navigation, guards, history, export, responsive,
// keyboard, and cleanup — SPA plus retained standalone dialog guards. Fails on 97a12de
// (no workspace routes, dashboard, or shell).
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
const OUT = path.join(ROOT, "docs", "v2-7a-evidence");
const STATIC_PORT = 5263;
const API_PORT = 5276;
const HOSTED_PORT = 5277;
const APP = `http://127.0.0.1:${STATIC_PORT}/`;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml",
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
let hostedApi = null;
let scratch = null;
let skipped = "";
let userToken = null;
const exportResponses = [];

function proxyTo(port) {
  return (req, res) => {
    const target = `http://127.0.0.1:${port}${req.url}`;
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
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
        const bytes = Buffer.from(await r.arrayBuffer());
        res.writeHead(r.status, Object.fromEntries([...r.headers.entries()].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k.toLowerCase()))));
        if (req.url?.endsWith('/export.pptx')) exportResponses.push({ path: req.url, status: r.status, bytes: bytes.length, cookie: Boolean(req.headers.cookie), bearer: Boolean(req.headers.authorization), disposition: r.headers.get('content-disposition') });
        res.end(bytes);
      } catch (err) {
        if (res.headersSent) res.destroy(err);
        else { res.writeHead(502); res.end(`proxy failed: ${err.message}`); }
      }
    });
  };
}

async function startApi(port, cfgDir, dbFile, extraEnv = {}) {
  const proc = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, FORGE_API_PORT: String(port), FORGE_CONFIG_DIR: cfgDir, FORGE_DB_PATH: dbFile, FORGE_DECKS_DIR: path.join(cfgDir, 'decks'), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 25000);
    const onData = (d) => {
      if (String(d).includes(`localhost:${port}`)) {
        clearTimeout(t);
        resolve(true);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
  assert.equal(ready, true, `api on ${port} never reported listening`);
  return proc;
}

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
    await mkdir(OUT, { recursive: true });
    scratch = await mkdtemp(path.join(tmpdir(), "forge-7a-chrome-"));
  } catch (err) {
    skipped = `setup failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  api = await startApi(API_PORT, path.join(scratch, "config"), path.join(scratch, "forge.db"), { FORGE_HOSTED: "0" });
  const hostedCfg = path.join(scratch, "hostedcfg");
  await mkdir(hostedCfg, { recursive: true });
  await import("node:fs/promises").then((fs) => fs.writeFile(path.join(hostedCfg, "hosted.json"), JSON.stringify({ hosted: true })));
  hostedApi = await startApi(HOSTED_PORT, hostedCfg, path.join(scratch, "hosted.db"));
  // Test account: dashboard + editor run signed in.
  const reg = await fetch(`http://127.0.0.1:${API_PORT}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Seven", email: "seven@example.test", password: "password-123" }),
  }).then((r) => r.json());
  assert.ok(reg.token, "test account registered");
  userToken = reg.token;
  server = await new Promise((resolve, reject) => {
    const proxied = proxyTo(API_PORT);
    const s = createServer(async (req, res) => {
      try {
        if ((req.url ?? "").startsWith("/api/")) return proxied(req, res);
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
  for (const proc of [api, hostedApi]) {
    if (proc) {
      proc.kill();
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

async function open(url, opts) {
  const { openViewer } = await import("../tools/chrome-shot.mjs");
  return openViewer(url, opts);
}

async function waitFor(page, expr, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(expr);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) {
      const detail = await page.evaluate(`JSON.stringify({url:location.href,save:document.querySelector('[data-save-state]')?.dataset.saveState,body:document.body.innerText.slice(-1800)})`).catch(() => 'no diagnostic context');
      throw new Error(`wait timed out: ${expr.slice(0, 100)}; ${detail}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

// Signed-in page at a hash route: token first, then navigate. Opens
// through scenes.html because openViewer gates on font readiness,
// which only the viewer reports; same origin, so the token carries.
async function openSignedIn(hash, opts, token = userToken, base = APP) {
  const page = await open(`${base}scenes.html?deck=mech-warm-humanist-plain`, opts);
  if (token) await page.evaluate(`localStorage.setItem('forge.token', ${JSON.stringify(token)})`);
  await page.evaluate(`window.location.href = ${JSON.stringify(base + hash)};`);
  // Navigation tears down execution contexts; poll tolerantly.
  const t0 = Date.now();
  for (;;) {
    try {
      const ok = await page.evaluate(`location.hash === ${JSON.stringify(hash)} && !location.pathname.endsWith('scenes.html') && document.getElementById('root') !== null && document.querySelector('[data-workspace-create],[data-topbar],[data-project-grid]') !== null`);
      if (ok) {
        if (hash === '#/projects') await waitFor(page, `document.querySelector('[data-project-catalog]') && ![...document.querySelectorAll('[data-project-catalog] [role=status]')].some(n => /^Loading (saved presentations|generated decks and reports)/.test(n.textContent)) && document.getAnimations().filter(a => a.effect?.target?.classList?.contains('view-in')).every(a => a.playState !== 'running')`);
        return page;
      }
    } catch { /* mid-navigation */ }
    if (Date.now() - t0 > 90000) throw new Error("signed-in app never settled");
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function openHarnessProject(id) {
  const page = await open(`${APP}scenes.html?deck=mech-warm-humanist-plain`);
  await page.evaluate(`localStorage.setItem('forge.token', ${JSON.stringify(userToken)});location.href=${JSON.stringify(`${APP}scenes.html?project=${id}`)}`);
  const end = Date.now() + 90000;
  for (;;) {
    try { if (await page.evaluate(`new URLSearchParams(location.search).get('project')===${JSON.stringify(id)} && !!document.querySelector('[data-recover-banner]')`)) break; } catch { /* navigation replaces context */ }
    if (Date.now() > end) throw new Error('standalone project recovery did not load');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await clickSelector(page, '[data-recover-banner] button');
  await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
  return page;
}

const byText = (text) => `(() => { const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '${text}'); if (!b || b.disabled) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const SAVE = `(document.querySelector('[data-save-state]')?.dataset?.saveState ?? null)`;
const PROJ = `JSON.parse(document.querySelector('[data-save-state]')?.dataset?.projectState ?? 'null')`;

async function apiAuthed(method, p, body = undefined) {
  const res = await fetch(`http://127.0.0.1:${API_PORT}${p}`, {
    method,
    headers: { Authorization: `Bearer ${userToken}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function clickSelector(page, selector) {
  const point = await page.evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n) return null; n.scrollIntoView({block:'nearest',inline:'nearest'}); const r=n.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; })()`);
  assert.ok(point, `missing control ${selector}`);
  await page.click(point[0], point[1]);
}

describe("v2-7a workspace dashboard", () => {
  it("shows the empty state first, then real projects", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-workspace-create]') !== null`, 60000);
      assert.ok(await page.evaluate(`document.body.textContent.includes('No projects yet')`), "empty state for first-time users");
      await page.screenshot(`${OUT}/dashboard-empty.png`);
      const { blankSlide } = await import("../packages/editor/scene-text.js");
      for (const title of ["Alpha Deck", "Beta Deck"]) {
        const r = await apiAuthed("POST", "/api/v2/projects", { title, scenes: [blankSlide()] });
        assert.equal(r.status, 200);
      }
      await page.evaluate(`window.location.reload()`);
      await waitFor(page, `document.querySelectorAll('[data-project-card]').length === 2`, 60000);
      const cards = await page.evaluate(`[...document.querySelectorAll('[data-project-card]')].map((n) => n.textContent)`);
      assert.ok(cards.some((c) => c.includes("Alpha Deck") && c.includes("1 slide")), "titles, slide counts, revisions listed");
      await page.screenshot(`${OUT}/dashboard.png`);
    } finally {
      await page.close();
    }
  });

  it("creates a blank presentation that opens in the editor", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-workspace-create]') !== null`, 60000);
      const create = await page.evaluate(byText("Create presentation"));
      await page.click(create[0], create[1]);
      await waitFor(page, `document.querySelector('[data-create-blank]') !== null`, 60000);
      const blank = await page.evaluate(`(() => { const b = document.querySelector('[data-create-blank]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(blank[0], blank[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const proj = await page.evaluate(PROJ);
      assert.equal(proj.revision, 0);
      assert.ok((await page.evaluate(`window.location.hash`)).startsWith("#/project/"), "deep link tracks the project");
      const title = await page.evaluate(`document.querySelector('[data-project-title]').value`);
      assert.equal(title, "Untitled presentation");
      await page.screenshot(`${OUT}/editor-blank.png`);
    } finally {
      await page.close();
    }
  });

  it("creates from a layout with editable content", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-workspace-create]') !== null`, 60000);
      const create = await page.evaluate(byText("Create presentation"));
      await page.click(create[0], create[1]);
      await waitFor(page, `document.querySelector('[data-create-layout]') !== null`, 60000);
      const layout = await page.evaluate(`(() => { const b = document.querySelector('[data-create-layout]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(layout[0], layout[1]);
      await waitFor(page, `document.querySelectorAll('[data-layout-pick]').length > 0`, 60000);
      const pick = await page.evaluate(`(() => { const b = document.querySelector('[data-layout-pick]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(pick[0], pick[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const count = await page.evaluate(`document.querySelectorAll('[data-thumb]').length`);
      assert.equal(count, 1);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).length > 0, "layout slide renders content");
    } finally {
      await page.close();
    }
  });

  it("renames from the top bar and returns to the dashboard", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Rename Me", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      await page.evaluate(`(() => { const i = document.querySelector('[data-project-title]'); i.focus(); i.setSelectionRange(0, i.value.length); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; d.call(i, 'Renamed Top'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await page.key(13, "Enter");
      await waitFor(page, `(${PROJ}?.title === 'Renamed Top')`, 60000);
      const back = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Back to workspace'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(back[0], back[1]);
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`, 60000);
      assert.ok(await page.evaluate(`document.querySelector('[data-project-card="${id}"]').textContent.includes('Renamed Top')`), "dashboard reflects the rename");
    } finally {
      await page.close();
    }
  });

  it("deletes with confirmation from the dashboard", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Doomed Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-project-card="${id}"]') !== null`, 60000);
      const del = await page.evaluate(`(() => { const row = document.querySelector('[data-project-card="${id}"]'); const b = [...row.querySelectorAll('button')].find((n) => n.textContent.includes('Delete')); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(del[0], del[1]);
      const confirm = await page.evaluate(byText("Delete"));
      await page.click(confirm[0], confirm[1]);
      await waitFor(page, `document.querySelector('[data-project-card="${id}"]') === null`, 60000);
      const missing = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(missing.status, 404);
    } finally {
      await page.close();
    }
  });
});

describe("v2-7a navigation and guards", () => {
  it("back/forward and refresh keep the project", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Nav Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-project-card="${id}"]') !== null`, 60000);
      const openBtn = await page.evaluate(`(() => { const b = document.querySelector('[data-project-open="${id}"]'); b.scrollIntoView({block:"nearest"}); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(openBtn[0], openBtn[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.id === '${id}')`, 90000);
      await page.evaluate(`window.history.back()`);
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`, 60000);
      await page.evaluate(`window.history.forward()`);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.id === '${id}')`, 90000);
      await page.evaluate(`window.location.reload()`);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.id === '${id}')`, 90000);
      assert.ok(true, "deep link refresh reopens the same project");
    } finally {
      await page.close();
    }
  });

  it("unsaved changes guard the trip back with save and discard paths", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Guard Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      // Make an edit through the engine (add-text commits immediately).
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'dirty'`, 60000);
      const back = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Back to workspace'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(back[0], back[1]);
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`, 60000);
      const saveLeave = await page.evaluate(`(() => { const b = document.querySelector('[data-leave-save]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(saveLeave[0], saveLeave[1]);
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`, 90000);
      const kept = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(kept.body.project.revision, 1, "save-and-leave persisted the edit");
    } finally {
      await page.close();
    }
  });

  it("switching projects from the dialog respects unsaved work", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const a = await apiAuthed("POST", "/api/v2/projects", { title: "Switch A", scenes: [blankSlide()] });
    const b = await apiAuthed("POST", "/api/v2/projects", { title: "Switch B", scenes: [blankSlide()] });
    const page = await openHarnessProject(a.body.project.id);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'dirty'`, 60000);
      const projects = await page.evaluate(byText("Projects"));
      await page.click(projects[0], projects[1]);
      await waitFor(page, `document.querySelector('[data-project-row="${b.body.project.id}"]') !== null`, 60000);
      const openB = await page.evaluate(`(() => { const b = document.querySelector('[data-project-open="${b.body.project.id}"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(openB[0], openB[1]);
      await waitFor(page, `document.querySelector('[data-switch-guard]') !== null`, 60000);
      const discard = await page.evaluate(byText("Discard & switch"));
      await page.click(discard[0], discard[1]);
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.id === '${b.body.project.id}')`, 90000);
    } finally {
      await page.close();
    }
  });
});

describe("v2-7a editor shell", () => {
  it("edits text, autosaves, and shows history access", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Shell Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      // Layers tab lists the (empty) slide tree; slides tab is default.
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const layers = await page.evaluate(byText("Layers"));
      await page.click(layers[0], layers[1]);
      await waitFor(page, `document.querySelector('[data-layers]') !== null`, 60000);
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-layer]').length`), 1, "added text appears in the object tree");
      //dblclick the new text and commit a word.
      const el = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el]'); return n ? n.getAttribute('data-el') : null; })()`);
      assert.ok(el, "added text is on the slide");
      const c0 = await page.evaluate(`(() => { const n = document.querySelector('[data-stage] [data-el="${el}"]'); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.dblclick(c0[0], c0[1]);
      await waitFor(page, `document.querySelector('[data-text-edit="${el}"]') !== null`, 60000);
      await page.insertText("hello shell");
      const commit = await page.evaluate(byText("Commit"));
      await page.click(commit[0], commit[1]);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 2`, 90000);
      assert.ok((await page.evaluate(`document.querySelector('[data-stage]').textContent`)).includes("hello shell"));
      const hist = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Version history'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(hist[0], hist[1]);
      await waitFor(page, `document.querySelectorAll('[data-history-row]').length >= 3`, 60000);
      await page.screenshot(`${OUT}/editor-shell.png`);
    } finally {
      await page.close();
    }
  });

  it("restores an older revision and exports native PowerPoint", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Restore Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`, 90000);
      const hist = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Version history'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(hist[0], hist[1]);
      await waitFor(page, `document.querySelector('[data-history-select="0"]') !== null`, 60000);
      const sel = await page.evaluate(`(() => { const b = document.querySelector('[data-history-select="0"]'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(sel[0], sel[1]);
      await waitFor(page, `document.querySelectorAll('[data-history-preview] li').length > 0`, 60000);
      const go = await page.evaluate(`(() => { const b = document.querySelector('[data-history-restore="0"]'); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(go, "restore offered");
      await page.click(go[0], go[1]);
      await waitFor(page, `document.querySelector('[data-restore-done]') !== null`, 60000);
      const after = await page.evaluate(PROJ);
      assert.equal(after.revision, 2);
      await page.screenshot(`${OUT}/editor-history.png`);
      await clickSelector(page, '[aria-label="Close version history"]');
      const exportStart = exportResponses.length;
      await clickSelector(page, '[data-topbar-export]');
      const exportDeadline = Date.now() + 15000;
      while (exportResponses.length === exportStart && Date.now() < exportDeadline) await new Promise(resolve => setTimeout(resolve,100));
      const exported = exportResponses[exportStart];
      assert.equal(exported?.status,200,'actual export action authenticates with the session bearer');
      assert.equal(exported.bearer,true);
      assert.match(exported.disposition,/attachment/);
      assert.ok(exported.bytes > 1000);
      assert.equal(await page.evaluate('location.hash'),`#/project/${id}`);
      const bytes = await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${id}/export.pptx`, { headers: { Authorization: `Bearer ${userToken}` } }).then(async (r) => {
        assert.equal(r.status, 200);
        return r.arrayBuffer();
      });
      const zip = await JSZip.loadAsync(bytes);
      const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f));
      assert.equal(parts.length, 1, "hosted export is order-exact");
    } finally {
      await page.close();
    }
  });

  it("conflicts across sessions refuse instead of overwriting", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Conflict Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const pageA = await openSignedIn(`#/project/${id}`);
    let pageB = null;
    try {
      await waitFor(pageA, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      pageB = await openSignedIn(`#/project/${id}`);
      await waitFor(pageB, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const addA = await pageA.evaluate(byText("+ Text"));
      await pageA.click(addA[0], addA[1]);
      await waitFor(pageA, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`, 90000);
      const addB = await pageB.evaluate(byText("+ Text"));
      await pageB.click(addB[0], addB[1]);
      await waitFor(pageB, `${SAVE} === 'stale'`, 90000);
      assert.ok((await pageB.evaluate(`document.querySelector('[data-save-error]').textContent`)).includes("conflict"));
      const kept = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(kept.body.project.revision, 1);
    } finally {
      await pageA.close();
      if (pageB) await pageB.close();
    }
  });

  it("locks, hides, multi-selects, and undoes", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Ops Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      // Duplicate the slide so multi-select has two thumbs.
      const menu = await page.evaluate(`(() => { const b = document.querySelector('[data-thumb-menu]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(menu[0], menu[1]);
      const dup = await page.evaluate(byText("Duplicate slide"));
      await page.click(dup[0], dup[1]);
      await waitFor(page, `document.querySelectorAll('[data-thumb]').length === 2`, 60000);
      // Shift-click range-selects both thumbs.
      const thumbs = await page.evaluate(`[...document.querySelectorAll('[data-thumb]')].map((n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })`);
      await page.click(thumbs[0][0], thumbs[0][1]);
      await page.click(thumbs[1][0], thumbs[1][1], { shift: true });
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-thumb-selected="true"]').length`), 2, "range multi-select");
      // Layers: lock the first row, see it in the inspector, unlock again.
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const layers = await page.evaluate(byText("Layers"));
      await page.click(layers[0], layers[1]);
      await waitFor(page, `document.querySelector('[data-layers]') !== null`, 60000);
      // Layers: lock the row (locking drops selection by design —
      // locked units are never selectable), verify the flag
      // server-side after autosave, then unlock again.
      const lock = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-layer] button')].find((n) => n.title === 'Lock'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(lock, "lock control present");
      await page.click(lock[0], lock[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const lockedEl = await apiAuthed("GET", `/api/v2/projects/${id}`).then((r) => r.body.project.scenes.flatMap((x) => x.elements).find((e) => e.kind === "text"));
      assert.equal(lockedEl.locked, true, "lock persisted");
      assert.ok(await page.evaluate(`[...document.querySelectorAll('[data-layer] button')].some((n) => n.title === 'Unlock')`), "tree shows the locked state");
      const unlock = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-layer] button')].find((n) => n.title === 'Unlock'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(unlock[0], unlock[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      // Hide through the tree, verify, show again.
      const hide = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-layer] button')].find((n) => n.title === 'Hide'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      assert.ok(hide, "hide control present");
      await page.click(hide[0], hide[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const hiddenEl = await apiAuthed("GET", `/api/v2/projects/${id}`).then((r) => r.body.project.scenes.flatMap((x) => x.elements).find((e) => e.kind === "text"));
      assert.equal(hiddenEl.hidden, true, "hide persisted");
      const show = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[data-layer] button')].find((n) => n.title === 'Show'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(show[0], show[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      // Undo and redo restore exact state while revisions remain monotonic.
      const revBefore = await page.evaluate(`JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev === ${revBefore + 1}`, 60000);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const undone = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(undone.body.project.scenes.flatMap(x => x.elements).find(e => e.kind === "text").hidden, true);
      const redo = await page.evaluate(`(() => { const b = document.querySelector('[aria-label="Redo"]'); const r = b.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; })()`);
      await page.click(redo[0], redo[1]);
      await waitFor(page, `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev === ${revBefore + 2}`, 60000);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const redone = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(Boolean(redone.body.project.scenes.flatMap(x => x.elements).find(e => e.kind === "text").hidden), false);

    } finally {
      await page.close();
    }
  });

  it("presents, assists honestly, and reads without editing", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Present Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const present = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Present'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(present[0], present[1]);
      await waitFor(page, `document.querySelector('[data-present]') !== null`, 60000);
      assert.ok(await page.evaluate(`document.querySelector('[data-present-count]').textContent.includes('1 / 1')`), "present shows the slide");
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-present]') === null`, 60000);
      const asst = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Assistant'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(asst[0], asst[1]);
      await waitFor(page, `document.querySelector('[data-assistant-panel]') !== null`, 60000);
      const panelText = await page.evaluate(`document.querySelector('[data-assistant-panel]').textContent`);
      assert.ok(panelText.includes("not available"), "assistant states its limits");
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-assistant-panel] input, [data-assistant-panel] textarea').length`), 0, "no fake composer");
      // Read-only: leave edit mode, navigate slides by keyboard.
      const done = await page.evaluate(byText("Done"));
      await page.click(done[0], done[1]);
      await waitFor(page, `document.querySelector('[data-editing="true"]') === null`, 60000);
      assert.ok(await page.evaluate(`document.querySelector('[data-topbar-export]') !== null`), "export stays available read-only");
      await page.screenshot(`${OUT}/editor-readonly.png`);
    } finally {
      await page.close();
    }
  });

  it("survives narrow viewports with usable rails", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Narrow Deck", scenes: [blankSlide()] });
    const page = await openSignedIn(`#/project/${made.body.project.id}`, { w: 480, h: 900 });
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      // Rails collapse; toggles reopen them as overlays.
      assert.equal(await page.evaluate(`document.querySelector('aside[aria-label="Slides"]').offsetParent === null`), true, "slides rail collapsed narrow");
      const slides = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Show slides rail'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(slides[0], slides[1]);
      await waitFor(page, `document.querySelector('aside[aria-label="Slides"]').offsetParent !== null`, 60000);
      await clickSelector(page, '[aria-label="Hide slides rail"]');
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`, 90000);
      const inspector = await page.evaluate(`(() => { const b = document.querySelector('[aria-label="Show inspector rail"]'); b.scrollIntoView({block:'nearest',inline:'nearest'}); const r=b.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; })()`);
      assert.ok(inspector[0] >= 0 && inspector[0] < 500, "inspector toggle is reachable in the viewport");
      await page.click(inspector[0], inspector[1]);
      await waitFor(page, `document.querySelector('aside[aria-label="Inspector"]').offsetParent !== null`);
      await page.screenshot(`${OUT}/editor-narrow.png`);
      await clickSelector(page, '[aria-label="Hide inspector rail"]');
      const projects = await page.evaluate(byText('History')); await page.click(...projects);
      await waitFor(page, `document.querySelector('[data-history-panel] [role="dialog"]') !== null`);
      const dialog = await page.evaluate(`(() => {const r=document.querySelector('[data-history-panel] [role="dialog"]').getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};})()`);
      assert.ok(dialog.x>=0 && dialog.y>=0 && dialog.right<=dialog.w && dialog.bottom<=dialog.h,'narrow dialog stays inside viewport');
      await page.screenshot(`${OUT}/editor-narrow-projects.png`);
      await page.key(27,'Escape');
      await waitFor(page, `document.querySelector('[data-history-panel]') === null`);
    } finally {
      await page.close();
    }
  });

  it("opens a large deck with a full filmstrip", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const scenes = [];
    for (let i = 0; i < 120; i++) scenes.push(blankSlide());
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Large Deck", scenes });
    assert.equal(made.status, 200);
    const id = made.body.project.id;
    const t0 = Date.now();
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 120000);
      await waitFor(page, `document.querySelectorAll('[data-thumb]').length === 120`, 120000);
      const dt = Date.now() - t0;
      await writeFile(`${OUT}/large-deck.json`, JSON.stringify({ project: id, slides: 120, thumbs: 120, openMs: dt }, null, 2));
      assert.ok(dt < 120000, `large deck opens in reasonable time (${dt}ms)`);
    } finally {
      await page.close();
    }
  });

  it("remounts cleanly with single-commit semantics", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Clean Deck", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      for (let i = 0; i < 3; i++) {
        const back = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Back to workspace'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        await page.click(back[0], back[1]);
        await waitFor(page, `document.querySelector('[data-project-grid]') !== null`, 60000);
        const openBtn = await page.evaluate(`(() => { const b = document.querySelector('[data-project-open="${id}"]'); b.scrollIntoView({block:"nearest"}); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        await page.click(openBtn[0], openBtn[1]);
        await waitFor(page, `(${SAVE} === 'saved' && ${PROJ}?.id === '${id}')`, 90000);
      }
      assert.equal(await page.evaluate(`document.querySelectorAll('[data-save-state]').length`), 1, "one save machine mounted");
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      const kept = await apiAuthed("GET", `/api/v2/projects/${id}`);
      assert.equal(kept.body.project.revision, 1, "exactly one commit per action after remounts");
    } finally {
      await page.close();
    }
  });

  it("keyboard regions, shortcuts, dialogs, and focus return", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const s2 = blankSlide();
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Keys Deck", scenes: [blankSlide(), s2] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `(${SAVE} === 'saved' && ${PROJ} !== null)`, 90000);
      const done = await page.evaluate(byText("Done"));
      await page.click(done[0], done[1]);
      await waitFor(page, `document.querySelector('[data-editing="true"]') === null`, 60000);
      // Focus the stage, then arrows move between slides read-only.
      await page.evaluate(`document.querySelector('[role="application"]').focus()`);
      await page.key(39, "ArrowRight");
      await waitFor(page, `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).slideIndex === 1`, 60000);
      // History dialog: Escape closes, focus returns to its opener.
      const projects = await page.evaluate(byText("History"));
      await page.click(projects[0], projects[1]);
      await waitFor(page, `document.querySelector('[data-history-panel]') !== null`, 60000);
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-history-panel]') === null`, 60000);
      const focused = await page.evaluate(`document.activeElement?.textContent?.trim() ?? ''`);
      assert.equal(focused, "History", "focus returns to the dialog opener");
    } finally {
      await page.close();
    }
  });

  it("hosted anonymous users get a sign-in state, not an error", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    // Separate static server proxied to the hosted API port.
    const proxied = proxyTo(HOSTED_PORT);
    const hostedStatic = await new Promise((resolve, reject) => {
      const s = createServer(async (req, res) => {
        try {
          if ((req.url ?? "").startsWith("/api/")) return proxied(req, res);
          const url = new URL(req.url ?? "/", "http://127.0.0.1:5264");
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
      s.listen(5264, "127.0.0.1", () => resolve(s));
    });
    const anon = await openSignedIn("#/projects", undefined, null, "http://127.0.0.1:5264/");
    try {
      await waitFor(anon, `document.body.textContent.includes('Sign in to see projects')`, 90000);
      const signin = await anon.evaluate(byText("Sign in"));
      await anon.click(signin[0], signin[1]);
      await waitFor(anon, `document.querySelector('input[type="password"]') !== null`, 60000);
      await anon.screenshot(`${OUT}/dashboard-hosted-anon.png`);
    } finally {
      await anon.close();
      await new Promise((resolve) => hostedStatic.close(resolve));
    }
  });

  it("failed saves remain guarded after Done, sidebar navigation, and browser Back", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed("POST", "/api/v2/projects", { title: "Failed guard", scenes: [blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-project-open="${id}"]') !== null`);
      await clickSelector(page, `[data-project-open="${id}"]`);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => { const real=window.fetch.bind(window); window.fetch=(url,opts)=>opts?.method==='PUT' && String(url).includes('/api/v2/projects/') ? Promise.resolve(new Response(JSON.stringify({ok:false,error:'Storage unavailable',code:'storage-unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})) : real(url,opts); })()`);
      const add = await page.evaluate(byText("+ Text")); await page.click(...add);
      await waitFor(page, `${SAVE} === 'unavailable'`);
      const done = await page.evaluate(byText("Done")); await page.click(...done);
      await clickSelector(page, 'a[href="#/projects"]');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      const cancel = await page.evaluate(byText("Cancel")); await page.click(...cancel);
      await waitFor(page, `document.querySelector('[data-leave-guard]') === null`);
      assert.equal(await page.evaluate('location.hash'), `#/project/${id}`);
      await page.evaluate('history.back()');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      await clickSelector(page, '[data-leave-discard]');
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`);
      const stored = await apiAuthed('GET', `/api/v2/projects/${id}`);
      assert.equal(stored.body.project.revision, 0);
      assert.equal(stored.body.project.scenes[0].elements.length, 0);
    } finally { await page.close(); }
  });

  it("save and leave waits for the in-flight request and the newest engine revision", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed('POST', '/api/v2/projects', { title:'Pending save guard',scenes:[blankSlide()] });
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => { const real=window.fetch.bind(window); let first=true; window.fetch=(url,opts)=> { if(first && opts?.method==='PUT' && String(url).includes('/api/v2/projects/')) {first=false;return new Promise(resolve=>{window.releaseForgeSave=()=>resolve(real(url,opts));});} return real(url,opts); }; })()`);
      let add = await page.evaluate(byText('+ Text')); await page.click(...add);
      await waitFor(page, `${SAVE} === 'saving' && typeof window.releaseForgeSave === 'function'`);
      add = await page.evaluate(byText('+ Text')); await page.click(...add);
      await waitFor(page, `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev === 2`);
      await clickSelector(page, '[aria-label="Back to workspace"]');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      await clickSelector(page, '[data-leave-save]');
      assert.equal(await page.evaluate('location.hash'), `#/project/${id}`, 'pending save cannot authorize departure');
      assert.ok(await page.evaluate(`document.querySelector('[data-workspace-editor]') !== null`));
      await page.evaluate('window.releaseForgeSave(); true');
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`);
      const stored = await apiAuthed('GET', `/api/v2/projects/${id}`);
      assert.equal(stored.body.project.scenes[0].elements.filter(e=>e.kind==='text').length,2);
      assert.equal(stored.body.project.revision,2);
    } finally { await page.close(); }
  });

  it("committing a pending text draft still guards and saves the new revision", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import("../packages/editor/scene-text.js");
    const made = await apiAuthed('POST','/api/v2/projects',{title:'Draft guard',scenes:[blankSlide()]});
    const id = made.body.project.id;
    const page = await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      const add = await page.evaluate(byText('+ Text')); await page.click(...add);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`);
      const point = await page.evaluate(`(() => {const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
      await page.dblclick(...point);
      await waitFor(page, `document.querySelector('[data-text-edit]') !== null`);
      await page.insertText('pending guarded text');
      await clickSelector(page, '[aria-label="Back to workspace"]');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      await clickSelector(page, '[data-leave-save]');
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`);
      const stored = await apiAuthed('GET', `/api/v2/projects/${id}`);
      assert.ok(JSON.stringify(stored.body.project.scenes).includes('pending guarded text'));
      assert.equal(stored.body.project.revision,2);
    } finally { await page.close(); }
  });

  it("discard suppresses newer autosaves while history departure is delayed", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import('../packages/editor/scene-text.js');
    const made = await apiAuthed('POST','/api/v2/projects',{title:'Discard in flight',scenes:[blankSlide()]});
    const id = made.body.project.id;
    const page = await openSignedIn('#/projects');
    try {
      await waitFor(page, `document.querySelector('[data-project-open="${id}"]') !== null`);
      await clickSelector(page, `[data-project-open="${id}"]`);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => { const real=window.fetch.bind(window);window.forgePuts=0;window.fetch=(url,opts)=> { if(opts?.method==='PUT' && String(url).includes('/api/v2/projects/')) {window.forgePuts++;if(window.forgePuts===1)return new Promise(resolve=>{window.releaseForgeSave=()=>real(url,opts).then(r=>{window.forgePutFinished=true;resolve(r);});});}return real(url,opts);};})()`);
      let add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `${SAVE} === 'saving' && typeof window.releaseForgeSave === 'function'`);
      add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await page.evaluate('history.back()');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      await page.evaluate(`(() => {const go=history.go.bind(history);history.go=delta=>{window.releaseForgeTravel=()=>go(delta);};})()`);
      await clickSelector(page,'[data-leave-discard]');
      await waitFor(page, `typeof window.releaseForgeTravel === 'function'`);
      await page.evaluate('window.releaseForgeSave();true');
      await waitFor(page, `window.forgePutFinished === true`);
      await new Promise(resolve=>setTimeout(resolve,2300));
      assert.equal(await page.evaluate('window.forgePuts'),1,'discard must suppress the newer revision, including queued autosave');
      await page.evaluate('window.releaseForgeTravel();true');
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`);
      const stored=await apiAuthed('GET',`/api/v2/projects/${id}`);
      assert.equal(stored.body.project.revision,1);
      assert.equal(stored.body.project.scenes[0].elements.filter(e=>e.kind==='text').length,1);
    } finally {await page.close();}
  });

  it("Done preserves failed edits for a later save and leave", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import('../packages/editor/scene-text.js');
    const made=await apiAuthed('POST','/api/v2/projects',{title:'Read-only save recovery',scenes:[blankSlide()]});
    const id=made.body.project.id;
    const page=await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => {window.realForgeFetch=window.fetch.bind(window);window.fetch=(url,opts)=>opts?.method==='PUT'?Promise.resolve(new Response(JSON.stringify({ok:false,error:'Storage unavailable'}),{status:503})):window.realForgeFetch(url,opts);})()`);
      const add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `${SAVE} === 'unavailable'`);
      const done=await page.evaluate(byText('Done'));await page.click(...done);
      await waitFor(page, `document.querySelector('[data-editing="true"]') === null`);
      await page.evaluate('window.fetch=window.realForgeFetch;true');
      await clickSelector(page,'[aria-label="Back to workspace"]');
      await waitFor(page, `document.querySelector('[data-leave-guard]') !== null`);
      await clickSelector(page,'[data-leave-save]');
      await waitFor(page, `document.querySelector('[data-project-grid]') !== null`);
      const stored=await apiAuthed('GET',`/api/v2/projects/${id}`);
      assert.equal(stored.body.project.revision,1);
      assert.equal(stored.body.project.scenes[0].elements.filter(e=>e.kind==='text').length,1);
    } finally {await page.close();}
  });

  it("cancelling Save and switch prevents a delayed request from navigating", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import('../packages/editor/scene-text.js');
    const made=await apiAuthed('POST','/api/v2/projects',{title:'Switch origin',scenes:[blankSlide()]});
    const other=await apiAuthed('POST','/api/v2/projects',{title:'Switch destination',scenes:[blankSlide()]});
    const id=made.body.project.id;
    const page=await openHarnessProject(id);
    try {
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => {const real=window.fetch.bind(window);window.fetch=(url,opts)=>opts?.method==='PUT'?new Promise(resolve=>{window.releaseForgeSave=()=>resolve(real(url,opts));}):real(url,opts);})()`);
      const add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `${SAVE} === 'saving' && typeof window.releaseForgeSave === 'function'`);
      const projects=await page.evaluate(byText('Projects'));await page.click(...projects);
      await waitFor(page, `document.querySelector('[data-project-open="${other.body.project.id}"]') !== null`);
      await clickSelector(page,`[data-project-open="${other.body.project.id}"]`);
      await waitFor(page, `document.querySelector('[data-switch-guard]') !== null`);
      const save=await page.evaluate(byText('Save & switch'));await page.click(...save);
      await clickSelector(page,'[data-switch-guard] button:last-child');
      await page.evaluate('window.releaseForgeSave();true');
      await waitFor(page, `${SAVE} === 'saved'`);
      assert.equal(await page.evaluate("new URLSearchParams(location.search).get('project')"),id);
      assert.equal(await page.evaluate(`${PROJ}?.id`),id);
      assert.equal(await page.evaluate(`document.querySelector('[data-switch-guard]') === null`),true);
    } finally {await page.close();}
  });

  it("a failed discard-and-reload keeps the original document saveable", async t => {
    if (skipped) return t.skip(skipped);
    const { blankSlide } = await import('../packages/editor/scene-text.js');
    const made=await apiAuthed('POST','/api/v2/projects',{title:'Failed reload recovery',scenes:[blankSlide()]});
    const id=made.body.project.id;
    const page=await openSignedIn(`#/project/${id}`);
    try {
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
      await page.evaluate(`(() => {window.realForgeFetch=window.fetch.bind(window);window.fetch=(url,opts)=>opts?.method==='PUT'?Promise.resolve(new Response(JSON.stringify({ok:false,code:'stale-revision',error:'Changed elsewhere'}),{status:409})):window.realForgeFetch(url,opts);})()`);
      let add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `${SAVE} === 'stale'`);
      const reload=await page.evaluate(byText('Load newer version'));await page.click(...reload);
      await waitFor(page, `document.querySelector('[data-switch-guard]') !== null`);
      await page.evaluate(`(() => {window.fetch=(url,opts)=>String(url).endsWith('/api/v2/projects/${id}') && (!opts?.method || opts.method==='GET')?Promise.resolve(new Response(JSON.stringify({ok:false,error:'Storage unavailable'}),{status:503})):window.realForgeFetch(url,opts);})()`);
      const discard=await page.evaluate(byText('Discard & switch'));await page.click(...discard);
      await waitFor(page, `${SAVE} === 'error'`);
      await page.evaluate('window.fetch=window.realForgeFetch;true');
      add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`);
      const stored=await apiAuthed('GET',`/api/v2/projects/${id}`);
      assert.equal(stored.body.project.scenes[0].elements.filter(e=>e.kind==='text').length,2,'failed reload retains and can save original edits');
    } finally {await page.close();}
  });

  it("unbound standalone edits remain guarded through Done and re-entering Edit", async t => {
    if (skipped) return t.skip(skipped);
    const page=await open(`${APP}scenes.html?deck=mech-warm-humanist-plain`);
    const guarded=`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})()`;
    try {
      const edit=await page.evaluate(byText('Edit'));await page.click(...edit);
      await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`);
      const add=await page.evaluate(byText('+ Text'));await page.click(...add);
      await waitFor(page, `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev === 1`);
      assert.equal(await page.evaluate(guarded),true);
      const done=await page.evaluate(byText('Done'));await page.click(...done);
      await waitFor(page, `document.querySelector('[data-editing="true"]') === null`);
      assert.equal(await page.evaluate(guarded),true,'Done retains unsaved ownership');
      const again=await page.evaluate(byText('Edit'));await page.click(...again);
      await waitFor(page, `document.querySelector('[data-editing="true"]') !== null`);
      assert.equal(await page.evaluate(`JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev`),1,'re-entering keeps the authoritative document');
      assert.equal(await page.evaluate(guarded),true);
    } finally {await page.close();}
  });

  for (const [kind, template] of [['chart','chart-insight'],['table','data-table']]) {
    it(`edits native ${kind} data in the shell without moving the canvas`, async t => {
      if (skipped) return t.skip(skipped);
      const { buildLayoutScenes } = await import('../app/web/src/lib/v2create.js');
      const scenes = await buildLayoutScenes(template);
      const element = scenes[0].elements.find(e=>e.kind===kind);
      const made = await apiAuthed('POST','/api/v2/projects',{title:`Shell ${kind}`,scenes});
      const id = made.body.project.id;
      const page = await openSignedIn(`#/project/${id}`);
      try {
        await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.id === '${id}'`);
        const bounds = await page.evaluate(`(() => {const r=document.querySelector('[data-stage]').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`);
        const layers = await page.evaluate(byText('Layers')); await page.click(...layers);
        await clickSelector(page, `[data-layer="${element.id}"] button[title^="Select"]`);
        await waitFor(page, `document.querySelector('[data-${kind}-editor]') !== null`);
        const after = await page.evaluate(`(() => {const r=document.querySelector('[data-stage]').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})()`);
        bounds.forEach((value,i)=>assert.ok(Math.abs(value-after[i])<1,'selection keeps canvas bounds'));
        await writeFile(`${OUT}/canvas-${kind}.json`,JSON.stringify({before:bounds,after,delta:bounds.map((value,i)=>after[i]-value)},null,2)+'\n');
        await page.evaluate(`(() => {const n=document.querySelector('[data-${kind}-editor] input${kind==='chart'?'[aria-label="Category 1 label"]':''}'); n.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'Shell edited');n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        const apply = await page.evaluate(byText('Apply')); await page.click(...apply);
        await waitFor(page, `${SAVE} === 'saved' && ${PROJ}?.revision === 1`);
        const stored = await apiAuthed('GET', `/api/v2/projects/${id}`);
        assert.ok(JSON.stringify(stored.body.project.scenes.find(s=>s.id===scenes[0].id).elements.find(e=>e.id===element.id)).includes('Shell edited'));
        await page.screenshot(`${OUT}/editor-${kind}.png`);
        const exported=await fetch(`http://127.0.0.1:${API_PORT}/api/v2/projects/${id}/export.pptx`,{headers:{Authorization:`Bearer ${userToken}`}});
        assert.equal(exported.status,200);
        await mkdir(path.join(ROOT,'out/v2-7a-validation'),{recursive:true});
        await writeFile(path.join(ROOT,`out/v2-7a-validation/shell-${kind}.pptx`),Buffer.from(await exported.arrayBuffer()));
      } finally { await page.close(); }
    });
  }

});
