import { getDb } from "./db.js";

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

export function limitConfig() {
  return {
    windowHours: Number(process.env.FORGE_AUTO_WINDOW_HOURS ?? 5),
    windowRequests: Number(process.env.FORGE_AUTO_WINDOW_REQUESTS ?? 12),
    weeklyRequests: Number(process.env.FORGE_AUTO_WEEKLY_REQUESTS ?? 30),
    windowSlides: Number(process.env.FORGE_AUTO_WINDOW_SLIDES ?? 45),
    weeklySlides: Number(process.env.FORGE_AUTO_WEEKLY_SLIDES ?? 90),
    weeklyTokens: Number(process.env.FORGE_AUTO_WEEKLY_TOKENS ?? 80000),
    // One deck may still burst to full length inside the window budget.
    maxSlidesPerDeck: Number(process.env.FORGE_AUTO_MAX_SLIDES_PER_DECK ?? 24),
  };
}

export function recordAutoEvent({ userId, eventType = "request", slides = 0, tokens = 0, provider = "tcet-auto" }) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`INSERT INTO auto_events (user_id, event_type, slides, tokens, provider, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, eventType, slides, tokens, provider, now);
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

export function checkAutoLimits({ userId, provider = "tcet-auto", upcomingSlides = 0, upcomingTokens = 0 }) {
  const cfg = limitConfig();
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
  if (usage.week.tokens + upcomingTokens > cfg.weeklyTokens) {
    errors.push(`Weekly token budget: ${usage.week.tokens}/${cfg.weeklyTokens} tokens this week`);
  }
  return {
    allowed: errors.length === 0,
    errors,
    usage,
    cfg,
    remaining: {
      windowRequests: Math.max(0, cfg.windowRequests - usage.window.requests),
      weeklyRequests: Math.max(0, cfg.weeklyRequests - usage.week.requests),
      windowSlides: Math.max(0, cfg.windowSlides - usage.window.slides),
      weeklySlides: Math.max(0, cfg.weeklySlides - usage.week.slides),
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
export function reserveAuto({ userId, provider = "tcet-auto", upcomingSlides = 0, upcomingTokens = 0 }) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const chk = checkAutoLimits({ userId, provider, upcomingSlides, upcomingTokens });
    if (chk.allowed) {
      recordAutoEvent({ userId, slides: upcomingSlides, tokens: upcomingTokens, provider });
    }
    db.exec("COMMIT");
    return chk;
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
      const e = out.get(r.user_id) ?? { windowRequests: 0, windowSlides: 0, weekRequests: 0, weekSlides: 0 };
      e[`${key}Requests`] = r.reqs;
      e[`${key}Slides`] = r.slides;
      out.set(r.user_id, e);
    }
  };
  const q = `SELECT user_id, COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides
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
  return before?.n ?? 0;
}

// cleanup old events (>30 days) to keep DB small
export function pruneAutoEvents() {
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM auto_events WHERE created_at < ?").run(cutoff);
}
