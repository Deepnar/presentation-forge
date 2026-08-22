import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "./paths.js";
import { getDb } from "./db.js";

function getVault() {
  try { return import("./vault.js"); } catch { return null; }
}

/**
 * Opt-in cloud backends — now with TCET auto tier.
 * - `auto`  = campus gateway (tcet-auto) shared key, rate-limited per user
 * - `cloud` = user's own BYOK (openai, opencode-go, etc.)
 * The key never lives in the repo: env first, then DB vault, then local.yaml legacy.
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

/** env first, then global_keys DB, then config/local.yaml — the file the Settings panel writes. */
export async function resolveSecret(name) {
  if (process.env[name]) return process.env[name];
  // DB global keys fallback for tcet
  if (name === "FORGE_TCET_API_KEY") {
    try {
      const db = getDb();
      const row = db.prepare("SELECT iv,ciphertext,tag FROM global_keys WHERE provider=?").get("tcet-auto");
      if (row) {
        const { decryptSecret } = await import("./vault.js");
        return decryptSecret(row);
      }
    } catch {}
  }
  // per-user BYOK is resolved separately via vault per userId
  return (await readYaml(LOCAL_FILE)).api_keys?.[name] ?? "";
}

export async function resolveUserSecret(userId, providerId) {
  if (!userId) return "";
  try {
    const { loadUserKey } = await import("./vault.js");
    const k = loadUserKey(userId);
    if (k && k.provider === providerId) return k.apiKey;
    // fallback: try any key for user if provider mismatch?
    if (k?.apiKey) return k.apiKey;
  } catch {}
  return "";
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
  // also write to global vault for tcet so it persists encrypted?
  if (name === "FORGE_TCET_API_KEY") {
    try {
      const { saveGlobalKey } = await import("./vault.js");
      saveGlobalKey("tcet-auto", key);
    } catch {}
  }
}

export async function clearApiKey(name) {
  const cfg = await readYaml(LOCAL_FILE);
  const keys = { ...(cfg.api_keys ?? {}) };
  delete keys[name];
  await writeFile(LOCAL_FILE, YAML.stringify({ ...cfg, api_keys: keys }), "utf8");
  if (name === "FORGE_TCET_API_KEY") {
    try {
      const db = getDb();
      db.prepare("DELETE FROM global_keys WHERE provider=?").run("tcet-auto");
    } catch {}
  }
}

// Per-user BYOK helpers (encrypted at rest)
export async function setUserApiKey(userId, provider, key) {
  const { saveUserKey } = await import("./vault.js");
  saveUserKey(userId, provider, key);
}
export async function clearUserApiKey(userId) {
  const { clearUserKey } = await import("./vault.js");
  clearUserKey(userId);
}
export async function getUserApiKey(userId) {
  try {
    const { loadUserKey } = await import("./vault.js");
    const k = loadUserKey(userId);
    return k?.apiKey ?? "";
  } catch { return ""; }
}

/** Where the model pickers default: auto (TCET) or cloud (BYOK). */
export async function routingPreference() {
  const v = (await readYaml(LOCAL_FILE)).routing?.default;
  if (v === "auto" || v === "cloud" || v === "local") return v;
  return "auto";
}

export async function setRoutingPreference(route) {
  if (!["auto", "cloud", "local"].includes(route)) {
    throw new Error(`routing default must be "auto" or "cloud" (or legacy "local"), got "${route}"`);
  }
  const cfg = await readYaml(LOCAL_FILE);
  await writeFile(LOCAL_FILE, YAML.stringify({ ...cfg, routing: { default: route } }), "utf8");
}

export function isHosted() {
  return process.env.FORGE_HOSTED === "1" || process.env.FORGE_DISABLE_LOCAL === "1";
}

// Auto provider — the free tier. On hosted it's TCET CoE (qwen3.6), on a local
// download with no TCET key it falls back to the local Ollama model so "AUTO"
// always works. This is what the header shows as AUTO. When FORGE_HOSTED=1 the
// local fallback is disabled — hosted has only Auto (TCET) + BYOK.
export async function autoProvider() {
  const models = await readYaml(MODELS_FILE);
  const tcet = models.providers?.["tcet-auto"];
  const key = await resolveSecret("FORGE_TCET_API_KEY");
  if (tcet && key.length > 0) {
    const list = Array.isArray(tcet.models) && tcet.models.length ? [...tcet.models] : await providerModels(tcet);
    return {
      id: "tcet-auto",
      label: "Auto",
      baseURL: String(tcet.baseURL).replace(/\/+$/, ""),
      models: list.length ? list : ["qwen3.6"],
      apiKey: tcet.apiKey ?? "env:FORGE_TCET_API_KEY",
      keySet: true,
      kind: "tcet",
    };
  }
  // Fallback: local Ollama as the free tier (download-and-run case)
  // Hosted has no local fallback — only TCET + BYOK.
  if (isHosted()) return null;
  const host = models.host ?? "http://localhost:11434";
  let localModels = [];
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const body = await res.json();
      localModels = (body.models ?? []).map((m) => m.name);
    }
  } catch {}
  // If no Ollama installed, still return a synthetic entry so AUTO is visible
  // but keySet false — the UI will show it as unavailable.
  return {
    id: "local",
    label: "Local",
    baseURL: host,
    models: localModels.length ? localModels : [models.roles?.author?.model ?? "qwen3-coder:30b-a3b-q4_K_M"],
    apiKey: "",
    keySet: localModels.length > 0,
    kind: "local",
  };
}
export async function autoStatus() {
  const p = await autoProvider();
  if (!p) return { configured: false, keySet: false, hosted: isHosted(), kind: isHosted() ? "hosted" : "none", route: await routingPreference() };
  return {
    configured: true,
    provider: p.id,
    label: p.label,
    baseURL: p.baseURL,
    models: p.models,
    keyName: p.id === "tcet-auto" ? "FORGE_TCET_API_KEY" : null,
    keySet: p.keySet,
    kind: p.kind ?? (p.id === "tcet-auto" ? "tcet" : "local"),
    hosted: isHosted(),
    route: await routingPreference(),
  };
}

/**
 * The BYOK cloud provider (first opt-in provider with a key, excluding tcet-auto).
 */
export async function cloudProvider() {
  const models = await readYaml(MODELS_FILE);
  for (const [id, p] of Object.entries(models.providers ?? {})) {
    if (id === "tcet-auto") continue;
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
  const ap = await autoProvider();
  const p = await cloudProvider();
  const name = await cloudKeyName();
  if (!p || !name) {
    // still return auto info so UI can show auto status
    const a = await autoStatus();
    return {
      configured: false,
      keySet: false,
      auto: a,
      route: await routingPreference(),
    };
  }
  const key = await resolveSecret(name);
  const a = await autoStatus();
  return {
    configured: true,
    provider: p.id,
    label: p.label,
    baseURL: p.baseURL,
    models: p.models,
    keyName: name,
    keySet: key.length > 0,
    route: await routingPreference(),
    auto: a,
  };
}

/**
 * A live authentication check. For tcet-auto it probes qwen3.6 with 1 token.
 */
export async function testAutoConnection() {
  const p = await autoProvider();
  if (!p) {
    if (isHosted()) return { ok: false, detail: "hosted mode — auto requires TCET key, or use BYOK Cloud" };
    return { ok: false, detail: "no auto provider configured" };
  }
  if (p.kind === "local" || p.id === "local") {
    try {
      const res = await fetch(`${p.baseURL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, detail: `Ollama not reachable at ${p.baseURL} — run: ollama serve` };
      const body = await res.json();
      const n = (body.models ?? []).length;
      return { ok: true, detail: `local Ollama OK — ${n} model(s) available`, model: p.models[0] };
    } catch (e) { return { ok: false, detail: `Ollama not reachable: ${e.message}` }; }
  }
  const key = await resolveSecret("FORGE_TCET_API_KEY");
  if (!key) return { ok: false, detail: "no Auto key configured" };
  const probe = p.models[0] ?? "qwen3.6";
  try {
    const modelsRes = await fetch(`${p.baseURL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!modelsRes.ok) {
      const t = (await modelsRes.text()).slice(0, 160);
      return { ok: false, detail: `models check failed HTTP ${modelsRes.status}: ${t}` };
    }
    const res = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: probe, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      if ([500, 520, 502, 503].includes(res.status)) {
        return { ok: false, detail: `Auto service temporarily unavailable (HTTP ${res.status}) — shared server may be restarting or at capacity. Try again or switch to Cloud.` };
      }
      return { ok: false, detail: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true, detail: `connected — ${probe} authenticated`, model: probe };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

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
