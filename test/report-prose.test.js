import { test } from "node:test";
import assert from "node:assert/strict";
import { salvageParagraph, assembleReport } from "../src/ai/report.js";

/**
 * Paragraphs the writer emitted as data rather than as prose.
 *
 * The section schema asks for an array of strings, and constrained decoding
 * enforces exactly that: the type and the length, never whether the characters
 * read as English. So a model can satisfy the grammar completely and still hand
 * back JSON. One generated report's Theoretical Background reached the .docx as
 * a serialised `{"text": …, "source": …}` object, the bare schema key
 * `paragraph_number_indexed_text`, and `]}` — three valid strings of legal
 * length, typeset into a document meant for submission.
 */

test("a paragraph that is really a JSON object gives up its prose", () => {
  const raw = JSON.stringify({
    text: "Perovskite solar cells suffer from inherent instability.",
    source: "Attributed to weak van der Waals interactions.",
  });
  assert.equal(salvageParagraph(raw), "Perovskite solar cells suffer from inherent instability.");
});

test("bare syntax and leaked schema keys are dropped", () => {
  assert.equal(salvageParagraph("]}"), null);
  assert.equal(salvageParagraph("}"), null);
  assert.equal(salvageParagraph("],"), null);
  assert.equal(salvageParagraph("paragraph_number_indexed_text"), null);
  assert.equal(salvageParagraph("   "), null);
  assert.equal(salvageParagraph(null), null);
});

test("truncated JSON is not prose either", () => {
  // The grammar cut the object mid-string; half an object cannot be salvaged.
  assert.equal(salvageParagraph('{"text": "a sentence that never clo'), null);
});

test("ordinary prose passes through untouched", () => {
  const p = "Perovskite efficiency rose from 3.8% to 25.8% within a decade.";
  assert.equal(salvageParagraph(p), p);
  // Prose that merely mentions a brace is still prose.
  const braces = "The set {A, B} denotes the two architectures compared here.";
  assert.equal(salvageParagraph(braces), braces);
  // A single word with no underscore is a legitimate (if terse) paragraph.
  assert.equal(salvageParagraph("Indeed."), "Indeed.");
});

test("assembleReport drops a section whose paragraphs were all junk", () => {
  const plan = { title: "T", sections: [{ name: "Good" }, { name: "Junk" }] };
  const report = assembleReport(plan, {
    Good: { paragraphs: ["A real sentence about the topic."] },
    Junk: { paragraphs: ["]}", "paragraph_number_indexed_text"] },
  });
  assert.deepEqual(Object.keys(report.content), ["Good"]);
  // A bare heading with nothing under it is worse than an absent section —
  // the renderer already contracts to skip what is not there.
  assert.equal(report.content.Junk, undefined);
});

test("assembleReport keeps a section's other fields while cleaning its prose", () => {
  const plan = { title: "T", sections: [{ name: "Mixed" }] };
  const table = { headers: ["a"], rows: [["1"]] };
  const report = assembleReport(plan, {
    Mixed: { paragraphs: ["Real prose here.", "]}"], table },
  });
  assert.deepEqual(report.content.Mixed.paragraphs, ["Real prose here."]);
  assert.deepEqual(report.content.Mixed.table, table);
});
