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

/**
 * Whether this install's operator default has actually been filled in.
 *
 * `config/identity.yaml` is gitignored, so a fresh box has none and every deck
 * whose owner has set nothing renders with the committed example's "Example
 * Institute of Technology". That is a wrong answer delivered silently: the
 * pipeline succeeds, the .pptx opens, and the only symptom is a stranger's
 * institution on a submitted deck. This box carried `institution.name: HACKED`
 * for weeks for exactly that reason.
 *
 * Modelled on donorStatus: a state with a reason, read by the boot log and by
 * Admin, never fatal. An unconfigured default is the ordinary local case and
 * must not stop a server that renders 34 themes of slides.
 *
 * `incomplete` is deliberately structural rather than a list of suspect values.
 * The long-term facts arrive together — a real institution has a short form and
 * a department — so a file carrying a name and nothing else was abandoned
 * half-written, whatever the name says.
 */
const LONG_TERM_FIELDS = ["short", "department"];

export async function identityStatus() {
  const template = (await readYaml(path.join(CONFIG, "identity.example.yaml"))) ?? {};
  const operator = await readYaml(path.join(CONFIG, "identity.yaml"));
  const file = path.join(CONFIG, "identity.yaml");
  const templateName = String(template.institution?.name ?? "").trim();

  if (!operator) {
    return { ok: false, file, reason: "missing", name: templateName, missing: [], detail: "no operator identity file — decks fall back to the committed example" };
  }

  const name = String(operator.institution?.name ?? "").trim();
  if (!name) {
    return { ok: false, file, reason: "missing", name: templateName, missing: ["name"], detail: "the operator identity file names no institution" };
  }
  if (templateName && name === templateName) {
    return { ok: false, file, reason: "template", name, missing: [], detail: `still the shipped example (${name})` };
  }

  const missing = LONG_TERM_FIELDS.filter((f) => {
    const value = String(operator.institution?.[f] ?? "").trim();
    return !value || value === String(template.institution?.[f] ?? "").trim();
  });
  if (missing.length) {
    return { ok: false, file, reason: "incomplete", name, missing, detail: `"${name}" has no ${missing.join(" or ")}` };
  }

  return { ok: true, file, reason: null, name, missing: [], detail: name };
}

/** The one-line form, for the boot log and the admin panel. */
export function identityUnconfigured(status) {
  if (status.reason === "template") {
    return `this server's default identity is still the shipped example — every deck whose owner has set none renders as "${status.name}"`;
  }
  if (status.reason === "incomplete") {
    return `this server's default identity is half-written: ${status.detail} — decks fall back to the shipped example for the rest`;
  }
  return `this server has no default identity configured — every deck whose owner has set none renders as "${status.name}"`;
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
