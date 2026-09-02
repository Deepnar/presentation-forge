import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_KEYS, initialBriefing, briefingFromPreset, applyPresetToBriefing,
  presetPayload, effectiveBriefStep, nextBriefStep, BRIEFING_QUESTIONS, REPORT_QUESTIONS,
} from "../app/web/src/lib/briefing.js";

test("PRESET_KEYS fixes team, slide counts, density, theme and branding — never guide or academic", () => {
  assert.deepEqual(PRESET_KEYS.sort(), ["branding", "density", "maxSlides", "slidesPerMember", "team", "theme"]);
  assert.ok(!PRESET_KEYS.includes("guide"));
  assert.ok(!PRESET_KEYS.includes("academic"));
});

test("initialBriefing pre-fills the guide from identity but never team or academic", () => {
  const b = initialBriefing({
    institution: { short: "EIT" },
    guide: { name: "Dr. A. Sharma", designation: "Professor" },
    team: { label: "old", members: [{ name: "Stale", presenting: true }] },
    academic: { subject: "Old", year: "2025-26" },
  });
  assert.equal(b.guide.name, "Dr. A. Sharma");
  assert.equal(b.guide.designation, "Professor");
  assert.deepEqual(b.team, { label: "", members: [] });
  assert.deepEqual(b.academic.subject, "");
  assert.equal(b.maxSlides, 0);
  assert.equal(b.slidesPerMember, null);
});

test("a preset pre-fills team, maxSlides, density, theme and branding — and not guide or academic", () => {
  const preset = {
    name: "IE preset",
    team: { label: "G2", members: [{ name: "Alice", presenting: true }] },
    maxSlides: 16,
    density: "dense",
    theme: "swiss-international",
    branding: "minimal",
    slidesPerMember: 2,
    guide: { name: "should not apply" }, // legacy shape — ignored
    academic: { subject: "should not apply" },
  };
  const b = briefingFromPreset(preset, { guide: { name: "Dr. G" } });
  assert.equal(b.team.members.length, 1);
  assert.equal(b.maxSlides, 16);
  assert.equal(b.density, "dense");
  assert.equal(b.theme, "swiss-international");
  assert.equal(b.branding, "minimal");
  assert.equal(b.slidesPerMember, 2);
  assert.equal(b.guide.name, "Dr. G"); // guide comes from identity, not the preset
  assert.equal(b.academic.subject, "");
});

test("presetPayload captures only the preset-fixable fields", () => {
  const payload = presetPayload({
    team: { label: "G", members: [{ name: "A" }] },
    maxSlides: 12,
    slidesPerMember: 2,
    theme: "x",
    density: "sparse",
    branding: "none",
    guide: { name: "G" },
    academic: { subject: "S" },
  });
  assert.equal(payload.maxSlides, 12);
  assert.equal(payload.guide, undefined);
  assert.equal(payload.academic, undefined);
});

test("a picked preset skips its fixed questions in the briefing walk", () => {
  const briefing = {
    presetId: "p1",
    team: {},
    maxSlides: 16,
    slidesPerMember: 2,
    density: "dense",
    theme: "x",
    branding: "none",
  };
  // Question order: 0 preset, 1 title, 2 team, 3 guide, 4 academic,
  // 5 thesis, 6 audience, 7 emphasis, 8 evidence, 9 theme, 10 maxSlides,
  // 11 slidesPerMember, 12 density, 13 branding, 14 research. Preset-fixed
  // are team/maxSlides/slidesPerMember/density/theme/branding.
  assert.equal(effectiveBriefStep(briefing, 2, BRIEFING_QUESTIONS), 3);  // skip team -> guide
  assert.equal(effectiveBriefStep(briefing, 9, BRIEFING_QUESTIONS), 14); // skip theme..branding -> research
  assert.equal(effectiveBriefStep(briefing, 10, BRIEFING_QUESTIONS), 14);
  assert.equal(effectiveBriefStep(briefing, 12, BRIEFING_QUESTIONS), 14);
  // Title/guide/academic/thesis/audience/emphasis/evidence are never preset-fixed.
  assert.equal(effectiveBriefStep(briefing, 1, BRIEFING_QUESTIONS), 1);
  assert.equal(effectiveBriefStep(briefing, 3, BRIEFING_QUESTIONS), 3);
  assert.equal(effectiveBriefStep(briefing, 5, BRIEFING_QUESTIONS), 5);
  assert.equal(effectiveBriefStep(briefing, 6, BRIEFING_QUESTIONS), 6);
  // An un-skipped preset question is editable without abandoning the preset.
  const rewound = { ...briefing, unskip: ["theme"] };
  assert.equal(effectiveBriefStep(rewound, 9, BRIEFING_QUESTIONS), 9);
});

test("applyPresetToBriefing refills fixed fields without touching the user's answers", () => {
  const b = {
    title: "My deck",
    audience: "the class",
    team: { label: "", members: [] },
    maxSlides: 0,
  };
  const out = applyPresetToBriefing(b, { team: { label: "G", members: [{ name: "A" }] }, maxSlides: 10 });
  assert.equal(out.title, "My deck");
  assert.equal(out.audience, "the class");
  assert.equal(out.maxSlides, 10);
  assert.equal(out.team.members.length, 1);
});

/**
 * Walk the briefing the way the view does: show the question at the effective
 * step, then store nextBriefStep(). Returns the keys in the order asked.
 *
 * The skip function was always right and its unit tests always passed — the
 * caller advanced the STORED step instead of the one on screen, so questions
 * repeated. Nothing that tested the function alone could see it; only walking
 * the whole thing can.
 */
function walk(briefing, questions, start = 0) {
  const asked = [];
  let step = start;
  for (let guard = 0; guard < questions.length * 3; guard++) {
    const eff = effectiveBriefStep(briefing, step, questions);
    if (eff >= questions.length) break;
    asked.push(questions[eff].key);
    step = nextBriefStep(briefing, step, questions);
  }
  return asked;
}

test("a briefing with no preset asks every question exactly once, in order", () => {
  const asked = walk({}, BRIEFING_QUESTIONS);
  assert.deepEqual(asked, BRIEFING_QUESTIONS.map((q) => q.key));
});

test("a preset skips the fixed questions and repeats none of the rest", () => {
  // pickPreset stores briefStep 1, so the walk resumes at the title.
  const asked = walk({ presetId: "p1" }, BRIEFING_QUESTIONS, 1);
  assert.deepEqual(asked, [
    "title", "guide", "academic", "thesis", "audience", "emphasis", "evidence", "research",
  ]);
  // The regression, stated as itself: "guide" was asked twice and "research"
  // six times, because the walk kept re-resolving to an answered question.
  assert.equal(new Set(asked).size, asked.length, `a question was asked twice: ${asked.join(" -> ")}`);
  for (const key of PRESET_KEYS) assert.ok(!asked.includes(key), `${key} is preset-fixed and must be skipped`);
});

test("the report briefing walks its own list without repeating either", () => {
  const fresh = walk({}, REPORT_QUESTIONS);
  assert.deepEqual(fresh, REPORT_QUESTIONS.map((q) => q.key));
  const withPreset = walk({ presetId: "p1" }, REPORT_QUESTIONS, 1);
  assert.equal(new Set(withPreset).size, withPreset.length, `a question was asked twice: ${withPreset.join(" -> ")}`);
});

test("an un-skipped question is asked once, not twice, on the way past", () => {
  const asked = walk({ presetId: "p1", unskip: ["theme"] }, BRIEFING_QUESTIONS, 1);
  assert.ok(asked.includes("theme"), "a rewound preset field must be asked again");
  assert.equal(new Set(asked).size, asked.length, `a question was asked twice: ${asked.join(" -> ")}`);
});
