import { getDb } from "./db.js";
import { settingValue } from "./runtime.js";
import { AUTO_PROVIDER } from "./autoid.js";

export const PLANS = {
  free: { label: "Free", multiplier: 1, trial: true },
  plus: { label: "Plus", multiplier: 4 },
  pro: { label: "Pro", multiplier: 12 },
  unlimited: { label: "Unlimited", multiplier: null },
};

export const DEFAULT_PLAN = "free";

export const isPlan = (p) => Object.hasOwn(PLANS, String(p ?? ""));

const SCALED = ["windowRequests", "weeklyRequests", "windowSlides", "weeklySlides", "weeklyTokens"];

export function limitConfig(plan = DEFAULT_PLAN) {
  const base = {
    windowHours: settingValue("autoWindowHours"),
    windowRequests: settingValue("autoWindowRequests"),
    weeklyRequests: settingValue("autoWeeklyRequests"),
    windowSlides: settingValue("autoWindowSlides"),
    weeklySlides: settingValue("autoWeeklySlides"),
    weeklyTokens: settingValue("autoWeeklyTokens"),
    maxSlidesPerDeck: settingValue("autoMaxSlidesPerDeck"),
  };
  const spec = PLANS[plan] ?? PLANS[DEFAULT_PLAN];
  const name = PLANS[plan] ? plan : DEFAULT_PLAN;
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

export function recordAutoEvent({ userId, eventType = "request", slides = 0, tokens = 0, provider = AUTO_PROVIDER }) {
  const db = getDb();
  const now = Date.now();
  const r = db.prepare(`INSERT INTO auto_events (user_id, event_type, slides, tokens, provider, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, eventType, slides, tokens, provider, now);
  db.prepare("UPDATE users SET lifetime_tokens = lifetime_tokens + ? WHERE id=?").run(Math.max(0, Math.round(tokens)), userId);
  return Number(r.lastInsertRowid);
}

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
  if (settled != null) {
    const delta = settled - (Number(before.tokens) || 0);
    if (delta !== 0) {
      db.prepare("UPDATE users SET lifetime_tokens = MAX(0, lifetime_tokens + ?) WHERE id=?")
        .run(delta, before.user_id);
    }
  }
  return true;
}

export function lifetimeTokens(userId) {
  if (!userId) return 0;
  return Number(getDb().prepare("SELECT lifetime_tokens FROM users WHERE id=?").get(userId)?.lifetime_tokens) || 0;
}

export function getUsage({ userId, provider = AUTO_PROVIDER }) {
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

export function checkAutoLimits({ userId, provider = AUTO_PROVIDER, upcomingSlides = 0, upcomingTokens = 0, plan = null }) {
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

export function reserveAuto({ userId, provider = AUTO_PROVIDER, upcomingSlides = 0, upcomingTokens = 0, plan = null }) {
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

export function usageByUser({ provider = AUTO_PROVIDER } = {}) {
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
  const q = `SELECT user_id, COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens
             FROM auto_events WHERE provider=? AND created_at>=? GROUP BY user_id`;
  add(db.prepare(q).all(provider, windowAgo), "window");
  add(db.prepare(q).all(provider, weekAgo), "week");
  return out;
}

export function clearAutoEvents({ userId, provider = AUTO_PROVIDER }) {
  const db = getDb();
  const before = db.prepare("SELECT COUNT(*) as n FROM auto_events WHERE user_id=? AND provider=?").get(userId, provider);
  db.prepare("DELETE FROM auto_events WHERE user_id=? AND provider=?").run(userId, provider);
  db.prepare("UPDATE users SET lifetime_tokens = 0 WHERE id=?").run(userId);
  return before?.n ?? 0;
}

export function pruneAutoEvents() {
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM auto_events WHERE created_at < ?").run(cutoff);
}
