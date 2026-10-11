// Minimal CDP screenshot client (no dependencies): launches
// headless Chrome, navigates, polls an in-page readiness signal,
// then captures. `--screenshot` cannot wait for font loading;
// this exists so evaluation screenshots gate on
// data-fonts-ready instead of racing system substitutions.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.id === id) {
        ws.removeEventListener("message", onMsg);
        if (msg.error) reject(new Error(`CDP ${method}: ${JSON.stringify(msg.error).slice(0, 200)}`));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, id, expression) {
  const r = await send(ws, id, "Runtime.evaluate", { expression, returnByValue: true });
  if (r?.exceptionDetails) throw new Error(`page JS failed: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
  return r?.result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(url, w, h) {
  const profile = await mkdtemp(path.join(tmpdir(), "opencode-shot-"));
  const dbgPort = 19000 + Math.floor(Math.random() * 9000);
  const chrome = spawn("google-chrome-stable", [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--no-first-run", `--user-data-dir=${profile}`, "--hide-scrollbars",
    `--window-size=${w},${h}`, `--ozone-override-screen-size=${w},${h}`,
    `--remote-debugging-port=${dbgPort}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  return { chrome, profile, dbgPort };
}

// Navigate and poll the in-page font gate until it reports (or the
// timeout bites). `--dump-dom` cannot wait, so every evaluation
// path funnels through here instead of racing substitutions.
async function killAndClean(chrome, profile) {
  // Signal, wait for actual exit (locked profile files fail rm),
  // then remove with one retry for stragglers.
  chrome.kill();
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 5000);
    chrome.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
  for (let i = 0; i < 2; i++) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch {
      await sleep(500);
    }
  }
}

async function gatedPage(url, w, h, timeoutMs) {
  const { chrome, profile, dbgPort } = await launch(url, w, h);
  const kill = () => killAndClean(chrome, profile);
  try {
    let tabs = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
        tabs = await res.json();
        if (tabs?.length) break;
      } catch { /* booting */ }
      await sleep(500);
    }
    if (!tabs?.length) throw new Error("CDP endpoint never answered");
    const wsUrl = tabs.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? tabs[0].webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    let id = 1;
    await send(ws, id++, "Page.enable");
    await send(ws, id++, "Page.navigate", { url });
    const t0 = Date.now();
    for (;;) {
      const ready = await evaluate(ws, id++, `document.querySelector("[data-fonts-ready]")?.dataset?.fontsReady ?? null`);
      if (ready === "true" || ready === "false") {
        const missing = await evaluate(ws, id++, `document.querySelector("[data-missing-fonts]")?.dataset?.missingFonts ?? ""`);
        return { ws, id, kill, ready, missing: missing ? missing.split(",") : [] };
      }
      if (Date.now() - t0 > timeoutMs) throw new Error(`font readiness never reported at ${url}`);
      await sleep(1000);
    }
  } catch (err) {
    await kill();
    throw err;
  }
}

export async function fontGatedScreenshot(url, pngPath, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const g = await gatedPage(url, w, h, timeoutMs);
  try {
    if (g.ready !== "true") throw new Error(`fonts not ready at ${url} (missing: ${g.missing})`);
    const shot = await send(g.ws, g.id++, "Page.captureScreenshot", { format: "png" });
    await writeFile(pngPath, Buffer.from(shot.data, "base64"));
    g.ws.close();
    return { missing: g.missing };
  } finally {
    try {
      g.ws.close();
    } catch { /* already closed */ }
    await g.kill();
  }
}

export async function fontGatedDom(url, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const g = await gatedPage(url, w, h, timeoutMs);
  try {
    if (g.ready !== "true") throw new Error(`fonts not ready at ${url} (missing: ${g.missing})`);
    const dom = await evaluate(g.ws, g.id++, `document.documentElement.outerHTML`);
    g.ws.close();
    return dom;
  } finally {
    try {
      g.ws.close();
    } catch { /* already closed */ }
    await g.kill();
  }
}

// Gated page plus one evaluated expression (for geometry reads
// dumps cannot express). Returns the expression's value.
export async function fontGatedEvaluate(url, expression, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const g = await gatedPage(url, w, h, timeoutMs);
  try {
    if (g.ready !== "true") throw new Error(`fonts not ready at ${url} (missing: ${g.missing})`);
    return await evaluate(g.ws, g.id++, expression);
  } finally {
    try {
      g.ws.close();
    } catch { /* already closed */ }
    await g.kill();
  }
}
