import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";

/**
 * Ollama client, role-addressed.
 *
 * Callers ask for a *role* ("author") rather than a model id, so swapping the
 * model behind a role is a config edit. Deliberately thin — no agent framework.
 * The pipeline is a fixed sequence, and with small local models every prompt
 * token needs to stay visible and editable.
 */

let _cfg;
async function config() {
  if (!_cfg) _cfg = YAML.parse(await readFile(path.join(CONFIG, "models.yaml"), "utf8"));
  return _cfg;
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
 * Resolve a role to a model that is actually pulled, falling back rather than
 * failing — a missing model should degrade quality, not abort a deck.
 */
export async function resolveRole(role) {
  const cfg = await config();
  const spec = cfg.roles?.[role];
  if (!spec) throw new Error(`Unknown role "${role}". Known: ${Object.keys(cfg.roles ?? {}).join(", ")}`);

  const have = await installed(cfg.host);
  if (have.has(spec.model)) return { ...spec, role, host: cfg.host, fellBack: false };

  for (const alt of cfg.fallbacks ?? []) {
    if (have.has(alt)) {
      return { ...spec, role, host: cfg.host, model: alt, fellBack: spec.model };
    }
  }
  throw new Error(
    `Role "${role}" wants ${spec.model}, which is not installed, and no fallback is either.\n` +
    `  Install it:  ollama pull ${spec.model}\n` +
    `  Installed:   ${[...have].slice(0, 8).join(", ")}`,
  );
}

/**
 * One chat completion.
 *
 * `format` accepts a JSON Schema (Ollama's structured-output mode). Passing the
 * schema rather than begging for JSON in the prompt is what makes a 4B model's
 * output parseable — it constrains decoding instead of hoping.
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
  // `model` overrides the role's default — used by the UI model picker and for
  // A/B testing a role against another local model without editing config.
  const spec = model
    ? { ...(await resolveRole(role)), model }
    : await resolveRole(role);
  const stream = typeof onToken === "function";

  // Vision models take images on the last user message.
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
      // Only send what the role declares — Ollama's own defaults are sane, and
      // overriding them blindly is how sampling bugs get introduced.
      ...(spec.top_k != null ? { top_k: spec.top_k } : {}),
      ...(spec.top_p != null ? { top_p: spec.top_p } : {}),
      ...(spec.repeat_penalty != null ? { repeat_penalty: spec.repeat_penalty } : {}),
      ...(spec.num_predict != null ? { num_predict: spec.num_predict } : {}),
    },
  };
  if (format) payload.format = format;
  if (tools?.length) payload.tools = tools;

  const timeout = cfg.defaults?.request_timeout_ms ?? 300_000;
  const maxRetries = cfg.defaults?.max_retries ?? 2;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await once(spec, payload, { stream, onToken, timeout, signal });
    } catch (err) {
      // A caller-initiated abort is intentional; never retry it.
      if (err.name === "AbortError" && signal?.aborted) throw err;
      lastErr = err;
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`Ollama request failed after ${maxRetries + 1} attempts: ${lastErr.message}`);
}

async function once(spec, payload, { stream, onToken, timeout, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(`${spec.host}/api/chat`, {
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
