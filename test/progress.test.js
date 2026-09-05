import { test } from "node:test";
import assert from "node:assert/strict";
import { progressLabel } from "../app/web/src/lib/progress.js";

test("progressLabel names every long action", () => {
  assert.equal(progressLabel({ status: "planning" }), "Planning the outline…");
  assert.equal(progressLabel({ status: "rendering" }), "Rendering slides…");
  assert.equal(progressLabel({ status: "reading" }), "Reading the deck…");
  assert.equal(progressLabel({ status: "editing" }), "Editing the deck…");
  assert.equal(progressLabel({ status: "report_planning" }), "Planning the report…");
});

test("progressLabel counts slides and sections for the writing frames", () => {
  assert.equal(progressLabel({ status: "writing", index: 0, total: 12 }), "Writing slide 1 of 12…");
  assert.equal(progressLabel({ status: "writing", index: 5, total: 8 }), "Writing slide 6 of 8…");
  assert.equal(progressLabel({ status: "report_writing", index: 2, total: 6 }), "Writing section 3 of 6…");
  assert.equal(progressLabel({ status: "sweeping", index: 3, total: 9 }), "Sweeping slide 4 of 9…");
  assert.equal(progressLabel({ status: "converting", index: 1 }), "Converting slide 2…");
});

test("progressLabel shows the research query under researching", () => {
  assert.equal(progressLabel({ status: "researching" }), "Researching sources…");
  assert.equal(progressLabel({ status: "researching", query: "green hydrogen cost" }), "Researching: green hydrogen cost…");
  assert.equal(progressLabel({ status: "researching", query: "↳ the rich source" }), "Researching: the rich source…");
});

test("progressLabel falls back for unknown frames", () => {
  assert.equal(progressLabel({ status: "something_else" }), "Working…");
  assert.equal(progressLabel({}), "Working…");
});

/* ------------------------------------- the phases after the last slide is written */

/**
 * Everything from the field-length pass to the critic runs after the deck is
 * written, and together it is the slow half of a generation — the critic alone
 * interleaves a full render with model calls, twice. All of it fell through to
 * "Working…", so the phase the user waits longest through was the one the UI
 * said least about.
 */
test("progressLabel names the post-write phases instead of saying Working", () => {
  const frames = [
    { status: "papers" },
    { status: "field_length_checking" },
    { status: "field_length", index: 3, total: 22 },
    { status: "coherence_checking" },
    { status: "coherence", round: 1 },
    { status: "coherence_fixing", count: 3 },
    { status: "images", index: 2, done: 0, total: 1 },
    { status: "images_done", supplied: 2, skipped: 1 },
    { status: "critiquing", round: 1, phase: "rendering" },
    { status: "critiquing", round: 1, phase: "critiquing", slide: 4, total: 22 },
    { status: "critiquing", round: 2, phase: "fixing", count: 2 },
    { status: "script", index: 0, total: 12 },
  ];
  for (const f of frames) {
    assert.notEqual(progressLabel(f), "Working…", `${f.status}/${f.phase ?? ""} is unlabelled`);
  }
});

test("the image counter counts images, not the slide it is illustrating", () => {
  // The supply emits `index` (the SLIDE) and `done` (the counter). Reading
  // `index` as the counter made a one-image deck report "image 3 of 1".
  assert.equal(progressLabel({ status: "images", index: 2, done: 0, total: 1 }), "Finding image 1 of 1…");
  assert.equal(progressLabel({ status: "images", index: 17, done: 1, total: 3 }), "Finding image 2 of 3…");
  assert.equal(progressLabel({ status: "images" }), "Finding images…");
});

test("progressLabel reports what the image pass actually did", () => {
  assert.equal(progressLabel({ status: "images_done", supplied: 2, skipped: 1 }), "2 images added, 1 skipped.");
  assert.equal(progressLabel({ status: "images_done", supplied: 1, skipped: 0 }), "1 image added.");
  assert.equal(progressLabel({ status: "images_done", supplied: 0, skipped: 0 }), "No images added.");
});

test("the critic's three phases read differently", () => {
  const at = (phase, extra = {}) => progressLabel({ status: "critiquing", round: 1, phase, ...extra });
  assert.match(at("rendering"), /Rendering the deck/);
  assert.match(at("critiquing", { slide: 4, total: 22 }), /slide 4 of 22/);
  assert.match(at("fixing", { count: 2 }), /Fixing 2 problems/);
  assert.match(at("fixing", { count: 1 }), /Fixing 1 problem\b/);
});

/* ----------------------------------------------------- the CLI's own one-liner */

test("formatProgress counts images by the counter, not by the slide index", async () => {
  const { formatProgress } = await import("../src/ai/pipeline.js");
  // The defect verbatim: one image, wanted on slide 3.
  assert.equal(formatProgress({ status: "images", index: 2, done: 0, total: 1 }), "images 1/1");
  assert.equal(formatProgress({ status: "images", index: 17, done: 1, total: 3 }), "images 2/3");
  // A stage whose index IS the sequence is unchanged.
  assert.equal(formatProgress({ status: "writing", index: 5, total: 12 }), "writing 6/12");
  // …and one with no counter at all does not invent a denominator.
  assert.equal(formatProgress({ status: "rendering" }), "rendering");
  assert.equal(formatProgress({ status: "converting", index: 1 }), "converting");
});
