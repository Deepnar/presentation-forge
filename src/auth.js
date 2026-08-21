import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";
import { getDb, setDbPathForTest } from "./db.js";

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
  return { name: u.name, email: u.email, createdAt: u.createdAt, ...(u.role ? { role: u.role } : {}) };
}

/** The operator's account. Admin is the only role today, minted by seedAdmin
 *  (or matched by FORGE_ADMIN_EMAIL for an account seeded before roles
 *  existed). Admin sees the whole deck store, including ownerless legacy
 *  decks that no account owns. */
export function isAdmin(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const adminEmail = process.env.FORGE_ADMIN_EMAIL;
  return typeof adminEmail === "string" && user.email === adminEmail.trim().toLowerCase();
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
    d.prepare("INSERT INTO users (email,name,password_hash,salt,created_at) VALUES (?,?,?,?,?)")
      .run(normalized, name.trim(), hash, salt, now);
    const row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    return publicUser(rowToUser(row));
  }
  const users = await loadUsers();
  if (users.some((u) => u.email === normalized)) {
    throw new Error("an account with that email already exists");
  }
  const user = {
    name: name.trim(),
    email: normalized,
    createdAt: new Date().toISOString(),
    ...hashPassword(password),
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return publicUser(user);
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
    d.prepare("INSERT INTO users (email,name,password_hash,salt,role,created_at) VALUES (?,?,?,?,?,?)")
      .run(normalized, name.trim(), hash, salt, "admin", now);
    return true;
  }
  const users = await loadUsers();
  if (users.some((u) => u.email === normalized)) return false;
  const user = {
    name: name.trim(),
    email: normalized,
    createdAt: new Date().toISOString(),
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
      d.prepare("UPDATE users SET google_sub=?, google_email=? WHERE id=?").run(sub, normalized, row.id);
      row = d.prepare("SELECT * FROM users WHERE id=?").get(row.id);
      return publicUser(rowToUser(row));
    }
    const now = new Date().toISOString();
    d.prepare("INSERT INTO users (email,name,google_sub,google_email,created_at) VALUES (?,?,?,?,?)")
      .run(normalized, name.trim() || normalized, sub, normalized, now);
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
    await writeJson(USERS_FILE, users);
    return publicUser(user);
  }
  const newUser = {
    name: name.trim() || normalized,
    email: normalized,
    createdAt: new Date().toISOString(),
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
