import { render } from "./render.js";
import { libreofficeToPdf } from "./preview.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

export const NON_TEXT = new Set([
  "type", "section", "image", "images", "html", "icon", "fit", "notes",
  "url", "src", "href", "align", "colour", "color", "variant", "kind",
  "sentiment", "state", "status", "tone", "trend", "direction", "level",
  "id", "from", "to",
  "chart",
]);

export function slideStrings(slide) {
  const out = [];
  const walk = (node, key) => {
    if (node == null) return;
    if (typeof node === "string") {
      if (!NON_TEXT.has(key) && !/^__.*__$/.test(node)) out.push(node);
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, key); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) if (!NON_TEXT.has(k)) walk(v, k);
    }
  };
  walk(slide, null);
  return out;
}

export function wordsOf(text, min = 6) {
  return String(text)
    .normalize("NFKD")
    .replace(/[‘’“”]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, "").toLowerCase())
    .filter((w) => w.length >= min && /\p{L}/u.test(w));
}

function despaceTracked(page) {
  return page.split("\n").map((line) => line.replace(/\s+/g, "")).join("\n");
}

const normalise = (s) => s.normalize("NFKD").replace(/[‘’“”]/g, "'").toLowerCase();

export async function substitutedFaces(theme) {
  const families = [...new Set(Object.values(theme.type ?? {}).map((t) => t.family).filter(Boolean))];
  const missing = [];
  for (const family of families) {
    try {
      const { stdout } = await run("fc-match", [`${family}:style=Regular`, "family"], { timeout: 10_000 });
      if (!stdout.toLowerCase().includes(family.toLowerCase())) missing.push(family);
    } catch {
      return families; // no fontconfig at all: treat every face as unresolved
    }
  }
  return missing;
}

export async function textCheck({
  deck, deckDir, themeName, mode = "light", out, minWord = 6,
  skip = new Set(["freeform", "image", "hero-image", "image-grid"]),
}) {
  const outFile = out ?? path.join(deckDir, "textcheck.pptx");
  const r = await render({ deck, deckDir, themeName, mode, out: outFile });
  const pdfFile = await libreofficeToPdf(r.outFile, { outDir: path.join(deckDir, "tc-pdf") });

  const { stdout } = await run("pdftotext", ["-layout", pdfFile, "-"], { maxBuffer: 32 * 1024 * 1024 });
  const pages = stdout.split("\f").map(normalise);

  const missing = [];
  deck.slides.forEach((slide, i) => {
    if (skip.has(slide.type)) return;
    const page = pages[i];
    if (page == null) { missing.push({ index: i + 1, type: slide.type, word: null, note: "no page rendered" }); return; }
    const seen = new Set(wordsOf(page, 1));
    const tracked = despaceTracked(page);
    const want = new Set(slideStrings(slide).flatMap((s) => wordsOf(s, minWord)));
    for (const w of want) {
      if (seen.has(w) || tracked.includes(w)) continue;
      missing.push({ index: i + 1, type: slide.type, word: w });
    }
  });

  return { outFile: r.outFile, problems: r.problems, missing, pages: pages.length };
}
