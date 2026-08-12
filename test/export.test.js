import { test } from "node:test";
import assert from "node:assert/strict";
import { deckToMarkdown } from "../src/export.js";
import { cloneDeck, uniqueSlug } from "../src/ai/pipeline.js";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DECKS } from "../src/paths.js";

test("deckToMarkdown extracts content, never geometry", () => {
  const deck = {
    title: "Green Hydrogen",
    subtitle: "A review",
    sections: ["Intro", "Data"],
    slides: [
      { type: "title" },
      { type: "bullets", headline: "Key facts", bullets: ["180 GW by 2030", "electrolysis"] },
      { type: "big-number", value: "180 GW", label: "committed", body: "across roadmaps" },
      { type: "quote", quote: "Clarity is a feature.", attribution: "principle" },
    ],
  };
  const md = deckToMarkdown(deck);
  assert.ok(md.startsWith("# Green Hydrogen"));
  assert.ok(md.includes("## 2. bullets — Key facts"));
  assert.ok(md.includes("- 180 GW by 2030"));
  assert.ok(md.includes("- committed"));
  // No coordinate/colour/geometry vocabulary leaks into a text artefact.
  assert.ok(!md.includes("C05D4E"));
  assert.ok(!md.includes("0.7"));
});

test("cloneDeck copies content files and re-stamps the meta slug", async () => {
  // Build a scratch deck under a unique slug, then clone it and assert the copy.
  const slug = await uniqueSlug("clone-source");
  const dir = path.join(DECKS, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), "title: Source\nslides:\n  - type: title\n", "utf8");
  await writeFile(path.join(dir, "meta.yaml"), "slug: source\n", "utf8");

  const { slug: copySlug } = await cloneDeck({ slug });
  assert.notEqual(copySlug, slug);
  assert.match(copySlug, /^clone-source/);
  const copied = await readFile(path.join(DECKS, copySlug, "deck.yaml"), "utf8");
  assert.ok(copied.includes("Source"));
  const meta = await readFile(path.join(DECKS, copySlug, "meta.yaml"), "utf8");
  assert.ok(meta.includes(`slug: ${copySlug}`));

  // Clean up both folders.
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true });
  await rm(path.join(DECKS, copySlug), { recursive: true, force: true });
});
