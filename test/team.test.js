import { test } from "node:test";
import assert from "node:assert/strict";
import { presentingNames, teamSize, targetSections, distributePresenters, DIVIDER_TYPES } from "../src/ai/team.js";

const team = (members) => ({ team: { label: "G1", members } });

test("presentingNames returns the presenting members, in order", () => {
  const id = team([
    { name: "A", presenting: true },
    { name: "B", presenting: false },
    { name: "C", presenting: true },
  ]);
  assert.deepEqual(presentingNames(id), ["A", "C"]);
});

test("presentingNames falls back to every named member when nobody is ticked", () => {
  const id = team([
    { name: "A", presenting: false },
    { name: "B", presenting: false },
  ]);
  assert.deepEqual(presentingNames(id), ["A", "B"]);
});

test("presentingNames ignores the placeholder empty-name members of a fresh identity", () => {
  const id = team([
    { name: "", presenting: true },
    { name: "A", presenting: true },
    { name: "", presenting: false },
  ]);
  assert.deepEqual(presentingNames(id), ["A"]);
});

test("teamSize counts named members, never the padding placeholders", () => {
  assert.equal(teamSize(team([{ name: "A" }, { name: "B" }])), 2);
  assert.equal(teamSize(team([{ name: "" }, { name: "" }])), 1);
  assert.equal(teamSize({}), 1);
});

test("targetSections clamps the team size into 3..8", () => {
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }])), 3);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }])), 3);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }])), 4);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }])), 5);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }])), 8);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }, { name: "F" }, { name: "G" }, { name: "H" }, { name: "I" }])), 8);
});

test("targetSections honours a custom floor — a report's graded core", () => {
  assert.equal(targetSections(team([{ name: "A" }]), { min: 4 }), 4);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }]), { min: 4 }), 4);
  assert.equal(targetSections(team([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }]), { min: 4 }), 4);
});

/* ---------------------------------------------- presenter distribution */

// A helper deck: interleave dividers with content so the returned assignment
// can be checked for both contiguity and divider-avoidance.
function deckOf(contentBySection) {
  const slides = [{ type: "title", section: 0 }];
  contentBySection.forEach((content, sec) => {
    slides.push({ type: "section", section: sec });
    for (const type of content) slides.push({ type, section: sec });
  });
  slides.push({ type: "closing", section: contentBySection.length - 1 });
  return slides;
}

const presenterAt = (assignment) => assignment.filter(Boolean);
const blocks = (assignment) => {
  // A member's block is contiguous in deck order: the section dividers that
  // open/close it carry no presenter, so contiguity means the presenter's runs
  // over the CONTENT sequence (dividers stripped) are uninterrupted.
  const content = assignment.filter(Boolean);
  const out = [];
  let cur = null;
  for (const p of content) {
    if (cur && cur.name === p) cur.count++;
    else { if (cur) out.push(cur); cur = { name: p, count: 1 }; }
  }
  if (cur) out.push(cur);
  return out;
};

test("5 members / 5 sections → each member presents their own section", () => {
  const slides = deckOf([["bullets", "bullets"], ["bullets"], ["bullets"], ["bullets"], ["bullets"]]);
  const a = distributePresenters(slides, ["M1", "M2", "M3", "M4", "M5"]);
  // Dividers carry nothing: title and every section divider are null.
  assert.equal(a[0], null);
  assert.equal(a[1], null);
  assert.deepEqual(a.slice(-1), [null]);          // closing divider
  const b = blocks(a);
  assert.equal(b.length, 5, "five members, five contiguous blocks");
  assert.deepEqual(b.map((x) => x.name), ["M1", "M2", "M3", "M4", "M5"]);
  assert.equal(b[0].count, 2, "section 0 carries two slides");
});

test("3 members / 8 content slides → balanced contiguous blocks", () => {
  // Sections of [3, 3, 2] → members get 3, 3, 2 slides, each one block.
  const slides = deckOf([["bullets", "bullets", "bullets"], ["bullets", "bullets", "bullets"], ["bullets", "bullets"]]);
  const a = distributePresenters(slides, ["A", "B", "C"]);
  const b = blocks(a);
  assert.deepEqual(b.map((x) => [x.name, x.count]), [["A", 3], ["B", 3], ["C", 2]]);
  // Balance: block sizes differ by at most one.
  const counts = b.map((x) => x.count).sort((p, q) => p - q);
  assert.ok(counts[counts.length - 1] - counts[0] <= 1);
});

test("a section is never split between two members", () => {
  const slides = deckOf([["bullets", "bullets"], ["bullets", "bullets", "bullets"], ["bullets"]]);
  const a = distributePresenters(slides, ["A", "B"]);
  // Section 0 (2 bullets, indices 2,3) is wholly A's; section 1 (indices 5-7)
  // and section 2 (index 9) are wholly B's — no section straddles a boundary.
  assert.equal(a[2], "A");
  assert.equal(a[3], "A");
  for (const i of [5, 6, 7, 9]) assert.equal(a[i], "B", `slide ${i} should be B's`);
  assert.equal(blocks(a).length, 2, "two members, two blocks");
});

test("fewer members than sections: no one gets 2+ while another gets 0", () => {
  const slides = deckOf([["bullets"], ["bullets"], ["bullets"], ["bullets"]]);
  const a = distributePresenters(slides, ["A", "B", "C"]);
  const counts = blocks(a).map((x) => x.count);
  // 4 content slides across 3 members → 2,1,1 — nobody idle, no one doubled up
  // while another has nothing.
  assert.deepEqual(counts.sort((p, q) => p - q), [1, 1, 2]);
});

test("0 presenting members → no presenters", () => {
  const slides = deckOf([["bullets", "bullets"], ["bullets"]]);
  assert.deepEqual(distributePresenters(slides, []), slides.map(() => null));
});

test("divider-only deck → no presenters", () => {
  const slides = [
    { type: "title", section: 0 },
    { type: "section", section: 0 },
    { type: "chapter", section: 0 },
    { type: "closing", section: 0 },
  ];
  assert.deepEqual(distributePresenters(slides, ["A", "B"]), [null, null, null, null]);
});

test("a slidesPerMember override still produces contiguous blocks", () => {
  const slides = deckOf([["bullets"], ["bullets"], ["bullets"], ["bullets"], ["bullets"], ["bullets"]]);
  const a = distributePresenters(slides, ["A", "B", "C"], { slidesPerMember: 2 });
  const b = blocks(a);
  assert.deepEqual(b.map((x) => [x.name, x.count]), [["A", 2], ["B", 2], ["C", 2]]);
});

test("dividers are never assigned a presenter", () => {
  const slides = deckOf([["bullets"], ["bullets"], ["bullets"]]);
  const a = distributePresenters(slides, ["A", "B", "C"]);
  for (const [i, s] of slides.entries()) {
    if (DIVIDER_TYPES.has(s.type)) assert.equal(a[i], null, `divider at ${i} must be null`);
  }
});
