import { test } from "node:test";
import assert from "node:assert/strict";
import { salvageParagraph, assembleReport, cleanReference } from "../src/ai/report.js";

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

/**
 * Reference entries scraped from PubMed/PMC.
 *
 * Those pages render "[DOI] [PubMed] [Google Scholar]" beside every citation.
 * The text lands in the research notes as part of the reference and the writer
 * copies it through — and a run of identical bracketed tokens is exactly what
 * constrained decoding loops on. One generated reference ran 600 characters:
 * the real citation, then "[Google Scholar] [PubMed]" twenty times, then a
 * dangling bracket where the grammar cut the next one.
 */

test("scraped database link labels are stripped from a citation", () => {
  const raw =
    "Bass K. K. Influence of moisture on organohalide perovskites. " +
    "Chem. Commun. 2014;50:15819-15822. doi: 10.1039/c4cc05231e. [DOI] [PubMed] [Google Scholar]";
  const out = cleanReference(raw);
  assert.ok(out.endsWith("doi: 10.1039/c4cc05231e."), out);
  for (const label of ["[DOI]", "[PubMed]", "[Google Scholar]"]) {
    assert.ok(!out.includes(label), `${label} must not survive`);
  }
});

test("a repetition loop collapses to the citation it started from", () => {
  const real = "He S. How far are we from a 10-year lifetime? Mater. Sci. Eng., R. 2020;140:100545.";
  const looped = real + " [Google Scholar] [PubMed]".repeat(20) + " [";
  const out = cleanReference(looped);
  assert.equal(out, real);
  assert.ok(out.length < 200, `600 characters of loop must not survive: ${out.length}`);
});

test("a clean citation is returned unchanged", () => {
  const clean = "Bryant D. Light and oxygen induced degradation. Energy Environ. Sci. 2016;9:1655-1660.";
  assert.equal(cleanReference(clean), clean);
});

test("assembleReport cleans a References section's entries", () => {
  const plan = { title: "T", sections: [{ name: "References" }] };
  const report = assembleReport(plan, {
    References: { entries: ["Smith J. A paper. Journal 2020;1:1. [DOI] [PubMed]", "   ", "[Google Scholar]"] },
  });
  assert.deepEqual(report.content.References.entries, ["Smith J. A paper. Journal 2020;1:1."]);
});
