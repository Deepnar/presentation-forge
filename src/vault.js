import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { getDb } from "./db.js";

function masterKey() {
  const pepper = process.env.FORGE_KEY_PEPPER || process.env.FORGE_KEY || "dev-pepper-change-me-in-prod-32b-min-32chars!!";
  // derive 32 bytes via sha256 (stable, no salt needed for master)
  return createHash("sha256").update(pepper).digest();
}

export function encryptSecret(plaintext) {
  const key = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    ciphertext: enc.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decryptSecret({ iv, ciphertext, tag }) {
  const key = masterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

// Per-user BYOK
export function saveUserKey(userId, provider, apiKey) {
  const db = getDb();
  const { iv, ciphertext, tag } = encryptSecret(apiKey);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_keys (user_id, provider, iv, ciphertext, tag, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, iv=excluded.iv, ciphertext=excluded.ciphertext, tag=excluded.tag, updated_at=excluded.updated_at
  `).run(userId, provider, iv, ciphertext, tag, now, now);
}

export function loadUserKey(userId) {
  const db = getDb();
  const row = db.prepare("SELECT provider, iv, ciphertext, tag FROM user_keys WHERE user_id=?").get(userId);
  if (!row) return null;
  try {
    const plaintext = decryptSecret(row);
    return { provider: row.provider, apiKey: plaintext };
  } catch { return null; }
}

export function clearUserKey(userId) {
  const db = getDb();
  db.prepare("DELETE FROM user_keys WHERE user_id=?").run(userId);
}

// Global tcet-auto key (single)
export function saveGlobalKey(provider, apiKey) {
  const db = getDb();
  const { iv, ciphertext, tag } = encryptSecret(apiKey);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO global_keys (provider, iv, ciphertext, tag, created_at, updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(provider) DO UPDATE SET iv=excluded.iv, ciphertext=excluded.ciphertext, tag=excluded.tag, updated_at=excluded.updated_at
  `).run(provider, iv, ciphertext, tag, now, now);
}

export function loadGlobalKey(provider) {
  const db = getDb();
  const row = db.prepare("SELECT iv, ciphertext, tag FROM global_keys WHERE provider=?").get(provider);
  if (!row) return null;
  try { return decryptSecret(row); } catch { return null; }
}

// fallback: env var always wins for tcet-auto if set
export function resolveGlobalKey(provider) {
  if (process.env.FORGE_TCET_API_KEY && provider === "tcet-auto") return process.env.FORGE_TCET_API_KEY;
  if (process.env.FORGE_TCET_API_KEY && provider === "tcet") return process.env.FORGE_TCET_API_KEY;
  const fromDb = loadGlobalKey(provider);
  if (fromDb) return fromDb;
  // legacy: config/local.yaml plaintext fallback
  return null;
}
