#!/usr/bin/env node
/**
 * Rasterises a .pptx to one PNG per slide via LibreOffice + pdftoppm.
 *
 * This is the eyes of the pipeline. The vision-capable local model reads these
 * PNGs and reports overflow, clipping and contrast problems that no amount of
 * schema validation can catch — a deck can be perfectly valid YAML and still
 * have a headline running off the slide.
 */
import { mkdir, readdir, rm, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
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

export async function preview(pptxFile, { outDir, dpi = 110 } = {}) {
  // Absolute throughout: soffice's -env:UserInstallation needs a real file://
  // URL, and --outdir is resolved against soffice's cwd, not ours.
  pptxFile = path.resolve(pptxFile);
  await access(pptxFile);
  const dir = path.resolve(outDir ?? path.join(path.dirname(pptxFile), "preview"));

  if (!(await which("soffice"))) {
    throw new Error("LibreOffice (soffice) not found — required to rasterise slides");
  }

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  // LibreOffice needs a private profile or it silently no-ops when an instance
  // is already running in the user's session.
  const profile = path.join(dir, ".lo-profile");
  await run("soffice", [
    `-env:UserInstallation=file://${profile}`,
    "--headless", "--norestore", "--invisible",
    "--convert-to", "pdf",
    "--outdir", dir,
    pptxFile,
  ], { timeout: 180_000 });

  const pdf = path.join(dir, path.basename(pptxFile).replace(/\.pptx$/i, ".pdf"));
  await access(pdf).catch(() => {
    throw new Error("LibreOffice produced no PDF — conversion failed");
  });

  if (await which("pdftoppm")) {
    await run("pdftoppm", ["-png", "-r", String(dpi), pdf, path.join(dir, "slide")], { timeout: 180_000 });
  } else {
    throw new Error("pdftoppm not found (install poppler) — required to split the PDF into slides");
  }

  await rm(profile, { recursive: true, force: true });

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
