import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "./paths.js";

/**
 * Opt-in cloud backends — the OpenCode Go subscription surface.
 *
 * The key never lives in the repo: it is read from the environment first,
 * then from config/local.yaml, the gitignored file the Settings panel writes.
 * Nothing here ever returns the key value; the API hands out booleans and
 * status text only. models.yaml stays the single source for which providers
 * and models exist — this file only resolves secrets and tests reachability.
 */

const LOCAL_FILE = path.join(CONFIG, "local.yaml");
const MODELS_FILE = path.join(CONFIG, "models.yaml");

async function readYaml(file) {
  try {
    return YAML.parse(await readFile(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** env first, then config/local.yaml — the file the Settings panel writes. */
export async function resolveSecret(name) {
  if (process.env[name]) return process.env[name];
  return (await readYaml(LOCAL_FILE)).api_keys?.[name] ?? "";
}

/**
 * A provider's model list. The static `models:` array in config/models.yaml is
 * the admin's curated list; when it is empty or absent the list is fetched
 * from the provider's own GET {baseURL}/models instead, so a hosted box with a
 * provider that does not declare models still offers a picker. The fetch is
 * best-effort and key-gated: no key, no fetch, empty result.
 */
export async function providerModels(p) {
  if (p && Array.isArray(p.models) && p.models.length) return [...p.models];
  if (!p || !p.baseURL) return [];
  const name = String(p.apiKey ?? "").match(/^env:(.+)$/)?.[1] ?? null;
  const key = name ? await resolveSecret(name) : "";
  if (!key) return [];
  const base = String(p.baseURL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    const list = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
    return list.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function setApiKey(name, key) {
  const cfg = await readYaml(LOCAL_FILE);
  const next = { ...cfg, api_keys: { ...(cfg.api_keys ?? {}), [name]: key } };
  await writeFile(LOCAL_FILE, YAML.stringify(next), "utf8");
}

export async function clearApiKey(name) {
  const cfg = await readYaml(LOCAL_FILE);
  const keys = { ...(cfg.api_keys ?? {}) };
  delete keys[name];
  await writeFile(LOCAL_FILE, YAML.stringify({ ...cfg, api_keys: keys }), "utf8");
}

/** Where the model pickers default: local Ollama or the attached cloud. The
 *  preference lives in gitignored config/local.yaml — a machine choice, not a
 *  repo one. */
export async function routingPreference() {
  return (await readYaml(LOCAL_FILE)).routing?.default ?? "local";
}

export async function setRoutingPreference(route) {
  if (!["local", "cloud"].includes(route)) {
    throw new Error(`routing default must be "local" or "cloud", got "${route}"`);
  }
  const cfg = await readYaml(LOCAL_FILE);
  await writeFile(LOCAL_FILE, YAML.stringify({ ...cfg, routing: { default: route } }), "utf8");
}

/**
 * The first opt-in provider that declares a model list — the one the picker
 * exposes. Only openai-compatible providers qualify. A provider with an empty
 * `models:` array still qualifies: its list is fetched from the API (GET
 * {baseURL}/models) so a host that does not curate a list is not left with a
 * dead picker.
 */
export async function cloudProvider() {
  const models = await readYaml(MODELS_FILE);
  for (const [id, p] of Object.entries(models.providers ?? {})) {
    if (p?.type !== "openai-compatible") continue;
    const list = await providerModels(p);
    if (!list.length) continue;
    return {
      id,
      label: p.label ?? id,
      baseURL: String(p.baseURL).replace(/\/+$/, ""),
      models: list,
      apiKey: p.apiKey ?? "",
    };
  }
  return null;
}

/** The env var (or local.yaml key name) a provider's apiKey reference reads. */
export async function cloudKeyName() {
  const p = await cloudProvider();
  if (!p) return null;
  return p.apiKey.match(/^env:(.+)$/)?.[1] ?? null;
}

/** What the Settings panel renders — never the key itself. */
export async function cloudStatus() {
  const p = await cloudProvider();
  const name = await cloudKeyName();
  if (!p || !name) return { configured: false, keySet: false };
  const key = await resolveSecret(name);
  return {
    configured: true,
    provider: p.id,
    label: p.label,
    baseURL: p.baseURL,
    models: p.models,
    keyName: name,
    keySet: key.length > 0,
    route: await routingPreference(),
  };
}

/**
 * A live authentication check. A /models list is public on some providers, so
 * it proves nothing about a key — an authenticated chat probe does. Probes the
 * provider's first listed model with a one-token call; for opencode-go that is
 * deepseek-v4-flash. The detail string is safe to show — no key, no headers.
 */
export async function testCloudConnection() {
  const p = await cloudProvider();
  const name = await cloudKeyName();
  if (!p || !name) {
    return { ok: false, detail: "no cloud provider configured in config/models.yaml" };
  }
  const key = await resolveSecret(name);
  if (!key) {
    return { ok: false, detail: "no API key set — add one in Settings or export the env var" };
  }
  const probe = p.models[0] ?? "gpt-4.1-mini";
  try {
    const res = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: probe,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 160);
      return { ok: false, detail: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true, detail: `connected — ${probe} authenticated`, model: probe };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}
