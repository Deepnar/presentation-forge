#!/usr/bin/env node
import { mkdir, mkdtemp, readdir, rm, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";
import sharp from "sharp";

const run = promisify(execFile);

const THUMB_W = 480;

async function which(bin) {
  try {
    await run("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

let profileDir = null;
async function loProfile() {
  if (!profileDir) {
    profileDir = await mkdtemp(path.join(tmpdir(), "forge-lo-"));
    process.once("exit", () => { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} });
  }
  return profileDir;
}

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
