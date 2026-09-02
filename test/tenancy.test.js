import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The multi-tenancy contract.
 *
 * These cover the boundaries that turn a single-operator appliance into
 * something safe to put in front of strangers: who can be an admin, whose
 * identity a deck renders with, and which credential a media URL accepts.
 * Each one is a regression test for a hole that was actually open.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-tenancy-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_BRAND_DIR = path.join(scratch, "brand");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
await mkdir(process.env.FORGE_BRAND_DIR, { recursive: true });

const auth = await import("../src/auth.js");
const { tenantId, userIdentityFile, userBrandDirs, resolveBrandPath } = await import("../src/tenant.js");
const identity = await import("../src/ai/identity.js");

// Keep the account store off the real users.json. The "forge-auth-" prefix is
// the seam auth.js uses to stay on the JSON store instead of opening SQLite.
const store = path.join(scratch, "forge-auth-store");
await mkdir(store, { recursive: true });
await writeFile(path.join(store, "users.json"), "[]");
await writeFile(path.join(store, "sessions.json"), "{}");
auth.setStoreDir(store);

/* ------------------------------------------------------------------ admin */

test("admin is a role, never an email address", () => {
  assert.equal(auth.isAdmin({ email: "18deepnar@gmail.com" }), false);
  assert.equal(auth.isAdmin({ email: "owner@example.com" }), false);
  assert.equal(auth.isAdmin({ email: "anyone@example.com", role: "admin" }), true);
  assert.equal(auth.isAdmin(null), false);
});

test("FORGE_ADMIN_EMAIL does not grant admin at request time", () => {
  const prev = process.env.FORGE_ADMIN_EMAIL;
  process.env.FORGE_ADMIN_EMAIL = "owner@example.com";
  try {
    // The env var designates the operator for boot-time seeding only. If it
    // also granted admin on sight, anyone could register that unverified
    // address and take the box over.
    assert.equal(auth.isAdmin({ email: "owner@example.com" }), false);
  } finally {
    if (prev === undefined) delete process.env.FORGE_ADMIN_EMAIL;
    else process.env.FORGE_ADMIN_EMAIL = prev;
  }
});

test("self-registration never mints a privileged account", async () => {
  const user = await auth.register({
    name: "Impostor",
    email: "18deepnar@gmail.com",
    password: "not-the-owner",
  });
  assert.equal(user.role, undefined);
  assert.equal(auth.isAdmin(user), false);
});

/* ----------------------------------------------------------- media cookie */

test("cookieToken reads only its own cookie out of the header", () => {
  assert.equal(auth.cookieToken("forge_session=abc123"), "abc123");
  assert.equal(auth.cookieToken("other=1; forge_session=abc123; more=2"), "abc123");
  assert.equal(auth.cookieToken("other=1; more=2"), null);
  assert.equal(auth.cookieToken(undefined), null);
  // A token is hex, but the encoder must round-trip anything the cookie holds.
  assert.equal(auth.cookieToken("forge_session=a%2Fb"), "a/b");
});

test("the session cookie is httpOnly, scoped to the deck routes, and TLS-gated", () => {
  const c = auth.sessionCookie("tok", { secure: true });
  assert.match(c, /^forge_session=tok;/);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Path=\/api\/decks/);
  assert.match(c, /Secure/);
  // Plain HTTP (local dev) must not set Secure or the cookie is never stored.
  assert.doesNotMatch(auth.sessionCookie("tok", { secure: false }), /Secure/);
  assert.match(auth.clearedSessionCookie(), /Max-Age=0/);
});

/* --------------------------------------------------------------- tenancy */

test("each account gets its own identity file and brand directory", () => {
  const a = tenantId("a@example.com");
  const b = tenantId("b@example.com");
  assert.notEqual(a, b);
  // Case and padding are not a different tenant.
  assert.equal(tenantId("  A@Example.com "), a);
  assert.equal(tenantId(""), null);

  // The address must not be readable from a path a rendered asset URL exposes.
  assert.doesNotMatch(userIdentityFile("a@example.com"), /a@example\.com/);
  assert.doesNotMatch(userBrandDirs("a@example.com").logos, /a@example\.com/);
  assert.notEqual(userBrandDirs("a@example.com").generated, userBrandDirs("b@example.com").generated);
});

test("brand paths resolve against the brand root, not the repo root", () => {
  // A container points FORGE_BRAND_DIR at a volume outside the image; joining
  // `brand/generated/crest.png` onto ROOT there finds nothing and every slide
  // silently loses its institutional marks.
  const resolved = resolveBrandPath("brand/generated/crest.png", "/app");
  assert.equal(resolved, path.join(scratch, "brand", "generated", "crest.png"));
  // Non-brand relative paths still resolve against the given root.
  assert.equal(resolveBrandPath("assets/x.png", "/app"), path.join("/app", "assets/x.png"));
  assert.equal(resolveBrandPath("/abs/x.png", "/app"), "/abs/x.png");
});

test("a deck renders with its OWNER's identity, not whoever edited settings last", async () => {
  const cfg = path.join(scratch, "config");
  await writeFile(path.join(cfg, "identity.example.yaml"),
    "institution:\n  name: Template Institute\nchrome:\n  slide_numbers: true\n");
  await writeFile(path.join(cfg, "identity.yaml"), "institution:\n  name: Operator Default\n");

  await identity.saveUserIdentity("owner@example.com", { institution: { name: "Owner College" } });
  await identity.saveUserIdentity("other@example.com", { institution: { name: "Other College" } });

  const deckDir = path.join(scratch, "deck");
  await mkdir(deckDir, { recursive: true });
  await writeFile(path.join(deckDir, "meta.yaml"), "owner: owner@example.com\n");

  const merged = await identity.loadIdentity(deckDir);
  assert.equal(merged.institution.name, "Owner College");
  // The template still supplies defaults the owner never set.
  assert.equal(merged.chrome.slide_numbers, true);

  // With no owner recorded, the install-wide default applies — a CLI deck.
  await writeFile(path.join(deckDir, "meta.yaml"), "title: Untitled\n");
  assert.equal((await identity.loadIdentity(deckDir)).institution.name, "Operator Default");
});

test("per-deck meta still wins over the account's standing identity", async () => {
  const deckDir = path.join(scratch, "deck2");
  await mkdir(deckDir, { recursive: true });
  await writeFile(path.join(deckDir, "meta.yaml"),
    "owner: owner@example.com\ninstitution:\n  name: Frozen At Briefing\n");
  const merged = await identity.loadIdentity(deckDir);
  assert.equal(merged.institution.name, "Frozen At Briefing");
});

/**
 * The install-wide default is what a deck renders under when its owner has set
 * nothing, and getting it wrong fails silently: the render succeeds and the
 * deck simply names somebody else's institution. This box shipped
 * `institution.name: HACKED` for weeks without a single check noticing.
 */
test("an unconfigured operator identity is a reported state, not a silent one", async () => {
  const cfg = process.env.FORGE_CONFIG_DIR;
  const example = path.join(cfg, "identity.example.yaml");
  const operator = path.join(cfg, "identity.yaml");
  await writeFile(example,
    "institution:\n  name: Example Institute of Technology\n  short: EIT\n  department: Department of Computer Engineering\n");

  // No operator file at all: a fresh box, falling back to the committed example.
  await rm(operator, { force: true });
  let status = await identity.identityStatus();
  assert.equal(status.ok, false);
  assert.equal(status.reason, "missing");
  assert.match(identity.identityUnconfigured(status), /Example Institute of Technology/);

  // Copied but never edited — the documented first step, and easy to stop at.
  await writeFile(operator, "institution:\n  name: Example Institute of Technology\n  short: EIT\n  department: Department of Computer Engineering\n");
  status = await identity.identityStatus();
  assert.equal(status.reason, "template");

  // Half-written. This is the shape the HACKED file had: a name and nothing
  // else. Caught structurally, so it needs no list of suspect values.
  await writeFile(operator, "institution:\n  name: HACKED\n");
  status = await identity.identityStatus();
  assert.equal(status.reason, "incomplete");
  assert.deepEqual(status.missing, ["short", "department"]);

  // A field left at the template's value is not a filled-in field.
  await writeFile(operator, "institution:\n  name: Real College\n  short: EIT\n  department: Physics\n");
  status = await identity.identityStatus();
  assert.equal(status.reason, "incomplete");
  assert.deepEqual(status.missing, ["short"]);

  await writeFile(operator, "institution:\n  name: Real College\n  short: RC\n  department: Physics\n");
  status = await identity.identityStatus();
  assert.equal(status.ok, true);
  assert.equal(status.name, "Real College");
});

test.after(() => rm(scratch, { recursive: true, force: true }));
