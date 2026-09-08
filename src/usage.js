import { AsyncLocalStorage } from "node:async_hooks";
import { CALL_RESEARCH_CHARS } from "./ai/retrieve.js";

const store = new AsyncLocalStorage();

export function newMeter() {
  return { calls: 0, promptTokens: 0, completionTokens: 0, byRole: {}, providers: new Set() };
}

export function withMeter(meter, fn) {
  return store.run(meter, fn);
}

export function currentMeter() {
  return store.getStore() ?? null;
}

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

export const CHARS_PER_TOKEN = 4;

export { CALL_RESEARCH_CHARS as RESEARCH_EXCERPT_CHARS } from "./ai/retrieve.js";

export const TOKENS_CALL_OVERHEAD = 1_500;

export const TOKENS_SLIDE_OUTPUT = 800;

export const RESEARCH_CARRYING_PASSES = 4;

export function estimateTokens({ slides = 0, research = false, depth = null, excerptChars = null } = {}) {
  const n = Number(slides) > 0 ? Number(slides) : 0;
  const excerpt = Math.max(0, Number(excerptChars ?? CALL_RESEARCH_CHARS));
  const perExcerpt = research || n > 0 ? Math.round(excerpt / CHARS_PER_TOKEN) : 0;

  const outPer = depth === "full" ? TOKENS_SLIDE_OUTPUT * 4 : TOKENS_SLIDE_OUTPUT;

  const calls = n + (research ? RESEARCH_CARRYING_PASSES : 1);
  return calls * (perExcerpt + TOKENS_CALL_OVERHEAD) + n * outPer;
}
