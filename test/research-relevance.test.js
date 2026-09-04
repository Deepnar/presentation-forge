import { test } from "node:test";
import assert from "node:assert/strict";
import { topicTerms, topicalDensity, hostDiversifier, RELEVANCE_FLOOR } from "../src/ai/research.js";

/**
 * Whether a fetched page is about the topic at all.
 *
 * Nothing used to ask. A real run for a solid-state battery deck absorbed
 * Wikipedia's "India" (31,107 words) and "History of India" (28,946) because
 * one angle query said "India", four Microsoft support pages, a Minecraft mod
 * and drugs.com on lithium the medication. Five of twenty-one sources were
 * about batteries, and 60,000 words about the wrong subject went to the writer.
 */

const BRIEF = "Solid-State Batteries for Electric Vehicles: Materials, Manufacturing and the Road to Commercial Scale";

test("the yardstick is the brief's distinctive words, and the code never learns the topic", () => {
  const terms = topicTerms(BRIEF);
  assert.ok(terms.includes("batteries"));
  assert.ok(terms.includes("solid-state"));
  assert.ok(!terms.includes("the"), "stopwords carry no signal");
  assert.ok(!terms.includes("road"), "generic nouns from a title carry none either");
  assert.ok(terms.every((t) => t.length >= 4), "short words are noise");
});

test("a hyphenated compound is kept whole and never also split", () => {
  // Measured: splitting "solid-state" puts "state" in the yardstick, and an
  // article about India — a country of states — scores seven times higher on
  // it. It cut the margin between on- and off-topic pages from 5.8x to 3.9x.
  const terms = topicTerms(BRIEF);
  assert.ok(terms.includes("solid-state"));
  assert.ok(!terms.includes("state"), "the halves of a compound are not distinctive");
  assert.ok(!terms.includes("solid"));
});

test("density separates on- from off-topic where presence cannot", () => {
  const terms = topicTerms(BRIEF);
  // A long article that mentions the words in passing — the shape of the real
  // failure. It contains most of the topic's terms, so any "does it mention
  // the topic" rule keeps it.
  const filler = "the country has many regions and a long history of trade and government. ".repeat(600);
  const passing = `${filler} electric vehicles and batteries are manufactured commercially using new materials.`;
  const onTopic = "solid-state batteries for electric vehicles use ceramic electrolytes; "
    + "manufacturing these batteries at commercial scale needs new materials. ".repeat(20);

  const mentioned = terms.filter((t) => passing.toLowerCase().includes(t)).length;
  assert.ok(mentioned >= 5, `a presence rule would keep this: it names ${mentioned} of the topic's terms`);

  assert.ok(topicalDensity(passing, terms) < RELEVANCE_FLOOR, "and density refuses it");
  assert.ok(topicalDensity(onTopic, terms) > RELEVANCE_FLOOR * 2, "while a real page clears it comfortably");
});

test("an empty or unreadable page scores zero rather than passing", () => {
  const terms = topicTerms(BRIEF);
  assert.equal(topicalDensity("", terms), 0);
  assert.equal(topicalDensity(null, terms), 0);
});

test("with no yardstick nothing is judged — the gate is off, not inverted", () => {
  // A caller that supplies no brief must not have its whole corpus dropped.
  assert.equal(topicalDensity("anything at all", []), Infinity);
  const pages = [];
  const { absorb } = hostDiversifier(pages, new Set(), { terms: [] });
  absorb([{ ok: true, url: "https://a.test/1", text: "totally unrelated words here" }]);
  assert.equal(pages.length, 1);
});

test("absorb drops the off-topic page and keeps the on-topic one", () => {
  const pages = [];
  const seen = new Set();
  const { absorb, offtopic } = hostDiversifier(pages, seen, { terms: topicTerms(BRIEF) });
  absorb([
    { ok: true, url: "https://good.test/a", text: "solid-state batteries for electric vehicles, manufacturing at commercial scale with new materials" },
    { ok: true, url: "https://junk.test/b", text: "the history of the country and its government and trade routes ".repeat(200) },
  ]);
  assert.deepEqual(pages.map((p) => p.url), ["https://good.test/a"]);
  assert.equal(offtopic.length, 1);
  assert.equal(offtopic[0].url, "https://junk.test/b");
});

test("an off-topic page is never backfilled, however thin the corpus", () => {
  // backfill exists so a corpus starved by the per-host cap can be refilled.
  // A thin corpus is a worse deck; a corpus about the wrong subject is a deck
  // about the wrong subject, so these must never come back.
  const pages = [];
  const { absorb, backfill } = hostDiversifier(pages, new Set(), { terms: topicTerms(BRIEF), minCorpus: 6 });
  absorb([{ ok: true, url: "https://junk.test/b", text: "unrelated prose ".repeat(500) }]);
  backfill();
  assert.equal(pages.length, 0, "the corpus stays empty rather than filling with the wrong subject");
});

test("the per-host cap still overflows and still backfills", () => {
  const pages = [];
  const onTopic = "solid-state batteries electric vehicles manufacturing commercial materials ";
  const { absorb, backfill } = hostDiversifier(pages, new Set(), {
    terms: topicTerms(BRIEF), maxPerHost: 2, minCorpus: 4,
  });
  absorb(Array.from({ length: 5 }, (_, i) => ({ ok: true, url: `https://one.test/${i}`, text: onTopic })));
  assert.equal(pages.length, 2, "capped per host");
  backfill();
  assert.equal(pages.length, 4, "and the surplus returns when the corpus is too thin");
});
