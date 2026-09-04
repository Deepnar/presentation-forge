import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "../paths.js";
import { resolveSecret, resolveProviderKey, routingPreference, cloudProvider, autoProvider, isHosted } from "../cloud.js";
import { currentUserId } from "../account.js";
import { localFallbackArmed, isGatewayUnreachable, armedTimeout } from "../devfallback.js";

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
  const route = await routingPreference(currentUserId());
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
 * The same lookup, but for a provider we can name — so the signed-in account's
 * own BYOK key is used instead of the operator's. Every backend built for a
 * request goes through this; `resolveEnv` remains for references with no
 * provider attached.
 */
const providerKey = (providerId, ref) => resolveProviderKey(providerId, ref);

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
  return {
    type: "openai-compatible",
    baseURL: p.baseURL,
    apiKey: await providerKey(spec.provider, p.apiKey),
    supportsThinking: Boolean(p.supports_thinking),
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
          backend: {
            type: "openai-compatible",
            baseURL: ap.baseURL,
            apiKey: await providerKey(ap.id, ap.apiKey),
            supportsThinking: Boolean(cfg.providers?.[ap.id]?.supports_thinking),
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

/**
 * What a local model can actually do, from Ollama rather than from its name.
 *
 * `/api/show` reports capabilities — "vision" among them — so a role that fell
 * back onto a text model is caught by what the model IS. Comparing the resolved
 * id against the configured one only catches the substitution, not the case
 * where somebody points the role at a model that cannot see in the first place.
 * Returns null when Ollama cannot be asked, which the caller treats as "do not
 * send images", because guessing in the permissive direction costs a deck.
 */
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
  // Only an ANSWER is cached. A failed probe means "could not ask", and
  // remembering that for the life of the process turns one unreachable moment
  // into a model that can never see or think again — on a long-running server,
  // for every request after the blip.
  if (out) _caps.set(key, out);
  return out;
}

/**
 * The `think` value to send Ollama for a role, or null to send nothing.
 *
 * `roles.author.thinking` was declared for two roles and read on exactly one
 * path: the openai-compatible one, which sends the gateway's
 * `chat_template_kwargs.enable_thinking`. The Ollama payload never carried it,
 * so on the local backend the flag was a comment — the same shape as `vision`
 * before `roleCanSeeImages`, and as `fellBack` before that.
 *
 * Asked rather than assumed, for the same reason vision is: Ollama reports
 * "thinking" in `/api/show` capabilities, and sending `think` to a model that
 * has none is an error rather than a no-op. Unknown capabilities mean no
 * thinking — the conservative direction, since the cost is a shallower answer
 * and the alternative is a failed request.
 *
 * Ollama takes a level as well as a boolean. `reasoning_effort` is written for
 * the gateway's vocabulary (low / medium / xhigh), so `xhigh` maps to Ollama's
 * top level rather than being passed through and rejected.
 */
const THINK_LEVELS = { low: "low", medium: "medium", high: "high", xhigh: "high" };

export async function ollamaThink(spec) {
  const caps = await modelCapabilities(spec.backend.baseURL, spec.model);
  if (!caps?.has("thinking")) return null;
  // Explicit in BOTH directions, because the model's default is to think.
  // Measured: the `research` role, which declares no thinking, returned 16,948
  // characters of reasoning — so omitting the flag did not mean "off", it meant
  // "whatever the template does". A config that is only consulted when it says
  // yes is not a config; `false` has to be sent as deliberately as a level.
  if (!spec.thinking) return false;
  return THINK_LEVELS[spec.reasoning_effort] ?? true;
}

/**
 * Whether the model a role will actually run on can read images.
 *
 * `config/models.yaml` declares `vision: true` on the critic role and NOTHING
 * read it — the same shape as `fellBack`, a field that looked like a constraint
 * and was a comment. It matters most exactly where it was least true: in hosted
 * mode `resolveRole` sends every non-author role to the gateway, so `--critic`
 * would post base64 slide PNGs to a text model and then edit the deck from
 * whatever came back. Findings invented from an image the model never saw are
 * worse than no critic at all.
 *
 * A provider may declare which of its models can see, via `vision_models`.
 * Absent that, a role that has been routed away from its configured local
 * vision model is assumed unable to see — the safe direction, since the cost of
 * a false negative is a skipped pass and the cost of a false positive is a deck
 * edited against hallucinated defects.
 */
export async function roleCanSeeImages(role) {
  const cfg = await config();
  const spec = cfg.roles?.[role];
  if (!spec?.vision) return { ok: false, reason: `role "${role}" is not declared as a vision role` };

  const resolved = await resolveRole(role);
  if (resolved.backend.type === "ollama") {
    // Ask Ollama what the model can actually do rather than trusting the name.
    // /api/show reports capabilities, so a fallback onto a text model is caught
    // by what it IS, not by whether it matches the configured id.
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

  // Find the provider that actually serves this model rather than assuming the
  // role's own: a hosted role falls through to whichever provider holds a key,
  // so the declaration to check is the one belonging to where it really landed.
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

/**
 * Which roles are running what they were configured to run.
 *
 * `resolveRole` has always recorded a substitution on `fellBack`, and that flag
 * has always been threaded through chat() into the turn's stats — where nothing
 * read it. So a role quietly running a different model than models.yaml names
 * was invisible everywhere, which section 9 already traced once to a thin
 * outline nobody could explain.
 *
 * This never throws. A box with Ollama stopped is the ordinary hosted case and
 * a perfectly normal local one; it answers `reachable: false` and says nothing
 * about the roles, rather than turning a diagnostic into an outage.
 */
export async function roleAudit() {
  // In hosted mode resolveRole does not consult installed models at all: every
  // role goes to the gateway, or falls through to whatever BYOK provider has a
  // key. Reporting "utility = qwen3:4b-instruct, ok" there is worse than
  // reporting nothing, because chat() will not use it — this audit exists to
  // stop a model substitution being invisible and must not become one.
  if (isHosted()) {
    // The one exception worth naming: armed, a hosted role CAN end up on a
    // local model after the gateway times out, so an audit that flatly says
    // "not local models" would be the invisible substitution this exists to
    // prevent.
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
    // A role pointed at a cloud provider is not this check's business — its
    // model lives on someone else's machine and "installed" means nothing.
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

/**
 * Say a substitution out loud, once per role per process.
 *
 * A run that quietly used a different model is the failure this exists to stop,
 * and the CLI has no admin page to read. Once per role, because a generation
 * makes many calls and a warning per call is noise nobody reads.
 */
const warnedFallbacks = new Set();
export function warnFallback(role, configured, actual) {
  if (!configured || warnedFallbacks.has(role)) return;
  warnedFallbacks.add(role);
  console.warn(
    `  WARNING: role "${role}" is configured for ${configured}, which is not installed — using ${actual} instead.`,
  );
}

const warnedDevFallbacks = new Set();
/**
 * Say it every time a NEW role is rescued, and say the gateway error that
 * caused it. A substitution nobody is told about is how a run comes to be
 * judged against a model it never used.
 */
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

/**
 * The local Ollama spec standing in for a role whose gateway is unreachable.
 * Returns null when there is nothing to stand in with — no Ollama, or the
 * role's model and every declared fallback missing — so the caller reports the
 * gateway error rather than a second, more confusing one.
 */
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
  // auto (tcet) status. `keySet` and `kind` are carried rather than implied by
  // this object existing: the UI reads both off `auto` whichever endpoint it
  // came from, and /api/auto/status sends them. A projection that dropped them
  // made `!auto.keySet` true on a box with a working key — a permanent "no key
  // on this install" banner on the empty chat screen — and left the composer
  // chip reading "Auto" where a local Ollama should say "Local · Ollama".
  let auto = null;
  const ap = await autoProvider();
  if (ap?.keySet) {
    auto = { provider: ap.id, label: ap.label, models: ap.models, keySet: true, kind: ap.kind };
  }
  // cloud (BYOK) provider
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
      // Reasoning depth travels with the role, and the provider flag with the
      // provider. cloudSpec builds its own spec rather than going through
      // resolveRole, so both have to be carried explicitly — without this the
      // author's `thinking: true` was silently dropped on exactly the path a
      // hosted deck actually takes.
      thinking: author.thinking,
      reasoning_effort: author.reasoning_effort,
      backend: {
        type: "openai-compatible",
        baseURL: p.baseURL,
        apiKey: await providerKey(name, p.apiKey),
        supportsThinking: Boolean(p.supports_thinking),
      },
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
    const route = await routingPreference(currentUserId());
    if (route === "auto") {
      const ap = await autoProvider();
      if (ap?.kind === "tcet" && ap?.keySet && ap?.models?.length) model = ap.models[0];
      else if (isHosted()) {
        // Hosted has no local fallback — surface a clear error instead of
        // "Ollama unreachable". If BYOK is present, hint to switch to Cloud.
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
  const timeout = armedTimeout(cfg.defaults?.request_timeout_ms ?? 300_000);
  const maxRetries = cfg.defaults?.max_retries ?? 2;
  const bumpCeiling = cfg.defaults?.num_predict_bump_ceiling ?? 64_000;

  // Set once the dev fallback has moved this request off the gateway, so the
  // result can say so. A caller must never have to guess which model answered.
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
        // Ollama returns reasoning on `message.thinking`, separate from
        // `message.content`, so a role that thinks still answers under the
        // grammar and nothing downstream has to strip anything.
        const think = await ollamaThink(spec);
        if (think != null) payload.think = think;
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
      res = { ...res, cap, transport: spec.backend.type, devLocalFallback };

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

      // DEVELOPMENT ONLY, and off unless FORGE_DEV_LOCAL_FALLBACK=1. The
      // gateway's failure is at request time — /v1/models keeps answering
      // while completions hang — so there is nothing to probe beforehand and
      // this is the only place that learns the truth. Swapping here keeps the
      // pipeline exercisable while the gateway is out; it does not make the
      // output judgeable, and `devLocalFallback` on the result says which.
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
    // Reasoning depth, where the provider serves it. The CoE gateway runs with
    // thinking OFF by default and takes it per request
    // (Student Developer Guide v1.0 §6), so the hard passes — planning a deck,
    // reviewing whether it coheres, reading a rendered slide — have to ask.
    // Gated on the PROVIDER declaring support: an unknown top-level field is
    // usually ignored by an OpenAI-compatible server and "usually" is not a
    // contract to send someone else's BYOK endpoint.
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
        // Ollama returns reasoning separately from the answer. Carried so a
        // caller can SAY whether a result was thought about — the same reason
        // `fellBack` and `transport` are carried. A run that cannot report
        // whether reasoning was used cannot be compared with one that did.
        thinking: body.message?.thinking || null,
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
        // Reasoning streams in its own field and is NOT streamed onward: a
        // caller's onToken is writing the answer to a user, and a model's
        // deliberation is not part of it. Accumulated only so the result can
        // report that thinking happened.
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
