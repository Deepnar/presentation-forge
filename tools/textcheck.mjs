#!/usr/bin/env node
/**
 * Did the words survive onto the slide?
 *
 *   node tools/textcheck.mjs                       # every theme, the specimen deck
 *   node tools/textcheck.mjs --themes a,b
 *   node tools/textcheck.mjs --deck decks/<slug>/deck.yaml --themes a,b
 *   node tools/textcheck.mjs --min 8               # only longer words
 *
 * The fit sweep (`themematrix`) proves text was set at a readable size. This
 * proves it is still there and still spelled the way it was written: it
 * rasterises to PDF, reads the text back, and reports every word the content
 * declared that did not survive. It catches the two failures nothing else can
 * see — a word too wide for its column broken in the middle of itself, and a
 * layout that simply never draws a field the schema lets the model fill.
 *
 * Needs LibreOffice and Poppler's pdftotext.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/paths.js";
import { textCheck, substitutedFaces } from "../src/textcheck.js";
import { specimenDeck } from "../src/specimens.js";
import { listThemes, loadTheme } from "../src/theme.js";
import { loadDeck } from "../src/validate.js";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const themes = list(arg("--themes")) ?? (await listThemes());
const minWord = Number(arg("--min", "6"));
const deckFile = arg("--deck");

const source = deckFile ? await loadDeck(deckFile) : await specimenDeck();
if (!deckFile) {
  source.title = "The shape of an argument";
  source.subtitle = "A neutral specimen";
}

const work = path.join(ROOT, ".themeaudit", "textcheck");
await rm(work, { recursive: true, force: true });

let total = 0;
for (const theme of themes) {
  const dir = path.join(work, theme);
  await mkdir(dir, { recursive: true });
  // Branding is a per-install variable and reserves title-band width, so a
  // sweep that included it would report this machine's identity.
  await writeFile(path.join(dir, "meta.yaml"), "chrome:\n  branding: none\n", "utf8");
  const substituted = await substitutedFaces(await loadTheme(theme));
  if (substituted.length) {
    // The page has to be rasterised in the theme's own faces or the result
    // describes this machine's fallbacks, not the layout. See docs/TRAPS.md.
    console.log(`  ${theme.padEnd(24)} SKIPPED — not installed: ${substituted.join(", ")} (npm run fonts)`);
    continue;
  }
  try {
    const r = await textCheck({
      deck: structuredClone(source), deckDir: dir, themeName: theme,
      out: path.join(dir, "deck.pptx"), minWord,
    });
    total += r.missing.length;
    if (!r.missing.length) { console.log(`  ${theme.padEnd(24)} ok`); continue; }
    const bySlide = new Map();
    for (const m of r.missing) {
      const key = `slide ${m.index} (${m.type})`;
      if (!bySlide.has(key)) bySlide.set(key, []);
      bySlide.get(key).push(m.word ?? m.note);
    }
    console.log(`  ${theme.padEnd(24)} ${r.missing.length} missing`);
    for (const [slide, words] of bySlide) console.log(`      ${slide}: ${words.join(", ")}`);
  } catch (err) {
    console.error(`  ${theme.padEnd(24)} FAILED ${err.message.slice(0, 140)}`);
    process.exitCode = 1;
  }
}

console.log(total ? `\n  ${total} word(s) did not survive to the page.` : `\n  every declared word survived, in ${themes.length} theme(s).`);
if (total) process.exitCode = 1;
