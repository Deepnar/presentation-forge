import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_KEYS, initialBriefing, briefingFromPreset, applyPresetToBriefing,
  presetPayload, effectiveBriefStep, BRIEFING_QUESTIONS,
} from "../app/web/src/lib/briefing.js";

test("PRESET_KEYS fixes team, density, theme and branding — never guide or academic", () => {
  assert.deepEqual(PRESET_KEYS.sort(), ["branding", "density", "team", "theme"]);
  assert.ok(!PRESET_KEYS.includes("guide"));
  assert.ok(!PRESET_KEYS.includes("academic"));
  // legacy presets still carry maxSlides/slidesPerMember but they are collapsed into density
  assert.ok(!PRESET_KEYS.includes("maxSlides"));
  assert.ok(!PRESET_KEYS.includes("slidesPerMember"));
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
    density: "dense",
    theme: "x",
    branding: "none",
  };
  // Question order (thesis-driven): 0 preset, 1 title, 2 thesis, 3 audience,
  // 4 emphasis, 5 evidence, 6 theme, 7 density, 8 research. Preset-fixed are
  // theme/density/branding (team is preset-stored but not asked). Skipped from
  // the current step onward.
  assert.equal(effectiveBriefStep(briefing, 6, BRIEFING_QUESTIONS), 8); // skip theme+ density → research
  assert.equal(effectiveBriefStep(briefing, 7, BRIEFING_QUESTIONS), 8); // skip density → research
  // Title/thesis/audience/emphasis/evidence are never preset-fixed.
  assert.equal(effectiveBriefStep(briefing, 1, BRIEFING_QUESTIONS), 1);
  assert.equal(effectiveBriefStep(briefing, 2, BRIEFING_QUESTIONS), 2);
  assert.equal(effectiveBriefStep(briefing, 3, BRIEFING_QUESTIONS), 3);
  assert.equal(effectiveBriefStep(briefing, 4, BRIEFING_QUESTIONS), 4);
  assert.equal(effectiveBriefStep(briefing, 5, BRIEFING_QUESTIONS), 5);
  assert.equal(effectiveBriefStep(briefing, 8, BRIEFING_QUESTIONS), 8);
  // An un-skipped preset question is editable without abandoning the preset.
  const rewound = { ...briefing, unskip: ["theme"] };
  assert.equal(effectiveBriefStep(rewound, 6, BRIEFING_QUESTIONS), 6);
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
