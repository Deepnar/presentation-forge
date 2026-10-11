// V2-4E §2: the font gate distinguishes pending from failed.
// The viewer reported "false" while fonts were still loading, and
// the CDP helper treated that as a completed result — so a slow
// font load failed captures that would have succeeded a moment
// later. The viewer now reports "pending" until settled, and the
// helper polls through it. The delayed-font case below fails on
// the V2-4D baseline `2509968` (helper returns early "false" and
// throws) and passes after.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { join, normalize, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "app", "web", "dist");
const PORT = 5212;

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

// Synthetic gate: "pending" for ~2s, then "true". No fonts
// involved — pins the helper's polling contract directly.
const GATE_HTML = `<!doctype html><html><body><div data-fonts-ready="pending" data-missing-fonts="">boot</div><script>setTimeout(()=>{document.querySelector("[data-fonts-ready]").dataset.fontsReady="true";},2000);</script></body></html>`;

let server = null;
let skipped = "";
let inflight = 0;

before(async () => {
  if (!chromeBinary()) {
    skipped = "no chrome binary on PATH";
    return;
  }
  try {
    execSync("node_modules/.bin/vite build --config app/web/vite.config.js", { cwd: ROOT, stdio: "pipe", timeout: 300000 });
  } catch (err) {
    skipped = `vite build failed: ${String(err.message).slice(0, 200)}`;
    return;
  }
  server = await new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      inflight++;
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
        if (url.pathname === "/gate.html") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(GATE_HTML);
          return;
        }
        let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
        if (rel === "" || rel.endsWith("/")) rel += "index.html";
        const file = join(DIST, rel);
        if (!file.startsWith(DIST)) {
          res.writeHead(403);
          res.end();
          return;
        }
        // Slow fonts: hold every woff2 ~3s so the viewer sits in
        // its loading state while the helper polls. On the V2-4D
        // baseline the readout reads "false" during this window
        // and the helper returns early and throws.
        if (file.endsWith(".woff2")) {
          await new Promise((r) => setTimeout(r, 3000));
        }
        res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(await readFile(file));
      } catch {
        try {
          res.writeHead(404);
          res.end("no such file");
        } catch { /* client gone during a held font response */ }
      } finally {
        inflight--;
      }
    });
    s.on("error", reject);
    s.listen(PORT, "127.0.0.1", () => resolve(s));
  });
});

after(async () => {
  // Drain delayed font responses before closing: a woff2 held
  // past teardown writes to a dead socket and fails the file.
  for (let i = 0; i < 40 && inflight > 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});

describe("v2-4e font-gate pending state", () => {
  it("a delayed successful gate does not fail prematurely", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { fontGatedDom } = await import("../tools/chrome-shot.mjs");
    const dom = await fontGatedDom(`http://127.0.0.1:${PORT}/gate.html`, { timeoutMs: 60000 });
    assert.match(dom, /boot/, "gate waited through pending to success");
  });

  it("the viewer with slow fonts still reaches ready, not failure", async (t) => {
    if (skipped) {
      t.skip(skipped);
      return;
    }
    const { fontGatedDom } = await import("../tools/chrome-shot.mjs");
    const dom = await fontGatedDom(
      `http://127.0.0.1:${PORT}/scenes.html?deck=mech-warm-humanist-plain&slide=1`,
      { timeoutMs: 120000 },
    );
    assert.match(dom, /data-fonts-ready="true"/, "slow fonts settle to ready");
    assert.match(dom, /data-slide=/, "viewer mounted behind the gate");
  });
});
