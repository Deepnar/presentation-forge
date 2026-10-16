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
    const cleanup = () => { clearTimeout(timer); ws.removeEventListener("message", onMsg); ws.removeEventListener("close", onClose); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`CDP ${method} timed out`)); }, 30000);
    const onClose = () => { cleanup(); reject(new Error(`CDP connection closed during ${method}`)); };
    const onMsg = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.id === id) {
        cleanup();
        if (msg.error) reject(new Error(`CDP ${method}: ${JSON.stringify(msg.error).slice(0, 200)}`));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.addEventListener("close", onClose, { once: true });
    try { ws.send(JSON.stringify({ id, method, params })); } catch (error) { cleanup(); reject(error); }
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
    // Headless desktop focus can disappear independently of page input and
    // spuriously commit inline drafts during keyboard tests.
    await send(ws, id++, "Emulation.setFocusEmulationEnabled", { enabled: true });
    await send(ws, id++, "Page.navigate", { url });
    const t0 = Date.now();
    for (;;) {
      const ready = await evaluate(ws, id++, `document.querySelector("[data-fonts-ready]")?.dataset?.fontsReady ?? null`);
      // "pending" is still loading — keep polling. Only a settled
      // "true"/"false" completes the gate: stopping on the initial
      // "false" raced slow font loads and failed captures that would
      // have succeeded a moment later.
      if (ready === "true" || ready === "false") {
        const missing = await evaluate(ws, id++, `document.querySelector("[data-missing-fonts]")?.dataset?.missingFonts ?? ""`);
        return { ws, id, kill, ready, missing: missing ? missing.split(",") : [] };
      }
      if (Date.now() - t0 > timeoutMs) throw new Error(`font readiness never reported at ${url}`);
      await sleep(500);
    }
  } catch (err) {
    await kill();
    throw err;
  }
}

export async function fontGatedScreenshot(url, pngPath, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const page = await openViewer(url, { w, h, timeoutMs });
  try {
    await page.screenshot(pngPath);
    return { missing: page.missing };
  } finally {
    await page.close();
  }
}

export async function fontGatedDom(url, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const page = await openViewer(url, { w, h, timeoutMs });
  try {
    return await page.evaluate(`document.documentElement.outerHTML`);
  } finally {
    await page.close();
  }
}

// Gated page plus one evaluated expression (for geometry reads
// dumps cannot express). Returns the expression's value.
export async function fontGatedEvaluate(url, expression, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const page = await openViewer(url, { w, h, timeoutMs });
  try {
    return await page.evaluate(expression);
  } finally {
    await page.close();
  }
}

// Interactive session: one Chrome, many steps. Selection tests
// and eval captures click, keypress, read, and screenshot against
// the same mounted viewer — single-shot helpers cannot hold a
// multiselect across calls. Clicks go through trusted CDP input
// dispatch at viewport coordinates, so overlay transparency and
// real hit testing are exercised, not bypassed.
export async function openViewer(url, { w = 1440, h = 900, timeoutMs = 90000 } = {}) {
  const g = await gatedPage(url, w, h, timeoutMs);
  if (g.ready !== "true") {
    try {
      g.ws.close();
    } catch { /* already closed */ }
    await g.kill();
    throw new Error(`fonts not ready at ${url} (missing: ${g.missing})`);
  }
  let seq = g.id;
  const close = async () => {
    try {
      g.ws.close();
    } catch { /* already closed */ }
    await g.kill();
  };
  return {
    missing: g.missing,
    async evaluate(expression) {
      return evaluate(g.ws, seq++, expression);
    },
    async click(x, y, { shift = false } = {}) {
      const modifiers = shift ? 8 : 0;
      for (const type of ["mousePressed", "mouseReleased"]) {
        await send(g.ws, seq++, "Input.dispatchMouseEvent", {
          type, x: Math.round(x), y: Math.round(y),
          button: "left", clickCount: 1, modifiers,
        });
      }
    },
    // Raw trusted pointer primitives. drag() below composes them;
    // drivers needing a mid-gesture pause (preview screenshots)
    // sequence them directly instead.
    async mouseDown(x, y) {
      await send(g.ws, seq++, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: Math.round(x), y: Math.round(y),
        button: "left", clickCount: 1,
      });
    },
    async mouseMove(x, y) {
      await send(g.ws, seq++, "Input.dispatchMouseEvent", {
        type: "mouseMoved", x: Math.round(x), y: Math.round(y),
        button: "left",
      });
    },
    async mouseUp(x, y, { shift = false } = {}) {
      const modifiers = shift ? 8 : 0;
      await send(g.ws, seq++, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: Math.round(x), y: Math.round(y),
        button: "left", clickCount: 1, modifiers,
      });
    },
    // Trusted drag: press, move in steps, release. Exercises the
    // real pointer path including hit testing, capture, threshold,
    // and coordinate projection — never bypassed.
    async drag(x1, y1, x2, y2, { steps = 8 } = {}) {
      await send(g.ws, seq++, "Input.dispatchMouseEvent", {
        type: "mousePressed", x: Math.round(x1), y: Math.round(y1),
        button: "left", clickCount: 1,
      });
      for (let i = 1; i <= steps; i++) {
        await send(g.ws, seq++, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: Math.round(x1 + ((x2 - x1) * i) / steps),
          y: Math.round(y1 + ((y2 - y1) * i) / steps),
          button: "left",
        });
      }
      await send(g.ws, seq++, "Input.dispatchMouseEvent", {
        type: "mouseReleased", x: Math.round(x2), y: Math.round(y2),
        button: "left", clickCount: 1,
      });
    },
    async screenshot(pngPath) {
      const shot = await send(g.ws, seq++, "Page.captureScreenshot", { format: "png" });
      await writeFile(pngPath, Buffer.from(shot.data, "base64"));
    },
    async viewport(width, height) {
      await send(g.ws, seq++, "Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    },
    async onNewDocument(source) {
      await send(g.ws, seq++, "Page.addScriptToEvaluateOnNewDocument", { source });
    },
    // Double-click: two press/release pairs, the second with
    // clickCount 2 so the page sees a real dblclick (single
    // clicks only select; dblclick opens text-edit mode).
    async dblclick(x, y) {
      for (const clickCount of [1, 2]) {
        await send(g.ws, seq++, "Input.dispatchMouseEvent", {
          type: "mousePressed", x: Math.round(x), y: Math.round(y),
          button: "left", clickCount,
        });
        await send(g.ws, seq++, "Input.dispatchMouseEvent", {
          type: "mouseReleased", x: Math.round(x), y: Math.round(y),
          button: "left", clickCount,
        });
      }
    },
    // Real committed-text path: inserts at the focused caret like
    // a trusted keystroke (the editing overlay must be focused).
    async insertText(text) {
      await send(g.ws, seq++, "Input.insertText", { text });
    },
    // Trusted key press against the focused element (keydown +
    // keyup). Windows key codes: Enter 13, Escape 27, Left 37,
    // Up 38, Right 39, Down 40.
    async key(code, keyName) {
      await send(g.ws, seq++, "Input.dispatchKeyEvent", {
        type: "rawKeyDown", windowsVirtualKeyCode: code, key: keyName,
      });
      await send(g.ws, seq++, "Input.dispatchKeyEvent", {
        type: "keyUp", windowsVirtualKeyCode: code, key: keyName,
      });
    },
    close,
  };
}
