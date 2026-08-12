import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
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

test("bearerToken extracts the header value", () => {
  assert.equal(auth.bearerToken("Bearer abc123"), "abc123");
  assert.equal(auth.bearerToken("bearer xyz"), "xyz");
  assert.equal(auth.bearerToken("Basic abc"), null);
  assert.equal(auth.bearerToken(undefined), null);
});

test.after(() => rm(scratch, { recursive: true, force: true }).catch(() => {}));
