// Rich text — paragraphs with styled words — can be edited in place
// without losing its styling: unchanged characters keep their run, typed
// characters take the run before them (or after, at a paragraph's
// start), and paragraphs keep their alignment and bullet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRichParagraphs, paragraphsToDraft } from "../packages/editor/scene-text.js";

const rich = () => [
  { runs: [{ text: "Cells ", size: 20, color: "111111" }, { text: "fail", size: 20, color: "C0392B", bold: true }, { text: " at the interface", size: 20, color: "111111" }], align: "center" },
  { runs: [{ text: "Second ", size: 14 }, { text: "line", size: 14, italic: true }], bullet: true },
];
const view = (ps) => ps.map((p) => p.runs.map((r) => `${r.bold ? "*" : ""}${r.italic ? "_" : ""}${r.text}`));

test("an unchanged draft gives back exactly what it was given", () => {
  assert.deepEqual(buildRichParagraphs(rich(), paragraphsToDraft(rich())), rich());
});

test("typing on from a styled word continues its style; elsewhere the text around it", () => {
  const ps = buildRichParagraphs(rich(), "Cells failing at the interface\nSecond line");
  assert.deepEqual(view(ps)[0], ["Cells ", "*failing", " at the interface"]);
  const start = buildRichParagraphs(rich(), "Most cells fail at the interface\nSecond line");
  assert.deepEqual(view(start)[0], ["Most cells ", "*fail", " at the interface"], "typed at a paragraph's start takes what follows");
  const plain = buildRichParagraphs(rich(), "Cells fail at the solid interface\nSecond line");
  assert.deepEqual(view(plain)[0], ["Cells ", "*fail", " at the solid interface"]);
});

test("paragraphs split and join with their alignment and bullet", () => {
  const split = buildRichParagraphs(rich(), "Cells fail\n at the interface\nSecond line");
  assert.deepEqual(view(split), [["Cells ", "*fail"], [" at the interface"], ["Second ", "_line"]]);
  assert.deepEqual(split.map((p) => [p.align, p.bullet]), [["center", undefined], ["center", undefined], [undefined, true]]);
  const joined = buildRichParagraphs(rich(), "Cells fail at the interfaceSecond line");
  assert.equal(joined.length, 1);
  assert.deepEqual(view(joined)[0], ["Cells ", "*fail", " at the interface", "Second ", "_line"], "each part keeps its own run");
  assert.equal(joined[0].align, "center", "the joined paragraph is the first one");
});

test("deleting everything leaves one empty paragraph in the text's first style", () => {
  const ps = buildRichParagraphs(rich(), "");
  assert.equal(ps.length, 1);
  assert.deepEqual(ps[0].runs, [{ text: "", size: 20, color: "111111" }]);
});
