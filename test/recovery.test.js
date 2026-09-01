import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Account recovery and address confirmation.
 *
 * Everything here is a boundary a stranger hits on day one: a forgotten
 * password with no way back, an address nobody can reach, and a token that
 * should work once. The auth suite deliberately runs on the JSON store, so
 * these run against real SQLite — that is where the token table lives, and a
 * single-use claim that has only ever been tested against an in-memory object
 * has not been tested.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-recovery-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DB_PATH = path.join(scratch, "config", "forge.db");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });

// Verification is only enforced where a message can be delivered, so the SMTP
// vars decide what register() does. Set before the first import.
const smtp = {
  FORGE_SMTP_HOST: "127.0.0.1",
  FORGE_SMTP_USER: "u",
  FORGE_SMTP_PASS: "p",
  FORGE_SMTP_FROM: "forge@example.com",
};
const setSmtp = (on) => {
  for (const [k, v] of Object.entries(smtp)) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
};

setSmtp(true);
const auth = await import("../src/auth.js");
const { getDb, closeDb } = await import("../src/db.js");

const openDb = () => new DatabaseSync(process.env.FORGE_DB_PATH);

test.after(async () => {
  closeDb();
  await rm(scratch, { recursive: true, force: true });
});

/* ------------------------------------------------------ what a gate needs */

test("verification is required exactly when a message can be delivered", () => {
  setSmtp(true);
  assert.equal(auth.verificationRequired(), true);
  setSmtp(false);
  // A gate whose only key is an email nobody can send is a locked door with no
  // handle: an install with no SMTP must not enforce one.
  assert.equal(auth.verificationRequired(), false);
  setSmtp(true);
});

test("an account is unverified on registration, and verified without SMTP", async () => {
  setSmtp(true);
  const gated = await auth.register({ name: "Gated", email: "gated@example.com", password: "correct horse" });
  assert.equal(gated.verified, false);

  setSmtp(false);
  const open = await auth.register({ name: "Open", email: "open@example.com", password: "correct horse" });
  assert.equal(open.verified, true, "no SMTP means the account is usable immediately");
  setSmtp(true);
});

test("a Google account arrives verified", async () => {
  // verifyGoogleIdToken refuses a token whose email_verified is false, so
  // reaching findOrCreateGoogleUser is itself the proof of ownership.
  const u = await auth.findOrCreateGoogleUser({ sub: "g-1", email: "goog@example.com", name: "Goog" });
  assert.equal(u.verified, true);
});

test("linking Google to an existing unverified account verifies it", async () => {
  await auth.register({ name: "Linker", email: "linker@example.com", password: "correct horse" });
  assert.equal((await auth.authenticate("linker@example.com", "correct horse")).verified, false);
  const linked = await auth.findOrCreateGoogleUser({ sub: "g-2", email: "linker@example.com", name: "Linker" });
  assert.equal(linked.verified, true);
});

/* ------------------------------------------------------------ the policy */

test("reading is free, changing anything is not", () => {
  const needs = (method, p) => auth.verifiedRequestOnly({ method, path: p });
  for (const m of ["GET", "HEAD", "OPTIONS"]) assert.equal(needs(m, "/whatever"), false, `${m} is a read`);
  // Someone who cannot generate must still be able to clear up after themselves.
  assert.equal(needs("DELETE", "/some-deck"), false);
  // A local filter over decks already owned spends nothing.
  assert.equal(needs("POST", "/search"), false);

  // Default-deny: every writing route, including ones that do not exist yet.
  for (const p of ["/", "/a/generate", "/a/render", "/a/chat", "/a/report/render", "/a/some-future-route"]) {
    assert.equal(needs("POST", p), true, `POST ${p} must be gated`);
  }
  assert.equal(needs("PUT", "/a"), true);
  assert.equal(needs("PATCH", "/a"), true);
});

/* -------------------------------------------------------------- tokens */

test("a token round-trips once and only once", async () => {
  await auth.register({ name: "Once", email: "once@example.com", password: "correct horse" });
  const token = auth.issueAuthToken("once@example.com", "reset");
  assert.ok(token, "a token is issued for a real account");

  const first = auth.consumeAuthToken(token, "reset");
  assert.equal(first.ok, true);
  assert.equal(first.email, "once@example.com");

  const second = auth.consumeAuthToken(token, "reset");
  assert.equal(second.ok, false);
  assert.equal(second.reason, "used", "a reset link is spent by the first use, not by the second");
});

test("the plaintext token is never written to the database", () => {
  const token = auth.issueAuthToken("once@example.com", "reset");
  const db = openDb();
  try {
    const rows = db.prepare("SELECT token_hash FROM auth_tokens").all();
    assert.ok(rows.length);
    for (const r of rows) {
      assert.notEqual(r.token_hash, token);
    }
    // A leaked database must not be a list of live password resets.
    const hit = db.prepare("SELECT COUNT(*) c FROM auth_tokens WHERE token_hash=?").get(token);
    assert.equal(hit.c, 0);
  } finally {
    db.close();
  }
});

test("a token cannot be spent for the purpose it was not issued for", () => {
  const verify = auth.issueAuthToken("once@example.com", "verify");
  const wrong = auth.consumeAuthToken(verify, "reset");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "invalid");
  // ...and is still good for its own purpose afterwards.
  assert.equal(auth.consumeAuthToken(verify, "verify").ok, true);
});

test("issuing a second token kills the first", () => {
  const older = auth.issueAuthToken("once@example.com", "reset");
  const newer = auth.issueAuthToken("once@example.com", "reset");
  assert.notEqual(older, newer);
  // Two live reset links doubles the window an intercepted email is useful in.
  assert.equal(auth.consumeAuthToken(older, "reset").reason, "invalid");
  assert.equal(auth.consumeAuthToken(newer, "reset").ok, true);
});

test("an expired token is refused", () => {
  const token = auth.issueAuthToken("once@example.com", "reset");
  const db = openDb();
  try {
    db.prepare("UPDATE auth_tokens SET expires_at=? WHERE used_at IS NULL").run(Date.now() - 1000);
  } finally {
    db.close();
  }
  const spent = auth.consumeAuthToken(token, "reset");
  assert.equal(spent.ok, false);
  assert.equal(spent.reason, "expired");
});

test("an unknown token is refused without saying why it is unknown", () => {
  const spent = auth.consumeAuthToken("0".repeat(64), "reset");
  assert.equal(spent.ok, false);
  assert.equal(spent.reason, "invalid");
});

/* --------------------------------------------------------------- reset */

test("a reset changes the password, kills every session, and proves the address", async () => {
  setSmtp(true);
  const email = "locked@example.com";
  await auth.register({ name: "Locked", email, password: "old password" });
  const user = await auth.authenticate(email, "old password");
  assert.equal(user.verified, false);

  const a = await auth.startSession(user);
  const b = await auth.startSession(user);
  assert.ok(await auth.userForToken(a));
  assert.ok(await auth.userForToken(b));

  const token = auth.issueAuthToken(email, "reset");
  const spent = auth.consumeAuthToken(token, "reset");
  assert.equal(spent.ok, true);
  auth.resetPassword(spent.email, "a brand new one");

  assert.equal(await auth.authenticate(email, "old password"), null, "the old password stops working");
  const after = await auth.authenticate(email, "a brand new one");
  assert.ok(after, "the new password works");

  // A reset is what someone does when they believe they have lost control of
  // the account; leaving the sessions that prompted it alive answers the wrong
  // half of the problem.
  assert.equal(await auth.userForToken(a), null);
  assert.equal(await auth.userForToken(b), null);

  // Completing a reset is itself proof that the address is readable.
  assert.equal(after.verified, true);
});

test("a reset refuses a password the registration rules would refuse", async () => {
  await auth.register({ name: "Short", email: "short@example.com", password: "long enough" });
  assert.throws(() => auth.resetPassword("short@example.com", "abc"), /at least 8 characters/);
  // ...and the old password still works, so a rejected attempt costs nothing.
  assert.ok(await auth.authenticate("short@example.com", "long enough"));
});

/* -------------------------------------------------------------- verify */

test("marking verified is idempotent and does not move the timestamp", async () => {
  setSmtp(true);
  const email = "confirm@example.com";
  await auth.register({ name: "Confirm", email, password: "correct horse" });
  const token = auth.issueAuthToken(email, "verify");
  assert.equal(auth.consumeAuthToken(token, "verify").ok, true);
  assert.equal(auth.markVerified(email), true);

  const db = openDb();
  let first;
  try {
    first = db.prepare("SELECT verified_at FROM users WHERE email=?").get(email).verified_at;
  } finally { db.close(); }
  assert.ok(first);

  auth.markVerified(email);
  const db2 = openDb();
  try {
    const again = db2.prepare("SELECT verified_at FROM users WHERE email=?").get(email).verified_at;
    assert.equal(again, first, "a second confirmation must not rewrite when the address was proved");
  } finally { db2.close(); }

  assert.equal((await auth.authenticate(email, "correct horse")).verified, true);
});

test("verification state distinguishes no account from a Google account", async () => {
  assert.equal(auth.accountVerificationState("nobody@example.com"), null);
  const google = auth.accountVerificationState("goog@example.com");
  // A Google account has no password to reset — the forgot route must be able
  // to tell that apart from a missing account without saying so to the caller.
  assert.equal(google.hasPassword, false);
  assert.equal(google.verified, true);
  assert.equal(auth.accountVerificationState("once@example.com").hasPassword, true);
});

test("tokens for a deleted account go with it", async () => {
  setSmtp(true);
  const email = "transient@example.com";
  await auth.register({ name: "Transient", email, password: "correct horse" });
  const token = auth.issueAuthToken(email, "reset");
  await auth.deleteUserAccount(email);
  const spent = auth.consumeAuthToken(token, "reset");
  assert.equal(spent.ok, false, "a reset link must not outlive the account it opens");
});

test("pruning drops spent and expired rows, never live ones", () => {
  const live = auth.issueAuthToken("once@example.com", "reset");
  const db = openDb();
  try {
    db.prepare("INSERT INTO auth_tokens (token_hash,user_id,email,purpose,created_at,expires_at) VALUES ('stale',1,'x@y.z','reset',0,1)").run();
  } finally { db.close(); }
  auth.pruneAuthTokens();
  const db2 = openDb();
  try {
    assert.equal(db2.prepare("SELECT COUNT(*) c FROM auth_tokens WHERE token_hash='stale'").get().c, 0);
  } finally { db2.close(); }
  assert.equal(auth.consumeAuthToken(live, "reset").ok, true, "a live token survives a prune");
});

/* ------------------------------------------------------------ migration */

test("accounts that predate verification are grandfathered, not locked out", async () => {
  // A database written before the column existed: users, no verified_at.
  const old = path.join(scratch, "legacy.db");
  const raw = new DatabaseSync(old);
  raw.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT, salt TEXT, google_sub TEXT UNIQUE, google_email TEXT,
      role TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO users (email,name,created_at) VALUES ('early@example.com','Early','2026-01-01T00:00:00.000Z');
  `);
  raw.close();

  const prevPath = process.env.FORGE_DB_PATH;
  closeDb();
  process.env.FORGE_DB_PATH = old;
  getDb(); // running ensureSchema is the migration
  closeDb();
  process.env.FORGE_DB_PATH = prevPath;
  getDb();

  const check = new DatabaseSync(old);
  try {
    const row = check.prepare("SELECT verified_at FROM users WHERE email='early@example.com'").get();
    // These people registered when nothing was asked of them. A migration that
    // locks every one of them out of their own decks is a worse failure than
    // the one verification prevents.
    assert.equal(row.verified_at, "2026-01-01T00:00:00.000Z");
  } finally {
    check.close();
  }
});
