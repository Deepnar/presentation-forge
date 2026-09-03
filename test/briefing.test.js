import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_KEYS, initialBriefing, briefingFromPreset, applyPresetToBriefing,
  presetPayload, effectiveBriefStep, nextBriefStep, BRIEFING_QUESTIONS, REPORT_QUESTIONS,
  questionsFor, tierQuestions, optionalAnswered,
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
  // Derived from the list, never from hardcoded positions: this test named
  // "0 preset, 1 title, 2 team…" and broke the moment the questions were
  // retiered, which tested the ordering rather than the skipping.
  const at = (key) => BRIEFING_QUESTIONS.findIndex((q) => q.key === key);
  const keyAt = (i) => BRIEFING_QUESTIONS[i]?.key ?? "(end)";

  // From a preset-fixed question, the walk lands on the next question that is
  // not preset-fixed — whatever that happens to be after a reorder.
  for (const fixed of PRESET_KEYS) {
    const landed = effectiveBriefStep(briefing, at(fixed), BRIEFING_QUESTIONS);
    assert.ok(landed > at(fixed), `${fixed} is preset-fixed and must be stepped over`);
    const key = keyAt(landed);
    assert.ok(key === "(end)" || !PRESET_KEYS.includes(key), `landed on ${key}, which is also preset-fixed`);
  }

  // A question a preset never fixes is not moved at all.
  for (const open of BRIEFING_QUESTIONS.map((q) => q.key).filter((k) => !PRESET_KEYS.includes(k))) {
    assert.equal(effectiveBriefStep(briefing, at(open), BRIEFING_QUESTIONS), at(open), `${open} must not be skipped`);
  }

  // An un-skipped preset question is editable without abandoning the preset.
  const rewound = { ...briefing, unskip: ["theme"] };
  assert.equal(effectiveBriefStep(rewound, at("theme"), BRIEFING_QUESTIONS), at("theme"));
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
  // pickPreset stores briefStep 1, so the walk resumes after the preset card.
  const asked = walk({ presetId: "p1" }, BRIEFING_QUESTIONS, 1);
  const expected = BRIEFING_QUESTIONS.slice(1).map((q) => q.key).filter((k) => !PRESET_KEYS.includes(k));
  assert.deepEqual(asked, expected);
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

/**
 * The two tiers.
 *
 * The briefing was fifteen questions walked one card at a time, and a user who
 * answered none of them still clicked through all fifteen. The tier is what
 * lets the surface render each group as one form instead of a sequence, so
 * these assert the split itself rather than any particular ordering.
 */

test("every question declares a tier, and required stays small enough to be one card", () => {
  for (const list of [BRIEFING_QUESTIONS, REPORT_QUESTIONS]) {
    for (const q of list) {
      assert.ok(q.tier === "required" || q.tier === "optional", `${q.key} has no tier`);
    }
  }
  // The point of the split is that the first screen is answerable at a glance.
  assert.ok(tierQuestions("deck", "required", {}, []).length <= 5);
  assert.ok(tierQuestions("report", "required", {}, []).length <= 5);
});

test("the preset question disappears when the account has no presets", () => {
  // "Use a saved format, or start fresh?" offered exactly one answer on a new
  // account — a question that cannot be answered two ways is not a question.
  assert.ok(!tierQuestions("deck", "required", {}, []).some((q) => q.key === "preset"));
  assert.ok(tierQuestions("deck", "required", {}, [{ id: "p1" }]).some((q) => q.key === "preset"));
});

test("a chosen preset drops the fields it fixes out of the required tier", () => {
  const withPreset = tierQuestions("deck", "required", { presetId: "p1" }, [{ id: "p1" }]).map((q) => q.key);
  for (const key of PRESET_KEYS) assert.ok(!withPreset.includes(key), `${key} is preset-fixed`);
  // ...and rewinding one brings it back, so a preset is a starting point rather
  // than a lock.
  const rewound = tierQuestions("deck", "required", { presetId: "p1", unskip: ["theme"] }, [{ id: "p1" }]).map((q) => q.key);
  assert.ok(rewound.includes("theme"));
});

test("no question is in both tiers, and every question is in one", () => {
  for (const kind of ["deck", "report"]) {
    const all = questionsFor(kind).map((q) => q.key);
    const req = tierQuestions(kind, "required", {}, [{ id: "p1" }]).map((q) => q.key);
    const opt = tierQuestions(kind, "optional", {}, [{ id: "p1" }]).map((q) => q.key);
    assert.deepEqual([...req, ...opt].sort(), [...all].sort(), `${kind}: the tiers must partition the questions`);
    assert.deepEqual(req.filter((k) => opt.includes(k)), [], `${kind}: a question is in both tiers`);
  }
});

test("optionalAnswered counts only answers actually given", () => {
  assert.equal(optionalAnswered("deck", {}), 0);
  assert.equal(optionalAnswered("deck", { title: "   ", thesis: "" }), 0, "whitespace is not an answer");
  assert.equal(optionalAnswered("deck", { title: "Solar", thesis: "It scales" }), 2);
  // The shaped fields count only when they carry something real — an empty
  // team is what made the summary read "0 members" as though it were an answer.
  assert.equal(optionalAnswered("deck", { team: { members: [] } }), 0);
  assert.equal(optionalAnswered("deck", { team: { members: [{ name: "A" }] } }), 1);
  assert.equal(optionalAnswered("deck", { guide: { name: "" } }), 0);
  assert.equal(optionalAnswered("deck", { academic: { subject: "", year: "" } }), 0);
});
