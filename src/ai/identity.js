import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";

/**
 * Per-deck identity: config/identity.yaml remembered defaults overridden by
 * decks/<slug>/meta.yaml — the same merge the renderer performs, so what the
 * model plans with matches what gets drawn. Shared by the pipeline (planning)
 * and the chat orchestrator (turn context).
 */

export function deepMerge(a, b) {
  if (Array.isArray(b)) return b;               // arrays replace, never merge
  if (b && typeof b === "object" && a && typeof a === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
    return out;
  }
  return b === undefined ? a : b;
}

export async function loadIdentity(deckDir) {
  // identity.yaml carries real personal and institutional details and is
  // gitignored, so a fresh clone falls back to the committed template.
  let base;
  try {
    base = YAML.parse(await readFile(path.join(CONFIG, "identity.yaml"), "utf8")) ?? {};
  } catch {
    base = YAML.parse(await readFile(path.join(CONFIG, "identity.example.yaml"), "utf8")) ?? {};
  }
  // Per-deck meta.yaml wins over the standing defaults, key by key — the same
  // merge the renderer performs, so what the model planned with matches what
  // gets drawn.
  if (deckDir) {
    try {
      const over = YAML.parse(await readFile(path.join(deckDir, "meta.yaml"), "utf8")) ?? {};
      return deepMerge(base, over);
    } catch { /* no meta yet */ }
  }
  return base;
}
