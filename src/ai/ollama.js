import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { resolveSecret } from "../cloud.js";

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
 */
export async function modelChoices() {
  const cfg = await config();
  const def = cfg.roles?.author?.model ?? null;
  let models = [];
  try {
    models = [...(await installed(cfg.host))].sort();
  } catch { /* offline — the picker just shows the default */ }
  let cloud = null;
  for (const [name, p] of Object.entries(cfg.providers ?? {})) {
    if (p.type !== "openai-compatible" || !Array.isArray(p.models) || !p.models.length) continue;
    if (!(await resolveEnv(p.apiKey))) continue; // only list cloud models with a key
    cloud = { provider: name, label: p.label ?? name, models: [...p.models] };
    break;
  }
  return { models, default: def, cloud };
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
  const spec = model
    ? (await cloudSpec(cfg, model, role)) ?? { ...(await resolveRole(role)), model }
    : await resolveRole(role);
  const stream = typeof onToken === "function";
  const timeout = cfg.defaults?.request_timeout_ms ?? 300_000;
  const maxRetries = cfg.defaults?.max_retries ?? 2;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
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
        return await once(spec, payload, { stream, onToken, timeout, signal });
      }
      return await cloudChat(spec, {
        messages, format, tools, images, temperature,
        stream, onToken, timeout, signal,
      });
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
    messages: cloudMessages(messages, images),
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

/** Cloud messages: images ride on the last user message as data-URL parts. */
function cloudMessages(messages, images) {
  const out = messages.map((m) => ({ role: m.role, content: m.content }));
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
 * fence, so recover the outermost JSON value rather than failing the turn.
 */
export async function chatJSON({ role, messages, schema, ...rest }) {
  const res = await chat({ role, messages, format: schema, ...rest });
  const raw = res.content.trim();
  try {
    return { ...res, data: JSON.parse(raw) };
  } catch {
    const salvaged = extractJSON(raw);
    if (salvaged) return { ...res, data: salvaged, salvaged: true };
    const why = res.doneReason === "length"
      ? ` Generation was CUT SHORT (done_reason=length, ${res.evalCount} tokens) — raise num_predict for role "${role}".`
      : ` (done_reason=${res.doneReason}, ${res.evalCount} tokens)`;
    throw new Error(`Model did not return JSON.${why}\nFirst 300 chars:\n${raw.slice(0, 300)}`);
  }
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.search(/[{[]/);
    if (start === -1) continue;
    const open = c[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        try { return JSON.parse(c.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
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
