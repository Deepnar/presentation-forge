import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptResearch, RESEARCH_EXCERPT, expandQueries } from "../src/ai/research.js";

test("short research passes through unchanged", () => {
  const text = "## One\n\nSome notes under the cap.";
  assert.equal(excerptResearch(text), text);
});

test("empty research stays empty", () => {
  assert.equal(excerptResearch(""), "");
  assert.equal(excerptResearch(undefined), "");
});

test("oversized research is capped and ends on a line boundary", () => {
  const text = `## A\n\n${"word ".repeat(RESEARCH_EXCERPT)}tail-line\n`;
  const out = excerptResearch(text);
  assert.ok(out.length <= RESEARCH_EXCERPT);
  // The cap never slices mid-line.
  assert.ok(out.endsWith("\n"));
});

test("the cap stays well under the author role's 32K context", () => {
  // ~3.5 chars per English token: 80K chars ≈ 23K tokens, leaving headroom for
  // the schema and output inside a 32768-token window.
  assert.ok(RESEARCH_EXCERPT < 100_000);
});

test("expandQueries uses the model's subtopic queries, brief first", async () => {
  const chat = async () => ({ data: { queries: ["query two", "query three"] } });
  const out = await expandQueries("Ray tracing", { chat });
  assert.deepEqual(out, ["Ray tracing", "query two", "query three"]);
});

test("expandQueries falls back to the brief alone when the model is unavailable", async () => {
  const chat = async () => { throw new Error("Ollama unreachable"); };
  assert.deepEqual(await expandQueries("Ray tracing", { chat }), ["Ray tracing"]);
});

test("expandQueries drops malformed expansions but keeps the brief", async () => {
  const chat = async () => ({ data: { queries: ["ok query", "x", 7] } });
  assert.deepEqual(await expandQueries("Ray tracing", { chat }), ["Ray tracing", "ok query"]);
});
