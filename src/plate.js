import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./paths.js";

/**
 * The HTML plate primitive.
 *
 * Headless Chrome renders a decorative HTML document to a PNG at build time;
 * the renderer places that PNG as a slide background with all text still
 * native. This is the single seam both plate themes and freeform slides use —
 * input is HTML + viewport, output is a cached PNG keyed by the content hash,
 * so repeated renders are free and a changed document gets a fresh plate
 * automatically.
 *
 * The page is sandboxed: a CSP with `default-src 'none'` blocks scripts and
 * every network scheme, and only inline styles plus local data:/file: images
 * and fonts are allowed. The HTML renders in a real browser, so anything else
 * must be unrepresentable rather than merely discouraged.
 */

// The slide is 13.333×7.5in = 16:9. 1280×720 CSS px at scale 1.5 is a 1920×1080
// plate, comfortably above the ~1466px the preview rasteriser wants.
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

/** Cache key = hash of everything that affects the pixels. */
export function plateCacheKey(html, { w = PLATE_W, h = PLATE_H, scale = PLATE_SCALE } = {}) {
  return createHash("sha256")
    .update(`${VERSION}\n${w}x${h}@${scale}\n${html}`)
    .digest("hex");
}

/** Resolve the Chrome binary once; the env override is for machines without it. */
export function chromeBinary() {
  return CHROME;
}

/** Screenshot one URL at a fixed viewport. Resolves when the PNG exists. */
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
    // Virtual time makes animations, fonts and images settle deterministically
    // without waiting real seconds.
    "--virtual-time-budget=2000",
    `--screenshot=${outFile}`,
    `file://${htmlFile}`,
  ];
  // The Docker image runs as root, where Chromium's setuid sandbox is refused;
  // as its unprivileged user the container has neither the setuid sandbox nor
  // user namespaces, so the sandbox is unavailable either way. FORGE_CHROME_NO_SANDBOX=1
  // is set in the image for both cases. Desktop installs keep the sandbox.
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

/**
 * Render an HTML document to a plate PNG. Returns the cached file path.
 * Two concurrent renders of the same document both land on the same key, so
 * the last writer wins and the bytes are identical either way.
 */
export async function renderPlate(
  html,
  { w = PLATE_W, h = PLATE_H, scale = PLATE_SCALE, cacheDir = PLATE_CACHE } = {},
) {
  // The screenshot URL is file://htmlFile; a relative cacheDir would make that
  // a malformed file URL (host = ".plate-cache") and Chrome renders a blank
  // error page. Resolve so the URL always names a real absolute path.
  const dir = path.resolve(cacheDir);
  const key = plateCacheKey(html, { w, h, scale });
  const outFile = path.join(dir, `${key}.png`);
  try {
    await access(outFile);
    return { path: outFile, cached: true, key };
  } catch { /* miss — render */ }

  await mkdir(dir, { recursive: true });
  // A unique temp name keeps concurrent renders from deleting each other's
  // input; the keyed output is shared by design.
  const htmlFile = path.join(dir, `${key}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.html`);
  await writeFile(htmlFile, WRAPPER(html), "utf8");
  try {
    // One retry: a crashed tab produces no file, and a single restart is cheap.
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

/**
 * The theme's plate template as an interpolated document. `{{path.to.token}}`
 * resolves into the resolved theme (tokens and voice), so the theme YAML stays
 * the single source of colours and the renderer never hardcodes one. The
 * surface — title / section / content — picks a variant when the theme defines
 * one.
 */
export function interpolateTemplate(tpl, theme) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, p) => {
    const val = p.split(".").reduce((o, k) => (o == null ? o : o[k]), theme);
    return val == null ? m : String(val);
  });
}

/** Which plate a slide gets: a slide `html` override wins, then the theme. */
export function plateHtmlFor({ theme, surface, slide, box }) {
  if (typeof slide?.html === "string" && slide.html.trim()) {
    return { html: slide.html, kind: "slide" };
  }
  const plate = theme?.plate;
  if (!plate || plate.enabled === false) return null;
  const tpl = (surface && plate.surfaces?.[surface]) || plate.html;
  if (!tpl) return null;
  return { html: interpolateTemplate(tpl, { ...theme, box: boxPx(box) }), kind: "theme" };
}

/**
 * The content region in CSS pixels (1in = 96px at the plate's viewport), so a
 * plate template can place a soft panel exactly behind where the native
 * content draws. Without this the soft-UI themes could not frost/emboss the
 * actual content area — they would only have a pretty border.
 */
function boxPx(box) {
  if (!box) return null;
  // content() returns `bottom` and `y`, not `h` — derive it so a template's
  // {{box.h}} is always a real number.
  const h = box.h ?? box.bottom - box.y;
  return { x: Math.round(box.x * 96), y: Math.round(box.y * 96), w: Math.round(box.w * 96), h: Math.round(h * 96) };
}

/** Resolve a plate's source into a rendered PNG path, or null if none. */
export async function renderSlidePlate({ theme, surface, slide, box, signal }) {
  const want = plateHtmlFor({ theme, surface, slide, box });
  if (!want) return null;
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const { path: png, cached } = await renderPlate(want.html);
  return { png, cached, kind: want.kind, key: plateCacheKey(want.html) };
}
