import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The sweep reads DECKS from src/paths.js at import time, so this test imports
// the module fresh after pointing the env at a scratch dir.
const scratch = await mkdtemp(path.join(tmpdir(), "forge-sweep-"));
process.env.FORGE_DECKS_DIR = scratch;

const { sweep } = await import("../src/sweep.js");

async function makeDeck(slug, { ageDays = 0, keep = false, brief = slug } = {}) {
  const dir = path.join(scratch, slug);
  await mkdir(dir, { recursive: true });
  const meta = { slug, brief, ...(keep ? { keep: true } : {}) };
  await writeFile(path.join(dir, "meta.yaml"), JSON.stringify(meta));
  await writeFile(path.join(dir, "deck.yaml"), `title: ${brief}\nslides: []\n`);
  if (ageDays > 0) {
    const past = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    // Touch mtimes back so the age logic sees them as old.
    const { utimes } = await import("node:fs/promises");
    await utimes(path.join(dir, "meta.yaml"), past, past);
    await utimes(path.join(dir, "deck.yaml"), past, past);
  }
}

test("sweep dry-run lists old unkept decks without deleting", async () => {
  await makeDeck("old-deck", { ageDays: 40 });
  await makeDeck("fresh-deck", { ageDays: 2 });
  await makeDeck("kept-old", { ageDays: 60, keep: true });

  const r = await sweep({ olderThanDays: 30, dryRun: true });
  assert.ok(r.willDelete.some((d) => d.slug === "old-deck"), "old unkept deck listed");
  assert.ok(!r.willDelete.some((d) => d.slug === "fresh-deck"), "recent deck not listed");
  assert.ok(!r.willDelete.some((d) => d.slug === "kept-old"), "keep-marked deck not listed");
  assert.ok(r.skipped.some((s) => s.slug === "kept-old"), "keep-marked deck reported as skipped");

  // Dry run deletes nothing.
  await access(path.join(scratch, "old-deck", "deck.yaml"));
});

test("sweep deletes old unkept decks and keeps recent + keep-marked", async () => {
  await makeDeck("old-deck", { ageDays: 40 });
  await makeDeck("fresh-deck", { ageDays: 2 });
  await makeDeck("kept-old", { ageDays: 60, keep: true });

  const r = await sweep({ olderThanDays: 30 });
  assert.deepEqual(r.deleted.map((d) => d.slug), ["old-deck"]);

  // old-deck gone; the others remain.
  await assert.rejects(access(path.join(scratch, "old-deck", "deck.yaml")));
  await access(path.join(scratch, "fresh-deck", "deck.yaml"));
  await access(path.join(scratch, "kept-old", "deck.yaml"));
});
