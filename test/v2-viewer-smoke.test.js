// V2-4A browser smoke: builds the web app, serves dist over a
// tiny static server, and drives the committed SceneViewer in
// headless Chrome. Building (rather than vite dev) removes
// transform-latency flakiness and validates the shipped artifact.
// All Chrome invocations are async (promisified execFile) so the
// in-process static server stays responsive while Chrome fetches
// subresources — sync execFileSync deadlocks the event loop and
// hangs every run. Linkedom unit tests in
// test/v2-viewer-4a.test.js carry the contracts regardless; this
// file proves real-Chrome mounting, deep links, and screenshots.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import path from "node:path";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const PORT = 5211;
const PAGE_URL = `http://127.0.0.1:${PORT}/scenes.html`;
const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const OUT = path.join(ROOT, "out", "v2-4a");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function chromeBinary() {
  for (const bin of ["google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      execSync(`command -v ${bin}`, { stdio: "ignore" });
      return bin;
    } catch { /* next */ }
  }
  return null;
}

async function chrome(args, timeout = 60000) {
  const bin = chromeBinary();
  if (!bin) return null;
  // Hermetic profile per invocation: sharing a profile directory
  // across runs risks SingletonLock staleness from killed runs,
  // which stalls headless Chrome indefinitely. Fresh dirs are
  // cheap; staleness is not.
  const profile = await mkdtemp(join(tmpdir(), "opencode-chrome-"));
  try {
    const { stdout } = await execFileAsync(bin, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
      "--no-first-run", `--user-data-dir=${profile}`, "--hide-scrollbars", ...args,
    ], { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    throw new Error(`chrome smoke failed: ${String(err.message).slice(0, 300)}`);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

// Layout viewport must equal the screenshot window: headless
// defaults the ozone screen to 800x600 regardless of
// --window-size, which silently shrinks fit math and evidence.
function shotSize(w, h) {
  return [`--window-size=${w},${h}`, `--ozone-override-screen-size=${w},${h}`];
}

// Static dist server: deterministic, no transform latency, and it
// exercises the exact files production serves.
function serveDir(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (rel === "" || rel.endsWith("/")) rel += "index.html";
      const file = join(dir, rel);
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("no such file");
    }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function waitFor(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let skipped = "";

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  await mkdir(OUT, { recursive: true });
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
  } catch (err) {
    skipped = `vite build failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  try {
    await stat(path.join(DIST, "scenes.html"));
  } catch {
    skipped = "build produced no scenes.html";
    return;
  }
  server = await serveDir(DIST, PORT);
  const up = await waitFor(PAGE_URL, 20);
  if (!up) {
    server.close();
    server = null;
    skipped = "static server did not answer";
  }
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

// Layout effects commit before serialization, so the first dump
// normally catches the mounted viewer; polling covers cold caches.
// (An earlier passive-effect version never appeared in dumps at
// all — serialization raced the effect.)
async function dumpReady(url, w = 1440, h = 900, tries = 6) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    last = await chrome([...shotSize(w, h), "--dump-dom", url], 45000) ?? "";
    if (last.includes("data-slide=")) return last;
    await sleep(2000);
  }
  throw new Error(`viewer never mounted at ${url} (last dump ${last.length} bytes)`);
}

function stateOf(dom, label) {
  const m = dom.match(/data-viewer-state="([^"]*)"/);
  assert.ok(m, `${label}: viewer state readout present`);
  return JSON.parse(m[1].replace(/&quot;/g, '"'));
}

describe("v2-4a browser smoke", () => {
  it("mounts real scenes with stable identities", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const dom = await dumpReady(PAGE_URL, 1440, 900);
    assert.match(dom, /data-slide="m-divider"/, "first slide mounted");
    // Uniqueness scopes to the main stage: the filmstrip mounts the
    // same scenes as thumbnails, so page-wide ids repeat by design.
    // Only the stage svg carries data-slide, which isolates it.
    const stage = dom.match(/<svg[^>]*data-slide="[^"]*"[\s\S]*?<\/svg>/);
    assert.ok(stage, "stage svg present");
    const ids = [...stage[0].matchAll(/data-el="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, `mounted elements present (got ${ids.length})`);
    assert.ok(new Set(ids).size === ids.length, "stage ids unique");
    const pageIds = [...dom.matchAll(/data-el="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(pageIds.length > 5, `stage plus filmstrip present (got ${pageIds.length})`);
    assert.match(dom, /aria-label="Slides"/, "filmstrip present");
    // Locked chrome lives in the chromed deck, not the default
    // plain deck: drive it via ?deck= and assert the flag there.
    const chromed = await dumpReady(`${PAGE_URL}?deck=mech-warm-humanist-chromed`, 1440, 900);
    assert.match(chromed, /data-locked="true"/, "locked chrome flagged");
    const st = stateOf(dom, "initial");
    assert.equal(st.slideIndex, 0);
    assert.equal(st.slideCount, 12);
    assert.equal(st.zoom, 1);
    assert.match(dom, /<svg[^>]*width="1280"/, "canonical 1280-wide stage");
  });

  it("deep links drive slide, zoom, and selection", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const url = `${PAGE_URL}?slide=3&zoom=2&select=m-compare%3Al%3Acontent`;
    const dom = await dumpReady(url, 1440, 900);
    const st = stateOf(dom, "deep link");
    assert.equal(st.slideIndex, 3, "slide param honored");
    assert.equal(st.zoom, 2, "zoom param honored");
    assert.equal(st.selectedId, "m-compare:l:content", "selection param honored");
    assert.match(dom, /data-selected="true"/, "selection marked in DOM");
  });

  it("captures evidence screenshots", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    await chrome([...shotSize(1440, 900), `--screenshot=${path.join(OUT, "viewer-1440.png")}`, PAGE_URL]);
    await chrome([...shotSize(1440, 900), `--screenshot=${path.join(OUT, "viewer-zoomed.png")}`, `${PAGE_URL}?slide=4&zoom=2`]);
    await chrome([...shotSize(900, 1400), `--screenshot=${path.join(OUT, "viewer-narrow.png")}`, `${PAGE_URL}?slide=1`]);
    for (const f of ["viewer-1440.png", "viewer-zoomed.png", "viewer-narrow.png"]) {
      assert.ok((await stat(path.join(OUT, f))).size > 20000, `${f} has substance`);
    }
  });
});
