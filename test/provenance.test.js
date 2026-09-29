import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slideSourceUse,
  mapDeckSources,
  buildReferencesSlide,
  insertReferencesSlide,
} from "../src/ai/provenance.js";
import { validateDeck } from "../src/validate.js";

/**
 * The slide before the thank-you slide.
 *
 * The writer is never asked for cites and grounding matches claims against
 * the whole notes blob, so nothing knows which source each slide drew on.
 * The mapping here is deterministic and best-effort: a slide "uses" every
 * page that grounds at least one of its numeric claims.
 */

const PAGES = [
  { url: "https://solar.example/cells", title: "Perovskite cell efficiencies", words: 900, text: "Certified cells reach 26.1% efficiency. Degradation halves output in 9 years." },
  { url: "https://grid.example/storage", title: "Grid storage costs", words: 500, text: "Battery packs fell to 139 USD per kWh in 2023. Auctions cleared 180 GW." },
];

const deckWith = (slides) => ({ title: "T", slides });

test("a slide maps to the page that grounds its figures", () => {
  const slide = { type: "bullets", headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] };
  assert.deepEqual(slideSourceUse(slide, PAGES), [0]);
});

test("a claim-free slide maps nowhere, dividers never map", () => {
  const plain = { type: "bullets", headline: "Why this matters", bullets: ["First reason to care.", "Second reason to care.", "Third reason to care.", "Fourth reason to care."] };
  assert.deepEqual(slideSourceUse(plain, PAGES), []);
  const figured = { type: "bullets", headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] };
  const deck = deckWith([
    { type: "title", headline: "T" },
    { type: "section", headline: "S", section: 0 },
    plain,
    figured,
  ]);
  assert.deepEqual(mapDeckSources(deck, PAGES).map((m) => m.slide), [3]);
});

test("the built slide names each source with its slide numbers", () => {
  const deck = deckWith([
    { type: "title", headline: "T" },
    { type: "bullets", headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] },
    { type: "bullets", headline: "Packs at 139 USD per kWh", bullets: ["Battery packs fell to 139 USD per kWh in 2023.", "Second point here.", "Third point here.", "Fourth point here."] },
    { type: "closing", headline: "Thanks" },
  ]);
  const slide = buildReferencesSlide(deck, PAGES);
  assert.ok(slide);
  assert.equal(slide.type, "references");
  assert.equal(slide.items.length, 2);
  assert.ok(slide.items[0].includes("slide 2"), slide.items[0]);
  assert.ok(slide.items[1].includes("slide 3"), slide.items[1]);
  for (const item of slide.items) assert.ok(item.length <= 220, item);
});

test("no mappable slide means no references slide", () => {
  const deck = deckWith([{ type: "title", headline: "T" }]);
  assert.equal(buildReferencesSlide(deck, PAGES), null);
  assert.equal(buildReferencesSlide(deck, []), null);
});

test("insertion lands before closing and never duplicates", () => {
  const deck = deckWith([
    { type: "title", headline: "T" },
    { type: "bullets", headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] },
    { type: "closing", headline: "Thanks" },
  ]);
  const slide = buildReferencesSlide(
    deck,
    [{ url: "https://a.example/x", title: "A source", words: 10, text: "Cells reach 26.1% efficiency." }],
  );
  assert.ok(slide);
  const first = insertReferencesSlide(deck, slide);
  assert.equal(first.inserted, true);
  assert.equal(first.deck.slides[first.index].type, "references");
  assert.equal(first.deck.slides[first.index + 1].type, "closing");
  const second = insertReferencesSlide(first.deck, slide);
  assert.equal(second.inserted, false);
});

test("the inserted slide validates", async () => {
  const deck = deckWith([
    { type: "title", headline: "T" },
    { type: "bullets", headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] },
    { type: "closing", headline: "Thanks" },
  ]);
  const slide = buildReferencesSlide(deck, PAGES);
  const { deck: next } = insertReferencesSlide(deck, slide);
  const v = await validateDeck(next);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("a bare year mentioned once does not link a page", () => {
  const slide = { type: "bullets", headline: "2023 review after 9 trials", bullets: ["First point here.", "Second point here.", "Third point here.", "Fourth point here."] };
  const pages = [
    { url: "https://a.example/x", title: "Passing mention", words: 10, text: "Published in 2023. Nothing else of note." },
    { url: "https://b.example/y", title: "Both figures", words: 10, text: "Published in 2023, revised after 9 trials." },
  ];
  assert.deepEqual(slideSourceUse(slide, pages), [1]);
});

test("a bare number that only appears as a substring never links", () => {
  const slide = { type: "bullets", headline: "25 years of warranty", bullets: ["First point here.", "Second point here.", "Third point here.", "Fourth point here."] };
  const pages = [
    { url: "https://a.example/x", title: "Year soup", words: 10, text: "In 2025 and 125 trials nothing was found." },
  ];
  assert.deepEqual(slideSourceUse(slide, pages), [], "25 must not match 2025 or 125");
});

test("tagged pages only link slides of their own part", () => {
  const slide = { type: "bullets", section: 0, headline: "Cells hit 26.1%", bullets: ["Certified cells reach 26.1% efficiency.", "Second point here.", "Third point here.", "Fourth point here."] };
  const pages = [
    { url: "https://a.example/x", title: "Same part", words: 10, subtopic: 0, text: "Certified cells reach 26.1% efficiency. Confirmed twice." },
    { url: "https://b.example/y", title: "Other part", words: 10, subtopic: 2, text: "Certified cells reach 26.1% efficiency. Confirmed twice." },
    { url: "https://c.example/z", title: "Untagged legacy", words: 10, text: "Certified cells reach 26.1% efficiency. Confirmed twice." },
  ];
  assert.deepEqual(slideSourceUse(slide, pages, 0), [0, 2]);
  assert.deepEqual(slideSourceUse(slide, pages, null), [0, 1, 2], "without a section every page is tested");
});
