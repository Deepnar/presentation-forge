import { AsyncLocalStorage } from "node:async_hooks";
import { CALL_RESEARCH_CHARS } from "./ai/retrieve.js";

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
 * Roughly four characters per token for English prose. Good enough for a spend
 * estimate; nothing here should be read as a tokeniser.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * The research one author call carries, in characters.
 *
 * This is the whole cost model. `writeSlide` and `writeSection` put research
 * into the user message of every call, so a 22-slide deck pays for it 26 times
 * — and the slides' own output is noise beside it, perhaps 800 tokens out
 * against the research in.
 *
 * It is now the RETRIEVAL budget, not the excerpt cap. `excerpt_chars` in
 * config/models.yaml bounds what is read off disk into the retrieval pool;
 * `CALL_RESEARCH_CHARS` bounds what any one call is actually shown, and that
 * is what is billed. Before retrieval the two were the same number and a deck
 * cost ~1.6M tokens; they are not the same number any more.
 */
export { CALL_RESEARCH_CHARS as RESEARCH_EXCERPT_CHARS } from "./ai/retrieve.js";

/** Prompt overhead per author call that is not the research: the system
 *  prompt, the slide catalogue, the theme voice, the deck so far. */
export const TOKENS_CALL_OVERHEAD = 1_500;

/** What one slide's own output costs. Small, and included for honesty rather
 *  than because it moves the total. */
export const TOKENS_SLIDE_OUTPUT = 800;

/** Calls that carry the research but are not slide writes: the plan, the
 *  field-length pass, the coherence pass, the critic's fix turn. */
export const RESEARCH_CARRYING_PASSES = 4;

/**
 * What an operation is expected to cost, before it runs.
 *
 * A reservation has to be taken BEFORE the work, or concurrent requests all
 * read an unspent budget (`reserveAuto` exists for exactly that reason) — and
 * before the work the true cost is unknown. So the reservation is an estimate
 * and `settleAuto` replaces it with the measured total afterwards.
 *
 * The first version of this multiplied a flat 9,000 tokens by the slide count
 * and put a 22-slide deck at 244,000. That was six times too low, because it
 * costed the WRITING and the writing is not what is expensive. Re-sending the
 * research excerpt on every call is, and it is the single thing to attack if
 * this is ever running against a key somebody pays for.
 */
export function estimateTokens({ slides = 0, research = false, depth = null, excerptChars = null } = {}) {
  const n = Number(slides) > 0 ? Number(slides) : 0;
  const excerpt = Math.max(0, Number(excerptChars ?? CALL_RESEARCH_CHARS));
  const perExcerpt = research || n > 0 ? Math.round(excerpt / CHARS_PER_TOKEN) : 0;

  // A report section is a bigger write than a slide, and there are eight of
  // them rather than twenty-two — but each still carries the same excerpt.
  const outPer = depth === "full" ? TOKENS_SLIDE_OUTPUT * 4 : TOKENS_SLIDE_OUTPUT;

  const calls = n + (research ? RESEARCH_CARRYING_PASSES : 1);
  return calls * (perExcerpt + TOKENS_CALL_OVERHEAD) + n * outPer;
}
