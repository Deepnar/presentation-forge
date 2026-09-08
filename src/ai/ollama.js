import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { resolveSecret, resolveProviderKey, routingPreference, cloudProvider, autoProvider, isHosted } from "../cloud.js";
import { currentUserId } from "../account.js";
import { recordModelUsage } from "../usage.js";
import { AUTO_PROVIDER_IDS, isAutoProviderId } from "../autoid.js";
import { localFallbackArmed, isGatewayUnreachable, armedTimeout } from "../devfallback.js";
import {
  BYOK_OUTPUT_CAP,
  estimateByokActual,
  estimateByokReservation,
  reserveByokCall,
  settleByokCall,
} from "../byok-budget.js";

export const DEFAULT_EXCERPT_CHARS = 80_000;

export function applyTransport(spec, backend) {
  const isCloud = backend?.type === "openai-compatible";
  const block = isCloud ? spec?.transports?.cloud : spec?.transports?.local;
  if (!block || typeof block !== "object") return spec;
  return { ...spec, ...block, transports: spec.transports };
}

export async function authorTransport({ model } = {}) {
  const cfg = await config();
  const spec = cfg.roles?.author ?? {};
  if (spec.provider) return "cloud";
  if (model) {
    for (const p of Object.values(cfg.providers ?? {})) {
      if (p?.type === "openai-compatible" && Array.isArray(p.models) && p.models.includes(model)) {
        if (AUTO_PROVIDER_IDS.some((id) => p === cfg.providers?.[id])) return "auto";
        return "cloud";
      }
    }
    return "ollama";
  }
  const route = await routingPreference(currentUserId());
  if (route === "auto") {
    const ap = await autoProvider();
    if (ap?.keySet) {
      if (isAutoProviderId(ap.kind)) return "auto";
      return "ollama"; // local fallback is just Ollama
    }
  }
  if (route === "cloud") {
    const cp = await cloudProvider();
    if (cp?.models?.length) return "cloud";
  }
  return "ollama";
}

export async function researchProfile() {
  const cfg = await config();
  const spec = cfg.roles?.research ?? {};
  const merged = applyTransport(spec, await backendFor(cfg, spec));
  return { ...RESEARCH_DEPTH_DEFAULTS, ...(merged.research ?? {}) };
}

const RESEARCH_DEPTH_DEFAULTS = {
  angle_max: 8,
  per_query_limit: 8,
  per_query_read: 4,
  followup_sources: 3,
  followup_limit: 6,
  followup_read: 3,
  gap_max: 3,
  gap_limit: 5,
  gap_read: 3,
  papers_limit: 6,
  papers_fulltext: 2,
};

export async function researchExcerptCap({ model } = {}) {
  const cfg = await config();
  const spec = cfg.roles?.author ?? {};
  const t = await authorTransport({ model });
  const merged = applyTransport(spec, { type: t === "cloud" ? "openai-compatible" : "ollama" });
  return merged.excerpt_chars ?? DEFAULT_EXCERPT_CHARS;
}

let _cfg;

export function withOllamaHost(cfg, host = process.env.FORGE_OLLAMA_HOST) {
  const override = host?.trim();
  return override ? { ...cfg, host: override } : cfg;
}

async function config() {
  if (!_cfg) _cfg = YAML.parse(await readFile(path.join(CONFIG, "models.yaml"), "utf8"));
  return withOllamaHost(_cfg);
}

async function resolveEnv(value) {
  const m = typeof value === "string" && value.match(/^env:(.+)$/);
  if (!m) return value ?? "";
  return resolveSecret(m[1]);
}

const providerKey = (providerId, ref) => resolveProviderKey(providerId, ref);

async function backendFor(cfg, spec) {
  if (!spec.provider) return { type: "ollama", baseURL: cfg.host };
  const p = cfg.providers?.[spec.provider];
  if (!p) {
    throw new Error(
      `Role uses provider "${spec.provider}" but models.yaml has no such entry under providers:.`,
    );
  }
  if (p.type !== "openai-compatible") {
    throw new Error(`models.yaml: unknown provider type "${p.type}" for "${spec.provider}".`);
  }
  return {
    type: "openai-compatible",
    baseURL: p.baseURL,
    apiKey: await providerKey(spec.provider, p.apiKey),
    supportsThinking: Boolean(p.supports_thinking),
    sessionHeader: p.session_header === true,
    providerId: spec.provider,
    billingOwner: isAutoProviderId(spec.provider) ? "operator" : "user",
  };
}

let _installed;
async function installed(host) {
  if (_installed) return _installed;
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    _installed = new Set((body.models ?? []).map((m) => m.name));
  } catch (err) {
    throw new Error(
      `Ollama unreachable at ${host} (${err.message}). Start it with: ollama serve`,
    );
  }
  return _installed;
}

export async function resolveRole(role) {
  const cfg = await config();
  const spec = cfg.roles?.[role];
  if (!spec) throw new Error(`Unknown role "${role}". Known: ${Object.keys(cfg.roles ?? {}).join(", ")}`);

  const backend = await backendFor(cfg, spec);

  if (backend.type !== "ollama") {
    return { ...spec, role, backend, model: spec.model, fellBack: false };
  }

  if (isHosted()) {
    if (role !== "author") {
      const ap = await autoProvider();
      if (isAutoProviderId(ap?.kind) && ap?.keySet) {
        return {
          ...spec,
          role,
          backend: {
            type: "openai-compatible",
            baseURL: ap.baseURL,
            apiKey: await providerKey(ap.id, ap.apiKey),
            supportsThinking: Boolean(cfg.providers?.[ap.id]?.supports_thinking),
            sessionHeader: cfg.providers?.[ap.id]?.session_header === true,
            providerId: ap.id,
            billingOwner: "operator",
          },
          model: ap.models[0],
          fellBack: spec.model,
        };
      }
      const cp = await cloudProvider();
      if (cp) {
        const key = await providerKey(cp.id, cp.apiKey);
        if (key) {
          return {
            ...spec,
            role,
            backend: {
              type: "openai-compatible",
              baseURL: cp.baseURL,
              apiKey: key,
              supportsThinking: Boolean(cfg.providers?.[cp.id]?.supports_thinking),
              sessionHeader: cfg.providers?.[cp.id]?.session_header === true,
              providerId: cp.id,
              billingOwner: "user",
            },
            model: cp.models[0],
            fellBack: spec.model,
          };
        }
      }
    }
    throw new Error(
      `Hosted mode: role "${role}" needs Forge hosted gateway or BYOK — no local Ollama available. Add hosted key or switch to Cloud and add a BYOK key in Settings.`,
    );
  }

  const have = await installed(cfg.host);
  if (have.has(spec.model)) {
    return { ...spec, role, backend, model: spec.model, fellBack: false };
  }

  for (const alt of cfg.fallbacks ?? []) {
    if (have.has(alt)) {
      warnFallback(role, spec.model, alt);
      return { ...spec, role, backend, model: alt, fellBack: spec.model };
    }
  }
  throw new Error(
    `Role "${role}" wants ${spec.model}, which is not installed, and no fallback is either.\n` +
    `  Install it:  ollama pull ${spec.model}\n` +
    `  Installed:   ${[...have].slice(0, 8).join(", ")}`,
  );
}

const _caps = new Map();
async function modelCapabilities(host, model) {
  const key = `${host}::${model}`;
  if (_caps.has(key)) return _caps.get(key);
  let out = null;
  try {
    const res = await fetch(`${host}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) out = new Set((await res.json()).capabilities ?? []);
  } catch { /* unreachable — the caller refuses rather than assumes */ }
  if (out) _caps.set(key, out);
  return out;
}

const THINK_LEVELS = { low: "low", medium: "medium", high: "high", xhigh: "high" };

export async function ollamaThink(spec) {
  const caps = await modelCapabilities(spec.backend.baseURL, spec.model);
  if (!caps?.has("thinking")) return null;
  if (!spec.thinking) return false;
  return THINK_LEVELS[spec.reasoning_effort] ?? true;
}

export async function roleCanSeeImages(role) {
  const cfg = await config();
  const spec = cfg.roles?.[role];
  if (!spec?.vision) return { ok: false, reason: `role "${role}" is not declared as a vision role` };

  const resolved = await resolveRole(role);
  if (resolved.backend.type === "ollama") {
    const caps = await modelCapabilities(resolved.backend.baseURL, resolved.model);
    if (caps === null) {
      return { ok: false, model: resolved.model, reason: `could not ask Ollama what ${resolved.model} can do` };
    }
    if (caps.has("vision")) return { ok: true, model: resolved.model };
    return {
      ok: false,
      model: resolved.model,
      reason: `"${role}" is running ${resolved.model}, which Ollama reports cannot read images`,
    };
  }

  const entries = Object.entries(cfg.providers ?? {});
  const owner = entries.find(([id, p]) =>
    id === spec.provider || (Array.isArray(p?.models) && p.models.includes(resolved.model)));
  const [providerId, provider] = owner ?? [null, null];
  if (Array.isArray(provider?.vision_models) && provider.vision_models.includes(resolved.model)) {
    return { ok: true, model: resolved.model };
  }
  return {
    ok: false,
    model: resolved.model,
    reason: `"${role}" resolves to ${resolved.model} on ${providerId ?? "a remote provider"}, which does not declare it as a vision model`,
  };
}

export async function roleAudit() {
  if (isHosted()) {
    const reason = localFallbackArmed()
      ? "hosted — roles resolve through the gateway or BYOK; DEV FALLBACK ARMED, so an unreachable gateway drops to a local model"
      : "hosted — roles resolve through the gateway or BYOK, not local models";
    return { reachable: false, reason, devLocalFallbackArmed: localFallbackArmed(), roles: [] };
  }
  let cfg;
  try {
    cfg = await config();
  } catch (err) {
    return { reachable: false, reason: `models.yaml unreadable: ${err.message}`, roles: [] };
  }
  const names = Object.keys(cfg.roles ?? {});
  if (!names.length) return { reachable: false, reason: "models.yaml defines no roles", roles: [] };

  let have;
  try {
    have = await installed(cfg.host);
  } catch (err) {
    return { reachable: false, reason: err.message, roles: [] };
  }

  const roles = names.map((role) => {
    const spec = cfg.roles[role];
    if (spec.provider) {
      return { role, configured: spec.model, resolved: spec.model, status: "provider", provider: spec.provider };
    }
    if (have.has(spec.model)) {
      return { role, configured: spec.model, resolved: spec.model, status: "ok" };
    }
    const alt = (cfg.fallbacks ?? []).find((a) => have.has(a));
    return alt
      ? { role, configured: spec.model, resolved: alt, status: "fallback" }
      : { role, configured: spec.model, resolved: null, status: "missing" };
  });

  return {
    reachable: true,
    reason: null,
    roles,
    devLocalFallbackArmed: localFallbackArmed(),
    ok: roles.every((r) => r.status === "ok" || r.status === "provider"),
  };
}

const warnedFallbacks = new Set();
export function warnFallback(role, configured, actual) {
  if (!configured || warnedFallbacks.has(role)) return;
  warnedFallbacks.add(role);
  console.warn(
    `  WARNING: role "${role}" is configured for ${configured}, which is not installed — using ${actual} instead.`,
  );
}

const warnedDevFallbacks = new Set();
function warnDevFallback(role, wanted, actual, why) {
  const key = `${role}`;
  if (warnedDevFallbacks.has(key)) return;
  warnedDevFallbacks.add(key);
  console.warn(
    `  DEV FALLBACK: role "${role}" could not reach the gateway (${String(why).slice(0, 120)})\n` +
    `                ${wanted} -> local ${actual}. FORGE_DEV_LOCAL_FALLBACK=1 is set.\n` +
    `                This exercises the pipeline. It does NOT produce output worth judging.`,
  );
}

async function localSpecFor(cfg, spec) {
  const backend = { type: "ollama", baseURL: cfg.host };
  let have;
  try {
    have = await installed(cfg.host);
  } catch {
    return null;
  }
  const wanted = cfg.roles?.[spec.role]?.model;
  const candidates = [wanted, ...(cfg.fallbacks ?? [])].filter(Boolean);
  const model = candidates.find((m) => have.has(m)) ?? [...have][0];
  if (!model) return null;
  return { ...cfg.roles?.[spec.role], role: spec.role, backend, model, fellBack: spec.model };
}

export async function modelChoices() {
  const cfg = await config();
  const def = cfg.roles?.author?.model ?? null;
  let models = [];
  if (!isHosted()) {
    try {
      models = [...(await installed(cfg.host))].sort();
    } catch { /* offline — the picker just shows the default */ }
  } else {
    models = [];
  }
  let auto = null;
  const ap = await autoProvider();
  if (ap?.keySet) {
    auto = { provider: ap.id, label: ap.label, models: ap.models, keySet: true, kind: ap.kind };
  }
  let cloud = null;
  const cp = await cloudProvider();
  if (cp) {
    if (await providerKey(cp.id, cp.apiKey)) {
      cloud = { provider: cp.id, label: cp.label, models: cp.models };
    }
  }
  const route = await routingPreference(currentUserId());
  let defaultModel = def;
  if (route === "auto" && auto?.models.length) defaultModel = auto.models[0];
  else if (route === "cloud" && cloud?.models.length) defaultModel = cloud.models[0];
  return { models, default: defaultModel, cloud, auto, route };
}

async function cloudSpec(cfg, model, role) {
  for (const [name, p] of Object.entries(cfg.providers ?? {})) {
    if (p.type !== "openai-compatible" || !Array.isArray(p.models) || !p.models.includes(model)) continue;
    const author = cfg.roles?.author ?? {};
    return {
      role,
      temperature: author.temperature,
      top_p: author.top_p,
      num_predict: author.num_predict,
      transports: author.transports,
      thinking: author.thinking,
      reasoning_effort: author.reasoning_effort,
      backend: {
        type: "openai-compatible",
        baseURL: p.baseURL,
        apiKey: await providerKey(name, p.apiKey),
        supportsThinking: Boolean(p.supports_thinking),
        sessionHeader: p.session_header === true,
        providerId: name,
        billingOwner: isAutoProviderId(name) ? "operator" : "user",
      },
      model,
      fellBack: false,
    };
  }
  return null;
}

export async function chat(opts) {
  const res = await chatOnce(opts);
  recordModelUsage(res);
  return res;
}

async function chatOnce({
  role,
  messages,
  format,
  tools,
  images,
  temperature,
  model,
  onToken,
  signal,
}) {
  const cfg = await config();
  if (!model && role === "author") {
    const route = await routingPreference(currentUserId());
    if (route === "auto") {
      const ap = await autoProvider();
      if (isAutoProviderId(ap?.kind) && ap?.keySet && ap?.models?.length) model = ap.models[0];
      else if (isHosted()) {
        const cp = await cloudProvider();
        const hasCloudKey = cp ? Boolean(await providerKey(cp.id, cp.apiKey)) : false;
        if (hasCloudKey) {
          throw new Error(
            "Hosted auto is not configured (no hosted key). Switch to Cloud in Settings and pick a BYOK model, or set hosted gateway key.",
          );
        }
        throw new Error(
          "Hosted mode has no local model — add hosted gateway key for Auto or add a BYOK Cloud key and switch to Cloud.",
        );
      }
    } else if (route === "cloud") {
      const cp = await cloudProvider();
      if (cp?.models?.length) model = cp.models[0];
    }
  }
  let spec = model
    ? (await cloudSpec(cfg, model, role)) ?? { ...(await resolveRole(role)), model }
    : await resolveRole(role);
  spec = applyTransport(spec, spec.backend);
  const guardedByok = spec.backend?.billingOwner === "user";
  if (guardedByok) {
    spec = { ...spec, num_predict: Math.min(spec.num_predict ?? BYOK_OUTPUT_CAP, BYOK_OUTPUT_CAP) };
  }
  const stream = typeof onToken === "function";
  const timeout = armedTimeout(cfg.defaults?.request_timeout_ms ?? 300_000);
  const configuredRetries = cfg.defaults?.max_retries ?? 2;
  const maxRetries = guardedByok ? Math.min(configuredRetries, 1) : configuredRetries;
  const bumpCeiling = guardedByok
    ? BYOK_OUTPUT_CAP
    : (cfg.defaults?.num_predict_bump_ceiling ?? 64_000);
  const sessionId = randomUUID();

  let devLocalFallback = false;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let res;
      if (spec.backend.type === "ollama") {
        const payload = {
          model: spec.model,
          messages: images?.length
            ? messages.map((m, i) => (i === messages.length - 1 ? { ...m, images } : m))
            : messages,
          stream,
          keep_alive: cfg.defaults?.keep_alive ?? "15m",
          options: {
            temperature: temperature ?? spec.temperature ?? 0.7,
            num_ctx: spec.num_ctx ?? 8192,
            ...(spec.top_k != null ? { top_k: spec.top_k } : {}),
            ...(spec.top_p != null ? { top_p: spec.top_p } : {}),
            ...(spec.repeat_penalty != null ? { repeat_penalty: spec.repeat_penalty } : {}),
            ...(spec.num_predict != null ? { num_predict: spec.num_predict } : {}),
          },
        };
        if (format) payload.format = format;
        if (tools?.length) payload.tools = tools;
        const think = await ollamaThink(spec);
        if (think != null) payload.think = think;
        res = await once(spec, payload, { stream, onToken, timeout, signal });
      } else {
        res = await cloudChat(spec, {
          messages, format, tools, images, temperature,
          stream, onToken, timeout, signal, sessionId,
        });
      }

      const cap = spec.num_predict ?? null;
      res = { ...res, cap, transport: spec.backend.type, devLocalFallback };

      if (!stream && res.doneReason === "length" && cap != null && cap < bumpCeiling) {
        const next = Math.min(cap * 2, bumpCeiling);
        if (next > cap) {
          spec = { ...spec, num_predict: next };
          lastErr = null;
          attempt--; // a length bump is a retry, not a failure
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (err.name === "AbortError" && signal?.aborted) throw err;
      lastErr = err;

      if (
        !devLocalFallback &&
        localFallbackArmed() &&
        spec.backend.type !== "ollama" &&
        isGatewayUnreachable(err)
      ) {
        const local = await localSpecFor(cfg, spec);
        if (local) {
          warnDevFallback(spec.role, spec.model, local.model, err.message);
          spec = applyTransport(local, local.backend);
          devLocalFallback = true;
          attempt--; // the swap is a different request, not another try at a dead one
          continue;
        }
      }

      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Model request failed after ${maxRetries + 1} attempts: ${lastErr.message}`);
}

async function cloudChat(spec, {
  messages, format, tools, images, temperature,
  stream, onToken, timeout, signal, sessionId,
}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  const byok = spec.backend.billingOwner === "user";
  const byokUserId = byok ? currentUserId() : null;
  const outputCap = byok
    ? Math.min(spec.num_predict ?? BYOK_OUTPUT_CAP, BYOK_OUTPUT_CAP)
    : spec.num_predict;
  const body = {
    model: spec.model,
    messages: cloudMessages(messages, images, format),
    stream,
    temperature: temperature ?? spec.temperature ?? 0.7,
    ...(outputCap ? { max_tokens: outputCap } : {}),
    ...(spec.top_p != null ? { top_p: spec.top_p } : {}),
    ...(format ? { response_format: { type: "json_object" } } : {}),
    ...(tools?.length ? { tools } : {}),
    ...(spec.thinking && spec.backend.supportsThinking
      ? {
          chat_template_kwargs: {
            enable_thinking: true,
            ...(spec.reasoning_effort ? { reasoning_effort: spec.reasoning_effort } : {}),
          },
        }
      : {}),
  };
  const headers = {
    "Content-Type": "application/json",
    ...(spec.backend.apiKey ? { Authorization: `Bearer ${spec.backend.apiKey}` } : {}),
    ...(spec.backend.sessionHeader ? { "x-opencode-session": sessionId } : {}),
  };

  const reservation = byokUserId
    ? reserveByokCall({
        userId: byokUserId,
        provider: spec.backend.providerId,
        tokens: estimateByokReservation(body),
      })
    : null;

  try {
    const url = `${String(spec.backend.baseURL).replace(/\/+$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Cloud ${res.status}: ${(await res.text()).slice(0, 200)}`);

    if (!stream) {
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      settleByokCall(
        reservation?.eventId,
        estimateByokActual(body, msg.content, data.usage?.prompt_tokens, data.usage?.completion_tokens),
      );
      return {
        content: msg.content ?? "",
        toolCalls: msg.tool_calls ?? [],
        model: data.model ?? spec.model,
        role: spec.role,
        fellBack: spec.fellBack,
        evalCount: data.usage?.completion_tokens ?? 0,
        promptCount: data.usage?.prompt_tokens ?? 0,
        doneReason: data.choices?.[0]?.finish_reason ?? null,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let thinking = "";
    let toolCalls = [];
    let evalCount = 0;
    let promptCount = 0;
    let doneReason = null;
    let finished = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done || finished) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while (!finished && (idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { finished = true; break; }
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        const choice = obj.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.content) { content += delta.content; onToken(delta.content); }
        if (delta.tool_calls?.length) toolCalls = delta.tool_calls;
        if (choice.finish_reason) doneReason = choice.finish_reason;
        if (obj.usage?.completion_tokens) evalCount = obj.usage.completion_tokens;
        if (obj.usage?.prompt_tokens) promptCount = obj.usage.prompt_tokens;
      }
    }

    settleByokCall(
      reservation?.eventId,
      estimateByokActual(body, content, promptCount, evalCount),
    );
    return {
      content, toolCalls, thinking: thinking || null,
      model: spec.model, role: spec.role, fellBack: spec.fellBack,
      evalCount, promptCount, doneReason,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function cloudMessages(messages, images, format) {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
  if (format) {
    const schemaNote = "Respond in JSON only, matching this JSON Schema exactly:\n" + JSON.stringify(format);
    if (out.length && out[0].role === "system") {
      out[0] = { role: "system", content: `${schemaNote}\n\n${out[0].content}` };
    } else {
      out.unshift({ role: "system", content: schemaNote });
    }
  }
  if (images?.length) {
    const last = out[out.length - 1];
    last.content = [
      { type: "text", text: last.content },
      ...images.map((b64) => ({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${b64}` },
      })),
    ];
  }
  return out;
}

async function once(spec, payload, { stream, onToken, timeout, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(`${spec.backend.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);

    if (!stream) {
      const body = await res.json();
      return {
        content: body.message?.content ?? "",
        thinking: body.message?.thinking || null,
        toolCalls: body.message?.tool_calls ?? [],
        model: spec.model,
        role: spec.role,
        fellBack: spec.fellBack,
        evalCount: body.eval_count ?? 0,
        promptCount: body.prompt_eval_count ?? 0,
        doneReason: body.done_reason ?? null,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let toolCalls = [];
    let evalCount = 0;
    let promptCount = 0;
    let doneReason = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }

        const piece = obj.message?.content ?? "";
        if (piece) {
          content += piece;
          onToken(piece);
        }
        if (obj.message?.thinking) thinking += obj.message.thinking;
        if (obj.message?.tool_calls?.length) toolCalls = obj.message.tool_calls;
        if (obj.eval_count) evalCount = obj.eval_count;
        if (obj.prompt_eval_count) promptCount = obj.prompt_eval_count;
        if (obj.done_reason) doneReason = obj.done_reason;
      }
    }

    return {
      content, toolCalls,
      model: spec.model, role: spec.role, fellBack: spec.fellBack,
      evalCount, promptCount, doneReason,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function chatJSON({ role, messages, schema, ...rest }) {
  const res = await chat({ role, messages, format: schema, ...rest });
  const raw = res.content.trim();
  try {
    return { ...res, data: JSON.parse(raw) };
  } catch {
    const salvage = salvageJSON(raw);
    if (salvage.value !== undefined) return { ...res, data: salvage.value, salvaged: true };
    const why = res.doneReason === "length"
      ? ` Generation was CUT SHORT (done_reason=length, ${res.evalCount} tokens) — the ` +
        `${res.transport ?? "?"} transport's effective cap (${res.cap ?? "unset"} tokens) was hit; ` +
        `the transport already retries length-truncated responses with the cap doubled up to the ceiling.`
      : ` (done_reason=${res.doneReason}, ${res.evalCount} tokens)`;
    throw new Error(
      `Model did not return JSON.${why}\n` +
      `Salvage attempts: ${salvage.attempts.join("; ") || "none"}\n` +
      `First 300 chars:\n${raw.slice(0, 300)}`,
    );
  }
}

function fenceCandidates(text) {
  const out = [];
  const re = /```[a-zA-Z]*\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

function tryParseWithRepairs(slice, attempts) {
  try {
    const value = JSON.parse(slice);
    attempts.push(`balanced ${slice.length}ch parse`);
    return { value };
  } catch (err) {
    const stripped = slice.replace(/,\s*([}\]])/g, "$1");
    if (stripped !== slice) {
      try {
        const value = JSON.parse(stripped);
        attempts.push(`balanced ${slice.length}ch parse after trailing-comma repair`);
        return { value };
      } catch { /* still broken — fall through */ }
    }
    attempts.push(`balanced ${slice.length}ch parse FAILED (${err.message})`);
    return {};
  }
}

export function salvageJSON(text) {
  const attempts = [];
  const docs = [...fenceCandidates(text), text];
  for (const doc of docs) {
    if (!doc || !doc.trim()) continue;
    for (let i = 0; i < doc.length; i++) {
      const ch = doc[i];
      if (ch !== "{" && ch !== "[") continue;
      const close = ch === "{" ? "}" : "]";
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < doc.length; j++) {
        const c = doc[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === ch) depth++;
        else if (c === close && --depth === 0) {
          const r = tryParseWithRepairs(doc.slice(i, j + 1), attempts);
          if (r.value !== undefined) return { value: r.value, attempts };
          break; // this region is broken — try the next start position
        }
      }
    }
  }
  return { value: undefined, attempts };
}

export async function ollamaHealthy() {
  try {
    const cfg = await config();
    const res = await fetch(`${cfg.host}/api/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
