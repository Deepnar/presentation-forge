import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { userIdentityFile } from "../tenant.js";

/**
 * Identity resolution, in four layers, each overriding the one before it:
 *
 *   1. config/identity.example.yaml — the committed template. Always the base,
 *      so a minimal override cannot erase the brand/chrome defaults.
 *   2. config/identity.yaml — the operator's standing default for this install.
 *   3. the deck OWNER's own identity — per account, so one user's institution
 *      and guide never appear on another user's slides.
 *   4. decks/<slug>/meta.yaml — the per-submission facts, frozen at briefing.
 *
 * Layer 3 needs no caller changes: the deck folder already records who owns it
 * (`meta.owner`), so the same meta.yaml read that supplies layer 4 also tells
 * us whose identity layer 3 is. An explicit `owner` option is for the paths
 * that have no deck folder yet — creating one, or editing the account's own
 * defaults in Settings.
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

async function readYaml(file) {
  try {
    return YAML.parse(await readFile(file, "utf8")) ?? {};
  } catch {
    return null;
  }
}

/** Just this account's overrides — what the Settings panel edits. */
export async function loadUserIdentity(email) {
  const file = userIdentityFile(email);
  if (!file) return {};
  return (await readYaml(file)) ?? {};
}

export async function saveUserIdentity(email, identity) {
  const file = userIdentityFile(email);
  if (!file) throw new Error("no account to save an identity for");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, YAML.stringify(identity), "utf8");
}

export async function clearUserIdentity(email) {
  const file = userIdentityFile(email);
  if (!file) return;
  await rm(file, { force: true });
}

/** The install-wide default: template plus the operator's identity.yaml. */
export async function loadBaseIdentity() {
  const base = (await readYaml(path.join(CONFIG, "identity.example.yaml"))) ?? {};
  const operator = await readYaml(path.join(CONFIG, "identity.yaml"));
  return operator ? deepMerge(base, operator) : base;
}

export async function loadIdentity(deckDir, { owner } = {}) {
  let base = await loadBaseIdentity();

  // The deck folder names its own owner, so the per-account layer resolves
  // without every caller having to thread a user through.
  let meta = null;
  if (deckDir) meta = await readYaml(path.join(deckDir, "meta.yaml"));

  const account = owner ?? meta?.owner ?? null;
  if (account) base = deepMerge(base, await loadUserIdentity(account));

  return meta ? deepMerge(base, meta) : base;
}
