import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The private Docker install has one setup door, not public self-registration.
 * Drive the real HTTP routes because the contract spans auth storage, session
 * creation, mode detection and the anonymous configuration the React surface
 * consumes. A pure helper test could pass while one of those seams stayed open.
 */
const scratch = await mkdtemp(path.join(tmpdir(), "forge-local-owner-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_REFERENCE_DIR = path.join(scratch, "reference");
process.env.FORGE_DB_PATH = path.join(scratch, "config", "forge.db");
process.env.FORGE_API_PORT = "0";
process.env.FORGE_HOSTED = "0";
delete process.env.FORGE_LOCAL_MULTI_USER;
delete process.env.FORGE_ADMIN_EMAIL;
for (const key of ["FORGE_SMTP_HOST", "FORGE_SMTP_USER", "FORGE_SMTP_PASS", "FORGE_SMTP_FROM"]) {
  delete process.env[key];
}
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
await mkdir(process.env.FORGE_DECKS_DIR, { recursive: true });

const { server } = await import("../app/server/index.js");
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const { closeDb } = await import("../src/db.js");
  closeDb();
  await rm(scratch, { recursive: true, force: true });
});

const json = async (route, options) => {
  const response = await fetch(`${base}${route}`, options);
  return { response, body: await response.json() };
};

test("a fresh local install offers one owner setup and no mail/OAuth surfaces", async () => {
  const { response, body } = await json("/api/auth/registration");
  assert.equal(response.status, 200);
  assert.deepEqual(
    {
      open: body.open,
      mail: body.mail,
      verifyRequired: body.verifyRequired,
      localOwner: body.localOwner,
      ownerConfigured: body.ownerConfigured,
    },
    { open: true, mail: false, verifyRequired: false, localOwner: true, ownerConfigured: false },
  );
  assert.equal((await json("/api/auth/google/config")).body.clientId, null);
});

test("first setup creates an immediately usable owner session and closes registration", async () => {
  const created = await json("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Local Owner", email: "owner@forge.local", password: "local-password" }),
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.localOwner, true);
  assert.equal(created.body.user.role, "admin");
  assert.equal(created.body.user.verified, true);
  assert.ok(created.body.token?.length >= 32, "setup starts the owner session directly");
  assert.match(created.response.headers.get("set-cookie") ?? "", /forge_session=/);

  const state = (await json("/api/auth/registration")).body;
  assert.equal(state.ownerConfigured, true);
  assert.equal(state.open, false);

  const second = await json("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Second", email: "second@forge.local", password: "second-password" }),
  });
  assert.equal(second.response.status, 403);
  assert.match(second.body.error, /already has an owner/);
});

test("the owner can log back in, while local email and Google entry points stay closed", async () => {
  const login = await json("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@forge.local", password: "local-password" }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.email, "owner@forge.local");

  for (const [route, body] of [
    ["/api/auth/google", { credential: "not-used" }],
    ["/api/auth/forgot", { email: "owner@forge.local" }],
    ["/api/auth/verify", { token: "not-used" }],
  ]) {
    const out = await json(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.ok([403, 404].includes(out.response.status), `${route} must not be a local-owner surface`);
  }
});

test("hosted mode keeps ordinary multi-user registration unchanged", async () => {
  process.env.FORGE_HOSTED = "1";
  try {
    const state = (await json("/api/auth/registration")).body;
    assert.equal(state.localOwner, false);
    assert.equal(state.open, true);

    const created = await json("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hosted Member", email: "member@example.test", password: "hosted-password" }),
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.body.token, undefined, "hosted self-registration still requires an explicit login");
    assert.equal(created.body.user.role, undefined, "hosted self-registration cannot mint an administrator");
  } finally {
    process.env.FORGE_HOSTED = "0";
  }
});
