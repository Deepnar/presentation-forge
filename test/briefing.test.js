import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_KEYS, initialBriefing, briefingFromPreset, applyPresetToBriefing,
  presetPayload, effectiveBriefStep, BRIEFING_QUESTIONS,
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
  // 5 audience, 6 emphasis, 7 theme, 8 maxSlides, 9 slidesPerMember,
  // 10 density, 11 branding, 12 research. Preset-fixed questions are skipped
  // from the current step onward.
  assert.equal(effectiveBriefStep(briefing, 2, BRIEFING_QUESTIONS), 3);  // skip team
  assert.equal(effectiveBriefStep(briefing, 7, BRIEFING_QUESTIONS), 12); // skip theme..branding
  assert.equal(effectiveBriefStep(briefing, 11, BRIEFING_QUESTIONS), 12);
  // Title/guide/academic/audience/emphasis are never preset-fixed.
  assert.equal(effectiveBriefStep(briefing, 1, BRIEFING_QUESTIONS), 1);
  assert.equal(effectiveBriefStep(briefing, 3, BRIEFING_QUESTIONS), 3);
  assert.equal(effectiveBriefStep(briefing, 5, BRIEFING_QUESTIONS), 5);
  // An un-skipped preset question is editable without abandoning the preset.
  const rewound = { ...briefing, unskip: ["theme"] };
  assert.equal(effectiveBriefStep(rewound, 7, BRIEFING_QUESTIONS), 7);
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
