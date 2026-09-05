import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Tokens are the unit the operator is billed in, and the unit nothing counted.
 *
 * `auto_events` has had a `tokens` column since it was created; every caller
 * wrote 0 into it, so the weekly token cap was unreachable and a 24-slide dense
 * deck with deep research cost exactly what a 10-slide sparse one did — one
 * "request". These tests hold the two halves of the fix: that a run's real
 * token spend is measured and recorded, and that a reservation taken before the
 * run is replaced by what the run actually cost.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-meter-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = scratch;
process.env.FORGE_AUTO_WINDOW_REQUESTS = "100";
process.env.FORGE_AUTO_WEEKLY_REQUESTS = "100";
process.env.FORGE_AUTO_WINDOW_SLIDES = "1000";
process.env.FORGE_AUTO_WEEKLY_SLIDES = "1000";
process.env.FORGE_AUTO_WEEKLY_TOKENS = "100000";
// This file is about the meter and the rolling caps. The lifetime trial would
// bind first at any realistic size, so it is lifted here and has its own file.
process.env.FORGE_AUTO_TRIAL_TOKENS = String(10 ** 9);

const {
  reserveAuto, settleAuto, getUsage, checkAutoLimits, clearAutoEvents,
  limitConfig, planFor, setPlan, PLANS, DEFAULT_PLAN, isPlan,
} = await import("../src/limits.js");
const {
  newMeter, withMeter, recordModelUsage, currentMeter, meterTotal, meterSummary, estimateTokens,
} = await import("../src/usage.js");
const auth = await import("../src/auth.js");

const email = "meter@example.test";
await auth.register({ name: "M", email, password: "test-password-123" });
const userId = auth.getUserId(email);

test.after(() => rm(scratch, { recursive: true, force: true }));

const reset = () => clearAutoEvents({ userId });

/* ------------------------------------------------------------- the meter */

test("the meter adds up what the model client reports, per role", () => {
  const m = newMeter();
  withMeter(m, () => {
    // Exactly the shape `chat()` returns.
    recordModelUsage({ role: "author", model: "qwen3.6", promptCount: 1200, evalCount: 300 });
    recordModelUsage({ role: "author", model: "qwen3.6", promptCount: 800, evalCount: 200 });
    recordModelUsage({ role: "research", model: "qwen3.6", promptCount: 500, evalCount: 50 });
  });
  assert.equal(m.calls, 3);
  assert.equal(m.promptTokens, 2500);
  assert.equal(m.completionTokens, 550);
  assert.equal(meterTotal(m), 3050);
  assert.equal(m.byRole.author.calls, 2);
  assert.equal(m.byRole.research.promptTokens, 500);
  assert.deepEqual(meterSummary(m).models, ["qwen3.6"]);
});

test("the meter survives a client that reports nothing", () => {
  // A transport that omits usage must not poison the total with NaN — that
  // would settle a reservation to garbage rather than to a number.
  const m = newMeter();
  withMeter(m, () => {
    recordModelUsage({ role: "author" });
    recordModelUsage({ role: "author", promptCount: undefined, evalCount: null });
    recordModelUsage(null);
  });
  assert.equal(meterTotal(m), 0);
  assert.equal(Number.isFinite(meterTotal(m)), true);
});

test("outside a metered scope every call is a no-op — the CLI is unaffected", () => {
  assert.equal(currentMeter(), null);
  assert.doesNotThrow(() => recordModelUsage({ role: "author", promptCount: 10, evalCount: 5 }));
});

test("the meter follows async work, which is the only reason it can be ambient", async () => {
  // The model client sits five or six awaits below the request.
  const m = newMeter();
  await withMeter(m, async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 1));
    await (async () => {
      await Promise.resolve();
      recordModelUsage({ role: "author", promptCount: 7, evalCount: 3 });
    })();
  });
  assert.equal(meterTotal(m), 10);
});

test("two concurrent operations do not pool their spend", async () => {
  const a = newMeter();
  const b = newMeter();
  await Promise.all([
    withMeter(a, async () => {
      await new Promise((r) => setTimeout(r, 2));
      recordModelUsage({ role: "author", promptCount: 100, evalCount: 0 });
    }),
    withMeter(b, async () => {
      recordModelUsage({ role: "author", promptCount: 5, evalCount: 0 });
      await new Promise((r) => setTimeout(r, 4));
      recordModelUsage({ role: "author", promptCount: 5, evalCount: 0 });
    }),
  ]);
  assert.equal(meterTotal(a), 100);
  assert.equal(meterTotal(b), 10);
});

/* ------------------------------------------------- reserve, then settle */

test("a reservation is replaced by what the run actually cost", () => {
  reset();
  const r = reserveAuto({ userId, upcomingSlides: 10, upcomingTokens: 50000 });
  assert.equal(r.allowed, true);
  assert.ok(r.eventId, "a reservation must be addressable to be settled");
  assert.equal(getUsage({ userId }).week.tokens, 50000);

  settleAuto({ eventId: r.eventId, tokens: 12345 });
  assert.equal(getUsage({ userId }).week.tokens, 12345, "the estimate should be gone, not added to");
});

test("a run that cost more than its estimate is charged the truth", () => {
  reset();
  const r = reserveAuto({ userId, upcomingTokens: 1000 });
  settleAuto({ eventId: r.eventId, tokens: 40000 });
  assert.equal(getUsage({ userId }).week.tokens, 40000);
});

test("settling a failed run charges what it spent, not the estimate", () => {
  // A generation that died in its third slide still spent those three slides'
  // tokens; charging it a full deck is the difference between fair use and a
  // refund request.
  reset();
  const r = reserveAuto({ userId, upcomingSlides: 22, upcomingTokens: 90000 });
  settleAuto({ eventId: r.eventId, tokens: 8000 });
  const usage = getUsage({ userId });
  assert.equal(usage.week.tokens, 8000);
  assert.equal(usage.week.requests, 1, "the run still happened, so it still counts as a request");
});

test("a refused reservation has nothing to settle", () => {
  reset();
  // Blow the weekly token budget outright.
  const first = reserveAuto({ userId, upcomingTokens: 99000 });
  assert.equal(first.allowed, true);
  const second = reserveAuto({ userId, upcomingTokens: 99000 });
  assert.equal(second.allowed, false);
  assert.equal(second.eventId, null, "a refusal must not write a row it would then settle");
  assert.equal(settleAuto({ eventId: second.eventId, tokens: 5 }), false);
  assert.equal(getUsage({ userId }).week.tokens, 99000, "the refused run cost nothing");
});

test("the token cap refuses a run that would cross it, and says by how much", () => {
  reset();
  reserveAuto({ userId, upcomingTokens: 95000 });
  const chk = checkAutoLimits({ userId, upcomingTokens: 20000 });
  assert.equal(chk.allowed, false);
  assert.ok(chk.errors.some((e) => /token/i.test(e)), chk.errors.join("; "));
  assert.ok(chk.errors.some((e) => e.includes("20,000")), "the refusal should name the run's own cost");
});

test("settleAuto ignores a settle with nothing in it", () => {
  reset();
  const r = reserveAuto({ userId, upcomingTokens: 100 });
  assert.equal(settleAuto({ eventId: r.eventId }), false);
  assert.equal(getUsage({ userId }).week.tokens, 100);
});

/* ------------------------------------------------------------------ tiers */

test("every account is free until it is not, and free is what it always was", () => {
  assert.equal(planFor(userId), DEFAULT_PLAN);
  assert.equal(DEFAULT_PLAN, "free");
  const free = limitConfig("free");
  const unspecified = limitConfig();
  assert.deepEqual(free, unspecified, "the default tier must be the settings as configured");
});

test("a paid tier scales the budgets and nothing else", () => {
  const free = limitConfig("free");
  const plus = limitConfig("plus");
  for (const k of ["windowRequests", "weeklyRequests", "windowSlides", "weeklySlides", "weeklyTokens"]) {
    assert.equal(plus[k], free[k] * PLANS.plus.multiplier, `${k} should scale`);
  }
  // The shape of one piece of work is not a budget: paying more does not make
  // an hour longer, and deck length is its own admin setting.
  assert.equal(plus.windowHours, free.windowHours);
  assert.equal(plus.maxSlidesPerDeck, free.maxSlidesPerDeck);
});

test("unlimited is uncapped rather than very large", () => {
  const u = limitConfig("unlimited");
  assert.equal(u.unlimited, true);
  assert.equal(u.weeklyTokens, Infinity);
  assert.equal(u.weeklyRequests, Infinity);
});

test("an account's tier decides which caps it is held to", () => {
  reset();
  reserveAuto({ userId, upcomingTokens: 95000 });
  assert.equal(checkAutoLimits({ userId, upcomingTokens: 20000 }).allowed, false);

  setPlan(userId, "plus");
  assert.equal(planFor(userId), "plus");
  assert.equal(
    checkAutoLimits({ userId, upcomingTokens: 20000 }).allowed, true,
    "the same spend, on a bigger tier",
  );

  setPlan(userId, "unlimited");
  assert.equal(checkAutoLimits({ userId, upcomingTokens: 10 ** 9 }).allowed, true);

  setPlan(userId, "free");
});

test("an unknown tier is refused rather than silently applied", () => {
  assert.throws(() => setPlan(userId, "enterprise"), /unknown plan/);
  assert.equal(planFor(userId), "free");
  assert.equal(isPlan("free"), true);
  assert.equal(isPlan("nonsense"), false);
  // A row carrying a tier that no longer exists falls back rather than
  // uncapping somebody by accident.
  assert.equal(limitConfig("nonsense").plan, "free");
});

test("a check reports the tier it judged against", () => {
  reset();
  assert.equal(checkAutoLimits({ userId }).plan, "free");
  assert.equal(checkAutoLimits({ userId, plan: "plus" }).plan, "plus");
});

/* -------------------------------------------------------------- estimates */

test("the estimate grows with the work, which is the whole point", () => {
  const small = estimateTokens({ slides: 10 });
  const big = estimateTokens({ slides: 24 });
  assert.ok(big > small * 2, "a deck twice the size should not cost the same");
  assert.ok(estimateTokens({ slides: 10, research: true }) > small, "research costs tokens too");
  assert.ok(estimateTokens({}) > 0, "even a single call is not free");
});

test("the free tier's SHIPPED token budget agrees with its slide budget", async () => {
  // The two caps are stated in different units and must not contradict each
  // other — a token budget under one deck would refuse everybody while the
  // slide budget said four. That is exactly what shipped: 80,000 tokens against
  // a 90-slide week, which was harmless only because nothing counted a token.
  //
  // Read the DEFAULTS, not this box's configuration: the env overrides above
  // are the test's own, and asserting against them would check nothing.
  const { settingDefault } = await import("../src/runtime.js");
  const perDeck = estimateTokens({ slides: 22, research: true });
  const decksByTokens = settingDefault("autoWeeklyTokens") / perDeck;
  const decksBySlides = settingDefault("autoWeeklySlides") / 22;
  assert.ok(decksByTokens >= 2, `token budget allows only ${decksByTokens.toFixed(1)} decks`);
  assert.ok(
    Math.abs(decksByTokens - decksBySlides) < decksBySlides,
    `the two budgets disagree: ${decksByTokens.toFixed(1)} decks by tokens, ${decksBySlides.toFixed(1)} by slides`,
  );
});

test("the estimator's research size tracks what a call actually carries", async () => {
  // A spend model reading a stale number over-reserves, refusing people for
  // tokens that cannot be spent. Before retrieval this had to track
  // `excerpt_chars` in models.yaml; now that only bounds the POOL read off
  // disk, and what is billed is the retrieval budget.
  const { RESEARCH_EXCERPT_CHARS } = await import("../src/usage.js");
  const { CALL_RESEARCH_CHARS } = await import("../src/ai/retrieve.js");
  assert.equal(RESEARCH_EXCERPT_CHARS, CALL_RESEARCH_CHARS);
});

test("retrieval is what makes the free tier affordable, and the budget says so", async () => {
  const { settingDefault } = await import("../src/runtime.js");
  const { estimateTokens } = await import("../src/usage.js");
  const perDeck = estimateTokens({ slides: 22, research: true });
  // Before per-slide retrieval a deck was ~1.6M tokens and no student price
  // point worked at all (docs/ECONOMICS.md).
  assert.ok(perDeck < 400_000, `a deck should not cost ${perDeck.toLocaleString()} tokens`);
  const decks = settingDefault("autoWeeklyTokens") / perDeck;
  assert.ok(decks >= 3, `the weekly budget buys only ${decks.toFixed(1)} decks`);
});
