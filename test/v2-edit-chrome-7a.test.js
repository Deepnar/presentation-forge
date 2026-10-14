// V2-7A unified workspace in real Chrome: dashboard, creation,
// editor shell, navigation, guards, history, export, responsive,
// keyboard, and cleanup — driven through the SPA. Fails on 97a12de
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
        res.writeHead(r.status, Object.fromEntries([...r.headers.entries()].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k.toLowerCase()))));
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (err) {
        res.writeHead(502);
        res.end(`proxy failed: ${err.message}`);
      }
    });
  };
}

async function startApi(port, cfgDir, dbFile, extraEnv = {}) {
  const proc = spawn("node", ["app/server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, FORGE_API_PORT: String(port), FORGE_CONFIG_DIR: cfgDir, FORGE_DB_PATH: dbFile, ...extraEnv },
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
    if (Date.now() - t0 > timeoutMs) throw new Error(`wait timed out: ${expr.slice(0, 100)}`);
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
      const ok = await page.evaluate(`document.getElementById('root') !== null && document.querySelector('[data-workspace-create],[data-topbar],[data-project-grid]') !== null`);
      if (ok) return page;
    } catch { /* mid-navigation */ }
    if (Date.now() - t0 > 90000) throw new Error("signed-in app never settled");
    await new Promise((r) => setTimeout(r, 500));
  }
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

describe("v2-7a workspace dashboard", () => {
  it("shows the empty state first, then real projects", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const page = await openSignedIn("#/projects");
    try {
      await waitFor(page, `document.querySelector('[data-workspace-create]') !== null`, 60000);
      assert.ok(await page.evaluate(`document.body.textContent.includes('No presentations yet')`), "empty state for first-time users");
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
      const openBtn = await page.evaluate(`(() => { const b = document.querySelector('[data-project-open="${id}"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
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
    const page = await openSignedIn(`#/project/${a.body.project.id}`);
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
      // Undo via the top bar steps the engine back one revision.
      const revBefore = await page.evaluate(`JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev`);
      const undo = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((n) => n.getAttribute('aria-label') === 'Undo'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(undo[0], undo[1]);
      await waitFor(page, `JSON.parse(document.querySelector('[data-edit-state]').dataset.editState).rev === ${revBefore - 1}`, 60000);
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
      const add = await page.evaluate(byText("+ Text"));
      await page.click(add[0], add[1]);
      await waitFor(page, `${SAVE} === 'saved'`, 90000);
      await page.screenshot(`${OUT}/editor-narrow.png`);
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
        const openBtn = await page.evaluate(`(() => { const b = document.querySelector('[data-project-open="${id}"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
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
      // Projects dialog: Escape closes, focus returns to its opener.
      const projects = await page.evaluate(byText("Projects"));
      await page.click(projects[0], projects[1]);
      await waitFor(page, `document.querySelector('[data-projects-panel]') !== null`, 60000);
      await page.key(27, "Escape");
      await waitFor(page, `document.querySelector('[data-projects-panel]') === null`, 60000);
      const focused = await page.evaluate(`document.activeElement?.textContent?.trim() ?? ''`);
      assert.equal(focused, "Projects", "focus returns to the dialog opener");
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
      await waitFor(anon, `document.body.textContent.includes('Sign in to see presentations')`, 90000);
      const signin = await anon.evaluate(byText("Sign in"));
      await anon.click(signin[0], signin[1]);
      await waitFor(anon, `document.querySelector('input[type="password"]') !== null`, 60000);
      await anon.screenshot(`${OUT}/dashboard-hosted-anon.png`);
    } finally {
      await anon.close();
      await new Promise((resolve) => hostedStatic.close(resolve));
    }
  });
});
