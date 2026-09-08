import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

const FILE = () => path.join(CONFIG, "scores.jsonl");

const MAX_ROWS = 10_000;

export async function recordScore(entry) {
  try {
    const row = {
      at: new Date().toISOString(),
      slug: entry.slug ?? null,
      score: entry.score ?? null,
      components: entry.components ?? {},
      slides: entry.counts?.slides ?? null,
      model: entry.model ?? null,
      transport: entry.transport ?? null,
      kind: entry.kind ?? "generate",
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
