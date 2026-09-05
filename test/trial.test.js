import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The free tier is a TRIAL, not an allowance.
 *
 * Every other cap in src/limits.js is a rolling window, and a rolling window
 * RESETS — a user who waits gets unlimited decks forever, so free exposure per
 * account is unbounded and cannot be budgeted. For a one-person operation
 * paying a commercial API bill that is the difference between a number you can
 * write down in advance and one you cannot (docs/ECONOMICS.md: ~₹5-21 per
 * signup once, against ₹110-439 per user per semester and climbing).
 *
 * Its own file because the trial and the rolling caps cannot both be the
 * binding limit in one fixture, and a test where the wrong one refuses is a
 * test about nothing.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-trial-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = scratch;
// The rolling caps are lifted so the TRIAL is always what refuses.
process.env.FORGE_AUTO_WINDOW_REQUESTS = "10000";
process.env.FORGE_AUTO_WEEKLY_REQUESTS = "10000";
process.env.FORGE_AUTO_WINDOW_SLIDES = "100000";
process.env.FORGE_AUTO_WEEKLY_SLIDES = "100000";
process.env.FORGE_AUTO_WEEKLY_TOKENS = String(10 ** 9);
process.env.FORGE_AUTO_TRIAL_TOKENS = "50000";

const {
  reserveAuto, settleAuto, getUsage, checkAutoLimits, clearAutoEvents,
  limitConfig, setPlan, lifetimeTokens,
} = await import("../src/limits.js");
const auth = await import("../src/auth.js");

const email = "trial@example.test";
await auth.register({ name: "T", email, password: "test-password-123" });
const userId = auth.getUserId(email);

test.after(() => rm(scratch, { recursive: true, force: true }));

const reset = () => clearAutoEvents({ userId });

/* ------------------------------------------------------------ the trial */

/**
 * The free tier is a TRIAL, not an allowance. Every other cap here is a
 * rolling window, and a rolling window resets — a user who waits gets
 * unlimited decks forever, so free exposure per account is unbounded and
 * cannot be budgeted. These tests hold the one property that makes it a
 * trial: it does not come back.
 */

const trialCfg = () => limitConfig("free");

test("the free tier carries a lifetime cap and the paid tiers do not", () => {
  assert.ok(Number.isFinite(trialCfg().lifetimeTokens), "free must be capped for life");
  assert.equal(trialCfg().trial, true);
  for (const paid of ["plus", "pro", "unlimited"]) {
    assert.equal(limitConfig(paid).lifetimeTokens, Infinity, `${paid} must not carry a trial cap`);
    assert.equal(limitConfig(paid).trial, false);
  }
});

test("the trial does not reset when the rolling windows do", async () => {
  reset();
  const cap = trialCfg().lifetimeTokens;

  // Spend the trial, then wind every event out of both rolling windows by
  // deleting the rows the way the 30-day prune eventually does.
  reserveAuto({ userId, upcomingTokens: cap });
  assert.equal(checkAutoLimits({ userId, upcomingTokens: 1000 }).allowed, false);

  const { getDb } = await import("../src/db.js");
  getDb().prepare("DELETE FROM auto_events WHERE user_id=?").run(userId);

  // Both windows now read zero — and the trial still says no. This is the
  // whole point: a row-derived trial would have refilled here.
  assert.equal(getUsage({ userId }).week.tokens, 0, "the rolling window should be empty");
  assert.equal(lifetimeTokens(userId), cap, "the trial counter must survive the rows");
  const chk = checkAutoLimits({ userId, upcomingTokens: 1000 });
  assert.equal(chk.allowed, false, "an emptied window must not refill the trial");
  assert.ok(chk.errors.some((e) => /free trial/i.test(e)), chk.errors.join("; "));
});

test("the refusal explains that this one does not come back", () => {
  reset();
  reserveAuto({ userId, upcomingTokens: trialCfg().lifetimeTokens });
  const [msg] = checkAutoLimits({ userId, upcomingTokens: 1000 }).errors;
  assert.match(msg, /does not reset/i, "a trial refusal must not read like 'come back later'");
  assert.match(msg, /own API key|Cloud/i, "and should name the unmetered way out");
});

test("settling gives back what a cheap run did not spend", async () => {
  reset();
  const r = reserveAuto({ userId, upcomingTokens: 40_000 });
  assert.equal(r.allowed, true);
  assert.equal(lifetimeTokens(userId), 40_000);
  settleAuto({ eventId: r.eventId, tokens: 12_000 });
  assert.equal(lifetimeTokens(userId), 12_000, "an over-estimate must not eat the trial");

  // With the estimate given back there is room for another run.
  const r2 = reserveAuto({ userId, upcomingTokens: 5_000 });
  assert.equal(r2.allowed, true, "the returned budget should be spendable");
  settleAuto({ eventId: r2.eventId, tokens: 9_000 });
  assert.equal(lifetimeTokens(userId), 21_000, "and an under-estimate must still be charged");
});

test("moving an account onto a paid tier lifts the trial", () => {
  reset();
  reserveAuto({ userId, upcomingTokens: trialCfg().lifetimeTokens });
  assert.equal(checkAutoLimits({ userId, upcomingTokens: 1000 }).allowed, false);
  setPlan(userId, "plus");
  assert.equal(
    checkAutoLimits({ userId, upcomingTokens: 1000 }).allowed, true,
    "paying must be the way out of a spent trial",
  );
  setPlan(userId, "free");
});

test("clearing an account's usage clears the trial with it", async () => {
  reset();
  reserveAuto({ userId, upcomingTokens: trialCfg().lifetimeTokens });
  assert.equal(checkAutoLimits({ userId, upcomingTokens: 1 }).allowed, false);
  clearAutoEvents({ userId });
  assert.equal(lifetimeTokens(userId), 0);
  assert.equal(
    checkAutoLimits({ userId, upcomingTokens: 1000 }).allowed, true,
    "the operator's one remedy must work on the one limit that never resets",
  );
});

test("a check reports how much trial is left, so it can be shown before it runs out", () => {
  reset();
  const chk = checkAutoLimits({ userId });
  assert.equal(chk.trial.cap, trialCfg().lifetimeTokens);
  assert.equal(chk.trial.spent, 0);
  assert.equal(chk.remaining.lifetimeTokens, trialCfg().lifetimeTokens);
  assert.equal(checkAutoLimits({ userId, plan: "plus" }).trial, null);
});

test("the trial is worth about three decks", async () => {
  const { settingDefault } = await import("../src/runtime.js");
  const { estimateTokens } = await import("../src/usage.js");
  const decks = settingDefault("autoTrialTokens") / estimateTokens({ slides: 22, research: true });
  // Enough to finish one real assignment and discover the tool is good; a free
  // tier that cannot complete one task converts nobody.
  assert.ok(decks >= 2 && decks <= 6, `the trial is worth ${decks.toFixed(1)} decks`);
});
