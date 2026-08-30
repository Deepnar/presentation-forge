import { render } from "./render.js";
import { libreofficeToPdf } from "./preview.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

/**
 * Did the words actually survive onto the slide?
 *
 * The fitter can prove text was set at a readable size. It cannot see the two
 * ways text is lost anyway: a word wider than its column is broken in the
 * middle of itself at raster time ("Compone / nt one"), and a layout can
 * simply not draw a field it was given. Both leave a valid .pptx, both look
 * like a rendering choice in a thumbnail, and neither raises anything.
 *
 * Rasterising to PDF and reading the text back answers it directly: every word
 * the content declares must appear, intact, on the page it belongs to. This is
 * the third deterministic instrument, beside the fit sweep (`themematrix`) and
 * the surface contrast test.
 */

// Fields that never reach the slide as text, or that the layout deliberately
// rewrites. `notes` go to the speaker-notes pane, not the canvas.
const NON_TEXT = new Set([
  "type", "section", "image", "images", "html", "icon", "fit", "notes",
  "url", "src", "href", "align", "colour", "color", "variant", "kind",
  // Enums that drive a mark rather than being set as text.
  "sentiment", "state", "status", "tone", "trend", "direction", "level",
  // A chart's own labels live inside the chart part, which pdftotext does not
  // read back; the headline and caption around it still do.
  "chart",
]);

/** Every string a slide asks to be drawn, flattened. */
export function slideStrings(slide) {
  const out = [];
  const walk = (node, key) => {
    if (node == null) return;
    // `__placeholder__` is the specimen's stand-in for an asset, not text.
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

/**
 * Words worth checking. Short words appear everywhere and break rarely, and a
 * word with no letters is a number or a symbol the layout may reformat.
 */
export function wordsOf(text, min = 6) {
  return String(text)
    // Curly quotes and non-breaking spaces come back differently from the
    // rasteriser than they went in; compare on letters and digits only. A
    // hyphenated compound is a legal wrap point, so it is checked in parts.
    .normalize("NFKD")
    .replace(/[‘’“”]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, "").toLowerCase())
    .filter((w) => w.length >= min && /\p{L}/u.test(w));
}

/**
 * Letter-spaced type comes back from the rasteriser with the tracking as real
 * spaces — "Key t a keaway", "Key take away", "Discover y" — which would read
 * as a broken word on every eyebrow in the product.
 *
 * What separates the two cases is that a wrap is a LINE break and tracking is
 * not: a word too wide for its column is split across two lines, while
 * tracking only ever widens the gaps within one. So each line is also offered
 * with its spaces closed up, and the comparison is a substring match. A
 * genuine "Compone" / "nt one" stays two lines and is still caught, which is
 * the thing this check exists to find.
 */
function despaceTracked(page) {
  return page.split("\n").map((line) => line.replace(/\s+/g, "")).join("\n");
}

const normalise = (s) => s.normalize("NFKD").replace(/[‘’“”]/g, "'").toLowerCase();

/**
 * The typefaces a theme names that fontconfig cannot actually resolve.
 *
 * This check reads the RASTERISED page, so it is only meaningful when the page
 * was rasterised in the fonts the theme asks for. A machine with only
 * DejaVu/Liberation substitutes a wider face, the fitter's metrics no longer
 * describe what was drawn, and a word that fits in Space Grotesk breaks in the
 * fallback — a real failure of that machine, not of the layout. Callers skip
 * rather than report a defect the product does not have.
 */
export async function substitutedFaces(theme) {
  const families = [...new Set(Object.values(theme.type ?? {}).map((t) => t.family).filter(Boolean))];
  const missing = [];
  for (const family of families) {
    try {
      const { stdout } = await run("fc-match", [`${family}:style=Regular`, "family"], { timeout: 10_000 });
      // fc-match answers with the family it resolved to; a substitution names
      // something else entirely.
      if (!stdout.toLowerCase().includes(family.toLowerCase())) missing.push(family);
    } catch {
      return families; // no fontconfig at all: treat every face as unresolved
    }
  }
  return missing;
}

/**
 * Render a deck and report every declared word that did not survive to the
 * page. `skip` names slide types whose text is not extractable — a freeform
 * slide is a rasterised HTML image, so nothing it says is in the PDF.
 */
export async function textCheck({
  deck, deckDir, themeName, mode = "light", out, minWord = 6,
  skip = new Set(["freeform", "image", "hero-image", "image-grid"]),
}) {
  const outFile = out ?? path.join(deckDir, "textcheck.pptx");
  const r = await render({ deck, deckDir, themeName, mode, out: outFile });
  // The PDF is all this needs; rasterising 75 pages to PNG would cost the
  // whole point of a check that runs over every theme.
  const pdfFile = await libreofficeToPdf(r.outFile, { outDir: path.join(deckDir, "tc-pdf") });

  const { stdout } = await run("pdftotext", ["-layout", pdfFile, "-"], { maxBuffer: 32 * 1024 * 1024 });
  const pages = stdout.split("\f").map(normalise);

  const missing = [];
  deck.slides.forEach((slide, i) => {
    if (skip.has(slide.type)) return;
    const page = pages[i];
    if (page == null) { missing.push({ index: i + 1, type: slide.type, word: null, note: "no page rendered" }); return; }
    const seen = new Set(wordsOf(page, 1));
    // De-spaced tracked lines are matched as a substring, not as tokens: the
    // tracking swallows the word boundaries too, so "Key takeaway" comes back
    // as one run.
    const tracked = despaceTracked(page);
    const want = new Set(slideStrings(slide).flatMap((s) => wordsOf(s, minWord)));
    for (const w of want) {
      if (seen.has(w) || tracked.includes(w)) continue;
      missing.push({ index: i + 1, type: slide.type, word: w });
    }
  });

  return { outFile: r.outFile, problems: r.problems, missing, pages: pages.length };
}
