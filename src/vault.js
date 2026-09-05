import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { getDb } from "./db.js";
import { isHosted } from "./cloud.js";
import { AUTO_KEY_ENV, LEGACY_AUTO_KEY_ENV, isAutoProviderId } from "./autoid.js";

const DEV_PEPPER = "dev-pepper-change-me-in-prod-32b-min-32chars!!";

/**
 * The key every stored API key is encrypted under.
 *
 * The development fallback is a constant in a public repository, so a hosted
 * box that forgot FORGE_KEY_PEPPER would encrypt its users' BYOK keys under a
 * value anyone can read — which is not encryption at all. Hosted mode therefore
 * refuses to run without a real pepper rather than quietly pretending.
 */
function masterKey() {
  const pepper = process.env.FORGE_KEY_PEPPER || process.env.FORGE_KEY || "";
  if (!pepper) {
    if (isHosted()) {
      throw new Error(
        "FORGE_KEY_PEPPER is not set. Hosted mode stores per-user API keys encrypted at rest, " +
        "and the built-in development pepper is a public constant. Set FORGE_KEY_PEPPER to a long random string.",
      );
    }
    return createHash("sha256").update(DEV_PEPPER).digest();
  }
  if (pepper === DEV_PEPPER && isHosted()) {
    throw new Error("FORGE_KEY_PEPPER is still the published development value — set a real one before hosting.");
  }
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

// The single install-wide Auto key.
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

// The environment always wins for the shared key: a key rotated in the
// deployment must beat one typed into a browser months earlier.
export function resolveGlobalKey(provider) {
  if (isAutoProviderId(provider) || provider === "tcet" || provider === "auto") {
    const env = process.env[AUTO_KEY_ENV] || process.env[LEGACY_AUTO_KEY_ENV];
    if (env) return env;
  }
  const fromDb = loadGlobalKey(provider);
  if (fromDb) return fromDb;
  // legacy: config/local.yaml plaintext fallback
  return null;
}
