import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the store at a scratch dir so auth tests never touch the real
// config/users.json and config/sessions.json.
const scratch = await mkdtemp(path.join(tmpdir(), "forge-auth-"));
await writeFile(path.join(scratch, "users.json"), "[]");
await writeFile(path.join(scratch, "sessions.json"), "{}");

const auth = await import("../src/auth.js");
auth.setStoreDir(scratch);

test("registration validation rejects missing fields and short passwords", () => {
  assert.equal(auth.validateRegistration({ name: "", email: "a@b.c", password: "12345678" }), "a name is required");
  assert.equal(auth.validateRegistration({ name: "A", email: "notanemail", password: "12345678" }), "a valid email is required");
  assert.equal(auth.validateRegistration({ name: "A", email: "a@b.c", password: "short" }), "password must be at least 8 characters");
  assert.equal(auth.validateRegistration({ name: "A", email: "a@b.c", password: "12345678" }), null);
});

test("scrypt hashes are salted and verify, but never equal the password", async () => {
  const { name, email } = { name: "Test User", email: "t@example.com" };
  const user = await auth.register({ name, email, password: "correct horse" });
  assert.equal(user.name, name);
  assert.equal(user.email, email);
  // The password is never on the public user.
  assert.deepEqual(Object.keys(user).sort(), ["createdAt", "email", "name"]);

  const authed = await auth.authenticate(email, "correct horse");
  assert.ok(authed);
  assert.equal(authed.email, email);

  assert.equal(await auth.authenticate(email, "wrong pass"), null);
});

test("emails are case-insensitive and unique", async () => {
  await auth.register({ name: "B", email: "dup@example.com", password: "12345678" });
  const err = await auth.register({ name: "B2", email: "DUP@example.com", password: "12345678" })
    .then(() => null, (e) => e.message);
  assert.equal(err, "an account with that email already exists");
});

test("sessions round-trip: start, resolve, end", async () => {
  const user = await auth.authenticate("dup@example.com", "12345678");
  const token = await auth.startSession(user);
  assert.ok(token.length >= 32);
  assert.equal((await auth.userForToken(token)).email, user.email);
  await auth.endSession(token);
  assert.equal(await auth.userForToken(token), null);
});

test("seedAdmin mints the operator account once and is idempotent", async () => {
  assert.equal(await auth.seedAdmin({ name: "Op", email: "op@example.com", password: "operator-pass" }), true);
  assert.equal(await auth.seedAdmin({ name: "Op", email: "OP@example.com", password: "operator-pass" }), false);
  assert.equal((await auth.authenticate("op@example.com", "operator-pass"))?.email, "op@example.com");
});

test("the seeded admin carries the admin role; regular accounts do not", async () => {
  const op = await auth.authenticate("op@example.com", "operator-pass");
  assert.equal(op.role, "admin");
  assert.equal(auth.isAdmin(op), true);
  const reg = await auth.authenticate("dup@example.com", "12345678");
  assert.equal(reg.role, undefined);
  assert.equal(auth.isAdmin(reg), false);
  assert.equal(auth.isAdmin(null), false);
});

test("deck access policy: owner decks are private, ownerless decks are operator-only", () => {
  const reg = { email: "dup@example.com", role: undefined };
  const op = { email: "op@example.com", role: "admin" };
  // Ownerless legacy/CLI decks — visible only to the operator.
  assert.equal(auth.canAccessDeck(reg, null), false);
  assert.equal(auth.canAccessDeck(op, null), true);
  assert.equal(auth.canAccessDeck(reg, undefined), false);
  // Owned decks belong to their owner.
  assert.equal(auth.canAccessDeck(reg, "dup@example.com"), true);
  assert.equal(auth.canAccessDeck(reg, "other@example.com"), false);
  // The operator sees everything.
  assert.equal(auth.canAccessDeck(op, "other@example.com"), true);
});

test("seedAdmin validates its env pair before writing", async () => {
  const err = await auth.seedAdmin({ name: "X", email: "bad", password: "12345678" })
    .then(() => null, (e) => e.message);
  assert.match(err, /misconfigured/);
});

test("an expired session token is rejected and pruned", async () => {
  const user = await auth.authenticate("dup@example.com", "12345678");
  const token = await auth.startSession(user);
  const sessionsFile = path.join(scratch, "sessions.json");
  const old = JSON.parse(await readFile(sessionsFile, "utf8"));
  // Backdate the session past the default 30-day TTL.
  old[token].createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  await writeFile(sessionsFile, JSON.stringify(old, null, 2), "utf8");
  assert.equal(await auth.userForToken(token), null);
  // The dead token is gone from the store.
  const pruned = JSON.parse(await readFile(sessionsFile, "utf8"));
  assert.ok(!pruned[token]);
});

test("a live session refreshes its clock on use", async () => {
  const user = await auth.authenticate("dup@example.com", "12345678");
  const token = await auth.startSession(user);
  const sessionsFile = path.join(scratch, "sessions.json");
  const before = JSON.parse(await readFile(sessionsFile, "utf8"))[token].createdAt;
  await new Promise((r) => setTimeout(r, 20)); // ensure the clock ticked
  await auth.userForToken(token);
  const after = JSON.parse(await readFile(sessionsFile, "utf8"))[token].createdAt;
  assert.ok(new Date(after) > new Date(before));
});

test("bearerToken extracts the header value", () => {
  assert.equal(auth.bearerToken("Bearer abc123"), "abc123");
  assert.equal(auth.bearerToken("bearer xyz"), "xyz");
  assert.equal(auth.bearerToken("Basic abc"), null);
  assert.equal(auth.bearerToken(undefined), null);
});

test.after(() => rm(scratch, { recursive: true, force: true }).catch(() => {}));
