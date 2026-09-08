/** Authentication routes and their abuse controls. */

import {
  accountCount, accountVerificationState, authenticate, bearerToken,
  clearedSessionCookie, consumeAuthToken, cookieToken, endSession,
  findOrCreateGoogleUser, isAdmin, issueAuthToken, markVerified, pruneAuthTokens,
  register, registerLocalOwner, RESET_TTL_MINUTES, resetPassword, sessionCookie,
  startSession, userForToken, verificationRequired, VERIFY_TTL_HOURS,
  verifyGoogleIdToken,
} from "../../src/auth.js";
import { isHosted } from "../../src/cloud.js";
import { mailConfigured, resetMail, sendMail, verifyMail } from "../../src/mail.js";
import { settingValue } from "../../src/runtime.js";
import { fail, ok, wrap } from "./http.js";

const AUTH_LIMIT = Number(process.env.FORGE_AUTH_RATE_LIMIT || 20);
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const MAIL_MIN_GAP_MS = 2 * 60 * 1000;
const MAIL_WINDOW_MS = 60 * 60 * 1000;
const MAIL_WINDOW_MAX = 5;
const authHits = new Map();
const mailHits = new Map();

function pruneHits(store, cutoff) {
  for (const [key, hits] of store) {
    const live = hits.filter((time) => time > cutoff);
    if (live.length) store.set(key, live);
    else store.delete(key);
  }
}

setInterval(() => pruneHits(authHits, Date.now() - AUTH_WINDOW_MS), AUTH_WINDOW_MS).unref();
setInterval(() => pruneHits(mailHits, Date.now() - MAIL_WINDOW_MS), MAIL_WINDOW_MS).unref();

function rateLimit(req, res, next) {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const hits = (authHits.get(ip) ?? []).filter((time) => now - time < AUTH_WINDOW_MS);
  if (hits.length >= AUTH_LIMIT) return fail(res, 429, "too many attempts — try again later");
  authHits.set(ip, [...hits, now]);
  next();
}

export const localOwnerMode = () =>
  !isHosted() && process.env.FORGE_LOCAL_MULTI_USER !== "1";

export async function resolveUser(req, { allowCookie = false } = {}) {
  const token = bearerToken(req.headers.authorization)
    ?? (allowCookie ? cookieToken(req.headers.cookie) : null);
  return userForToken(token);
}

export async function requireAuth(req, res, message = "log in to continue") {
  const user = await resolveUser(req);
  if (user) return user;
  fail(res, 401, message);
  return null;
}

export async function requireAdminUser(req, res, message = "admin only") {
  const user = await resolveUser(req);
  if (!user) {
    fail(res, 401, "log in");
    return null;
  }
  if (!isAdmin(user)) {
    fail(res, 403, message);
    return null;
  }
  return user;
}

const openRegistration = () => settingValue("openRegistration");

async function registrationState() {
  const localOwner = localOwnerMode();
  const ownerConfigured = localOwner ? (await accountCount()) > 0 : false;
  return {
    open: localOwner ? !ownerConfigured : openRegistration(),
    mail: localOwner ? false : mailConfigured(),
    verifyRequired: localOwner ? false : verificationRequired(),
    localOwner,
    ownerConfigured,
  };
}

function secureRequest(req) {
  return req.secure
    || String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
}

function mailThrottled(purpose, email) {
  const key = `${purpose}:${String(email).trim().toLowerCase()}`;
  const now = Date.now();
  const hits = (mailHits.get(key) ?? []).filter((time) => now - time < MAIL_WINDOW_MS);
  if (hits.length >= MAIL_WINDOW_MAX) return true;
  if (hits.length && now - hits.at(-1) < MAIL_MIN_GAP_MS) return true;
  mailHits.set(key, [...hits, now]);
  return false;
}

function dispatchMail(message, to) {
  sendMail({ ...message, to })
    .then((result) => {
      if (!result.sent) console.warn(`  ! mail not sent to ${to}: ${result.reason}`);
    })
    .catch((error) => console.warn(`  ! mail to ${to} failed: ${error.message}`));
}

export function registerAuthRoutes(app) {
  app.post("/api/auth/register", rateLimit, wrap(async (req, res) => {
    const state = await registrationState();
    if (!state.open) {
      const message = state.localOwner
        ? "this local workspace already has an owner — log in to continue"
        : "registration is closed on this server — ask the owner for an account";
      return fail(res, 403, message);
    }
    const { name, email, password } = req.body ?? {};
    try {
      if (state.localOwner) {
        const user = await registerLocalOwner({ name, email, password });
        const token = await startSession(user);
        res.setHeader("Set-Cookie", sessionCookie(token, { secure: secureRequest(req) }));
        return ok(res, { user, token, localOwner: true, verifySent: false });
      }
      const user = await register({ name, email, password });
      if (!user.verified && mailConfigured()) {
        const token = issueAuthToken(user.email, "verify");
        if (token) {
          mailThrottled("verify", user.email);
          dispatchMail(verifyMail({ name: user.name, token, hours: VERIFY_TTL_HOURS }), user.email);
        }
      }
      ok(res, { user, verifySent: !user.verified });
    } catch (error) {
      fail(res, 400, error.message);
    }
  }));

  app.post("/api/auth/login", rateLimit, wrap(async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = await authenticate(email, password);
    if (!user) return fail(res, 401, "invalid email or password");
    const token = await startSession(user);
    res.setHeader("Set-Cookie", sessionCookie(token, { secure: secureRequest(req) }));
    ok(res, { token, user });
  }));

  app.post("/api/auth/google", rateLimit, wrap(async (req, res) => {
    if (localOwnerMode()) return fail(res, 403, "Google sign-in is disabled for a private local workspace");
    const token = req.body?.id_token ?? req.body?.credential;
    if (!token) return fail(res, 400, "missing Google id_token");
    try {
      const user = await findOrCreateGoogleUser(await verifyGoogleIdToken(token));
      const bearer = await startSession(user);
      res.setHeader("Set-Cookie", sessionCookie(bearer, { secure: secureRequest(req) }));
      ok(res, { token: bearer, user });
    } catch (error) {
      fail(res, 401, error.message);
    }
  }));

  app.post("/api/auth/logout", wrap(async (req, res) => {
    await endSession(bearerToken(req.headers.authorization) ?? cookieToken(req.headers.cookie));
    res.setHeader("Set-Cookie", clearedSessionCookie({ secure: secureRequest(req) }));
    ok(res);
  }));

  app.get("/api/auth/me", wrap(async (req, res) => {
    const token = bearerToken(req.headers.authorization);
    const user = await userForToken(token ?? cookieToken(req.headers.cookie));
    if (!user) return fail(res, 401, "not logged in");
    if (token && !cookieToken(req.headers.cookie)) {
      res.setHeader("Set-Cookie", sessionCookie(token, { secure: secureRequest(req) }));
    }
    ok(res, { user, verifyRequired: verificationRequired() });
  }));

  app.post("/api/auth/forgot", rateLimit, wrap(async (req, res) => {
    if (localOwnerMode()) return fail(res, 404, "password recovery is not available in local-owner mode");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const generic = () => ok(res, { sent: true });
    if (!email || !mailConfigured() || mailThrottled("reset", email)) return generic();
    try {
      pruneAuthTokens();
      const state = accountVerificationState(email);
      if (!state?.hasPassword) return generic();
      const token = issueAuthToken(email, "reset");
      if (token) dispatchMail(resetMail({ name: state.name, token, minutes: RESET_TTL_MINUTES }), email);
    } catch (error) {
      console.warn(`  ! reset request failed: ${error.message}`);
    }
    return generic();
  }));

  app.post("/api/auth/reset", rateLimit, wrap(async (req, res) => {
    if (localOwnerMode()) return fail(res, 404, "password recovery is not available in local-owner mode");
    const { token, password } = req.body ?? {};
    if (!token) return fail(res, 400, "missing reset token");
    const spent = consumeAuthToken(token, "reset");
    if (!spent.ok) {
      if (spent.reason === "unavailable") return fail(res, 503, "the account store is unavailable");
      return fail(res, 400, "that reset link has expired or has already been used — ask for a new one");
    }
    try {
      resetPassword(spent.email, password);
    } catch (error) {
      const replacement = issueAuthToken(spent.email, "reset");
      return res.status(400).json({ ok: false, error: error.message, token: replacement });
    }
    ok(res, { email: spent.email });
  }));

  app.post("/api/auth/verify", rateLimit, wrap(async (req, res) => {
    if (localOwnerMode()) return fail(res, 404, "email verification is not used in local-owner mode");
    const { token } = req.body ?? {};
    if (!token) return fail(res, 400, "missing verification token");
    const spent = consumeAuthToken(token, "verify");
    if (!spent.ok) {
      if (spent.reason === "unavailable") return fail(res, 503, "the account store is unavailable");
      return fail(res, 400, "that confirmation link has expired or has already been used — sign in and ask for a new one");
    }
    markVerified(spent.email);
    ok(res, { email: spent.email });
  }));

  app.post("/api/auth/verify/resend", rateLimit, wrap(async (req, res) => {
    if (localOwnerMode()) return fail(res, 404, "email verification is not used in local-owner mode");
    const user = await requireAuth(req, res, "log in to resend the confirmation");
    if (!user) return;
    if (user.verified) return ok(res, { sent: false, verified: true });
    if (!mailConfigured()) return fail(res, 503, "this server cannot send email — ask the owner to confirm your account");
    if (mailThrottled("verify", user.email)) {
      return res.status(429).json({ ok: false,
        error: "a confirmation is already on its way — check your inbox, including spam",
        code: "recently_sent" });
    }
    const token = issueAuthToken(user.email, "verify");
    if (!token) return fail(res, 503, "the account store is unavailable");
    dispatchMail(verifyMail({ name: user.name, token, hours: VERIFY_TTL_HOURS }), user.email);
    ok(res, { sent: true });
  }));

  app.get("/api/auth/registration", wrap(async (_req, res) => ok(res, await registrationState())));
  app.get("/api/auth/google/config", wrap(async (_req, res) => ok(res, {
    clientId: localOwnerMode()
      ? null
      : process.env.GOOGLE_CLIENT_ID || process.env.FORGE_GOOGLE_CLIENT_ID || null,
  })));
}
