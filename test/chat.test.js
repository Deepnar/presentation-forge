import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonl,
  serializeJsonl,
  retireOldTurns,
  buildReplayHistory,
  maintainThreadState,
  assembleInstruction,
  RECENT_WINDOW,
} from "../src/ai/chat.js";

test("chat.jsonl round-trips through parse/serialize", () => {
  const records = [
    { type: "summary", text: "deck was built" },
    { type: "turn", id: "u-1", role: "user", instruction: "make slide 4 punchier" },
    { type: "turn", id: "a-1", role: "assistant", changes: ["~ slide 4 (bullets)"] },
  ];
  const text = serializeJsonl(records);
  assert.equal(text.split("\n").filter(Boolean).length, 3);
  assert.deepEqual(parseJsonl(text), records);
});

test("blank and malformed lines are skipped, not fatal", () => {
  const records = parseJsonl("{}\n\nnot-json\n{\"type\":\"turn\"}\n");
  assert.equal(records.length, 2);
});

test("retireOldTurns keeps only the last window of user turns", () => {
  const records = [];
  for (let i = 0; i < RECENT_WINDOW + 3; i++) {
    records.push({ type: "turn", role: "user", instruction: `q${i}` });
    records.push({ type: "turn", role: "assistant", changes: [] });
  }
  const { retired, recent } = retireOldTurns(records);
  const retiredUsers = retired.filter((r) => r.role === "user").length;
  const recentUsers = recent.filter((r) => r.role === "user").length;
  assert.equal(retiredUsers, 3);
  assert.equal(recentUsers, RECENT_WINDOW);
  // Pairs stay intact — an assistant never outlives its user turn.
  assert.equal(recent.filter((r) => r.role === "assistant").length, RECENT_WINDOW);
});

test("replay history carries only un-promoted user intent, plus the summary", () => {
  const turns = [
    { role: "user", instruction: "keep it under 12 slides", promoted: true },
    { role: "assistant", changes: ["meta: title, sections"] },
    { role: "user", instruction: "slide 4 feels weak" },
    { role: "assistant", changes: ["~ slide 4 (bullets)"] },
  ];
  const history = buildReplayHistory({ summary: "earlier context", turns });
  // Summary is a system message; promoted instruction is gone.
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "system");
  assert.match(history[0].content, /earlier context/);
  assert.equal(history[1].role, "user");
  assert.equal(history[1].content, "slide 4 feels weak");
});

test("a deck with no thread replays nothing", () => {
  assert.deepEqual(buildReplayHistory({ summary: "", turns: [] }), []);
});

test("maintainThreadState appends a pair and flags promoted instructions", () => {
  const thread = { turns: [{ role: "user", instruction: "old" }, { role: "assistant", changes: [] }] };
  const { userRec, asstRec, recent, retired, decisions } = maintainThreadState(thread, {
    instruction: "always use UK spelling",
    durable: ["Always use UK spelling."],
    model: "qwen3:4b-instruct",
    changes: ["~ slide 2 (bullets)"],
    stats: { promptTokens: 10, outputTokens: 5 },
    ts: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(userRec.promoted, true);
  assert.equal(asstRec.changes[0], "~ slide 2 (bullets)");
  assert.equal(recent.at(-1), asstRec);
  assert.equal(retired.length, 0);
  assert.deepEqual(decisions, ["Always use UK spelling."]);
});

test("a broken deck prepends the repair demand to the instruction", () => {
  const out = assembleInstruction("make it shorter", ["slide 2: missing required field bullets"]);
  assert.match(out, /BROKEN/);
  assert.match(out, /missing required field/);
  assert.ok(out.indexOf("make it shorter") > out.indexOf("BROKEN"));
});

test("a healthy deck passes the instruction through untouched", () => {
  assert.equal(assembleInstruction("make it shorter", []), "make it shorter");
});
