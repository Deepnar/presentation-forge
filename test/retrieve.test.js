import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "../src/paths.js";
import { terms, chunkResearch, scoreChunks, selectResearch, slideQuery } from "../src/ai/retrieve.js";

/**
 * Per-slide research retrieval.
 *
 * `writeSlide` used to carry the entire research excerpt on every call — 26
 * times over a 22-slide deck, ~1.6M tokens for one deck on the cloud
 * transport, and almost all of it the same input again. These tests hold the
 * two claims that make replacing it worthwhile: that the selection is BOUNDED,
 * and that it actually DISCRIMINATES between slides rather than handing every
 * one of them the same opening passages.
 */

const NOTES = `## Grid economics of depot charging

Peak-shaving revenue averaged EUR 41 per bus per month across the Rotterdam
trial, measured over fourteen months of bidirectional operation.

Tariff design decided most of that spread. Depots on a static tariff earned
roughly half what dynamic-tariff depots did.

## Battery degradation under bidirectional cycling

Cells cycled bidirectionally lost 2.3% additional capacity per year against a
unidirectional control group, which is well inside warranty thresholds.

Thermal management mattered more than cycle count: actively cooled packs
showed no measurable penalty at all.

## Procurement and charger specification

A 60 kW bidirectional charger costs roughly EUR 28,000 installed, against
EUR 9,000 for a unidirectional unit of the same rating.

Procurement officers consistently underestimated commissioning time, which ran
to eleven weeks on average.
`;

/* ---------------------------------------------------------------- terms */

test("terms keeps figures and drops the words every passage shares", () => {
  const t = terms("The depot earned EUR 41 per bus, and this will show that");
  assert.ok(t.includes("depot"), t.join(","));
  assert.ok(t.includes("earned"));
  assert.ok(t.includes("eur"));
  // A figure is exactly the kind of thing a slide is about.
  assert.ok(t.includes("41"), "numbers must survive tokenising");
  for (const stop of ["the", "and", "this", "will", "that", "show"]) {
    assert.ok(!t.includes(stop), `"${stop}" should not be a search term`);
  }
});

/* --------------------------------------------------------------- chunks */

test("chunkResearch splits on headings and carries the source with each passage", () => {
  const chunks = chunkResearch(NOTES);
  assert.ok(chunks.length >= 3, `expected a passage per source, got ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.heading, "a passage with no source attached is an ungroundable claim");
    assert.ok(c.body.trim().length > 0);
  }
  assert.ok(chunks.some((c) => /Grid economics/.test(c.heading)));
  assert.ok(chunks.some((c) => /degradation/i.test(c.heading)));
});

test("a subheading refines its source rather than replacing it", () => {
  const chunks = chunkResearch("## Highland V2G\n\nBody one.\n\n### Scaling nationally\n\nBody two.\n");
  const sub = chunks.find((c) => /Scaling/.test(c.heading));
  assert.ok(sub, "the subsection should produce its own passage");
  assert.match(sub.heading, /Highland V2G/, "and must still name the source it came from");
});

test("chunkResearch survives notes with no headings at all", () => {
  const chunks = chunkResearch("Just a paragraph of prose.\n\nAnd another one.\n");
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every((c) => typeof c.body === "string"));
});

/* -------------------------------------------------------------- scoring */

test("scoring puts the passage about the question first", () => {
  const chunks = chunkResearch(NOTES);
  const scores = scoreChunks(chunks, "battery degradation from bidirectional cycling");
  const best = chunks[scores.indexOf(Math.max(...scores))];
  assert.match(best.heading + best.body, /degradation/i);

  const other = scoreChunks(chunks, "charger procurement cost and commissioning");
  const bestOther = chunks[other.indexOf(Math.max(...other))];
  assert.match(bestOther.heading + bestOther.body, /charger|procurement/i);
});

test("a query with no usable terms scores nothing rather than something arbitrary", () => {
  const chunks = chunkResearch(NOTES);
  assert.deepEqual(scoreChunks(chunks, "the and this that"), chunks.map(() => 0));
  assert.deepEqual(scoreChunks(chunks, ""), chunks.map(() => 0));
});

/* ------------------------------------------------------------ selection */

test("selectResearch stays inside its budget and keeps document order", () => {
  const big = NOTES.repeat(12);
  const out = selectResearch(big, "charger procurement cost", { budget: 2000 });
  assert.ok(out.length <= 2600, `budget overrun: ${out.length}`);
  assert.ok(out.length > 0);
});

test("short research is passed through whole rather than mangled", () => {
  const out = selectResearch(NOTES, "anything", { budget: 50_000 });
  assert.equal(out, NOTES, "nothing to select from when it all fits");
});

test("a slide whose words match nothing still gets research, not an empty prompt", () => {
  // A writer with no material still has to produce a slide; arbitrary research
  // beats none.
  const out = selectResearch(NOTES.repeat(12), "xylophone marzipan quasar", { budget: 2000 });
  assert.ok(out.trim().length > 0, "the fallback must return something usable");
});

test("selectResearch handles empty and missing input", () => {
  assert.equal(selectResearch("", "q"), "");
  assert.equal(selectResearch(null, "q"), "");
});

/* ------------------------------------------------------------ the query */

test("slideQuery uses the slide's purpose and its part, and NOT the deck title", () => {
  // The title is the one term every passage in the corpus shares — it is why
  // the corpus was researched — so including it pulled every slide toward the
  // same generically-on-topic passages.
  const plan = { title: "Vehicle-to-Grid for Bus Depots", sections: ["Economics", "Hardware"] };
  const q = slideQuery({ spec: { section: 1, purpose: "Compare charger costs" }, plan });
  assert.match(q, /Hardware/);
  assert.match(q, /Compare charger costs/);
  assert.ok(!/Vehicle-to-Grid for Bus Depots/.test(q), "the deck title must not be in the query");
});

test("slideQuery survives a slide with no section", () => {
  const q = slideQuery({ spec: { purpose: "Open the deck" }, plan: { title: "T", sections: [] } });
  assert.equal(q, "Open the deck");
});

/* ------------------------------- the property the whole change rests on */

test("different slides of a real deck receive different research", async (t) => {
  const dir = path.join(ROOT, "decks", "vehicle-to-grid-integration-for-electric-bus");
  let research, plan;
  try {
    research = await readFile(path.join(dir, "research", "notes.md"), "utf8");
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
  } catch {
    t.skip("the V2G fixture deck is not on this box");
    return;
  }

  const chunks = chunkResearch(research);
  const specs = plan.slides.filter((s) => s.purpose);
  assert.ok(specs.length >= 8 && chunks.length >= 20, "fixture too small to measure discrimination");

  const top = specs.map((spec) => {
    const scores = scoreChunks(chunks, slideQuery({ spec, plan }));
    return new Set(
      chunks.map((c, i) => [i, scores[i]]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([i]) => i),
    );
  });

  const jaccard = (a, b) => {
    const inter = [...a].filter((x) => b.has(x)).length;
    return inter / (a.size + b.size - inter);
  };
  let sum = 0, n = 0;
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) { sum += jaccard(top[i], top[j]); n++; }
  }
  const overlap = sum / n;
  const reach = new Set(top.flatMap((s) => [...s])).size / chunks.length;

  // Measured at 0.24 / 0.65 with the title out of the query, and 0.62 / 0.29
  // with it in. The bounds are loose enough to survive a tuning change and
  // tight enough to fail if retrieval stops discriminating.
  assert.ok(overlap < 0.40, `slides are getting the same research (overlap ${(overlap * 100).toFixed(0)}%)`);
  assert.ok(reach > 0.45, `the deck only reaches ${(reach * 100).toFixed(0)}% of its own research`);
});

test("a slide's selection is a small fraction of the whole corpus", async (t) => {
  const dir = path.join(ROOT, "decks", "vehicle-to-grid-integration-for-electric-bus");
  let research, plan;
  try {
    research = await readFile(path.join(dir, "research", "notes.md"), "utf8");
    plan = YAML.parse(await readFile(path.join(dir, "plan.yaml"), "utf8"));
  } catch {
    t.skip("the V2G fixture deck is not on this box");
    return;
  }
  const spec = plan.slides.find((s) => s.purpose);
  const out = selectResearch(research, slideQuery({ spec, plan }), { budget: 12000 });
  assert.ok(out.length <= 13000, `budget overrun: ${out.length}`);
  assert.ok(
    out.length < research.length * 0.5,
    "the point is to send a fraction, not most of it",
  );
});
