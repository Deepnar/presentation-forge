import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureStructuralSlides, trimContentToBudget, mintContentSlides, placeholderFor } from "../src/ai/generate.js";
import { distributePresenters, DIVIDER_TYPES } from "../src/ai/team.js";
import { validateDeck } from "../src/validate.js";

const content = (section) => ({ type: "bullets", section, purpose: "a point" });

/** planDeck's post-processing, replayed here without a model. */
function finalize(slides, sections, contentCap, mint = {}) {
  let out = [...slides];
  if (out.length && out[0].type !== "title") out.unshift({ type: "title", purpose: "Open the deck.", section: 0 });
  out = trimContentToBudget(out, contentCap);
  out = mintContentSlides(out, sections, contentCap, mint);
  return ensureStructuralSlides(out, sections);
}

test("ensureStructuralSlides opens the deck with a title", () => {
  const out = ensureStructuralSlides([content(0), content(0)], ["Intro"]);
  assert.equal(out[0].type, "title");
  assert.equal(out[0].section, 0);
});

test("ensureStructuralSlides adds one divider per content-bearing section, placed before its first content slide", () => {
  const out = ensureStructuralSlides([
    content(0), content(0),
    content(1), content(1), content(1),
  ], ["A", "B"]);
  assert.deepEqual(out.map((s) => s.type), ["title", "section", "bullets", "bullets", "section", "bullets", "bullets", "bullets", "closing"]);
  assert.deepEqual(out.map((s) => s.section), [0, 0, 0, 0, 1, 1, 1, 1, 1]);
});

test("ensureStructuralSlides ends with a closing slide", () => {
  const out = ensureStructuralSlides([content(0)], ["A"]);
  assert.equal(out[out.length - 1].type, "closing");
});

test("ensureStructuralSlides does not duplicate an existing section opener", () => {
  const given = [
    { type: "title", section: 0 },
    { type: "section", section: 0, purpose: "open" },
    content(0),
    { type: "closing", section: 0 },
  ];
  const out = ensureStructuralSlides(given, ["A"]);
  assert.equal(out.filter((s) => s.type === "section").length, 1, "one opener, not two");
  assert.equal(out.filter((s) => s.type === "closing").length, 1);
});

test("ensureStructuralSlides skips a named-but-empty section — no blank page", () => {
  const out = ensureStructuralSlides([content(0), content(1)], ["A", "B", "C"]);
  const secTypes = out.filter((s) => s.type === "section").length;
  assert.equal(secTypes, 2, "dividers only for sections 0 and 1, never the empty section 2");
});

test("trimContentToBudget drops trailing content slides, never dividers", () => {
  const given = [
    { type: "title", section: 0 },
    content(0), content(0), content(0),
    { type: "closing", section: 0 },
  ];
  const out = trimContentToBudget(given, 2);
  assert.equal(out.filter((s) => !DIVIDER_TYPES.has(s.type)).length, 2, "content cut to budget");
  assert.equal(out[0].type, "title", "structure survives");
  assert.equal(out[out.length - 1].type, "closing", "structure survives");
  assert.deepEqual(out.map((s) => s.type), ["title", "bullets", "bullets", "closing"]);
});

test("trimContentToBudget leaves a deck already within budget untouched", () => {
  const given = [content(0), content(1)];
  assert.deepEqual(trimContentToBudget(given, 5), given);
});

test("finalize on an over-produced team deck: 11 members × 1-per-member, 11 max → exactly 11 content slides + structure", () => {
  // The model overshoots: 16 content slides across 8 sections. After the cap
  // trims to 11 and structure is enforced, the plan must be title + 8 section
  // dividers + 11 content + closing — and every one of the 11 members gets
  // exactly one content slide at generation.
  const overshot = Array.from({ length: 16 }, (_, i) => content(i % 8));
  const sections = Array.from({ length: 8 }, (_, i) => `Part ${i + 1}`);
  const plan = finalize(overshot, sections, 11);

  const contentSlides = plan.filter((s) => !DIVIDER_TYPES.has(s.type));
  const names = Array.from({ length: 11 }, (_, i) => `M${i + 1}`);
  const assignment = distributePresenters(plan, names, { slidesPerMember: 1 });

  assert.equal(contentSlides.length, 11, "content capped at the 11-slide budget");
  assert.equal(plan[0].type, "title");
  assert.equal(plan.filter((s) => s.type === "section").length, 8, "every part opens with a divider");
  assert.equal(plan[plan.length - 1].type, "closing");
  const counts = names.map((name) => assignment.filter((p) => p === name).length);
  assert.deepEqual(counts, names.map(() => 1), "every member exactly one content slide");
});

test("finalize on an under-produced team deck: 9 content slides for 11 members mint up to exactly 11, one per member, closing last", () => {
  const under = Array.from({ length: 9 }, (_, i) => content(i % 3));
  const plan = finalize(under, ["A", "B", "C"], 11, { members: 11, slidesPerMember: 1 });
  const names = Array.from({ length: 11 }, (_, i) => `M${i + 1}`);
  const assignment = distributePresenters(plan, names, { slidesPerMember: 1 });

  const contentSlides = plan.filter((s) => !DIVIDER_TYPES.has(s.type));
  assert.equal(contentSlides.length, 11, "9 under-produced slides mint up to the 11-slide budget");
  assert.equal(plan[plan.length - 1].type, "closing", "closing still ends the deck");
  const counts = names.map((name) => assignment.filter((p) => p === name).length);
  assert.deepEqual(counts, names.map(() => 1), "every member exactly one content slide");
});

test("finalize on the reported failure: 10 content slides across 8 sections, 11 members × 1 → the missing 11th content slide is minted so the LAST member is never stranded", () => {
  // The observed defect: 8 sections, 10 content slides, 11 presenting members —
  // the deck jumped from member 10's slide straight to the closing, and member
  // 11 (Dhwani) presented nothing.
  const natural = Array.from({ length: 10 }, (_, i) => content(i % 8));
  const sections = Array.from({ length: 8 }, (_, i) => `Part ${i + 1}`);
  const plan = finalize(natural, sections, 11, { members: 11, slidesPerMember: 1 });
  const names = Array.from({ length: 11 }, (_, i) => `M${i + 1}`);
  const assignment = distributePresenters(plan, names, { slidesPerMember: 1 });

  const contentSlides = plan.filter((s) => !DIVIDER_TYPES.has(s.type));
  assert.equal(contentSlides.length, 11, "one content slide per presenting member");
  const counts = names.map((name) => assignment.filter((p) => p === name).length);
  assert.deepEqual(counts, names.map(() => 1), "every member including the last presents exactly one slide");
  assert.equal(plan[plan.length - 1].type, "closing", "closing is last, after the final member's slide");
});

test("mintContentSlides without a briefing target still gives every member at least one when members exceed content", () => {
  const under = Array.from({ length: 3 }, (_, i) => content(i));
  const plan = finalize(under, ["A", "B", "C"], 24, { members: 5, slidesPerMember: null });
  const names = Array.from({ length: 5 }, (_, i) => `M${i + 1}`);
  const assignment = distributePresenters(plan, names);

  const contentSlides = plan.filter((s) => !DIVIDER_TYPES.has(s.type));
  assert.equal(contentSlides.length, 5, "3 natural content slides mint up to one per member");
  const counts = names.map((name) => assignment.filter((p) => p === name).length);
  for (const c of counts) assert.ok(c >= 1, `every member gets at least one (got ${counts.join(",")})`);
});

test("mintContentSlides never exceeds the budget when the team is bigger than the cap", () => {
  const under = Array.from({ length: 4 }, (_, i) => content(i));
  const plan = finalize(under, ["A", "B", "C"], 6, { members: 11, slidesPerMember: 1 });
  const contentSlides = plan.filter((s) => !DIVIDER_TYPES.has(s.type));
  assert.equal(contentSlides.length, 6, "a mint is bounded by the content cap, not the team");
});

test("placeholderFor keeps a failed content slide as a validating bullets slide", async () => {
  const spec = { type: "roadmap", section: 2, purpose: "Show the phased path to cost parity: scale manufacturing, raise efficiency, extend stack life." };
  const p = placeholderFor(spec);
  assert.equal(p.type, "bullets");
  assert.equal(p.section, 2);
  const { ok } = await validateDeck({ title: "T", slides: [p] });
  assert.ok(ok, "placeholder must validate — a dropped slide would break the promised member count");
});

test("placeholderFor keeps a failed DIVIDER spec a divider, never a content slide", async () => {
  for (const type of ["title", "section", "closing", "epigraph"]) {
    const p = placeholderFor({ type, section: 0, purpose: "Open the deck." });
    assert.ok(DIVIDER_TYPES.has(p.type), `${type} placeholder stays a divider`);
    assert.notEqual(p.type, "bullets");
    const { ok } = await validateDeck({ title: "T", slides: [p] });
    assert.ok(ok, `${type} placeholder must validate`);
  }
});
