import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { resolveSecret, routingPreference, cloudProvider, autoProvider, isHosted } from "../cloud.js";

/**
 * Per-transport capability split. A role's sampling/output/context settings are
 * written for the LOCAL backend — the caps and conservative choices a
 * small-model pipeline survives on. A role may declare `transports.cloud` (and
 * optionally `transports.local`) overrides; the cloud transport then gets the
 * full capability instead of inheriting limits that only exist because the
 * local model cannot handle more. Everything that resolves a role applies this
 * before the request is built, so both backends always see their own numbers.
 */

/** The research excerpt default (80000 chars ≈ 23K tokens) — what the local
 *  author's 32768 num_ctx window has headroom for. Research.js re-exports it. */
export const DEFAULT_EXCERPT_CHARS = 80_000;

/**
 * Merge a role's per-transport overrides over its base spec. Shallow at the top
 * level, so a nested block (e.g. `research:`) is replaced wholesale by its
 * cloud form rather than partially merged — the overrides are a complete
 * alternative, not a patch.
 */
export function applyTransport(spec, backend) {
  // tcet-auto is an openai-compatible backend but uses the cloud overrides (larger caps)
  const isCloud = backend?.type === "openai-compatible";
  const block = isCloud ? spec?.transports?.cloud : spec?.transports?.local;
  if (!block || typeof block !== "object") return spec;
  return { ...spec, ...block, transports: spec.transports };
}

/**
 * The transport the author role would run on right now, mirroring `chat()`'s
 * own resolution: an explicit `provider` wins, then an explicit model name that
 * belongs to a cloud provider's `models:` list, then the routing preference.
 * Exposed so prompt-builders can pick a full-strength variant for cloud before
 * the call is made.
 */
export async function authorTransport({ model } = {}) {
  const cfg = await config();
  const spec = cfg.roles?.author ?? {};
  if (spec.provider) return "cloud";
  if (model) {
    // tcet-auto's single model is qwen3.6 — treat as cloud-equivalent for caps
    for (const p of Object.values(cfg.providers ?? {})) {
      if (p?.type === "openai-compatible" && Array.isArray(p.models) && p.models.includes(model)) {
        if (p === cfg.providers?.["tcet-auto"]) return "auto";
        return "cloud";
      }
    }
    return "ollama";
  }
  const route = await routingPreference();
  if (route === "auto") {
    const ap = await autoProvider();
    if (ap?.keySet) {
      if (ap.kind === "tcet") return "auto";
      return "ollama"; // local fallback is just Ollama
    }
  }
  if (route === "cloud") {
    const cp = await cloudProvider();
    if (cp?.models?.length) return "cloud";
  }
  return "ollama";
}

/** The transport-aware research depth profile for the research role. */
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

/**
 * How much of research/notes.md the AUTHOR role can see per call. The cap exists
 * because the local author's num_ctx is 32768; on the cloud transport the
 * window is far larger, so the cloud override raises it. Mirrors `chat()`'s
 * transport decision so the excerpt matches the model that will actually read
 * it.
 */
export async function researchExcerptCap({ model } = {}) {
  const cfg = await config();
  const spec = cfg.roles?.author ?? {};
  const t = await authorTransport({ model });
  const merged = applyTransport(spec, { type: t === "cloud" ? "openai-compatible" : "ollama" });
  return merged.excerpt_chars ?? DEFAULT_EXCERPT_CHARS;
}

/**
 * Model client, role-addressed, with an optional cloud backend.
 *
 * Callers ask for a *role* ("author") rather than a model id, so swapping the
 * model behind a role is a config edit. Roles resolve to the local Ollama
 * backend by default; a role may opt into an OpenAI-compatible cloud provider
 * via `provider:` in config/models.yaml. Deliberately thin — no agent
 * framework. The pipeline is a fixed sequence, and every prompt token needs to
 * stay visible and editable.
 */

let _cfg;
async function config() {
  if (!_cfg) _cfg = YAML.parse(await readFile(path.join(CONFIG, "models.yaml"), "utf8"));
  return _cfg;
}

/**
 * Resolve an `env:NAME` apiKey reference: the environment first, then
 * config/local.yaml — the gitignored file the Settings panel writes, so the UI
 * can attach a key without the user exporting anything.
 */
async function resolveEnv(value) {
  const m = typeof value === "string" && value.match(/^env:(.+)$/);
  if (!m) return value ?? "";
  return resolveSecret(m[1]);
}

/**
 * The transport a role's model runs on. No `provider` on the role means the
 * local Ollama backend; anything else must be a defined `providers:` entry.
 */
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
  return { type: "openai-compatible", baseURL: p.baseURL, apiKey: await resolveEnv(p.apiKey) };
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

/**
 * Resolve a role to the model it runs on and the backend that serves it.
 * For Ollama the model must be pulled, falling back rather than failing — a
 * missing model should degrade quality, not abort a deck. Cloud backends skip
 * the installed check; a missing key surfaces as a request error.
 */
export async function resolveRole(role) {
  const cfg = await config();
  const spec = cfg.roles?.[role];
  if (!spec) throw new Error(`Unknown role "${role}". Known: ${Object.keys(cfg.roles ?? {}).join(", ")}`);

  const backend = await backendFor(cfg, spec);

  if (backend.type !== "ollama") {
    return { ...spec, role, backend, model: spec.model, fellBack: false };
  }

  // Hosted has no Ollama — internal roles (research, critic, utility) fall
  // through TCET or BYOK. The author role is routed explicitly in chat()
  // via routingPreference, so it should not silently fall back here — a
  // missing route there must surface as a clear hosted error.
  if (isHosted()) {
    if (role !== "author") {
      const ap = await autoProvider();
      if (ap?.kind === "tcet" && ap?.keySet) {
        return {
          ...spec,
          role,
          backend: { type: "openai-compatible", baseURL: ap.baseURL, apiKey: await resolveEnv(ap.apiKey) },
          model: ap.models[0],
          fellBack: spec.model,
        };
      }
      const cp = await cloudProvider();
      if (cp) {
        const key = await resolveEnv(cp.apiKey);
        if (key) {
          return {
            ...spec,
            role,
            backend: { type: "openai-compatible", baseURL: cp.baseURL, apiKey: key },
            model: cp.models[0],
            fellBack: spec.model,
          };
        }
      }
    }
    throw new Error(
      `Hosted mode: role "${role}" needs TCET or BYOK — no local Ollama available. Add FORGE_TCET_API_KEY or switch to Cloud and add a BYOK key in Settings.`,
    );
  }

  const have = await installed(cfg.host);
  if (have.has(spec.model)) {
    return { ...spec, role, backend, model: spec.model, fellBack: false };
  }

  for (const alt of cfg.fallbacks ?? []) {
    if (have.has(alt)) {
      return { ...spec, role, backend, model: alt, fellBack: spec.model };
    }
  }
  throw new Error(
    `Role "${role}" wants ${spec.model}, which is not installed, and no fallback is either.\n` +
    `  Install it:  ollama pull ${spec.model}\n` +
    `  Installed:   ${[...have].slice(0, 8).join(", ")}`,
  );
}

/**
 * The picker's options: every installed local model, plus the models of any
 * opt-in cloud provider whose key is present (grouped separately so the UI can
 * label them), plus the author role's default. `model: null` in a request means
 * "the role default", so the UI can present that as an explicit choice.
 * Installed models are best-effort — a dead Ollama yields just the default, and
 * requests fail loudly on their own.
 *
 * The routing preference (gitignored config/local.yaml) chooses what "auto"
 * means: tcet-auto's qwen3.6, or the attached cloud's first model.
 */
export async function modelChoices() {
  const cfg = await config();
  const def = cfg.roles?.author?.model ?? null;
  let models = [];
  if (!isHosted()) {
    try {
      models = [...(await installed(cfg.host))].sort();
    } catch { /* offline — the picker just shows the default */ }
  } else {
    // Hosted has no local Ollama
    models = [];
  }
  // auto (tcet) status
  let auto = null;
  const ap = await autoProvider();
  if (ap?.keySet) {
    auto = { provider: ap.id, label: ap.label, models: ap.models };
  }
  // cloud (BYOK) provider
  let cloud = null;
  const cp = await cloudProvider();
  if (cp) {
    const keyName = String(cp.apiKey).match(/^env:(.+)$/)?.[1] ?? null;
    if (keyName && (await resolveEnv(cp.apiKey))) {
      cloud = { provider: cp.id, label: cp.label, models: cp.models };
    }
  }
  const route = await routingPreference();
  let defaultModel = def;
  if (route === "auto" && auto?.models.length) defaultModel = auto.models[0];
  else if (route === "cloud" && cloud?.models.length) defaultModel = cloud.models[0];
  return { models, default: defaultModel, cloud, auto, route };
}

/**
 * A `model` override that names one of a cloud provider's listed models routes
 * to that provider — this is how picking "deepseek-v4-flash" in the UI sends
 * the request to OpenCode Go rather than to a (probably absent) local pull.
 * Sampling defaults come from the author role, the only role the UI overrides.
 */
async function cloudSpec(cfg, model, role) {
  for (const [name, p] of Object.entries(cfg.providers ?? {})) {
    if (p.type !== "openai-compatible" || !Array.isArray(p.models) || !p.models.includes(model)) continue;
    const author = cfg.roles?.author ?? {};
    return {
      role,
      temperature: author.temperature,
      top_p: author.top_p,
      num_predict: author.num_predict,
      // Carried so the per-transport override can raise the cap for the cloud
      // backend the model override just selected.
      transports: author.transports,
      backend: { type: "openai-compatible", baseURL: p.baseURL, apiKey: await resolveEnv(p.apiKey) },
      model,
      fellBack: false,
    };
  }
  return null;
}

/**
 * One chat completion against whatever backend the role resolves to.
 *
 * Local Ollama gets `format` (a JSON Schema compiled to a decoding grammar).
 * Cloud (OpenAI-compatible) gets `response_format: json_object` and relies on
 * the model being strong enough to obey it — so prefer big cloud models and
 * keep the schema small. `model` overrides the role's default on either.
 */
export async function chat({
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
  // Routing: when the user's preference is cloud and no explicit model was
  // picked, the author role's work goes to the attached cloud provider's first
  // model. This is how the header's LOCAL/CLOUD toggle takes effect — "auto"
  // follows the preference rather than the author role's local default. Only
  // the author role routes: that is what the pickers control, and the internal
  // roles (research, utility, critic) stay on their configured backends —
  // cloud routing is about where the user's work runs, not the plumbing.
  if (!model && role === "author") {
    const route = await routingPreference();
    if (route === "auto") {
      const ap = await autoProvider();
      if (ap?.kind === "tcet" && ap?.keySet && ap?.models?.length) model = ap.models[0];
      else if (isHosted()) {
        // Hosted has no local fallback — surface a clear error instead of
        // "Ollama unreachable". If BYOK is present, hint to switch to Cloud.
        const cp = await cloudProvider();
        const hasCloudKey = cp ? Boolean(await resolveEnv(cp.apiKey)) : false;
        if (hasCloudKey) {
          throw new Error(
            "Hosted auto is not configured (no TCET key). Switch to Cloud in Settings and pick a BYOK model, or set FORGE_TCET_API_KEY.",
          );
        }
        throw new Error(
          "Hosted mode has no local model — add FORGE_TCET_API_KEY for Auto or add a BYOK Cloud key and switch to Cloud.",
        );
      }
      // local fallback: let Ollama resolve the author's default, no explicit model
    } else if (route === "cloud") {
      const cp = await cloudProvider();
      if (cp?.models?.length) model = cp.models[0];
    }
  }
  let spec = model
    ? (await cloudSpec(cfg, model, role)) ?? { ...(await resolveRole(role)), model }
    : await resolveRole(role);
  // The per-transport split lands here: the resolved role spec is written for
  // one backend, and the transport it actually runs on may override it (cloud
  // gets the larger num_predict / excerpt budget, never the local caps).
  spec = applyTransport(spec, spec.backend);
  const stream = typeof onToken === "function";
  const timeout = cfg.defaults?.request_timeout_ms ?? 300_000;
  const maxRetries = cfg.defaults?.max_retries ?? 2;
  const bumpCeiling = cfg.defaults?.num_predict_bump_ceiling ?? 64_000;

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
            // Only send what the role declares — Ollama's own defaults are sane,
            // and overriding them blindly is how sampling bugs get introduced.
            ...(spec.top_k != null ? { top_k: spec.top_k } : {}),
            ...(spec.top_p != null ? { top_p: spec.top_p } : {}),
            ...(spec.repeat_penalty != null ? { repeat_penalty: spec.repeat_penalty } : {}),
            ...(spec.num_predict != null ? { num_predict: spec.num_predict } : {}),
          },
        };
        if (format) payload.format = format;
        if (tools?.length) payload.tools = tools;
        res = await once(spec, payload, { stream, onToken, timeout, signal });
      } else {
        res = await cloudChat(spec, {
          messages, format, tools, images, temperature,
          stream, onToken, timeout, signal,
        });
      }

      // Carry the effective cap and transport on the result so callers can say
      // "cut at N tokens" precisely and decide whether a bump is warranted.
      const cap = spec.num_predict ?? null;
      res = { ...res, cap, transport: spec.backend.type };

      // done_reason=length means the response hit the token cap mid-output, not
      // that the model stopped for a good reason. Retry the same request with
      // the cap doubled, up to the ceiling — a legitimate large output gets
      // room, while a runaway grammar still fails cleanly once the ceiling is
      // reached. Non-streamed only: tokens already streamed cannot be unsaid,
      // so a truncated streamed turn keeps today's behaviour (failed JSON parse
      // surfaced as an error).
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
      // A caller-initiated abort is intentional; never retry it.
      if (err.name === "AbortError" && signal?.aborted) throw err;
      lastErr = err;
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Model request failed after ${maxRetries + 1} attempts: ${lastErr.message}`);
}

/** OpenAI-compatible /chat/completions transport (stream and non-stream). */
async function cloudChat(spec, {
  messages, format, tools, images, temperature,
  stream, onToken, timeout, signal,
}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  const body = {
    model: spec.model,
    messages: cloudMessages(messages, images, format),
    stream,
    temperature: temperature ?? spec.temperature ?? 0.7,
    ...(spec.num_predict ? { max_tokens: spec.num_predict } : {}),
    ...(spec.top_p != null ? { top_p: spec.top_p } : {}),
    // The cloud transport cannot compile a decoding grammar; json_object is the
    // closest universal guarantee, and chatJSON's salvage covers the rest.
    ...(format ? { response_format: { type: "json_object" } } : {}),
    ...(tools?.length ? { tools } : {}),
  };
  const headers = {
    "Content-Type": "application/json",
    ...(spec.backend.apiKey ? { Authorization: `Bearer ${spec.backend.apiKey}` } : {}),
  };

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
      return {
        content: msg.content ?? "",
        toolCalls: msg.tool_calls ?? [],
        model: data.model ?? spec.model,
        role: spec.role,
        fellBack: spec.fellBack,
        evalCount: data.usage?.completion_tokens ?? 0,
        promptCount: data.usage?.prompt_tokens ?? 0,
        // "stop" = finished; "length" = hit max_tokens — the same truncation
        // signal chatJSON checks for on the Ollama side.
        doneReason: data.choices?.[0]?.finish_reason ?? null,
      };
    }

    // SSE: one `data: {json}` per line, `data: [DONE]` at the end.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
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

/**
 * Cloud messages: images ride on the last user message as data-URL parts.
 *
 * Providers that offer `response_format: json_object` demand the word "json"
 * appear in the prompt, or they reject the request outright. Many of this
 * system's prompts never mention it (the report planner, for one). When the
 * request asks for structured output, a system message stating the contract
 * satisfies the provider and nudges the model — without touching every caller.
 *
 * `json_object` guarantees only that output parses, never that it matches the
 * schema — unlike Ollama's grammar, which enforces shape. So the schema itself
 * is spelled out in that message: a strong cloud model can hold a small schema
 * in context and emit its keys correctly, which is exactly what the local
 * grammar did for us. Big schemas degrade this, so keep the per-call schemas
 * small (the report section grammars already are).
 */
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
        toolCalls: body.message?.tool_calls ?? [],
        model: spec.model,
        role: spec.role,
        fellBack: spec.fellBack,
        evalCount: body.eval_count ?? 0,
        promptCount: body.prompt_eval_count ?? 0,
        // "stop" = model finished; "length" = hit num_predict or context.
        // Without this a truncated response is indistinguishable from a model
        // that simply emitted malformed output.
        doneReason: body.done_reason ?? null,
      };
    }

    // NDJSON stream: one JSON object per line, partial lines across chunks.
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

/**
 * Chat constrained to a JSON Schema, parsed.
 *
 * Structured output still occasionally arrives wrapped in prose or a code
 * fence, or with a small JSON blemish (a trailing comma, a stray character),
 * so recover the outermost JSON value rather than failing the turn. On
 * failure the error names the salvage attempts so the failure is diagnosable
 * instead of a bare "did not return JSON".
 */
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

/** Strip every code fence, case-insensitive language tag, so a multi-fence
 *  reply yields each block as a candidate document. */
function fenceCandidates(text) {
  const out = [];
  const re = /```[a-zA-Z]*\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** Try JSON.parse plus a couple of common one-character repairs, reporting
 *  which path succeeded (or why the region is unsalvageable). */
function tryParseWithRepairs(slice, attempts) {
  try {
    const value = JSON.parse(slice);
    attempts.push(`balanced ${slice.length}ch parse`);
    return { value };
  } catch (err) {
    // The most common blemish by far: a trailing comma before a closing
    // bracket. A cheap strip recovers it without loosening the parser.
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

/**
 * Recover a JSON object or array from model output that wrapped it in prose,
 * fences, or small syntax blemishes. Returns `{ value, attempts }`; `value`
 * is undefined when nothing salvaged. Every plausible start position is tried
 * (not just the first brace), so leading prose that happens to contain a brace
 * cannot mask the real document, and `attempts` records what was scanned for
 * the caller's error message.
 */
export function salvageJSON(text) {
  const attempts = [];
  const docs = [...fenceCandidates(text), text];
  for (const doc of docs) {
    if (!doc || !doc.trim()) continue;
    // A fence candidate only helps if the reply was actually fenced; a bare
    // re-scan of the whole text is the fallback that always runs.
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
