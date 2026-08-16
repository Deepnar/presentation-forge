import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFloorProblems, shortenString, trimSlide } from "../src/ai/trim.js";

test("parseFloorProblems extracts slide indexes and roles from render problems", () => {
  const problems = [
    "slide 6 (feature-grid): body would need 8.1pt — floor 14pt (cut text, don't shrink)",
    "slide 2 (agenda): subhead would need 9.3pt — floor 14pt (cut text, don't shrink)",
    "slide 6 (feature-grid): caption would need 7.2pt — floor 12pt (cut text, don't shrink)",
    "slide 14 (compare): no renderer for type \"nope\"",
  ];
  const map = parseFloorProblems(problems);
  assert.deepEqual([...map.keys()], [5, 1]);
  assert.deepEqual([...map.get(5)].sort(), ["body", "caption"]);
  assert.deepEqual([...map.get(1)], ["subhead"]);
});

test("parseFloorProblems ignores non-floor problems and empty input", () => {
  assert.equal(parseFloorProblems([]).size, 0);
  assert.equal(parseFloorProblems(["slide 3 (cards): no renderer for type"]).size, 0);
});

test("shortenString cuts prose at a sentence boundary with an ellipsis", () => {
  const s = "First impressions form within four seconds of contact. Your posture, gaze, and tone arrive together.";
  const out = shortenString(s);
  assert.ok(out.length < s.length, "must get shorter");
  assert.ok(out.endsWith("…"), "must end with an ellipsis");
  assert.ok(s.includes(out.slice(0, -1)), "must be a prefix of the original");
  assert.ok(out.endsWith("contact…"), "must stop at a sentence boundary, not a word");
});

test("shortenString refuses to cut mid-sentence — no 'the…' ever", () => {
  // No sentence end inside the cut window → the field is left alone, never
  // chopped at a word boundary into a fragment.
  const s = "MPI ranks own NUMA domains and OpenMP threads share the same rank memory across every level";
  assert.equal(shortenString(s), null);
  // A comma is not a sentence end either.
  assert.equal(shortenString("One rank per NUMA domain, not per core of the machine at all really"), null);
});

test("shortenString refuses short strings and single tokens", () => {
  assert.equal(shortenString("short"), null);
  assert.equal(shortenString("53kWh"), null);
  assert.equal(shortenString(""), null);
});

test("trimSlide drops the last bullet before shortening, and never below minItems", async () => {
  let slide = {
    type: "bullets",
    presenter: "P",
    section: 2,
    headline: "Key mechanisms",
    bullets: [
      "First impressions form within four seconds of contact. Faster than most people assume, the read lands early.",
      "Your posture, gaze, and tone arrive together as one signal. The listener reads all three channels at once.",
      "A warm open stance reads as approachable. Crossed arms and a turned shoulder signal the opposite.",
      "Eye contact length and frequency change trust. The balance shifts the whole feel of an exchange.",
      "Mirror-image postures between speakers mark rapport. The pair quietly synchronise as they talk.",
      "The full channel set is live at once. Sight, hearing, smell, touch and taste all contribute.",
    ],
  };
  // Six bullets, minItems 4 → two drops allowed, then it must shorten instead.
  for (let i = 0; i < 2; i++) {
    const next = await trimSlide(slide);
    assert.ok(next, "still droppable");
    assert.equal(next.type, "bullets");
    assert.equal(next.presenter, "P");
    assert.equal(next.section, 2);
    assert.equal(next.bullets.length, slide.bullets.length - 1, "one bullet dropped");
    slide = next;
  }
  assert.equal(slide.bullets.length, 4, "at minItems");
  const next = await trimSlide(slide);
  assert.ok(next, "now shortens instead of dropping");
  assert.equal(next.bullets.length, 4, "minItems is a floor, not a drop target");
  assert.ok(next.bullets.some((b) => b.length < slide.bullets[slide.bullets.length - 1].length));
});

test("trimSlide drops the lowest-value item first (the trailing element)", async () => {
  const slide = {
    type: "cards",
    headline: "Four approaches",
    cards: [
      { title: "A", body: "first card body" },
      { title: "B", body: "second card body" },
      { title: "C", body: "third card body" },
      { title: "D", body: "fourth card body" },
    ],
  };
  const next = await trimSlide(slide);
  assert.equal(next.cards.length, 3);
  assert.equal(next.cards.at(-1).title, "C", "the trailing card went first");
});

test("trimSlide shortens a scalar body when there is no array to drop", async () => {
  const slide = {
    type: "callout",
    label: "Key point",
    body: "A long callout body that genuinely runs on and on past any reasonable single-slide budget. It needs to be cut down to a sentence that still fits.",
  };
  const next = await trimSlide(slide);
  assert.equal(next.type, "callout");
  assert.ok(next.body.length < slide.body.length, "body shortened");
  assert.ok(next.body.endsWith("…"));
});

test("trimSlide touches nested side bodies on a compare slide", async () => {
  const slide = {
    type: "compare",
    headline: "In person vs on screen",
    left: {
      title: "In Person",
      body: "A deliberately long left-column body full of words. It clearly exceeds the length the column is worth trimming by this pass.",
      points: ["one"],
    },
    right: {
      title: "On Screen",
      body: "A deliberately long right-column body full of words. It clearly exceeds the length the column is worth trimming by this pass.",
    },
  };
  // left.points can drop (minItems 0); then the longest body shortens.
  const dropped = await trimSlide(slide);
  assert.deepEqual(dropped.left.points, []);
  const next = await trimSlide(dropped);
  assert.ok(next.left.body.length < dropped.left.body.length || next.right.body.length < dropped.right.body.length);
});

test("trimSlide returns null when nothing more can be trimmed", async () => {
  const slide = {
    type: "bullets",
    headline: "Minimal",
    bullets: ["a", "b"],
  };
  assert.equal(await trimSlide(slide), null);
});
