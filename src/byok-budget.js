import { getDb } from "./db.js";

export const DEFAULT_BYOK_DAILY_TOKENS = 180_000;
export const MIN_BYOK_DAILY_TOKENS = 10_000;
export const MAX_BYOK_DAILY_TOKENS = 5_000_000;
export const BYOK_OUTPUT_CAP = 12_000;
export const BYOK_WINDOW_MS = 24 * 60 * 60 * 1000;

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

export function defaultByokDailyTokens() {
  return positiveInt(process.env.FORGE_BYOK_DAILY_TOKENS) ?? DEFAULT_BYOK_DAILY_TOKENS;
}

export function byokBudgetFor(userId) {
  if (!userId) return defaultByokDailyTokens();
  const row = getDb().prepare("SELECT byok_daily_tokens FROM user_prefs WHERE user_id=?").get(userId);
  return positiveInt(row?.byok_daily_tokens) ?? defaultByokDailyTokens();
}

export function setByokBudget(userId, value) {
  if (!userId) throw new Error("log in to change the BYOK safety budget");
  const n = positiveInt(value);
  if (n == null || n < MIN_BYOK_DAILY_TOKENS || n > MAX_BYOK_DAILY_TOKENS) {
    throw new Error(`dailyTokens must be between ${MIN_BYOK_DAILY_TOKENS.toLocaleString()} and ${MAX_BYOK_DAILY_TOKENS.toLocaleString()}`);
  }
  getDb().prepare(`
    INSERT INTO user_prefs (user_id, byok_daily_tokens, updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET byok_daily_tokens=excluded.byok_daily_tokens, updated_at=excluded.updated_at
  `).run(userId, n, new Date().toISOString());
  return n;
}

export function recordByokCostAcceptance(userId) {
  if (!userId) throw new Error("log in before attaching a BYOK key");
  const at = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO user_prefs (user_id, byok_terms_accepted_at, updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET byok_terms_accepted_at=excluded.byok_terms_accepted_at, updated_at=excluded.updated_at
  `).run(userId, at, at);
  return at;
}

export function byokCostAcceptedAt(userId) {
  if (!userId) return null;
  return getDb().prepare("SELECT byok_terms_accepted_at FROM user_prefs WHERE user_id=?").get(userId)?.byok_terms_accepted_at ?? null;
}

export function byokUsage(userId, { now = Date.now() } = {}) {
  const since = now - BYOK_WINDOW_MS;
  const row = getDb().prepare(
    "SELECT COUNT(*) AS calls, COALESCE(SUM(tokens),0) AS tokens, MIN(created_at) AS oldest FROM byok_events WHERE user_id=? AND created_at>=?",
  ).get(userId, since);
  const limit = byokBudgetFor(userId);
  const tokens = Number(row?.tokens) || 0;
  return {
    calls: Number(row?.calls) || 0,
    tokens,
    limit,
    remaining: Math.max(0, limit - tokens),
    resetsAt: new Date(row?.oldest ? Number(row.oldest) + BYOK_WINDOW_MS : now).toISOString(),
  };
}

export class ByokBudgetError extends Error {
  constructor({ used, limit, requested }) {
    super(
      `BYOK safety budget reached: ${used.toLocaleString()} of ${limit.toLocaleString()} tokens ` +
      `reserved in the last 24 hours; this provider call may use up to ${requested.toLocaleString()}. ` +
      "Raise your limit under Settings → Cloud only after checking your provider's billing cap.",
    );
    this.name = "ByokBudgetError";
    this.status = 429;
    this.budget = { used, limit, requested, remaining: Math.max(0, limit - used) };
  }
}

export function reserveByokCall({ userId, provider, tokens, now = Date.now() }) {
  if (!userId) return null;
  const amount = Math.max(1, Math.ceil(Number(tokens) || 0));
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const limit = byokBudgetFor(userId);
    const since = now - BYOK_WINDOW_MS;
    const used = Number(db.prepare(
      "SELECT COALESCE(SUM(tokens),0) AS tokens FROM byok_events WHERE user_id=? AND created_at>=?",
    ).get(userId, since)?.tokens) || 0;
    if (used + amount > limit) throw new ByokBudgetError({ used, limit, requested: amount });
    const result = db.prepare(
      "INSERT INTO byok_events (user_id,provider,tokens,created_at) VALUES (?,?,?,?)",
    ).run(userId, String(provider || "cloud"), amount, now);
    db.exec("COMMIT");
    return { eventId: Number(result.lastInsertRowid), reserved: amount };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function settleByokCall(eventId, tokens) {
  if (!eventId) return false;
  const amount = Math.max(1, Math.ceil(Number(tokens) || 0));
  const result = getDb().prepare("UPDATE byok_events SET tokens=? WHERE id=?").run(amount, eventId);
  return result.changes > 0;
}

export function clearByokUsage(userId) {
  return getDb().prepare("DELETE FROM byok_events WHERE user_id=?").run(userId).changes;
}

export function pruneByokUsage({ now = Date.now() } = {}) {
  return getDb().prepare("DELETE FROM byok_events WHERE created_at<?").run(now - 30 * BYOK_WINDOW_MS).changes;
}

function contentChars(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "").length;
  return content.reduce((sum, part) => {
    if (part?.type === "text") return sum + String(part.text ?? "").length;
    if (part?.type === "image_url") return sum + 6_000;
    return sum + JSON.stringify(part ?? "").length;
  }, 0);
}

export function estimateByokInput(body) {
  const messageChars = (body?.messages ?? []).reduce((sum, m) => sum + contentChars(m?.content) + 16, 0);
  const toolChars = body?.tools?.length ? JSON.stringify(body.tools).length : 0;
  return Math.max(1, Math.ceil((messageChars + toolChars) / 4));
}

export function estimateByokReservation(body) {
  return estimateByokInput(body) + Math.max(1, Number(body?.max_tokens) || BYOK_OUTPUT_CAP);
}

export function estimateByokActual(body, output, reportedPrompt = 0, reportedCompletion = 0) {
  const reported = (Number(reportedPrompt) || 0) + (Number(reportedCompletion) || 0);
  if (reported > 0) return reported;
  return estimateByokInput(body) + Math.max(1, Math.ceil(String(output ?? "").length / 4));
}
