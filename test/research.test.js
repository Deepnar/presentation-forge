import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptResearch, RESEARCH_EXCERPT, expandQueries, researchSummary } from "../src/ai/research.js";

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

test("researchSummary counts sources, domains, and academic vs listicle", () => {
  const sources = [
    { url: "https://www.nature.com/articles/x", title: "Nature", words: 400 },
    { url: "https://arxiv.org/abs/2301.00001", title: "arXiv", words: 300, kind: "paper" },
    { url: "https://en.wikipedia.org/wiki/Electrolysis", title: "Wikipedia", words: 500 },
    { url: "https://medium.com/posts/xyz", title: "Medium", words: 100 },
    { url: "https://www.nature.com/articles/y", title: "Nature again", words: 200 },
  ];
  const s = researchSummary(sources, "some notes words here");
  assert.equal(s.total, 5);
  // nature.com, arxiv.org, wikipedia.org, medium.com
  assert.equal(s.distinctDomains, 4);
  // arxiv (kind=paper) + wikipedia look academic; medium is listicle; nature.com is a plain .com.
  assert.equal(s.paperCount, 1);
  assert.equal(s.academicCount, 2);
  assert.equal(s.listicleCount, 1);
  assert.equal(s.notesWords, 4);
});

test("researchSummary flags single-source domains", () => {
  const sources = [
    { url: "https://a.example/page1", title: "A1" },
    { url: "https://a.example/page2", title: "A2" },
    { url: "https://b.example/only", title: "B" },
  ];
  const s = researchSummary(sources);
  assert.deepEqual(s.singleSourceDomains, ["b.example"]);
  assert.equal(s.distinctDomains, 2);
});
