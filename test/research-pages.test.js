import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-pages-"));
process.env.FORGE_DECKS_DIR = scratch;
process.env.FORGE_CONFIG_DIR = process.env.FORGE_CONFIG_DIR ?? path.join(scratch, "config");

const { writeResearch } = await import("../src/ai/pipeline.js");
const { readResearchPages } = await import("../src/ai/research.js");

/**
 * The per-source page store.
 *
 * `notes.md` is the merged text the writer draws from, but the merge forgets
 * which source each passage came from — so a references slide cannot say which
 * slide drew on which source. `research/pages.json` keeps the per-page texts
 * beside the merge; `notes.md` itself is byte-identical either way.
 */

async function dir(name) {
  const d = path.join(scratch, name);
  await mkdir(d, { recursive: true });
  return d;
}

test("writeResearch stores per-page texts beside the merged notes", async () => {
  const d = await dir("deck-a");
  await writeResearch(d, {
    text: "## Alpha\n\n180 GW by 2030.",
    sources: [{ url: "https://a.example/x", title: "Alpha", words: 5 }],
    pages: [{ url: "https://a.example/x", title: "Alpha", words: 5, text: "180 GW by 2030." }],
  });
  assert.equal(await readFile(path.join(d, "research", "notes.md"), "utf8"), "## Alpha\n\n180 GW by 2030.");
  const pages = await readResearchPages(d);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].url, "https://a.example/x");
  assert.equal(pages[0].text, "180 GW by 2030.");
});

test("writeResearch without pages writes no pages.json and reads back null", async () => {
  const d = await dir("deck-b");
  await writeResearch(d, { text: "nothing much", sources: [] });
  assert.equal(await readResearchPages(d), null);
});

test("empty-text pages are dropped and upload pseudo-pages survive", async () => {
  const d = await dir("deck-c");
  await writeResearch(d, {
    text: "hello",
    sources: [],
    pages: [
      { url: null, title: "brief.pdf", words: 1, kind: "user-provided", text: "hello" },
      { url: "https://b.example/y", title: "Blank", words: 0, text: "   " },
    ],
  });
  const pages = await readResearchPages(d);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].kind, "user-provided");
  assert.equal(pages[0].url, null);
});

test("readResearchPages is null-safe on corrupt or missing files", async () => {
  const d = await dir("deck-d");
  await mkdir(path.join(d, "research"), { recursive: true });
  await writeFile(path.join(d, "research", "pages.json"), "not json", "utf8");
  assert.equal(await readResearchPages(d), null);
  assert.equal(await readResearchPages(path.join(scratch, "no-such-deck")), null);
});
