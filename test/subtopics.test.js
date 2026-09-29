import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SUBTOPICS,
  clampSubtopics,
  subtopicCountFor,
  sanitizeSubtopics,
  ownersFor,
  planSubtopics,
} from "../src/ai/subtopics.js";

/**
 * The split before the research.
 *
 * Subtopics come from the model's own structuring judgement — no web, no
 * notes — and research runs per subtopic afterwards. The count follows the
 * presenting team (or an explicit solo count), and one member may own several
 * parts: contiguity is required, 1:1 is not.
 */

const identityWith = (names) => ({
  team: { members: names.map((name) => ({ name, presenting: true })) },
});

test("the count follows the presenting team, clamped to the renderer ceiling", () => {
  assert.equal(subtopicCountFor({ identity: identityWith(["A", "B", "C"]) }), 3);
  assert.equal(subtopicCountFor({ identity: identityWith(Array.from({ length: 10 }, (_, i) => `M${i}`)) }), MAX_SUBTOPICS);
  assert.equal(subtopicCountFor({ identity: identityWith([]) }), 3);
  assert.equal(subtopicCountFor({}), 3);
});

test("solo mode takes the explicit count instead of the team", () => {
  assert.equal(subtopicCountFor({ mode: "solo", subtopicCount: 12 }), MAX_SUBTOPICS);
  assert.equal(subtopicCountFor({ mode: "solo", subtopicCount: 5 }), 5);
  assert.equal(subtopicCountFor({ mode: "solo" }), 6);
  assert.equal(clampSubtopics(0), 1);
});

test("an explicit part count wins over the team size in either mode", () => {
  assert.equal(subtopicCountFor({ identity: identityWith(["A", "B", "C"]), subtopicCount: 6 }), 6);
  assert.equal(subtopicCountFor({ mode: "solo", subtopicCount: 2 }), 2);
});

test("sanitize drops title-less, focus-less and duplicate parts", () => {
  const out = sanitizeSubtopics([
    { title: "Cells", focus: "How they work." },
    { title: "cells", focus: "Duplicate." },
    { title: "Grid", focus: "" },
    { title: "", focus: "No title." },
    { title: "Costs", focus: "What they are." },
  ]);
  assert.deepEqual(out.map((s) => s.title), ["Cells", "Costs"]);
});

test("owners are contiguous shares — one member may own several parts", () => {
  assert.deepEqual(ownersFor([1, 2, 3, 4, 5, 6], ["A", "B", "C"]), ["A", "A", "B", "B", "C", "C"]);
  assert.deepEqual(ownersFor([1, 2, 3], ["A", "B", "C"]), ["A", "B", "C"]);
  assert.deepEqual(ownersFor([1, 2, 3, 4], ["Solo"]), ["Solo", "Solo", "Solo", "Solo"]);
  assert.deepEqual(ownersFor([1, 2], []), [null, null]);
});

test("fewer parts than people still covers the first members one each", () => {
  assert.deepEqual(
    ownersFor([1, 2, 3, 4, 5], ["A", "B", "C", "D", "E", "F", "G"]),
    ["A", "B", "C", "D", "E"],
  );
});

test("planSubtopics sends no research — the split is knowledge-only", async () => {
  let seen = null;
  const chat = async (opts) => {
    seen = opts;
    return {
      model: "stub",
      data: {
        title: "Cells",
        subtopics: [
          { title: "Intro", focus: "Why cells matter." },
          { title: "Cells", focus: "How they work." },
        ],
      },
    };
  };
  const { subtopics, stats } = await planSubtopics({
    brief: "Perovskite cells", identity: identityWith(["A", "B"]), count: 2, chat,
  });
  assert.equal(subtopics.length, 2);
  assert.equal(stats.want, 2);
  const userText = seen.messages.map((m) => String(m.content)).join("\n");
  assert.ok(!/RESEARCH NOTES/.test(userText), "research must not reach the split");
  assert.ok(!/RESEARCH NOTES/.test(seen.messages[0].content));
});

test("planSubtopics retries once when the split comes back thin", async () => {
  let calls = 0;
  const chat = async () => {
    calls++;
    return {
      model: "stub",
      data: calls === 1
        ? { title: "T", subtopics: [{ title: "Only", focus: "One part." }] }
        : { title: "T", subtopics: [
          { title: "One", focus: "First." },
          { title: "Two", focus: "Second." },
          { title: "Three", focus: "Third." },
        ] },
    };
  };
  const { subtopics } = await planSubtopics({ brief: "T", count: 3, chat });
  assert.equal(calls, 2);
  assert.equal(subtopics.length, 3);
});
