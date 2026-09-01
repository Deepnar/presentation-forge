#!/usr/bin/env node
/**
 * Rasterises a .pptx to one PNG per slide via LibreOffice + pdftoppm.
 *
 * This is the eyes of the pipeline. The vision-capable local model reads these
 * PNGs and reports overflow, clipping and contrast problems that no amount of
 * schema validation can catch — a deck can be perfectly valid YAML and still
 * have a headline running off the slide.
 */
import { mkdir, mkdtemp, readdir, rm, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import sharp from "sharp";

const run = promisify(execFile);

/** Grid thumbnails. Full-res plates are ~1.5 MP each and a 12-slide deck will
 *  stall a browser if the gallery loads them directly. */
const THUMB_W = 480;

async function which(bin) {
  try {
    await run("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert any Office document to PDF via LibreOffice headless. The one
 * trustworthy rendering primitive in the repo: the report's TOC page-number
 * pass and the deck's rasterisation both need a real layout engine.
 *
 * Absolute throughout: soffice's -env:UserInstallation needs a real file://
 * URL, and --outdir is resolved against soffice's cwd, not ours.
 */
/**
 * One LibreOffice profile per process, built once and reused.
 *
 * A private profile is not optional: soffice silently no-ops when an instance
 * is already running in the user's session, which is the trap this whole
 * function exists around. But building one from scratch on every conversion
 * pays that setup cost every time — measured at roughly 0.8s of a 7s
 * conversion, on every slide sweep and every report render.
 *
 * Private and reused, not fresh and reused: a directory of our own under the
 * OS temp dir, so two concurrent PROCESSES still get separate profiles and
 * cannot lock each other out.
 */
let profileDir = null;
async function loProfile() {
  if (!profileDir) {
    profileDir = await mkdtemp(path.join(tmpdir(), "forge-lo-"));
    // Best effort: a leftover profile is harmless, but tidy is better.
    process.once("exit", () => { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} });
  }
  return profileDir;
}

/**
 * Serialise conversions within this process.
 *
 * Two soffice invocations sharing one profile directory is exactly the
 * lock-out the private profile prevents, so reusing the profile is only safe
 * if nothing overlaps. Every caller today awaits sequentially; this makes that
 * a property of the function rather than of its callers' good manners.
 */
let loQueue = Promise.resolve();
function loSlot() {
  const prev = loQueue;
  let release;
  loQueue = new Promise((r) => { release = r; });
  return prev.then(() => release);
}

export async function libreofficeToPdf(file, { outDir, timeout = 180_000 } = {}) {
  file = path.resolve(file);
  await access(file);
  const dir = path.resolve(outDir ?? path.join(path.dirname(file), "preview"));

  if (!(await which("soffice"))) {
    throw new Error("LibreOffice (soffice) not found — required to convert to PDF");
  }

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const release = await loSlot();
  try {
    await run("soffice", [
      `-env:UserInstallation=file://${await loProfile()}`,
      "--headless", "--norestore", "--invisible",
      "--convert-to", "pdf",
      "--outdir", dir,
      file,
    ], { timeout });
  } finally {
    release();
  }

  const pdf = path.join(dir, path.basename(file).replace(/\.(pptx|docx)$/i, ".pdf"));
  await access(pdf).catch(() => {
    throw new Error("LibreOffice produced no PDF — conversion failed");
  });

  return pdf;
}

export async function preview(pptxFile, { outDir, dpi = 110 } = {}) {
  const dir = path.resolve(outDir ?? path.join(path.dirname(pptxFile), "preview"));
  const pdf = await libreofficeToPdf(pptxFile, { outDir: dir });

  if (await which("pdftoppm")) {
    await run("pdftoppm", ["-png", "-r", String(dpi), pdf, path.join(dir, "slide")], { timeout: 180_000 });
  } else {
    throw new Error("pdftoppm not found (install poppler) — required to split the PDF into slides");
  }

  const pngs = (await readdir(dir)).filter((f) => /^slide-\d+\.png$/.test(f)).sort();

  const thumbDir = path.join(dir, "thumbs");
  await mkdir(thumbDir, { recursive: true });
  await Promise.all(pngs.map((f) =>
    sharp(path.join(dir, f)).resize({ width: THUMB_W }).png({ compressionLevel: 9 })
      .toFile(path.join(thumbDir, f)),
  ));

  return {
    dir,
    pdf,
    pages: pngs.map((f) => path.join(dir, f)),
    thumbs: pngs.map((f) => path.join(thumbDir, f)),
  };
}

/**
 * Rasterise a report .docx to one PNG per page, exactly like the deck preview —
 * the preview IS the real Word output, drawn by LibreOffice and split by
 * pdftoppm, so what the user sees in the report view is what opens in Word.
 * Lives in out/report-preview so it never collides with the deck's slides.
 */
export async function reportPreview(docxFile, { dpi = 110 } = {}) {
  const dir = path.resolve(path.join(path.dirname(docxFile), "report-preview"));
  const pdf = await libreofficeToPdf(docxFile, { outDir: dir });

  if (await which("pdftoppm")) {
    await run("pdftoppm", ["-png", "-r", String(dpi), pdf, path.join(dir, "page")], { timeout: 180_000 });
  } else {
    throw new Error("pdftoppm not found (install poppler) — required to split the PDF into report pages");
  }

  const pngs = (await readdir(dir)).filter((f) => /^page-\d+\.png$/.test(f)).sort();

  const thumbDir = path.join(dir, "thumbs");
  await mkdir(thumbDir, { recursive: true });
  await Promise.all(pngs.map((f) =>
    sharp(path.join(dir, f)).resize({ width: THUMB_W }).png({ compressionLevel: 9 })
      .toFile(path.join(thumbDir, f)),
  ));

  return {
    dir,
    pdf,
    pages: pngs.map((f) => path.join(dir, f)),
    thumbs: pngs.map((f) => path.join(thumbDir, f)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node src/preview.js <deck.pptx> [--dpi N]");
    process.exit(2);
  }
  const dpiArg = process.argv.indexOf("--dpi");
  try {
    const r = await preview(file, { dpi: dpiArg > -1 ? Number(process.argv[dpiArg + 1]) : 110 });
    console.log(`  ${r.pages.length} page(s) -> ${r.dir}`);
  } catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}
