import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";
import { getDb, setDbPathForTest } from "./db.js";
import { mailConfigured } from "./mail.js";
import { userIdentityFile, userBrandDirs, userReferenceDir } from "./tenant.js";

/**
 * Local single-install accounts. This is deliberately NOT a multi-user system:
 * accounts exist so the Cloud-key section can be gated (the key is sensitive)
 * and to have a place for future hosting, nothing more. Everything else in the
 * app stays open.
 *
 * Passwords are hashed with crypto.scryptSync (a real KDF, Node built-in) and
 * a per-user random salt; the hash and salt are the only thing written to disk.
 * The password is never logged, returned, or otherwise leaves the request.
 * Sessions are opaque random tokens held in a server-side file; the browser
 * never sees anything but the token.
 */

let USERS_FILE = path.join(CONFIG, "users.json");
let SESSIONS_FILE = path.join(CONFIG, "sessions.json");

// Test seam: auth.test.js redirects the store to a scratch dir so it never
// touches the real users/sessions.
let useJsonOnly = false;
export function setStoreDir(dir) {
  USERS_FILE = path.join(dir, "users.json");
  SESSIONS_FILE = path.join(dir, "sessions.json");
  try { setDbPathForTest(path.join(dir, "forge.db")); } catch {}
  // tests manipulate JSON directly — stay on JSON for that run
  if (dir.includes("forge-auth-")) useJsonOnly = true;
}

export const MIN_PASSWORD_LENGTH = 8;
// Sessions are idle-expiring: a token unused for this long is dead, and using
// a token refreshes its clock. A leaked token therefore has a bounded shelf
// life without forcing the owner to log in again mid-project.
const SESSION_TTL_MS = (Number(process.env.FORGE_SESSION_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8")) ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function loadUsers() {
  const users = await readJson(USERS_FILE, []);
  return Array.isArray(users) ? users : [];
}

async function loadSessions() {
  const sessions = await readJson(SESSIONS_FILE, {});
  return typeof sessions === "object" && sessions !== null ? sessions : {};
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateRegistration({ name, email, password }) {
  if (typeof name !== "string" || !name.trim()) return "a name is required";
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "a valid email is required";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/** Public shape only — never the hash or salt, never anything derivable. */
export function publicUser(u) {
  return {
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    verified: Boolean(u.verifiedAt),
    ...(u.role ? { role: u.role } : {}),
  };
}

/**
 * Whether an address has to be confirmed before the account can spend anything.
 * Only where a confirmation can actually be delivered: an install with no SMTP
 * marks accounts verified at creation, because a gate whose only key is an
 * email nobody can send is not a gate, it is a locked door with no handle.
 */
export function verificationRequired() {
  return mailConfigured();
}

/**
 * The operator's role. Admin is granted in exactly two places: `seedAdmin()` at
 * boot from the FORGE_ADMIN_* env pair, and promotion by an existing admin.
 *
 * It is deliberately NOT derived from the email address. Registration does not
 * verify email ownership, so treating any address as inherently privileged
 * means whoever signs up with that address first owns the instance. The env
 * var still designates the operator — but only at boot, where an attacker
 * cannot reach it.
 */
export function isAdmin(user) {
  return Boolean(user && user.role === "admin");
}

/** RBAC — list all users for the admin panel. */
export async function listUsers() {
  const d = db();
  if (d) {
    try {
      const rows = d.prepare("SELECT email,name,role,created_at,google_sub,verified_at FROM users ORDER BY created_at DESC").all();
      return rows.map((r) => ({
        email: r.email,
        name: r.name,
        role: r.role ?? null,
        createdAt: r.created_at,
        google: Boolean(r.google_sub),
        verified: Boolean(r.verified_at),
        admin: r.role === "admin",
      }));
    } catch {}
  }
  const users = await loadUsers();
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role ?? null,
    createdAt: u.createdAt,
    google: Boolean(u.google_sub),
    verified: Boolean(u.verifiedAt),
    admin: u.role === "admin",
  }));
}

export async function setUserRole(email, role) {
  const normalized = String(email).trim().toLowerCase();
  const clean = role === "admin" ? "admin" : null;
  const d = db();
  if (d) {
    const row = d.prepare("SELECT role FROM users WHERE email=?").get(normalized);
    if (!row) throw new Error("no such user");
    d.prepare("UPDATE users SET role=? WHERE email=?").run(clean, normalized);
    return;
  }
  const users = await loadUsers();
  const u = users.find((x) => x.email === normalized);
  if (!u) throw new Error("no such user");
  if (clean) u.role = clean;
  else delete u.role;
  await writeJson(USERS_FILE, users);
}

/**
 * Everything an account owns OUTSIDE the database.
 *
 * The per-user tables cascade on `users.id`, so deleting the row takes
 * sessions, BYOK keys, prefs and usage with it. These do not cascade because
 * they are files: an identity override, the account's own brand marks (PNGs,
 * the largest of the three) and its report donor. Left behind they are
 * addressed by a hash of an email that no longer resolves to anyone — dead
 * bytes on the volume that nothing will ever read or clean up.
 *
 * Best effort by design: a file that cannot be removed must not leave the
 * account half-deleted, which is a worse state than a leaked file.
 */
async function removeTenantFiles(email) {
  const targets = [
    userIdentityFile(email),
    userBrandDirs(email)?.logos,
    userBrandDirs(email)?.generated,
    userReferenceDir(email),
  ].filter(Boolean);
  for (const t of targets) {
    try { await rm(t, { recursive: true, force: true }); } catch { /* leave it rather than fail the delete */ }
  }
}

export async function deleteUserAccount(email) {
  const normalized = String(email).trim().toLowerCase();
  const d = db();
  if (d) {
    const row = d.prepare("SELECT id FROM users WHERE email=?").get(normalized);
    if (!row) throw new Error("no such user");
    // forbid deleting the last admin
    const admins = d.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get()?.c ?? 0;
    const targetIsAdmin = d.prepare("SELECT role FROM users WHERE email=?").get(normalized)?.role === "admin";
    if (targetIsAdmin && admins <= 1) throw new Error("cannot delete the last admin");
    d.prepare("DELETE FROM users WHERE email=?").run(normalized);
    d.prepare("DELETE FROM sessions WHERE email=?").run(normalized);
    if (row?.id) d.prepare("DELETE FROM auto_events WHERE user_id=?").run(row.id);
    await removeTenantFiles(normalized);
    return;
  }
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.email === normalized);
  if (idx === -1) throw new Error("no such user");
  users.splice(idx, 1);
  await writeJson(USERS_FILE, users);
  const sessions = await loadSessions();
  for (const [tok, sess] of Object.entries(sessions)) {
    if (sess.email === normalized) delete sessions[tok];
  }
  await writeJson(SESSIONS_FILE, sessions);
  await removeTenantFiles(normalized);
}

/**
 * The per-user deck access policy, shared by the list and the per-slug gate so
 * the two can never disagree. Owned decks belong to their owner; ownerless
 * decks (legacy folders, CLI runs) are operator-only — a fresh account must
 * not see a stranger's CLI decks as its own.
 */
export function canAccessDeck(user, owner) {
  if (isAdmin(user)) return true;
  if (!owner) return false;
  return owner === user.email;
}

/**
 * Whether a workspace request needs a confirmed address behind it.
 *
 * The rule is one sentence — reading is free, changing anything is not — and it
 * is written as a default-deny so a route added later is covered without
 * anybody remembering to cover it. That shape is the point: the alternative, a
 * list of the routes that currently spend something, goes stale the first time
 * another is written.
 *
 * It lives here beside canAccessDeck rather than in the Express layer because
 * it is an access policy, and because a policy inside a module that calls
 * listen() at import cannot be tested.
 *
 * DELETE stays open on purpose. Someone who cannot generate should still be
 * able to clear up, and refusing that leaves junk nobody can remove.
 */
export function verifiedRequestOnly({ method, path: reqPath } = {}) {
  const verb = String(method ?? "").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "DELETE" || verb === "OPTIONS") return false;
  // A local filter over decks the caller already owns — no model, no disk.
  if (reqPath === "/search") return false;
  return true;
}

function db() {
  if (useJsonOnly) return null;
  try { return getDb(); } catch { return null; }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    salt: row.salt,
    hash: row.password_hash,
    role: row.role,
    google_sub: row.google_sub,
    verifiedAt: row.verified_at,
  };
}

export async function register({ name, email, password }) {
  const error = validateRegistration({ name, email, password });
  if (error) throw new Error(error);
  const normalized = email.trim().toLowerCase();
  const d = db();
  if (d) {
    const exists = d.prepare("SELECT id FROM users WHERE email=?").get(normalized);
    if (exists) throw new Error("an account with that email already exists");
    const { salt, hash } = hashPassword(password);
    const now = new Date().toISOString();
    // Self-registration never carries a role. Admin comes from seedAdmin() or
    // an existing admin's promotion, never from what someone typed in a form.
    d.prepare("INSERT INTO users (email,name,password_hash,salt,created_at,verified_at) VALUES (?,?,?,?,?,?)")
      .run(normalized, name.trim(), hash, salt, now, verificationRequired() ? null : now);
    const row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    return publicUser(rowToUser(row));
  }
  const users = await loadUsers();
  if (users.some((u) => u.email === normalized)) {
    throw new Error("an account with that email already exists");
  }
  const now = new Date().toISOString();
  const user = {
    name: name.trim(),
    email: normalized,
    createdAt: now,
    verifiedAt: verificationRequired() ? null : now,
    ...hashPassword(password),
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return publicUser(user);
}

/**
 * Give an existing account the admin role. Called at boot for FORGE_ADMIN_EMAIL
 * so the operator keeps admin even when the account was created by ordinary
 * registration (which never grants a role) or by Google sign-in, where no
 * password exists for seedAdmin to set. Boot is the only safe place for this:
 * the env var is operator intent, and nothing reachable over HTTP can reach it.
 */
export async function promoteToAdmin(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const d = db();
  if (d) {
    const row = d.prepare("SELECT id, role FROM users WHERE email=?").get(normalized);
    if (!row) return false;
    if (row.role === "admin") return false;
    d.prepare("UPDATE users SET role='admin' WHERE email=?").run(normalized);
    return true;
  }
  const users = await loadUsers();
  const u = users.find((x) => x.email === normalized);
  if (!u || u.role === "admin") return false;
  u.role = "admin";
  await writeJson(USERS_FILE, users);
  return true;
}

/** Mint the operator's account from env on first boot (registration locked).
 *  No-op when the email is already taken — the env can stay set across
 *  restarts without repeatedly erroring. */
export async function seedAdmin({ name, email, password }) {
  const error = validateRegistration({ name, email, password });
  if (error) throw new Error(`FORGE_ADMIN_* misconfigured: ${error}`);
  const normalized = email.trim().toLowerCase();
  const d = db();
  if (d) {
    const exists = d.prepare("SELECT id FROM users WHERE email=?").get(normalized);
    if (exists) return false;
    const { salt, hash } = hashPassword(password);
    const now = new Date().toISOString();
    d.prepare("INSERT INTO users (email,name,password_hash,salt,role,created_at,verified_at) VALUES (?,?,?,?,?,?,?)")
      .run(normalized, name.trim(), hash, salt, "admin", now, now);
    return true;
  }
  const users = await loadUsers();
  if (users.some((u) => u.email === normalized)) return false;
  const seededAt = new Date().toISOString();
  const user = {
    name: name.trim(),
    email: normalized,
    createdAt: seededAt,
    verifiedAt: seededAt,
    role: "admin",
    ...hashPassword(password),
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return true;
}

export async function authenticate(email, password) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const d = db();
  if (d) {
    const row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    if (!row || !row.password_hash || typeof password !== "string") return null;
    const user = rowToUser(row);
    return verifyPassword(password, user.salt, user.hash) ? publicUser(user) : null;
  }
  const users = await loadUsers();
  const user = users.find((u) => u.email === normalized);
  if (!user || typeof password !== "string") return null;
  return verifyPassword(password, user.salt, user.hash) ? publicUser(user) : null;
}

// Google OAuth — any email, verified via tokeninfo. In dev without GOOGLE_CLIENT_ID, skip aud check.
export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.FORGE_GOOGLE_CLIENT_ID || null;
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google token invalid: ${t.slice(0,120)}`);
  }
  const info = await res.json();
  if (clientId && info.aud !== clientId) throw new Error("Google token audience mismatch");
  if (info.email_verified !== "true" && info.email_verified !== true) throw new Error("Google email not verified");
  if (!info.email) throw new Error("Google token missing email");
  const exp = Number(info.exp);
  if (Number.isFinite(exp) && Date.now()/1000 > exp) throw new Error("Google token expired");
  return {
    sub: String(info.sub),
    email: String(info.email).trim().toLowerCase(),
    name: String(info.name ?? info.email.split("@")[0]),
    picture: info.picture ?? null,
  };
}

export async function findOrCreateGoogleUser({ sub, email, name }) {
  const normalized = email.trim().toLowerCase();
  const d = db();
  if (d) {
    let row = d.prepare("SELECT * FROM users WHERE google_sub=?").get(sub);
    if (row) return publicUser(rowToUser(row));
    row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    if (row) {
      // Signing in with Google against an existing unverified account proves
      // the address as surely as clicking a link would.
      d.prepare("UPDATE users SET google_sub=?, google_email=?, verified_at=COALESCE(verified_at,?) WHERE id=?")
        .run(sub, normalized, new Date().toISOString(), row.id);
      row = d.prepare("SELECT * FROM users WHERE id=?").get(row.id);
      return publicUser(rowToUser(row));
    }
    const now = new Date().toISOString();
    // verifyGoogleIdToken refuses a token whose email_verified is false, so
    // arriving here IS the proof of ownership that the email flow exists to get.
    d.prepare("INSERT INTO users (email,name,google_sub,google_email,created_at,verified_at) VALUES (?,?,?,?,?,?)")
      .run(normalized, name.trim() || normalized, sub, normalized, now, now);
    row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    return publicUser(rowToUser(row));
  }
  // JSON fallback
  const users = await loadUsers();
  let user = users.find((u) => u.google_sub === sub);
  if (user) return publicUser(user);
  user = users.find((u) => u.email === normalized);
  if (user) {
    user.google_sub = sub;
    user.google_email = normalized;
    user.verifiedAt ??= new Date().toISOString();
    await writeJson(USERS_FILE, users);
    return publicUser(user);
  }
  const linkedAt = new Date().toISOString();
  const newUser = {
    name: name.trim() || normalized,
    email: normalized,
    createdAt: linkedAt,
    verifiedAt: linkedAt,
    google_sub: sub,
    google_email: normalized,
  };
  users.push(newUser);
  await writeJson(USERS_FILE, users);
  return publicUser(newUser);
}

export function createSession() {
  return randomBytes(32).toString("hex");
}

export async function startSession(user) {
  const token = createSession();
  const now = new Date().toISOString();
  const d = db();
  if (d) {
    // lookup user id
    const row = d.prepare("SELECT id FROM users WHERE email=?").get(user.email.trim().toLowerCase());
    const uid = row?.id ?? null;
    if (uid) {
      d.prepare("INSERT INTO sessions (token,user_id,email,created_at,last_used) VALUES (?,?,?,?,?)")
        .run(token, uid, user.email.trim().toLowerCase(), now, now);
      return token;
    }
  }
  const sessions = await loadSessions();
  sessions[token] = { email: user.email, createdAt: now };
  await writeJson(SESSIONS_FILE, sessions);
  return token;
}

export async function endSession(token) {
  if (!token) return;
  const d = db();
  if (d) {
    d.prepare("DELETE FROM sessions WHERE token=?").run(token);
    return;
  }
  const sessions = await loadSessions();
  if (sessions[token]) {
    delete sessions[token];
    await writeJson(SESSIONS_FILE, sessions);
  }
}

/** Helper for limits: get user DB id */
export function getUserId(email) {
  const d = db();
  if (!d) return null;
  const row = d.prepare("SELECT id FROM users WHERE email=?").get(String(email).trim().toLowerCase());
  return row?.id ?? null;
}

/**
 * The address behind an internal id.
 *
 * The inverse of `getUserId`, for the places that hold ids from another table
 * (usage rows) and need to label them. Without it the only route from id to
 * email was to walk every account calling `getUserId` — one query per
 * registered user to name a handful of rows.
 */
export function getUserEmailById(id) {
  const d = db();
  if (!d || !Number.isInteger(id)) return null;
  const row = d.prepare("SELECT email FROM users WHERE id=?").get(id);
  return row?.email ?? null;
}

/** Resolve a bearer token to a public user, or null. Expired sessions are
 *  pruned (and the store rewritten) so a dead token cannot accumulate, and a
 *  live session's clock is refreshed so an active owner never logs in again
 *  mid-project. */
export async function userForToken(token) {
  if (!token) return null;
  const d = db();
  if (d) {
    const sess = d.prepare("SELECT * FROM sessions WHERE token=?").get(token);
    if (!sess) return null;
    const created = Date.parse(sess.last_used ?? sess.created_at);
    if (Number.isFinite(created) && Date.now() - created > SESSION_TTL_MS) {
      d.prepare("DELETE FROM sessions WHERE token=?").run(token);
      return null;
    }
    // refresh
    d.prepare("UPDATE sessions SET last_used=? WHERE token=?").run(new Date().toISOString(), token);
    const userRow = d.prepare("SELECT * FROM users WHERE id=?").get(sess.user_id);
    if (!userRow) return null;
    // also try email lookup if user deleted?
    return publicUser(rowToUser(userRow));
  }
  const sessions = await loadSessions();
  const now = Date.now();
  let changed = false;
  const session = sessions[token];
  if (session) {
    const created = Date.parse(session.createdAt);
    if (Number.isFinite(created) && now - created > SESSION_TTL_MS) {
      delete sessions[token];
      changed = true;
    } else {
      // Slide-window TTL: refresh the clock so an active session never dies.
      session.createdAt = new Date(now).toISOString();
      changed = true;
    }
  }
  if (changed) await writeJson(SESSIONS_FILE, sessions);
  if (!session || !sessions[token]) return null;
  const users = await loadUsers();
  const user = users.find((u) => u.email === session.email);
  return user ? publicUser(user) : null;
}

/** Extract the bearer token from an Authorization header value. */
export function bearerToken(header) {
  if (typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/* --------------------------------------------------- reset / verify tokens */

/**
 * One store for both "prove you can read this address" jobs: password reset and
 * address verification. They differ only in lifetime and in what consuming one
 * does, so they share a table and a code path — two near-identical token
 * implementations is how one of them ends up missing the single-use check.
 *
 * What is stored is the SHA-256 of the token, never the token. A reset token is
 * a bearer credential for an account; a database that leaks must not be a list
 * of live password resets. The plaintext exists only in the email.
 *
 * A reset is short (an hour — it is answered immediately or not at all); a
 * verification is long (a day — it can sit in a spam folder overnight and still
 * be worth clicking).
 */
export const RESET_TTL_MINUTES = Number(process.env.FORGE_RESET_TTL_MINUTES) || 60;
export const VERIFY_TTL_HOURS = Number(process.env.FORGE_VERIFY_TTL_HOURS) || 24;

const PURPOSES = new Set(["reset", "verify"]);
const tokenHash = (token) => createHash("sha256").update(String(token)).digest("hex");

/**
 * Mint a token for an account. Any outstanding token of the same purpose is
 * dropped first: two live reset links for one account doubles the window an
 * intercepted email is useful in, and the newest request is the one the person
 * is actually looking at.
 *
 * Returns the plaintext, which is written to exactly one place — the email.
 */
export function issueAuthToken(email, purpose) {
  if (!PURPOSES.has(purpose)) throw new Error(`unknown token purpose: ${purpose}`);
  const normalized = String(email ?? "").trim().toLowerCase();
  const d = db();
  if (!d) return null;
  const row = d.prepare("SELECT id FROM users WHERE email=?").get(normalized);
  if (!row) return null;
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const ttl = purpose === "reset"
    ? RESET_TTL_MINUTES * 60 * 1000
    : VERIFY_TTL_HOURS * 60 * 60 * 1000;
  d.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?").run(row.id, purpose);
  d.prepare("INSERT INTO auth_tokens (token_hash,user_id,email,purpose,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .run(tokenHash(token), row.id, normalized, purpose, now, now + ttl);
  return token;
}

/**
 * Spend a token, or explain why it cannot be spent.
 *
 * The consume is a conditional UPDATE rather than a read-then-write: two
 * requests arriving together on one token would both pass a read check and both
 * proceed, and "single use" that two callers can satisfy is not single use.
 * SQLite reports the row count, so exactly one caller sees `changes === 1`.
 */
export function consumeAuthToken(token, purpose) {
  const d = db();
  if (!d) return { ok: false, reason: "unavailable" };
  const hash = tokenHash(token ?? "");
  const row = d.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=?").get(hash, purpose);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (Date.now() > row.expires_at) return { ok: false, reason: "expired" };
  const spent = d.prepare("UPDATE auth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL")
    .run(Date.now(), hash);
  if (!spent.changes) return { ok: false, reason: "used" };
  const user = d.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
  if (!user) return { ok: false, reason: "invalid" };
  return { ok: true, email: row.email, userId: row.user_id, user: publicUser(rowToUser(user)) };
}

/** Drop spent and expired rows. Called from the reset path, so the table is
 *  pruned by ordinary use rather than needing a scheduled job. */
export function pruneAuthTokens() {
  const d = db();
  if (!d) return 0;
  return d.prepare("DELETE FROM auth_tokens WHERE expires_at < ? OR used_at IS NOT NULL")
    .run(Date.now() - 24 * 60 * 60 * 1000).changes ?? 0;
}

export function markVerified(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const d = db();
  if (!d) return false;
  const res = d.prepare("UPDATE users SET verified_at=COALESCE(verified_at,?) WHERE email=?")
    .run(new Date().toISOString(), normalized);
  return Boolean(res.changes);
}

/**
 * Set a new password after a reset.
 *
 * Every session for the account dies with it. A reset is what someone does when
 * they believe they have lost control of the account, and leaving the sessions
 * that prompted the reset alive would answer the wrong half of the problem.
 * Outstanding reset tokens go too, and a completed reset proves the address, so
 * an unverified account is verified by finishing one.
 */
export function resetPassword(email, password) {
  const error = validateRegistration({ name: "x", email, password });
  if (error) throw new Error(error);
  const normalized = String(email).trim().toLowerCase();
  const d = db();
  if (!d) throw new Error("account store unavailable");
  const row = d.prepare("SELECT id FROM users WHERE email=?").get(normalized);
  if (!row) throw new Error("no such user");
  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  d.prepare("UPDATE users SET password_hash=?, salt=?, verified_at=COALESCE(verified_at,?) WHERE id=?")
    .run(hash, salt, now, row.id);
  d.prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
  d.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset'").run(row.id);
  return true;
}

/** Whether an account exists and still needs its address confirmed. Used to
 *  decide if a verification mail is worth sending at all. */
export function accountVerificationState(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const d = db();
  if (!d) return null;
  const row = d.prepare("SELECT name, verified_at, password_hash FROM users WHERE email=?").get(normalized);
  if (!row) return null;
  return {
    name: row.name,
    verified: Boolean(row.verified_at),
    hasPassword: Boolean(row.password_hash),
  };
}

/* ------------------------------------------------------------ session cookie */

/**
 * The browser cannot put an Authorization header on an `<img src>`, so the
 * raster, download and asset routes used to be exempt from authentication
 * entirely — with a slug derived from the deck title as their only protection.
 * A title is not a secret, so that was an IDOR: anyone could fetch anyone's
 * deck by guessing.
 *
 * The fix is a second carrier for the SAME session token: an httpOnly cookie
 * scoped to /api/decks. Media requests carry it automatically; every
 * state-changing route still reads the bearer header and ignores this cookie,
 * so widening the credential cannot widen CSRF exposure.
 */
export const SESSION_COOKIE = "forge_session";

/** Pull one cookie out of a raw Cookie header without a parser dependency. */
export function cookieToken(header, name = SESSION_COOKIE) {
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch { return null; }
  }
  return null;
}

export function sessionCookie(token, { secure = false } = {}) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/api/decks",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearedSessionCookie({ secure = false } = {}) {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/api/decks", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
