import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { userIdentityFile } from "../tenant.js";

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

export async function loadBaseIdentity() {
  const base = (await readYaml(path.join(CONFIG, "identity.example.yaml"))) ?? {};
  const operator = await readYaml(path.join(CONFIG, "identity.yaml"));
  return operator ? deepMerge(base, operator) : base;
}

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

  let meta = null;
  if (deckDir) meta = await readYaml(path.join(deckDir, "meta.yaml"));

  const account = owner ?? meta?.owner ?? null;
  if (account) base = deepMerge(base, await loadUserIdentity(account));

  return meta ? deepMerge(base, meta) : base;
}
