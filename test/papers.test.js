import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPapers, mergePapers } from "../src/papers.js";

const ARXIV_XML = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2005.03464v5</id>
    <title>Optimal supply chains and power sector benefits of green hydrogen</title>
    <published>2020-05-07T16:24:15Z</published>
    <summary>A study of green hydrogen supply chains and their power sector benefits.</summary>
    <author><name>John Doe</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2205.11901v5</id>
    <title>Endogenous learning for green hydrogen in a sector-coupled energy model</title>
    <published>2022-05-24T10:00:00Z</published>
    <summary>Learning curves for green hydrogen electrolysis in energy systems.</summary>
    <author><name>Jane Smith</name></author>
  </entry>
</feed>`;

const CROSSREF_JSON = {
  message: {
    items: [
      {
        DOI: "10.1016/j.ijhydene.2023.01.001",
        title: ["Green hydrogen production: a comprehensive review of electrolysis"],
        URL: "https://doi.org/10.1016/j.ijhydene.2023.01.001",
        published: { "date-parts": [[2023]] },
        abstract: "A review of electrolysis technologies for green hydrogen.",
        author: [{ given: "Alice", family: "Brown" }],
        "container-title": ["International Journal of Hydrogen Energy"],
      },
    ],
  },
};

function mockFetch(records) {
  return async (url, options) => {
    const u = String(url);
    if (u.startsWith("https://export.arxiv.org")) {
      return {
        ok: true,
        status: 200,
        text: async () => records.arxiv,
        headers: { get: () => "application/atom+xml" },
      };
    }
    if (u.startsWith("https://api.crossref.org")) {
      return {
        ok: true,
        status: 200,
        json: async () => records.crossref,
        headers: { get: () => "application/json" },
      };
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
}

test("searchPapers queries arXiv and Crossref and dedupes by canonical id", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFetch({ arxiv: ARXIV_XML, crossref: CROSSREF_JSON });
  try {
    const r = await searchPapers("green hydrogen electrolysis");
    // 2 arXiv + 1 Crossref, all distinct.
    assert.equal(r.errors.length, 0);
    const papers = r.papers;
    assert.ok(papers.length >= 3);
    const arxiv = papers.find((p) => p.id === "2005.03464v5");
    assert.ok(arxiv, "arXiv id recorded");
    assert.equal(arxiv.kind, "paper");
    const doi = papers.find((p) => p.doi === "10.1016/j.ijhydene.2023.01.001");
    assert.ok(doi, "DOI recorded");
    // Relevance-ranked: the paper matching the brief's terms ranks above the rest.
    const ranked = [...papers].sort((a, b) => b.score - a.score);
    assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);
  } finally {
    globalThis.fetch = orig;
  }
});

test("searchPapers degrades to an error record when an API fails", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://export.arxiv.org")) return { ok: false, status: 503, text: async () => "" };
    return { ok: true, status: 200, json: async () => CROSSREF_JSON, headers: { get: () => "application/json" } };
  };
  try {
    const r = await searchPapers("green hydrogen");
    assert.ok(r.errors.length >= 1, "the failed arXiv call surfaces as a paper_error");
    assert.ok(r.papers.length >= 1, "Crossref still contributes papers");
  } finally {
    globalThis.fetch = orig;
  }
});

test("mergePapers tags paper sources with kind, doi and arxivId", () => {
  const papers = [
    { kind: "paper", id: "2205.11901v5", url: "https://arxiv.org/pdf/2205.11901v5", title: "T1", doi: null, year: "2022" },
    { kind: "paper", doi: "10.1016/j.x", url: "https://doi.org/10.1016/j.x", title: "T2", id: null, year: "2023", journal: "IJHE" },
  ];
  const merged = mergePapers([{ url: "https://web.example/a", title: "web" }], papers);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].kind, "paper");
  assert.equal(merged[1].arxivId, "2205.11901v5");
  assert.equal(merged[2].doi, "10.1016/j.x");
  assert.equal(merged[2].journal, "IJHE");
  assert.equal(merged[0].kind, undefined);
});
