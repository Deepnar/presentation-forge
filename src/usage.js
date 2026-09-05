import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What one pipeline operation actually cost, in tokens.
 *
 * The quota system was built to meter "requests" — one plan, one generate, one
 * chat turn — and that unit is nearly meaningless as a cost. A 24-slide dense
 * deck with deep research makes dozens of model calls and can outspend a
 * 10-slide sparse one by an order of magnitude, and both counted as 1. The
 * `auto_events` table has had a `tokens` column since it was created and every
 * caller wrote 0 into it, so `weeklyTokens` was a cap nothing could reach.
 *
 * The numbers were never missing. `chat()` has always returned `promptCount`
 * and `evalCount` — the gateway reports `usage.prompt_tokens` /
 * `usage.completion_tokens`, Ollama reports `prompt_eval_count` /
 * `eval_count` — and every one of them was discarded by the caller above.
 * What was missing was somewhere to add them up.
 *
 * An async-local meter is that somewhere, for the same reason `src/account.js`
 * is an async-local account: the model client sits five or six calls below the
 * HTTP layer, and threading an accumulator through pipeline → generate → turn
 * → chat would touch the CLI, which has no request to account to. Outside a
 * metered scope every call here is a no-op, so the CLI and the tests are
 * unchanged.
 *
 * Note what this deliberately does NOT do: convert tokens to money. Prompt and
 * completion tokens are priced differently by every provider and the operator's
 * gateway is free at the point of use, so the meter records the two counts
 * separately and leaves pricing to whatever eventually needs it.
 */

const store = new AsyncLocalStorage();

export function newMeter() {
  return { calls: 0, promptTokens: 0, completionTokens: 0, byRole: {}, providers: new Set() };
}

/** Run `fn` with `meter` as the ambient meter. */
export function withMeter(meter, fn) {
  return store.run(meter, fn);
}

export function currentMeter() {
  return store.getStore() ?? null;
}

/**
 * Add one model call to the ambient meter. Called from `chat()`, so every
 * transport and every role is counted in one place — a role that forgets is a
 * role that bills the operator invisibly.
 */
export function recordModelUsage(res) {
  const meter = store.getStore();
  if (!meter || !res) return;
  const prompt = Number(res.promptCount) || 0;
  const completion = Number(res.evalCount) || 0;
  meter.calls += 1;
  meter.promptTokens += prompt;
  meter.completionTokens += completion;
  const role = res.role ?? "unknown";
  const seen = meter.byRole[role] ?? (meter.byRole[role] = { calls: 0, promptTokens: 0, completionTokens: 0 });
  seen.calls += 1;
  seen.promptTokens += prompt;
  seen.completionTokens += completion;
  if (res.model) meter.providers.add(res.model);
}

export const meterTotal = (m) => (m ? m.promptTokens + m.completionTokens : 0);

/** The meter as something loggable and storable. */
export function meterSummary(m) {
  if (!m) return null;
  return {
    calls: m.calls,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    totalTokens: meterTotal(m),
    byRole: m.byRole,
    models: [...m.providers],
  };
}

/**
 * What an operation is expected to cost, before it runs.
 *
 * A reservation has to be taken BEFORE the work, or concurrent requests all
 * read an unspent budget (`reserveAuto` exists for exactly that reason) — and
 * before the work the true cost is unknown. So the reservation is an estimate
 * and `settleAuto` replaces it with the measured total afterwards.
 *
 * The estimate is deliberately rough and deliberately DERIVED rather than
 * tuned: per content slide, the writer sends a system prompt plus the slide
 * catalogue plus a research excerpt and receives a slide, and the finalize,
 * field-length, coherence and critic passes each re-read some of that. Until a
 * real run on the gateway has been measured this is an educated guess with the
 * arithmetic written down, which is worth more than a magic number — and being
 * wrong is survivable in a way it would not be if nothing reconciled, because
 * the estimate lives only for the duration of the run.
 */
export const TOKENS_PER_SLIDE = 9000;
export const TOKENS_RESEARCH = 40000;
export const TOKENS_BASE = 6000;

export function estimateTokens({ slides = 0, research = false, depth = null } = {}) {
  const n = Number(slides) > 0 ? Number(slides) : 0;
  // A report section is a bigger write than a slide but there are far fewer of
  // them; full depth writes four paragraphs and a table where brief writes four
  // sentences.
  const perUnit = depth === "full" ? TOKENS_PER_SLIDE * 2 : depth === "brief" ? TOKENS_PER_SLIDE : TOKENS_PER_SLIDE;
  return TOKENS_BASE + n * perUnit + (research ? TOKENS_RESEARCH : 0);
}
