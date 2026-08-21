import { getDb } from "./db.js";

/**
 * Auto-tier limits for the shared TCET gateway.
 * Hourly / weekly sliding windows, counting both requests and slides.
 *
 * Defaults are env-overridable so hosting can tune without code change.
 * Pillars:
 *  - hourly_requests: how many model calls can be made in 60m
 *  - weekly_requests: overall throttle
 *  - hourly_slides: slides generated in 60m (covers one big deck)
 *  - weekly_slides: weekly slide budget
 *  - weekly_tokens: rough token budget (optional)
 */

export function limitConfig() {
  return {
    hourlyRequests: Number(process.env.FORGE_AUTO_HOURLY_REQUESTS ?? 20),
    weeklyRequests: Number(process.env.FORGE_AUTO_WEEKLY_REQUESTS ?? 100),
    hourlySlides: Number(process.env.FORGE_AUTO_HOURLY_SLIDES ?? 60),
    weeklySlides: Number(process.env.FORGE_AUTO_WEEKLY_SLIDES ?? 300),
    weeklyTokens: Number(process.env.FORGE_AUTO_WEEKLY_TOKENS ?? 200000),
    // allow burst for single deck (e.g., 24 slides in one generate)
    maxSlidesPerDeck: Number(process.env.FORGE_AUTO_MAX_SLIDES_PER_DECK ?? 30),
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
  const hourAgo = now - 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const hourRows = db.prepare(
    `SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events WHERE user_id=? AND provider=? AND created_at>=?`
  ).get(userId, provider, hourAgo);
  const weekRows = db.prepare(
    `SELECT COUNT(*) as reqs, COALESCE(SUM(slides),0) as slides, COALESCE(SUM(tokens),0) as tokens FROM auto_events WHERE user_id=? AND provider=? AND created_at>=?`
  ).get(userId, provider, weekAgo);
  return {
    hour: { requests: hourRows.reqs, slides: hourRows.slides, tokens: hourRows.tokens },
    week: { requests: weekRows.reqs, slides: weekRows.slides, tokens: weekRows.tokens },
    resets: {
      hourly: new Date(hourAgo + 60 * 60 * 1000 + 1000).toISOString(),
      weekly: new Date(weekAgo + 7 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    },
  };
}

export function checkAutoLimits({ userId, provider = "tcet-auto", upcomingSlides = 0, upcomingTokens = 0 }) {
  const cfg = limitConfig();
  const usage = getUsage({ userId, provider });
  const errors = [];

  if (usage.hour.requests + 1 > cfg.hourlyRequests) {
    errors.push(`Hourly request limit: ${usage.hour.requests}/${cfg.hourlyRequests} used — try again in an hour`);
  }
  if (usage.week.requests + 1 > cfg.weeklyRequests) {
    errors.push(`Weekly request limit: ${usage.week.requests}/${cfg.weeklyRequests} used — resets soon`);
  }
  if (usage.hour.slides + upcomingSlides > cfg.hourlySlides) {
    errors.push(`Hourly slide limit: ${usage.hour.slides}/${cfg.hourlySlides} slides this hour, this action would add ${upcomingSlides}`);
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
      hourlyRequests: Math.max(0, cfg.hourlyRequests - usage.hour.requests),
      weeklyRequests: Math.max(0, cfg.weeklyRequests - usage.week.requests),
      hourlySlides: Math.max(0, cfg.hourlySlides - usage.hour.slides),
      weeklySlides: Math.max(0, cfg.weeklySlides - usage.week.slides),
    },
  };
}

// cleanup old events (>30 days) to keep DB small
export function pruneAutoEvents() {
  const db = getDb();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM auto_events WHERE created_at < ?").run(cutoff);
}
