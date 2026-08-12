import { test } from "node:test";
import assert from "node:assert/strict";
import { presentingNames, teamSize, targetSections } from "../src/ai/team.js";

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
