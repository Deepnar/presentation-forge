import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "./paths.js";
import { getDb } from "./db.js";
import { currentUserId } from "./account.js";
import { AUTO_PROVIDER, AUTO_PROVIDER_IDS, AUTO_KEY_ENV, LEGACY_AUTO_KEY_ENV, isAutoProviderId, pickAutoProvider } from "./autoid.js";
import { estimateByokActual, estimateByokReservation, reserveByokCall, settleByokCall } from "./byok-budget.js";

function getVault() {
  try { return import("./vault.js"); } catch { return null; }
}

const LOCAL_FILE = path.join(CONFIG, "local.yaml");
const MODELS_FILE = path.join(CONFIG, "models.yaml");

async function readYaml(file) {
  try {
    return YAML.parse(await readFile(file, "utf8")) ?? {};
  } catch {
    return {};
  }
}

export async function resolveSecret(name) {
  if (process.env[name]) return process.env[name];
  if (name === AUTO_KEY_ENV && process.env[LEGACY_AUTO_KEY_ENV]) return process.env[LEGACY_AUTO_KEY_ENV];
  if (name === LEGACY_AUTO_KEY_ENV && process.env[AUTO_KEY_ENV]) return process.env[AUTO_KEY_ENV];

  if (name === AUTO_KEY_ENV || name === LEGACY_AUTO_KEY_ENV) {
    try {
      const db = getDb();
      const { decryptSecret } = await import("./vault.js");
      for (const provider of AUTO_PROVIDER_IDS) {
        const row = db.prepare("SELECT iv,ciphertext,tag FROM global_keys WHERE provider=?").get(provider);
        if (row) return decryptSecret(row);
      }
    } catch {}
  }
  const stored = (await readYaml(LOCAL_FILE)).api_keys ?? {};
  if (stored[name]) return stored[name];
  if (name === AUTO_KEY_ENV && stored[LEGACY_AUTO_KEY_ENV]) return stored[LEGACY_AUTO_KEY_ENV];
  return "";
}

export async function resolveProviderKey(providerId, apiKeyRef) {
  const userId = currentUserId();
  if (userId && providerId && !isAutoProviderId(providerId)) {
    const own = await resolveUserSecret(userId, providerId);
    if (own) return own;
  }
  const m = typeof apiKeyRef === "string" && apiKeyRef.match(/^env:(.+)$/);
  if (!m) return apiKeyRef ?? "";
  return resolveSecret(m[1]);
}

export async function resolveUserSecret(userId, providerId) {
  if (!userId) return "";
  try {
    const { loadUserKey } = await import("./vault.js");
    const k = loadUserKey(userId);
    if (k && k.provider === providerId) return k.apiKey;
    if (k?.apiKey) return k.apiKey;
  } catch {}
  return "";
}

export async function providerModels(p, providerId = null) {
  if (p && Array.isArray(p.models) && p.models.length) return [...p.models];
  if (!p || !p.baseURL) return [];
  const key = await resolveProviderKey(providerId, p.apiKey);
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
  if (name === "FORGE_TCET_API_KEY") {
    try {
      const { saveGlobalKey } = await import("./vault.js");
      saveGlobalKey(AUTO_PROVIDER, key);
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
      for (const p of AUTO_PROVIDER_IDS) db.prepare("DELETE FROM global_keys WHERE provider=?").run(p);
    } catch {}
  }
}

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

const ROUTES = ["auto", "cloud", "local"];

export async function routingPreference(userId = null) {
  if (userId) {
    try {
      const row = getDb().prepare("SELECT routing FROM user_prefs WHERE user_id=?").get(userId);
      if (row && ROUTES.includes(row.routing)) return row.routing;
    } catch { /* no DB (JSON-only tests) — fall through to the install default */ }
  }
  const v = (await readYaml(LOCAL_FILE)).routing?.default;
  return ROUTES.includes(v) ? v : "auto";
}

export async function setRoutingPreference(route, userId = null) {
  if (!ROUTES.includes(route)) {
    throw new Error(`routing default must be "auto" or "cloud" (or legacy "local"), got "${route}"`);
  }
  if (userId) {
    getDb().prepare(`
      INSERT INTO user_prefs (user_id, routing, updated_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET routing=excluded.routing, updated_at=excluded.updated_at
    `).run(userId, route, new Date().toISOString());
    return;
  }
  const cfg = await readYaml(LOCAL_FILE);
  await writeFile(LOCAL_FILE, YAML.stringify({ ...cfg, routing: { default: route } }), "utf8");
}

const HOSTED_FILE = path.join(CONFIG, "hosted.json");

let hostedOverride = null;
export function setHostedForTest(flag) {
  hostedOverride = flag === null ? null : Boolean(flag);
}

export function isHosted() {
  if (hostedOverride !== null) return hostedOverride;
  try {
    if (existsSync(HOSTED_FILE)) {
      const j = JSON.parse(readFileSync(HOSTED_FILE, "utf8"));
      if (j && typeof j.hosted === "boolean") return j.hosted;
    }
  } catch {}
  if (process.env.FORGE_HOSTED === "1" || process.env.FORGE_DISABLE_LOCAL === "1") return true;
  if (process.env.FORGE_HOSTED === "0") return false;
  return false;
}
export async function setHosted(flag) {
  const next = Boolean(flag);
  await writeFile(HOSTED_FILE, JSON.stringify({ hosted: next, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  return next;
}

export async function autoProvider() {
  const models = await readYaml(MODELS_FILE);
  const found = pickAutoProvider(models.providers);
  const key = await resolveSecret(AUTO_KEY_ENV);
  if (found && key.length > 0) {
    const { spec } = found;
    const list = Array.isArray(spec.models) && spec.models.length
      ? [...spec.models]
      : await providerModels(spec, AUTO_PROVIDER);
    return {
      id: AUTO_PROVIDER,
      label: "Auto",
      baseURL: String(spec.baseURL).replace(/\/+$/, ""),
      models: list.length ? list : ["qwen3.6"],
      apiKey: spec.apiKey ?? `env:${AUTO_KEY_ENV}`,
      keySet: true,
      kind: AUTO_PROVIDER,
    };
  }
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
export async function autoStatus(userId = null) {
  const p = await autoProvider();
  if (!p) return { configured: false, keySet: false, hosted: isHosted(), kind: isHosted() ? "hosted" : "none", route: await routingPreference(userId) };
  return {
    configured: true,
    provider: p.id,
    label: p.label,
    baseURL: p.baseURL,
    models: p.models,
    keyName: isAutoProviderId(p.id) ? AUTO_KEY_ENV : null,
    keySet: p.keySet,
    kind: p.kind ?? (isAutoProviderId(p.id) ? AUTO_PROVIDER : "local"),
    hosted: isHosted(),
    route: await routingPreference(userId),
  };
}

export async function cloudProvider() {
  const models = await readYaml(MODELS_FILE);
  for (const [id, p] of Object.entries(models.providers ?? {})) {
    if (isAutoProviderId(id)) continue;
    if (p?.type !== "openai-compatible") continue;
    const list = await providerModels(p, id);
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

export async function cloudKeyName() {
  const p = await cloudProvider();
  if (!p) return null;
  return p.apiKey.match(/^env:(.+)$/)?.[1] ?? null;
}

export async function cloudStatus(userId = null) {
  const ap = await autoProvider();
  const p = await cloudProvider();
  const name = await cloudKeyName();
  if (!p || !name) {
    const a = await autoStatus(userId);
    return {
      configured: false,
      keySet: false,
      auto: a,
      route: await routingPreference(userId),
    };
  }
  const key = await resolveProviderKey(p.id, p.apiKey);
  const a = await autoStatus(userId);
  return {
    configured: true,
    provider: p.id,
    label: p.label,
    baseURL: p.baseURL,
    models: p.models,
    keyName: name,
    keySet: key.length > 0,
    route: await routingPreference(userId),
    auto: a,
  };
}

const AUTO_HEALTH_TTL_MS = 60_000;
let autoHealthCache = null;

let autoHealthInFlight = null;

async function probeAutoHealth() {
  const at = Date.now();
  let value;
  try {
    const r = await testAutoConnection();
    value = { ok: r.ok === true, detail: r.detail ?? null, checkedAt: new Date(at).toISOString() };
  } catch (err) {
    value = { ok: false, detail: err.message, checkedAt: new Date(at).toISOString() };
  }
  autoHealthCache = { at, value };
  return value;
}

export async function autoHealth({ force = false } = {}) {
  const fresh = autoHealthCache && Date.now() - autoHealthCache.at < AUTO_HEALTH_TTL_MS;
  if (!force && fresh) return autoHealthCache.value;

  if (!autoHealthInFlight) {
    autoHealthInFlight = probeAutoHealth().finally(() => { autoHealthInFlight = null; });
  }
  if (force) return autoHealthInFlight;
  if (autoHealthCache) return { ...autoHealthCache.value, stale: true };

  return { ok: null, pending: true, detail: "checking…", checkedAt: null };
}

export async function testAutoConnection() {
  const p = await autoProvider();
  if (!p) {
    if (isHosted()) return { ok: false, detail: "hosted mode — auto requires hosted gateway key, or use BYOK Cloud" };
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
    if (err.name === "TimeoutError" || /aborted due to timeout/i.test(err.message)) {
      return {
        ok: false,
        detail: "gateway reachable but not generating — a one-token request timed out. The model service behind it is down or saturated; nothing on this box can fix it.",
      };
    }
    return { ok: false, detail: err.message };
  }
}

export async function testCloudConnection() {
  const p = await cloudProvider();
  if (!p) {
    return { ok: false, detail: "no cloud provider configured in config/models.yaml" };
  }
  const key = await resolveProviderKey(p.id, p.apiKey);
  if (!key) {
    return { ok: false, detail: "no API key set — add one in Settings or export the env var" };
  }
  const probe = p.models[0] ?? "gpt-4.1-mini";
  const body = {
    model: probe,
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
  };
  const reservation = currentUserId()
    ? reserveByokCall({
        userId: currentUserId(),
        provider: p.id,
        tokens: estimateByokReservation(body),
      })
    : null;
  try {
    const res = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 160);
      return { ok: false, detail: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json().catch(() => ({}));
    settleByokCall(
      reservation?.eventId,
      estimateByokActual(
        body,
        data.choices?.[0]?.message?.content,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
    );
    return { ok: true, detail: `connected — ${probe} authenticated`, model: probe };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}
