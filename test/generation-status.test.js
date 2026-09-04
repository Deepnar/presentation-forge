import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

// generationStatus reads DECKS from src/paths.js at import time, so the env has
// to point at a scratch dir before the pipeline is imported.
const scratch = await mkdtemp(path.join(tmpdir(), "forge-genstatus-"));
process.env.FORGE_DECKS_DIR = scratch;

const { generationStatus } = await import("../src/ai/pipeline.js");

/**
 * The finalize watchdog's input.
 *
 * `DeckDetail` AUTO-RUNS finalize when this reports a deck as needing it — a
 * grounding pass, a coherence model call, image supply, a render and a preview.
 * So "does this deck need finalizing" is not a cosmetic question: getting it
 * wrong re-runs the whole post-write pass every time somebody opens the page.
 */

let n = 0;
async function deckDir({ plan = 4, written = 4, status = "ready", run = null, meta = true } = {}) {
  const slug = `deck-${n++}`;
  const dir = path.join(scratch, slug);
  await mkdir(dir, { recursive: true });
  if (plan != null) {
    await writeFile(path.join(dir, "plan.yaml"), YAML.stringify({
      title: "T", sections: ["A"],
      slides: Array.from({ length: plan }, () => ({ type: "bullets", section: 0, purpose: "p" })),
    }), "utf8");
  }
  if (written != null) {
    await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({
      title: "T",
      slides: Array.from({ length: written }, () => ({ type: "bullets", headline: "H", bullets: ["a", "b", "c", "d"] })),
    }), "utf8");
  }
  if (meta) await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ slug, status }), "utf8");
  if (run) await writeFile(path.join(dir, ".run.json"), JSON.stringify(run), "utf8");
  return slug;
}

test("a finished deck does not ask to be finalised again", async () => {
  // The regression: `complete` is true of every deck that ever succeeded, so
  // reading it as "interrupted" made the watchdog re-run the post-write pass on
  // every page load of every finished deck.
  const slug = await deckDir({ plan: 4, written: 4, status: "ready" });
  const r = await generationStatus(slug);
  assert.equal(r.complete, true, "every plan slide is written");
  assert.equal(r.finalized, true);
  assert.equal(r.unfinalised, false, "finished is not the same as unfinalised");
  assert.equal(r.partial, false);
});

test("a deck written through but stranded before finalize still asks", async () => {
  // writeDeckContent sets "writing" and finalizeDeck flips it to "ready", so a
  // deck stuck at "writing" with every slide on disk is exactly what an
  // interrupted run leaves behind — the case the watchdog exists for.
  const slug = await deckDir({ plan: 4, written: 4, status: "writing" });
  const r = await generationStatus(slug);
  assert.equal(r.complete, true);
  assert.equal(r.finalized, false);
  assert.equal(r.unfinalised, true, "this is the state the watchdog is for");
});

test("a half-written deck is resumable, not finalisable", async () => {
  const slug = await deckDir({ plan: 5, written: 2, status: "writing", run: { total: 5, status: "writing" } });
  const r = await generationStatus(slug);
  assert.equal(r.partial, true);
  assert.equal(r.complete, false);
  assert.equal(r.unfinalised, false, "there is still content to write — resume, do not finalize");
  assert.equal(r.status, "writing");
});

test("a planned deck with nothing written is neither", async () => {
  const slug = await deckDir({ plan: 6, written: null, status: "planned" });
  const r = await generationStatus(slug);
  assert.equal(r.written, 0);
  assert.equal(r.complete, false);
  assert.equal(r.partial, false);
  assert.equal(r.unfinalised, false);
});

test("a deck with no meta is treated as unfinalised, the old behaviour", async () => {
  // Offering a finalize that was not needed costs a run; withholding one that
  // was leaves a deck the user cannot use. Without the signal, prefer the run.
  const slug = await deckDir({ plan: 4, written: 4, meta: false });
  const r = await generationStatus(slug);
  assert.equal(r.finalized, false);
  assert.equal(r.unfinalised, true);
});

test("the checkpoint's total wins over the plan's, and completeness follows it", async () => {
  // A resumed run's real total lives in .run.json; the plan may have been
  // trimmed since. Reading the plan instead would call a deck complete early.
  const slug = await deckDir({ plan: 4, written: 4, status: "writing", run: { total: 8, status: "writing" } });
  const r = await generationStatus(slug);
  assert.equal(r.total, 8);
  assert.equal(r.complete, false);
  assert.equal(r.partial, true);
});

test("a swept or re-rendered ready deck stays finalised", async () => {
  // sweepDensity and the critic branch both re-write meta.status = "ready";
  // none of them may push a deck back into the watchdog's path.
  const slug = await deckDir({ plan: 12, written: 12, status: "ready" });
  assert.equal((await generationStatus(slug)).unfinalised, false);
});

test.after(() => rm(scratch, { recursive: true, force: true }));
