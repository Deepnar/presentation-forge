import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";
import { getDb, setDbPathForTest } from "./db.js";
import { mailConfigured } from "./mail.js";
import { userIdentityFile, userBrandDirs, userReferenceDir } from "./tenant.js";

let USERS_FILE = path.join(CONFIG, "users.json");
let SESSIONS_FILE = path.join(CONFIG, "sessions.json");

let useJsonOnly = false;
export function setStoreDir(dir) {
  USERS_FILE = path.join(dir, "users.json");
  SESSIONS_FILE = path.join(dir, "sessions.json");
  try { setDbPathForTest(path.join(dir, "forge.db")); } catch {}
  if (dir.includes("forge-auth-")) useJsonOnly = true;
}

export const MIN_PASSWORD_LENGTH = 8;
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

export function publicUser(u) {
  return {
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
    verified: Boolean(u.verifiedAt),
    ...(u.role ? { role: u.role } : {}),
  };
}

export function verificationRequired() {
  return mailConfigured();
}

export function isAdmin(user) {
  return Boolean(user && user.role === "admin");
}

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

export function canAccessDeck(user, owner) {
  if (isAdmin(user)) return true;
  if (!owner) return false;
  return owner === user.email;
}

export function verifiedRequestOnly({ method, path: reqPath } = {}) {
  const verb = String(method ?? "").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "DELETE" || verb === "OPTIONS") return false;
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

export async function accountCount() {
  const d = db();
  if (d) return Number(d.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0);
  return (await loadUsers()).length;
}

export async function registerLocalOwner({ name, email, password }) {
  const error = validateRegistration({ name, email, password });
  if (error) throw new Error(error);
  const normalized = email.trim().toLowerCase();
  const d = db();
  if (d) {
    d.exec("BEGIN IMMEDIATE");
    try {
      const count = Number(d.prepare("SELECT COUNT(*) AS c FROM users").get()?.c ?? 0);
      if (count !== 0) throw new Error("this local workspace already has an owner");
      const { salt, hash } = hashPassword(password);
      const now = new Date().toISOString();
      d.prepare("INSERT INTO users (email,name,password_hash,salt,role,created_at,verified_at) VALUES (?,?,?,?,?,?,?)")
        .run(normalized, name.trim(), hash, salt, "admin", now, now);
      d.exec("COMMIT");
      return publicUser(rowToUser(d.prepare("SELECT * FROM users WHERE email=?").get(normalized)));
    } catch (err) {
      try { d.exec("ROLLBACK"); } catch {}
      throw err;
    }
  }

  const users = await loadUsers();
  if (users.length) throw new Error("this local workspace already has an owner");
  const now = new Date().toISOString();
  const user = {
    name: name.trim(),
    email: normalized,
    role: "admin",
    createdAt: now,
    verifiedAt: now,
    ...hashPassword(password),
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return publicUser(user);
}

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
      d.prepare("UPDATE users SET google_sub=?, google_email=?, verified_at=COALESCE(verified_at,?) WHERE id=?")
        .run(sub, normalized, new Date().toISOString(), row.id);
      row = d.prepare("SELECT * FROM users WHERE id=?").get(row.id);
      return publicUser(rowToUser(row));
    }
    const now = new Date().toISOString();
    d.prepare("INSERT INTO users (email,name,google_sub,google_email,created_at,verified_at) VALUES (?,?,?,?,?,?)")
      .run(normalized, name.trim() || normalized, sub, normalized, now, now);
    row = d.prepare("SELECT * FROM users WHERE email=?").get(normalized);
    return publicUser(rowToUser(row));
  }
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

export function getUserId(email) {
  const d = db();
  if (!d) return null;
  const row = d.prepare("SELECT id FROM users WHERE email=?").get(String(email).trim().toLowerCase());
  return row?.id ?? null;
}

export function getUserEmailById(id) {
  const d = db();
  if (!d || !Number.isInteger(id)) return null;
  const row = d.prepare("SELECT email FROM users WHERE id=?").get(id);
  return row?.email ?? null;
}

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
    d.prepare("UPDATE sessions SET last_used=? WHERE token=?").run(new Date().toISOString(), token);
    const userRow = d.prepare("SELECT * FROM users WHERE id=?").get(sess.user_id);
    if (!userRow) return null;
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

export function bearerToken(header) {
  if (typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export const RESET_TTL_MINUTES = Number(process.env.FORGE_RESET_TTL_MINUTES) || 60;
export const VERIFY_TTL_HOURS = Number(process.env.FORGE_VERIFY_TTL_HOURS) || 24;

const PURPOSES = new Set(["reset", "verify"]);
const tokenHash = (token) => createHash("sha256").update(String(token)).digest("hex");

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

export const SESSION_COOKIE = "forge_session";

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
