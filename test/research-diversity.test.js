import { test } from "node:test";
import assert from "node:assert/strict";
import { hostDiversifier } from "../src/ai/research.js";

/**
 * Host diversity across the research CORPUS.
 *
 * `search()` caps results per host at 2 and states the reason: a model handed
 * eight pages from one domain writes a report sourced entirely from one site.
 * That cap is per QUERY. A deep run makes eight queries plus follow-ups and
 * absorbed them into a corpus deduped by URL alone, so the guard bought nothing
 * at the level it was written to protect — a real run came back three-tenths
 * Wikipedia, including the mineralogy article for a deck about solar cells.
 */

const pagesFrom = (host, n) =>
  Array.from({ length: n }, (_, i) => ({ ok: true, url: `https://${host}/p${i}`, title: `${host} ${i}`, words: 500 }));

const tally = (pages) => {
  const by = {};
  for (const p of pages) {
    const h = new URL(p.url).hostname.replace(/^www\./, "");
    by[h] = (by[h] ?? 0) + 1;
  }
  return by;
};

test("one flooding domain is capped while the others still get in", () => {
  const pages = [];
  const { absorb } = hostDiversifier(pages, new Set(), { maxPerHost: 4, minCorpus: 6 });
  absorb(pagesFrom("en.wikipedia.org", 12));
  absorb(pagesFrom("nrel.gov", 3));
  absorb(pagesFrom("iea.org", 2));
  const by = tally(pages);
  assert.equal(by["en.wikipedia.org"], 4, "the flood is capped");
  assert.equal(by["nrel.gov"], 3, "a modest source is untouched");
  assert.equal(by["iea.org"], 2);
});

test("a corpus that would starve is back-filled from the surplus", () => {
  // The topic where one authority genuinely holds the material: enforcing
  // variety here would leave too little to write from, which is the worse
  // failure. The cap yields rather than the corpus.
  const pages = [];
  const { absorb, backfill } = hostDiversifier(pages, new Set(), { maxPerHost: 4, minCorpus: 6 });
  absorb(pagesFrom("nrel.gov", 9));
  assert.equal(pages.length, 4, "capped first");
  backfill();
  assert.equal(pages.length, 6, "then filled back to the minimum");
});

test("back-fill stops at the minimum rather than undoing the cap", () => {
  const pages = [];
  const { absorb, backfill } = hostDiversifier(pages, new Set(), { maxPerHost: 2, minCorpus: 5 });
  absorb(pagesFrom("one.example", 20));
  backfill();
  assert.equal(pages.length, 5, "exactly the minimum, not the whole surplus");
});

test("duplicate URLs are still dropped, and failures never enter", () => {
  const pages = [];
  const seen = new Set();
  const { absorb } = hostDiversifier(pages, seen, { maxPerHost: 4 });
  const batch = pagesFrom("a.example", 2);
  absorb(batch);
  absorb(batch);
  assert.equal(pages.length, 2, "the same URL twice is one page");
  absorb([{ ok: false, url: "https://a.example/broken" }]);
  assert.equal(pages.length, 2, "a failed fetch is not a source");
});

test("an unparseable url is grouped rather than crashing the run", () => {
  const pages = [];
  const { absorb } = hostDiversifier(pages, new Set(), { maxPerHost: 1 });
  absorb([{ ok: true, url: "not a url" }, { ok: true, url: "also not a url" }]);
  assert.equal(pages.length, 2, "distinct strings are distinct hosts, and neither throws");
});
