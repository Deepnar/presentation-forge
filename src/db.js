import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.js";

/**
 * Resolved per open, not once at import. `setDbPathForTest` works by setting
 * FORGE_DB_PATH, so a constant captured at module load meant the seam quietly
 * did nothing and a test that asked for a scratch database got the real one.
 * The two suites that redirect the store both took the JSON escape hatch, which
 * is why nothing noticed.
 */
const dbPath = () => process.env.FORGE_DB_PATH || path.join(CONFIG, "forge.db");

let db = null;
let initDone = false;

function getDb() {
  if (db) return db;
  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  // WAL for concurrent reads
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  ensureSchema(db);
  // migrate JSON files once
  if (!initDone) {
    initDone = true;
    // fire-and-forget sync migration (no async in DatabaseSync)
    try { migrateJsonIfNeeded(db); } catch {}
  }
  return db;
}

function ensureSchema(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      salt TEXT,
      google_sub TEXT UNIQUE,
      google_email TEXT,
      role TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

    CREATE TABLE IF NOT EXISTS user_keys (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS global_keys (
      provider TEXT PRIMARY KEY,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      routing TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      slides INTEGER NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      provider TEXT NOT NULL DEFAULT 'tcet-auto',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auto_events_user_time ON auto_events(user_id, created_at);
  `);
}

function migrateJsonIfNeeded(d) {
  const usersFile = path.join(CONFIG, "users.json");
  const sessionsFile = path.join(CONFIG, "sessions.json");
  const hasUsers = d.prepare("SELECT COUNT(*) as c FROM users").get()?.c ?? 0;
  if (hasUsers > 0) return;
  if (!existsSync(usersFile)) return;
  try {
    const raw = readFileSync(usersFile, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return;
    const ins = d.prepare(`INSERT OR IGNORE INTO users (email,name,password_hash,salt,google_sub,role,created_at) VALUES (?,?,?,?,?,?,?)`);
    for (const u of arr) {
      if (!u.email) continue;
      ins.run(
        String(u.email).trim().toLowerCase(),
        String(u.name ?? u.email).trim() || u.email,
        u.hash ?? null,
        u.salt ?? null,
        u.google_sub ?? null,
        u.role ?? null,
        u.createdAt ?? new Date().toISOString()
      );
    }
    // sessions
    if (existsSync(sessionsFile)) {
      const sRaw = readFileSync(sessionsFile, "utf8");
      const sObj = JSON.parse(sRaw);
      if (sObj && typeof sObj === "object") {
        const sIns = d.prepare(`INSERT OR IGNORE INTO sessions (token,user_id,email,created_at,last_used) VALUES (?,?,?,?,?)`);
        for (const [token, sess] of Object.entries(sObj)) {
          if (!sess?.email) continue;
          const user = d.prepare("SELECT id FROM users WHERE email=?").get(String(sess.email).trim().toLowerCase());
          if (!user) continue;
          const ts = sess.createdAt ?? new Date().toISOString();
          sIns.run(token, user.id, String(sess.email).trim().toLowerCase(), ts, ts);
        }
      }
    }
  } catch {}
}

// Helpers for tests to redirect DB path (must be called before getDb)
export function setDbPathForTest(p) {
  if (db) { try { db.close(); } catch {} db = null; }
  // hack: override CONFIG resolution by env
  process.env.FORGE_DB_PATH = p;
  initDone = false;
}

export function closeDb() {
  if (db) { try { db.close(); } catch {} db = null; }
}

export { getDb, dbPath };
