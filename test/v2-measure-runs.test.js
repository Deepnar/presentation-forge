// The editor measures text as it is drawn: bold counted, styled words in
// their own type, each paragraph at its own pitch — so grow-to-fit, the
// overflow notice and the resize floor are right for text styled from
// the toolbar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureText, overflowEstimate } from "../packages/editor/scene-text.js";

const box = (paragraphs, w = 4, h = 3) => ({ id: "t", kind: "text", x: 1, y: 1, w, h, z: 0, provenance: "human", paragraphs });
const words = "measure ".repeat(14).trim();

test("bold set from the toolbar is measured as bold", () => {
  // bold:true measures exactly as an explicit 700 weight at every width,
  // and somewhere in a sweep of widths it wraps where regular does not.
  let differs = false;
  for (let w = 2; w <= 6; w += 0.05) {
    const flag = measureText(box([{ runs: [{ text: words, size: 18, bold: true }] }], w));
    const weight = measureText(box([{ runs: [{ text: words, size: 18, weight: 700 }] }], w));
    const plain = measureText(box([{ runs: [{ text: words, size: 18 }] }], w));
    assert.equal(flag.lines, weight.lines, `at ${w.toFixed(2)}in`);
    if (flag.lines !== plain.lines) differs = true;
  }
  assert.ok(differs, "bold is wider than regular somewhere");
});

test("styled words are measured in their own type", () => {
  // The same words, the second half at 36pt: more lines than all at 14pt.
  const small = measureText(box([{ runs: [{ text: `${words} ${words}`, size: 14 }] }]));
  const mixed = measureText(box([{ runs: [{ text: `${words} `, size: 14 }, { text: words, size: 36 }] }]));
  assert.ok(mixed.lines > small.lines, `${mixed.lines} > ${small.lines}`);
});

test("each paragraph takes its own line pitch", () => {
  const m = measureText(box([{ runs: [{ text: "Title", size: 40 }] }, { runs: [{ text: "note", size: 12 }] }], 6));
  const pitch = (pt) => (pt / 72) * 1.35;
  assert.ok(Math.abs(m.height - (pitch(40) + pitch(12))) < 1e-9, "40pt line plus 12pt line, not two 40pt lines");
  // A box just tall enough for that fits; it would not if both lines were 40pt.
  assert.equal(overflowEstimate(box([{ runs: [{ text: "Title", size: 40 }] }, { runs: [{ text: "note", size: 12 }] }], 6, pitch(40) + pitch(12) + 0.01)).fits, true);
});
