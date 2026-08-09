#!/usr/bin/env node
/**
 * Downloads every typeface listed in fonts.manifest.json from Google Fonts
 * into brand/fonts/, then installs them into the user font dir so that
 * LibreOffice (preview rendering) and headless Chrome (background plates)
 * both resolve them. Idempotent — skips files already on disk.
 *
 * Note: we deliberately send NO User-Agent. The CSS2 API content-negotiates on
 * it, and the default gets us plain `.ttf` urls. Spoofing an old browser gets
 * extension-less `/l/font?kit=` urls instead, which fontconfig won't index.
 */
import { readFile, mkdir, writeFile, access, copyFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = path.join(ROOT, "brand", "fonts");
const INSTALL_DIR = path.join(os.homedir(), ".local", "share", "fonts", "presentation-forge");

const exists = (p) => access(p).then(() => true, () => false);

async function ttfUrlsFor(family, weights) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${weights.join(";")}&display=swap`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSS2 API ${res.status} for "${family}"`);
  const css = await res.text();

  // Each @font-face block carries one weight and one src url.
  const out = [];
  for (const block of css.split("@font-face").slice(1)) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const src = block.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
    if (weight && src) out.push({ weight, src });
  }
  if (!out.length) throw new Error(`no TTF urls parsed for "${family}"`);
  return out;
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "tools", "fonts.manifest.json"), "utf8"),
  );
  const families = Object.entries(manifest.families);

  await mkdir(FONT_DIR, { recursive: true });
  await mkdir(INSTALL_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  const failed = [];

  for (const [family, spec] of families) {
    const slug = family.replace(/\s+/g, "");
    try {
      const urls = await ttfUrlsFor(family, spec.weights);
      for (const { weight, src } of urls) {
        const file = path.join(FONT_DIR, `${slug}-${weight}.ttf`);
        if (await exists(file)) {
          skipped++;
          continue;
        }
        const res = await fetch(src);
        if (!res.ok) throw new Error(`download ${res.status} ${family} ${weight}`);
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        downloaded++;
      }
      process.stdout.write(`  ok   ${family} (${urls.length})\n`);
    } catch (err) {
      failed.push({ family, reason: err.message });
      process.stdout.write(`  FAIL ${family} — ${err.message}\n`);
    }
  }

  // Mirror into the user font dir so fontconfig picks them up.
  for (const f of await readdir(FONT_DIR)) {
    if (f.endsWith(".ttf")) {
      await copyFile(path.join(FONT_DIR, f), path.join(INSTALL_DIR, f));
    }
  }
  await run("fc-cache", ["-f", INSTALL_DIR]).catch(() => {});

  console.log(
    `\n${downloaded} downloaded, ${skipped} already present, ${failed.length} failed.`,
  );
  console.log(`installed -> ${INSTALL_DIR}`);
  if (failed.length) process.exitCode = 1;
}

main();
