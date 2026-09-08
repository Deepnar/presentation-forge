import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./paths.js";

export const PLATE_W = 1280;
export const PLATE_H = 720;
export const PLATE_SCALE = 1.5;

export const PLATE_CACHE = process.env.FORGE_PLATE_CACHE || path.join(ROOT, ".plate-cache");

const CHROME = process.env.FORGE_CHROME || "/usr/bin/google-chrome-stable";
const VERSION = "plate-v1"; // bump to invalidate every cached plate at once

const WRAPPER = (body) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta http-equiv="Content-Security-Policy" content="` +
  `default-src 'none'; style-src 'unsafe-inline'; ` +
  `img-src data: file:; font-src data: file:">` +
  `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
  `</head><body>${body}</body></html>`;

export function plateCacheKey(html, { w = PLATE_W, h = PLATE_H, scale = PLATE_SCALE } = {}) {
  return createHash("sha256")
    .update(`${VERSION}\n${w}x${h}@${scale}\n${html}`)
    .digest("hex");
}

export function chromeBinary() {
  return CHROME;
}

function screenshot(htmlFile, outFile, { w, h, scale }) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-color-profile=srgb",
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    "--virtual-time-budget=2000",
    `--screenshot=${outFile}`,
    `file://${htmlFile}`,
  ];
  if (process.env.FORGE_CHROME_NO_SANDBOX === "1") args.splice(1, 0, "--no-sandbox");
  return new Promise((resolve, reject) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Chrome failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      access(outFile).then(resolve).catch(() => reject(
        new Error(`Chrome exited ${code} without writing ${outFile}. ` +
          `Check FORGE_CHROME points at a working binary.\n${stderr.trim()}`),
      ));
    });
  });
}

export async function renderPlate(
  html,
  { w = PLATE_W, h = PLATE_H, scale = PLATE_SCALE, cacheDir = PLATE_CACHE } = {},
) {
  const dir = path.resolve(cacheDir);
  const key = plateCacheKey(html, { w, h, scale });
  const outFile = path.join(dir, `${key}.png`);
  try {
    await access(outFile);
    return { path: outFile, cached: true, key };
  } catch { /* miss — render */ }

  await mkdir(dir, { recursive: true });
  const htmlFile = path.join(dir, `${key}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.html`);
  await writeFile(htmlFile, WRAPPER(html), "utf8");
  try {
    try {
      await screenshot(htmlFile, outFile, { w, h, scale });
    } catch (err) {
      await rm(outFile, { force: true });
      await screenshot(htmlFile, outFile, { w, h, scale });
    }
  } finally {
    await rm(htmlFile, { force: true });
  }
  return { path: outFile, cached: false, key };
}

export function interpolateTemplate(tpl, theme) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, p) => {
    const val = p.split(".").reduce((o, k) => (o == null ? o : o[k]), theme);
    return val == null ? m : String(val);
  });
}

export function plateHtmlFor({ theme, surface, slide, box }) {
  if (typeof slide?.html === "string" && slide.html.trim()) {
    return { html: slide.html, kind: "slide" };
  }
  const plate = theme?.plate;
  if (!plate || plate.enabled === false) return null;
  const tpl = (surface && plate.surfaces?.[surface]) || plate.html;
  if (!tpl) return null;
  const px = boxPx(box);
  return {
    html: interpolateTemplate(tpl, { ...theme, box: px, panel: panelPx(px) }),
    kind: "theme",
  };
}

function boxPx(box) {
  if (!box) return null;
  const h = box.h ?? box.bottom - box.y;
  return { x: Math.round(box.x * 96), y: Math.round(box.y * 96), w: Math.round(box.w * 96), h: Math.round(h * 96) };
}

const PANEL_INSET = { x: 30, y: 26 };

function panelPx(box) {
  if (!box) return null;
  return {
    x: box.x - PANEL_INSET.x,
    y: box.y - PANEL_INSET.y,
    w: box.w + PANEL_INSET.x * 2,
    h: box.h + PANEL_INSET.y * 2,
  };
}

export async function renderSlidePlate({ theme, surface, slide, box, signal }) {
  const want = plateHtmlFor({ theme, surface, slide, box });
  if (!want) return null;
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { path: png, cached } = await renderPlate(want.html);
  return { png, cached, kind: want.kind, key: plateCacheKey(want.html) };
}
