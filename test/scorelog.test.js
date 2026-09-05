import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The score, kept.
 *
 * `scoreDeck` has existed and been run by hand, which answers "is this deck any
 * good" once and then loses the answer — the standing gap the roadmap
 * describes: everything mechanical got fixed and "did the output get worse"
 * stayed unanswerable between the rare occasions somebody sat and read a deck.
 *
 * Recorded at generation it becomes a different instrument: the comparison is
 * available without anybody deciding to make it.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-scorelog-"));
process.env.FORGE_CONFIG_DIR = scratch;

const { recordScore, readScores, regression, summarise } = await import("../src/scorelog.js");

test.after(() => rm(scratch, { recursive: true, force: true }));

const file = () => path.join(scratch, "scores.jsonl");
const reset = () => writeFile(file(), "", "utf8");

/* ------------------------------------------------------------ recording */

test("a recorded score can be read back with what produced it", async () => {
  await reset();
  await recordScore({
    slug: "v2g", score: 73, components: { intact: 1, fits: 0.82 },
    counts: { slides: 22 }, model: "qwen3.6", transport: "cloud",
    findings: ["slide 4: placeholder was never rewritten"],
  });
  const [row] = await readScores();
  assert.equal(row.slug, "v2g");
  assert.equal(row.score, 73);
  assert.equal(row.slides, 22);
  // A score is not comparable across backends, so a row that cannot say which
  // one produced it is a row nobody can act on.
  assert.equal(row.model, "qwen3.6");
  assert.equal(row.transport, "cloud");
  assert.equal(row.findings.length, 1);
  assert.ok(row.at, "and when");
});

test("scores accumulate rather than overwrite", async () => {
  await reset();
  for (const score of [70, 80, 90]) await recordScore({ slug: "d", score });
  assert.deepEqual((await readScores()).map((r) => r.score), [70, 80, 90]);
});

test("recording never throws, whatever it is handed", async () => {
  await reset();
  await assert.doesNotReject(() => recordScore({}));
  await assert.doesNotReject(() => recordScore({ slug: "x", score: null, findings: null }));
  // A generation that succeeded must not fail because bookkeeping about it did.
  await assert.doesNotReject(() => recordScore(null));
});

test("one corrupt line does not lose the rest of the history", async () => {
  await reset();
  await recordScore({ slug: "a", score: 60 });
  await writeFile(file(), `${await readFile(file(), "utf8")}{not json\n`, "utf8");
  await recordScore({ slug: "b", score: 65 });
  assert.deepEqual((await readScores()).map((r) => r.slug), ["a", "b"]);
});

test("history can be filtered to one deck", async () => {
  await reset();
  await recordScore({ slug: "a", score: 60 });
  await recordScore({ slug: "b", score: 90 });
  await recordScore({ slug: "a", score: 62 });
  assert.deepEqual((await readScores({ slug: "a" })).map((r) => r.score), [60, 62]);
});

/* ----------------------------------------------------------- regression */

const runs = (...scores) => scores.map((score) => ({ score }));

test("a regression is a drop against the median, not against the last run", async () => {
  // Scores move a few points between decks on subject matter alone, so
  // "worse than last time" fires constantly and means nothing.
  const noisy = runs(78, 71, 80, 73, 79, 72);
  assert.equal(regression(noisy).regressed, false, "ordinary variation is not a regression");

  const dropped = runs(78, 76, 80, 77, 79, 55);
  const r = regression(dropped);
  assert.equal(r.regressed, true);
  assert.equal(r.score, 55);
  assert.ok(r.delta < -8, `delta ${r.delta}`);
});

test("too little history reports nothing rather than a verdict", async () => {
  assert.equal(regression([]), null);
  assert.equal(regression(runs(80)), null);
  assert.equal(regression(runs(80, 40)), null, "one prior run cannot establish a median");
  assert.ok(regression(runs(80, 80, 80, 80, 40)), "five runs can");
});

test("unscored rows are ignored rather than counted as zero", async () => {
  const withNulls = [{ score: 80 }, { score: null }, { score: 82 }, { score: null },
    { score: 79 }, { score: 81 }, { score: 78 }];
  const r = regression(withNulls);
  assert.ok(r, "the scored rows are enough");
  assert.equal(r.regressed, false, "a failed scoring run must not read as a crash in quality");
});

test("the summary says the number and whether it fell", async () => {
  assert.match(summarise([]), /no scored generations/);
  const line = summarise([...runs(80, 79, 81, 78, 80), { slug: "v2g", score: 55 }]);
  assert.match(line, /v2g scored 55\/100/);
  assert.match(line, /DOWN/);
  assert.ok(!/DOWN/.test(summarise([...runs(80, 79, 81, 78, 80), { slug: "v2g", score: 80 }])));
});
