import { getDb } from "./db.js";
import { settingValue } from "./runtime.js";

/**
 * Auto-tier limits for the shared TCET gateway.
 * Hourly / weekly sliding windows, counting both requests and slides.
 *
 * A "request" here is ONE PIPELINE OPERATION — a plan, a generate, a chat turn
 * — not one model call. `enforceAuto`/`recordAutoFor` are invoked per API
 * route, and a single generate makes many model calls behind one recorded
 * event. Reading these as model calls makes every number look ten times
 * tighter than it is, which is how they came to be set this high.
 *
 * The Auto key bills the operator, so the budget is a real cost and the free
 * tier is deliberately enough to produce a few decks a week and iterate on
 * them, not to run a workload. A full deck cycle is roughly three to six
 * requests and twenty-odd slides; the weekly numbers are about four of those.
 * Anyone who needs more attaches their own key under Cloud, where none of this
 * applies, and a local Ollama backend is unlimited.
 *
 * Defaults are env-overridable so hosting can tune without a code change.
 * The short window is FIVE HOURS, not one. An hour is shorter than a sitting:
 * someone who plans a deck, reads the outline, changes their mind and
 * regenerates is doing one piece of work, and a sixty-minute window cuts them
 * off in the middle of it. Five hours covers a session and still stops a
 * script.
 *
 *  - window_hours: the length of the short window
 *  - window_requests: pipeline operations within it
 *  - weekly_requests: overall throttle
 *  - window_slides: slides generated within the window (covers one big deck)
 *  - weekly_slides: weekly slide budget
 *  - weekly_tokens: rough token budget (optional)
 */

/**
 * The tiers an account can be metered against.
 *
 * The admin settings define the FREE tier — that is what every account was
 * already being given, so an operator who has tuned them keeps exactly the
 * budget they tuned. A paid tier is a multiple of it, which means there is one
 * place to adjust "how much is a little" and the paid tiers follow rather than
 * silently drifting out of proportion.
 *
 * `unlimited` is not a sales tier. It is for the operator's own account and for
 * anyone comped by hand, and it is the honest way to say so — previously the
 * only way to exempt somebody was to raise the caps for everybody.
 *
 * BYOK is deliberately absent: a user on their own key costs the operator
 * nothing and is not metered at all. `isAutoRoute` decides that before any of
 * this is consulted.
 */
export const PLANS = {
  // `trial: true` is the whole difference between a free tier and a free
  // allowance. Every other cap here is a rolling window, and a rolling window
  // RESETS — a user who waits gets unlimited decks forever, so exposure per
  // account is unbounded and cannot be budgeted. The trial does not reset.
  // See docs/ECONOMICS.md: ~₹5-21 per signup once, against ₹110-439 per user
  // per semester and climbing.
  free: { label: "Free", multiplier: 1, trial: true },
  plus: { label: "Plus", multiplier: 4 },
  pro: { label: "Pro", multiplier: 12 },
  unlimited: { label: "Unlimited", multiplier: null },
};

export const DEFAULT_PLAN = "free";

export const isPlan = (p) => Object.hasOwn(PLANS, String(p ?? ""));

/** Budgets scale with the tier; the shape of one piece of work does not.
 *  `windowHours` is how long a sitting is and `maxSlidesPerDeck` is how big a
 *  deck may be — paying more does not make an hour longer, and deck length is
 *  a separate admin setting because it is about what the renderer and the
 *  planner do well, not about spend. */
const SCALED = ["windowRequests", "weeklyRequests", "windowSlides", "weeklySlides", "weeklyTokens"];

export function limitConfig(plan = DEFAULT_PLAN) {
  // Read per call, never cached: an admin changing a cap in the panel must
  // apply to the next request, not the next restart.
  const base = {
    windowHours: settingValue("autoWindowHours"),
    windowRequests: settingValue("autoWindowRequests"),
    weeklyRequests: settingValue("autoWeeklyRequests"),
    windowSlides: settingValue("autoWindowSlides"),
    weeklySlides: settingValue("autoWeeklySlides"),
    weeklyTokens: settingValue("autoWeeklyTokens"),
    // One deck may still burst to full length inside the window budget.
    maxSlidesPerDeck: settingValue("autoMaxSlidesPerDeck"),
  };
  const spec = PLANS[plan] ?? PLANS[DEFAULT_PLAN];
  const name = PLANS[plan] ? plan : DEFAULT_PLAN;
  // A paid tier buys a recurring allowance, so it has no lifetime ceiling; the
  // trial has nothing else.
  const lifetimeTokens = spec.trial ? settingValue("autoTrialTokens") : Infinity;
  if (spec.multiplier == null) {
    return {
      ...base,
      ...Object.fromEntries(SCALED.map((k) => [k, Infinity])),
      lifetimeTokens: Infinity,
      plan: name,
      unlimited: true,
      trial: false,
    };
  }
  const out = { ...base, lifetimeTokens, plan: name, unlimited: false, trial: Boolean(spec.trial) };
  for (const k of SCALED) out[k] = Math.round(base[k] * spec.multiplier);
  return out;
}

/** The tier an account is on. Unknown or missing means free, which is what
 *  every account got before tiers existed. */
export function planFor(userId) {
  if (!userId) return DEFAULT_PLAN;
  const row = getDb().prepare("SELECT plan FROM users WHERE id=?").get(userId);
  return isPlan(row?.plan) ? row.plan : DEFAULT_PLAN;
}

export function setPlan(userId, plan) {
  if (!isPlan(plan)) throw new Error(`unknown plan "${plan}" — one of ${Object.keys(PLANS).join(", ")}`);
  getDb().prepare("UPDATE users SET plan=? WHERE id=?").run(plan, userId);
  return plan;
}

export function recordAutoEvent({ userId, eventType = "request", slides = 0, tokens = 0, provider = "tcet-auto" }) {
  const db = getDb();
  const now = Date.now();
  const r = db.prepare(`INSERT INTO auto_events (user_id, event_type, slides, tokens, provider, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, eventType, slides, tokens, provider, now);
  // The trial counter is a running total on the account, not a sum over these
  // rows: pruneAutoEvents deletes them past 30 days, and a lifetime cap that
  // refills monthly is not a lifetime cap.
  db.prepare("UPDATE users SET lifetime_tokens = lifetime_tokens + ? WHERE id=?").run(Math.max(0, Math.round(tokens)), userId);
  // The row id is the reservation handle: settleAuto replaces the estimate on
  // this row with what the run actually spent.
  return Number(r.lastInsertRowid);
}

/**
 * Replace a reservation's estimate with what the operation really cost.
 *
 * A reservation must be taken before the work — that is the whole point of
 * `reserveAuto`, and concurrent requests would otherwise all read an unspent
 * budget — but before the work the true cost is unknown, so what is held is an
 * estimate. Leaving it there means a run that was cheaper than expected keeps
 * charging the difference for a week, and a run that failed after two model
 * calls costs the same as one that finished.
 *
 * Settling is deliberately unconditional on success: a generation that died
 * halfway still spent the tokens it spent, and the operator was still billed.
 * What changes is that the user is charged for those and not for the rest.
 */
export function settleAuto({ eventId, tokens = null, slides = null }) {
  if (!eventId) return false;
  const db = getDb();
  const before = db.prepare("SELECT user_id, tokens FROM auto_events WHERE id=?").get(eventId);
  if (!before) return false;
  const sets = [];
  const args = [];
  const settled = tokens != null ? Math.max(0, Math.round(tokens)) : null;
  if (settled != null) { sets.push("tokens=?"); args.push(settled); }
  if (slides != null) { sets.push("slides=?"); args.push(Math.max(0, Math.round(slides))); }
  if (!sets.length) return false;
  args.push(eventId);
  db.prepare(`UPDATE auto_events SET ${sets.join(", ")} WHERE id=?`).run(...args);
  // The trial counter moves by the DIFFERENCE, since the reservation's
  // estimate was already added to it. A run cheaper than estimated gives the
  // difference back; one that overran takes it.
  if (settled != null) {
    const delta = settled - (Number(before.tokens) || 0);
    if (delta !== 0) {
      db.prepare("UPDATE users SET lifetime_tokens = MAX(0, lifetime_tokens + ?) WHERE id=?")
        .run(delta, before.user_id);
    }
  }
  return true;
}

/** How much of the trial this account has spent, ever. */
export function lifetimeTokens(userId) {
  if (!userId) return 0;
  return Number(getDb().prepare("SELECT lifetime_tokens FROM users WHERE id=?").get(userId)?.lifetime_tokens) || 0;
}

export function getUsage({ userId, provider = "tcet-auto" }) {
  const db = getDb();
  const now = Date.now();
  const windowMs = limitConfig().windowHours * 60 * 60 * 1000;
  const windowAgo = now - windowMs;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const windowRows = db.prepare(
    `SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events WHERE user_id=? AND provider=? AND created_at>=?`
  ).get(userId, provider, windowAgo);
  const weekRows = db.prepare(
    `SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events WHERE user_id=? AND provider=? AND created_at>=?`
  ).get(userId, provider, weekAgo);
  return {
    window: { requests: windowRows.reqs, slides: windowRows.slides, tokens: windowRows.tokens },
    week: { requests: weekRows.reqs, slides: weekRows.slides, tokens: weekRows.tokens },
    resets: {
      window: new Date(windowAgo + windowMs + 1000).toISOString(),
      weekly: new Date(weekAgo + 7 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    },
  };
}

export function checkAutoLimits({ userId, provider = "tcet-auto", upcomingSlides = 0, upcomingTokens = 0, plan = null }) {
  const cfg = limitConfig(plan ?? planFor(userId));
  const usage = getUsage({ userId, provider });
  const errors = [];

  if (usage.window.requests + 1 > cfg.windowRequests) {
    errors.push(`Request limit: ${usage.window.requests}/${cfg.windowRequests} used in the last ${cfg.windowHours} hours`);
  }
  if (usage.week.requests + 1 > cfg.weeklyRequests) {
    errors.push(`Weekly request limit: ${usage.week.requests}/${cfg.weeklyRequests} used — resets soon`);
  }
  if (usage.window.slides + upcomingSlides > cfg.windowSlides) {
    errors.push(`Slide limit: ${usage.window.slides}/${cfg.windowSlides} slides in the last ${cfg.windowHours} hours, and this would add ${upcomingSlides}`);
  }
  if (usage.week.slides + upcomingSlides > cfg.weeklySlides) {
    errors.push(`Weekly slide limit: ${usage.week.slides}/${cfg.weeklySlides} slides this week`);
  }
  if (upcomingSlides > cfg.maxSlidesPerDeck) {
    errors.push(`This deck needs ${upcomingSlides} slides but auto allows ${cfg.maxSlidesPerDeck} per deck — split it or use your own key`);
  }
  // The trial is checked FIRST because its message is the one that should be
  // read: a rolling limit says "come back later" and is true; the trial says
  // "this is the end of the free tier" and is a different conversation.
  if (cfg.lifetimeTokens !== Infinity) {
    const spent = lifetimeTokens(userId);
    if (spent + upcomingTokens > cfg.lifetimeTokens) {
      errors.push(
        `Free trial used: ${spent.toLocaleString()} of ${cfg.lifetimeTokens.toLocaleString()} tokens. ` +
        "The free tier is a fixed amount rather than a weekly allowance, so this does not reset — " +
        "upgrade to keep generating, or add your own API key under Cloud, which is unmetered.",
      );
    }
  }
  if (usage.week.tokens + upcomingTokens > cfg.weeklyTokens) {
    errors.push(
      `Weekly token budget: ${usage.week.tokens.toLocaleString()}/${cfg.weeklyTokens.toLocaleString()} ` +
      `tokens this week, and this run is estimated at ${Math.round(upcomingTokens).toLocaleString()}`,
    );
  }
  return {
    allowed: errors.length === 0,
    errors,
    usage,
    cfg,
    plan: cfg.plan,
    trial: cfg.lifetimeTokens !== Infinity
      ? { spent: lifetimeTokens(userId), cap: cfg.lifetimeTokens }
      : null,
    remaining: {
      windowRequests: Math.max(0, cfg.windowRequests - usage.window.requests),
      weeklyRequests: Math.max(0, cfg.weeklyRequests - usage.week.requests),
      windowSlides: Math.max(0, cfg.windowSlides - usage.window.slides),
      weeklySlides: Math.max(0, cfg.weeklySlides - usage.week.slides),
      weeklyTokens: Math.max(0, cfg.weeklyTokens - usage.week.tokens),
      lifetimeTokens: cfg.lifetimeTokens === Infinity
        ? Infinity
        : Math.max(0, cfg.lifetimeTokens - lifetimeTokens(userId)),
    },
  };
}

/**
 * Check the limits and spend the budget in one indivisible step.
 *
 * The routes used to `await enforceAuto(...)` and then `recordAutoFor(...)`.
 * Node being single-threaded is not the protection it looks like: an `await`
 * is a yield, so every request in flight reads the same pre-spend usage,
 * every one of them passes, and only then does any of them record. Ten
 * concurrent requests against a budget of three admitted ten, and the gateway
 * key bills the operator for all of them.
 *
 * The fix is that there is no yield. This function is synchronous from the
 * count to the insert, so no other request can observe the unspent budget in
 * between. The IMMEDIATE transaction is for the case JS cannot cover — two
 * processes on the same database file — and takes the write lock up front, so
 * the count and the insert cannot straddle another writer's commit.
 *
 * A refusal writes nothing: a request that was denied cost the operator
 * nothing and must not consume the budget it was refused for.
 */
export function reserveAuto({ userId, provider = "tcet-auto", upcomingSlides = 0, upcomingTokens = 0, plan = null }) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const chk = checkAutoLimits({ userId, provider, upcomingSlides, upcomingTokens, plan });
    let eventId = null;
    if (chk.allowed) {
      eventId = recordAutoEvent({ userId, slides: upcomingSlides, tokens: upcomingTokens, provider });
    }
    db.exec("COMMIT");
    return { ...chk, eventId };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Every account's spend in both windows, in one query per window.
 *
 * The admin users list needs this for every row, and the per-row alternative
 * is a query per account — which is how the stats page came to run 116 queries
 * to label ten bars. Returns a Map keyed by user id.
 */
export function usageByUser({ provider = "tcet-auto" } = {}) {
  const db = getDb();
  const now = Date.now();
  const windowAgo = now - limitConfig().windowHours * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const out = new Map();
  const add = (rows, key) => {
    for (const r of rows) {
      const e = out.get(r.user_id) ?? {
        windowRequests: 0, windowSlides: 0, windowTokens: 0,
        weekRequests: 0, weekSlides: 0, weekTokens: 0,
      };
      e[`${key}Requests`] = r.reqs;
      e[`${key}Slides`] = r.slides;
      e[`${key}Tokens`] = r.tokens;
      out.set(r.user_id, e);
    }
  };
  // Tokens are what the operator is billed in, so the operator's own view of
  // who is spending what has to show them.
  const q = `SELECT user_id, COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens
             FROM auto_events WHERE provider=? AND created_at>=? GROUP BY user_id`;
  add(db.prepare(q).all(provider, windowAgo), "window");
  add(db.prepare(q).all(provider, weekAgo), "week");
  return out;
}

/**
 * Forget one account's Auto spend.
 *
 * The operator vocabulary was find, promote, delete — so the only remedy for
 * someone wrongly capped (a failed run that still counted, a shared machine,
 * a demo) was to delete their account or wait out the week. Returns how many
 * events were dropped.
 */
export function clearAutoEvents({ userId, provider = "tcet-auto" }) {
  const db = getDb();
  const before = db.prepare("SELECT COUNT(*) as n FROM auto_events WHERE user_id=? AND provider=?").get(userId, provider);
  db.prepare("DELETE FROM auto_events WHERE user_id=? AND provider=?").run(userId, provider);
  // Forgetting an account's spend has to forget the trial too, or the one
  // remedy an operator has stops working for the one limit that never resets.
  db.prepare("UPDATE users SET lifetime_tokens = 0 WHERE id=?").run(userId);
  return before?.n ?? 0;
}

// cleanup old events (>30 days) to keep DB small
export function pruneAutoEvents() {
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM auto_events WHERE created_at < ?").run(cutoff);
}
