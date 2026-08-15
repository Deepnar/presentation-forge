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
