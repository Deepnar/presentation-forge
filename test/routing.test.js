import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Route ORDER, asserted against the real server.
 *
 * This is the one property of `app/server/index.js` that no unit test can
 * reach. Express matches a path-carrying `app.use` before any route registered
 * later, so a literal segment under `/api/decks/` is swallowed by the per-slug
 * ownership gate — it parses, every other test passes, and the endpoint is dead
 * in production. `POST /api/decks/search` was dead for months exactly this way,
 * and invisible to the operator: an admin passes the ownership check that
 * shadows it, so the only account that could have noticed never could.
 *
 * So the server is booted on port 0 and asked over HTTP, as an ordinary
 * non-admin account.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-routing-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_REFERENCE_DIR = path.join(scratch, "reference");
process.env.FORGE_DB_PATH = path.join(scratch, "config", "forge.db");
process.env.FORGE_API_PORT = "0";
// No SMTP: confirmation is not enforced, so these accounts are usable the
// moment they exist and the test is about routing, not about the gate.
for (const k of ["FORGE_SMTP_HOST", "FORGE_SMTP_USER", "FORGE_SMTP_PASS", "FORGE_SMTP_FROM"]) delete process.env[k];
// A sweep scheduler would keep the process alive past the last test.
delete process.env.FORGE_SWEEP_DAYS;
delete process.env.FORGE_ADMIN_EMAIL;
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
await mkdir(process.env.FORGE_DECKS_DIR, { recursive: true });

/** A deck on disk, owned by `owner` (omit for a legacy, operator-owned folder). */
async function seedDeck(slug, { owner, body }) {
  const dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.yaml"), owner ? `slug: ${slug}\nowner: ${owner}\n` : `slug: ${slug}\n`);
  await writeFile(path.join(dir, "deck.yaml"), body);
}

await seedDeck("mine-electrolysis", {
  owner: "member@example.com",
  body: "title: Electrolysis\nslides:\n  - type: title\n    headline: Electrolysis\n",
});
await seedDeck("theirs-rasterisation", {
  owner: "other@example.com",
  body: "title: Rasterisation\nslides:\n  - type: title\n    headline: Electrolysis too\n",
});

const auth = await import("../src/auth.js");
await auth.register({ name: "Member", email: "member@example.com", password: "member password" });
const user = await auth.authenticate("member@example.com", "member password");
assert.ok(user, "the test account exists");
assert.notEqual(user.role, "admin", "and is deliberately NOT an admin — an admin passes the gate that hid this");
const token = await auth.startSession(user);

const { server } = await import("../app/server/index.js");
if (!server.listening) await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(async () => {
  await new Promise((r) => server.close(r));
  const { closeDb } = await import("../src/db.js");
  closeDb();
  await rm(scratch, { recursive: true, force: true });
});

const post = (route, body) =>
  fetch(`${base}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

test("deck search reaches its handler as a non-admin, not the per-slug gate", async () => {
  const res = await post("/api/decks/search", { q: "electrolysis" });
  const json = await res.json();
  // The bug's signature: a 404 "no such deck" from the ownership middleware,
  // which had matched the literal segment as a deck named "search".
  assert.notEqual(json.error, "no such deck", "the ownership gate must not claim this path");
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.hits), "the search handler answered");
});

test("search stays scoped to the caller's own decks", async () => {
  const json = await (await post("/api/decks/search", { q: "electrolysis" })).json();
  // Both decks contain the word; only one is this account's. Reaching the
  // handler must not mean reaching everyone's content.
  assert.deepEqual(json.hits, ["mine-electrolysis"]);
});

test("an empty query is answered, not refused", async () => {
  const json = await (await post("/api/decks/search", { q: "  " })).json();
  assert.equal(json.ok, true);
  assert.deepEqual(json.hits, []);
});

test("the per-slug gate still refuses a deck the caller does not own", async () => {
  // The other half of the same property: moving the route above the middleware
  // must not have moved anything else out from under it.
  const res = await fetch(`${base}/api/decks/theirs-rasterisation`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "no such deck");
});

test("the workspace still refuses an unauthenticated caller", async () => {
  const res = await fetch(`${base}/api/decks/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: "electrolysis" }),
  });
  assert.equal(res.status, 401, "search sits below the workspace gate, not above it");
});

/* ------------------------------------------------- tiers are an admin lever */

/**
 * The tier an account is metered against is install-wide state that costs the
 * operator money, so it must be admin-gated like every other setting written
 * outside a user's own scope. This account is deliberately not an admin.
 */
test("a non-admin cannot move themselves onto a bigger tier", async () => {
  const res = await post("/api/admin/users/member@example.com/plan", { plan: "unlimited" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "admin only");

  const { planFor } = await import("../src/limits.js");
  assert.equal(
    planFor(auth.getUserId("member@example.com")), "free",
    "a refused request must not have changed the tier anyway",
  );
});

test("a non-admin cannot read everyone's spend", async () => {
  const res = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 403);
});

test("an account can read its own usage, and is told which tier and what is left", async () => {
  const res = await fetch(`${base}/api/auto/usage`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.plan, "free");
  assert.equal(json.planLabel, "Free");
  // A refusal is a dead end unless the surface can see it coming.
  assert.ok(Number.isFinite(json.remaining.weeklyTokens), "the token budget must be legible before it runs out");
  assert.ok(json.limits.weeklyTokens > 0);
});

test("the usage route says how much of the free trial is left", async () => {
  // A trial that never resets is the one budget a user most needs to see
  // coming, and the only place it can be shown from is here.
  const json = await (await fetch(`${base}/api/auto/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  assert.ok(json.trial, "a free account must be told it is on a trial");
  assert.equal(json.trial.spent, 0);
  assert.ok(json.trial.cap > 0);
  assert.equal(json.trial.remaining, json.trial.cap);
});
