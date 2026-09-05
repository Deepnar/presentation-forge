import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

/**
 * Every deck's score, kept, so a regression is a number rather than a memory.
 *
 * `scoreDeck` has existed and been run by hand. Run by hand it answers "is this
 * deck any good" once and then the answer evaporates — which is exactly the
 * failure the roadmap entry describes: everything mechanical got fixed and
 * "did the output get worse" stayed unanswerable between the rare occasions
 * somebody sat and read a deck.
 *
 * A number that is recorded at generation is a different instrument from the
 * same number computed on request. It makes the comparison available without
 * anybody deciding to make it: the next session can ask what the last ten runs
 * scored, on which backend, and see a drop before reading a single slide.
 *
 * Append-only JSONL, install-wide rather than per-deck, because the question is
 * about the PRODUCT over time and a per-deck file can only answer it about one
 * deck. Small — a line is ~200 bytes, so ten thousand generations is 2 MB —
 * and trimmed at a generous ceiling rather than pruned by age, since an old
 * baseline is the most valuable row in the file.
 *
 * Deliberately not a claim about quality. Every component is necessary and none
 * is sufficient; a deck can score 100 and argue nothing. It exists so that a
 * deck broken in a way somebody already found once cannot quietly come back.
 */

const FILE = () => path.join(CONFIG, "scores.jsonl");

/** Enough rows to hold a project's whole history; a line is about 200 bytes. */
const MAX_ROWS = 10_000;

/**
 * Record one scored generation.
 *
 * Never throws: a scoring failure must not fail a generation that otherwise
 * succeeded. The deck is the artefact; this is bookkeeping about it.
 */
export async function recordScore(entry) {
  try {
    const row = {
      at: new Date().toISOString(),
      slug: entry.slug ?? null,
      score: entry.score ?? null,
      components: entry.components ?? {},
      slides: entry.counts?.slides ?? null,
      // Which backend produced it, because a score is not comparable across
      // them — that is the whole reason roleAudit reports the model actually
      // used, and a row that cannot say is a row nobody can act on.
      model: entry.model ?? null,
      transport: entry.transport ?? null,
      kind: entry.kind ?? "generate",
      // What it lost points for, capped: the score says a run got worse and
      // this says what changed.
      findings: (entry.findings ?? []).slice(0, 8),
    };
    await mkdir(CONFIG, { recursive: true });
    let existing = "";
    try { existing = await readFile(FILE(), "utf8"); } catch { /* first run */ }
    const lines = existing ? existing.split("\n").filter(Boolean) : [];
    lines.push(JSON.stringify(row));
    await writeFile(FILE(), `${lines.slice(-MAX_ROWS).join("\n")}\n`, "utf8");
    return row;
  } catch {
    return null;
  }
}

/** Every recorded score, newest last. A malformed line is skipped rather than
 *  throwing — one bad write must not make the whole history unreadable. */
export async function readScores({ limit = 0, slug = null } = {}) {
  let raw = "";
  try { raw = await readFile(FILE(), "utf8"); } catch { return []; }
  const rows = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (slug && row.slug !== slug) continue;
      rows.push(row);
    } catch { /* a truncated write is not a reason to lose the rest */ }
  }
  return limit > 0 ? rows.slice(-limit) : rows;
}

/**
 * Whether the newest run is worse than what came before it, and by how much.
 *
 * The comparison is against the MEDIAN of the previous runs rather than the
 * last one: scores move a few points between decks on subject matter alone, so
 * "worse than the previous run" fires constantly and means nothing. A drop
 * below the median of the recent history is the shape of an actual regression.
 *
 * Returns null when there is not enough history to say — which is most of the
 * time at first, and is the honest answer rather than a verdict from one
 * data point.
 */
export function regression(rows, { window = 10, drop = 8, min = 4 } = {}) {
  const scored = rows.filter((r) => typeof r.score === "number");
  if (scored.length < min + 1) return null;

  const latest = scored.at(-1);
  const prior = scored.slice(-(window + 1), -1).map((r) => r.score).sort((a, b) => a - b);
  if (prior.length < min) return null;
  const mid = prior.length % 2
    ? prior[(prior.length - 1) / 2]
    : (prior[prior.length / 2 - 1] + prior[prior.length / 2]) / 2;

  const delta = latest.score - mid;
  return {
    score: latest.score,
    median: mid,
    delta,
    over: prior.length,
    regressed: delta <= -drop,
  };
}

/** One line a human can read, for the CLI and the boot log. */
export function summarise(rows) {
  const scored = rows.filter((r) => typeof r.score === "number");
  if (!scored.length) return "no scored generations yet";
  const latest = scored.at(-1);
  const reg = regression(scored);
  const trend = reg
    ? ` — median ${reg.median} over the previous ${reg.over}${reg.regressed ? `, DOWN ${Math.abs(reg.delta)}` : ""}`
    : "";
  return `${latest.slug ?? "deck"} scored ${latest.score}/100${trend}`;
}
