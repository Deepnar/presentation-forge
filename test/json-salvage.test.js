import { test } from "node:test";
import assert from "node:assert/strict";
import { salvageJSON } from "../src/ai/ollama.js";

const ops = { ops: [{ op: "update_slide", index: 8, patch: { body: ["OmpSs"] } }] };

test("salvageJSON parses bare JSON as-is", () => {
  const { value } = salvageJSON(JSON.stringify(ops));
  assert.deepEqual(value, ops);
});

test("salvageJSON strips a json fence", () => {
  const { value } = salvageJSON(`Here you go:\n\n\`\`\`json\n${JSON.stringify(ops)}\n\`\`\`\n`);
  assert.deepEqual(value, ops);
});

test("salvageJSON strips a fence with an upper-case tag", () => {
  const { value } = salvageJSON(`\`\`\`JSON\n${JSON.stringify(ops)}\n\`\`\``);
  assert.deepEqual(value, ops);
});

test("salvageJSON tolerates trailing prose after the JSON", () => {
  const { value } = salvageJSON(`${JSON.stringify(ops)}\n\nThat should apply cleanly.`);
  assert.deepEqual(value, ops);
});

test("salvageJSON recovers when leading prose contains a brace", () => {
  const wrapped = `Note: the { current deck } is slide 9. ${JSON.stringify(ops)}`;
  const { value } = salvageJSON(wrapped);
  assert.deepEqual(value, ops);
});

test("salvageJSON repairs a trailing comma before the closing bracket", () => {
  const { value } = salvageJSON(`{"ops":[{"op":"update_slide","index":8,"patch":{"body":["OmpSs"]}},]}`);
  assert.deepEqual(value, ops);
});

test("salvageJSON returns the first parseable region when prose carries a stray JSON-looking chunk", () => {
  const { value } = salvageJSON(`prefix {not real json,} suffix ${JSON.stringify(ops)} tail`);
  assert.deepEqual(value, ops);
});

test("salvageJSON records its attempts for the error message", () => {
  const { value, attempts } = salvageJSON("no json here at all");
  assert.equal(value, undefined);
  assert.ok(Array.isArray(attempts));
});
