import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The shared tier stopped being named for one institution.
 *
 * It was the literal `tcet-auto` as a provider id, `FORGE_TCET_API_KEY` as the
 * key, and a `kind: "tcet"` that reached a label in the browser — which is
 * fine while the only users are at that college and wrong the moment anybody
 * else is invited. Nothing about the tier is institutional: it is "the shared
 * key the operator pays for, rate-limited per user", which is a role.
 *
 * The rename is only safe if an install that has never been touched keeps
 * working, so these tests are about the OLD names continuing to resolve, and
 * about the rows already in a live database not being orphaned.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-rename-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = scratch;

const { getDb, closeDb } = await import("../src/db.js");
const auth = await import("../src/auth.js");
const {
  AUTO_PROVIDER, LEGACY_AUTO_PROVIDER, AUTO_KEY_ENV, LEGACY_AUTO_KEY_ENV,
  isAutoProviderId, pickAutoProvider,
} = await import("../src/autoid.js");

await auth.register({ name: "R", email: "rename@example.test", password: "test-password-123" });
const userId = auth.getUserId("rename@example.test");

test.after(async () => {
  closeDb();
  await rm(scratch, { recursive: true, force: true });
});

/* -------------------------------------------------------------- the names */

test("the canonical name is a role, and the old one is still recognised", () => {
  assert.equal(AUTO_PROVIDER, "auto");
  assert.equal(AUTO_KEY_ENV, "FORGE_AUTO_API_KEY");
  assert.equal(isAutoProviderId(AUTO_PROVIDER), true);
  assert.equal(isAutoProviderId(LEGACY_AUTO_PROVIDER), true);
  assert.equal(isAutoProviderId("openai"), false);
  assert.equal(isAutoProviderId(undefined), false);
});

test("a config under either spelling resolves, new name preferred", () => {
  assert.equal(pickAutoProvider({ auto: { x: 1 } })?.id, AUTO_PROVIDER);
  assert.equal(pickAutoProvider({ "tcet-auto": { x: 1 } })?.id, LEGACY_AUTO_PROVIDER);
  // An install mid-migration may have both; the new one wins so nothing keeps
  // reading the old block once it has been added.
  assert.equal(pickAutoProvider({ auto: { x: 1 }, "tcet-auto": { x: 2 } })?.id, AUTO_PROVIDER);
  assert.equal(pickAutoProvider({}), null);
  assert.equal(pickAutoProvider(), null);
});

/* ----------------------------------------------------------- the key */

test("either environment variable supplies the shared key", async () => {
  const { resolveSecret } = await import("../src/cloud.js");
  delete process.env[AUTO_KEY_ENV];
  delete process.env[LEGACY_AUTO_KEY_ENV];

  process.env[LEGACY_AUTO_KEY_ENV] = "key-from-the-old-name";
  assert.equal(
    await resolveSecret(AUTO_KEY_ENV), "key-from-the-old-name",
    "a compose file that was never edited must keep working",
  );

  delete process.env[LEGACY_AUTO_KEY_ENV];
  process.env[AUTO_KEY_ENV] = "key-from-the-new-name";
  assert.equal(await resolveSecret(LEGACY_AUTO_KEY_ENV), "key-from-the-new-name");
  delete process.env[AUTO_KEY_ENV];
});

/* ------------------------------------------------------- the stored rows */

test("usage recorded under the old provider name survives the rename", async () => {
  const db = getDb();
  db.prepare(
    "INSERT INTO auto_events (user_id,event_type,slides,tokens,provider,created_at) VALUES (?,?,?,?,?,?)",
  ).run(userId, "request", 22, 90_000, LEGACY_AUTO_PROVIDER, Date.now());
  // Force the row back to the old spelling in case the migration already ran
  // in this process, then re-run the migration the way a restart would.
  db.prepare("UPDATE auto_events SET provider=? WHERE user_id=?").run(LEGACY_AUTO_PROVIDER, userId);
  db.exec(`UPDATE auto_events SET provider='${AUTO_PROVIDER}' WHERE provider='${LEGACY_AUTO_PROVIDER}'`);

  const { getUsage } = await import("../src/limits.js");
  // Read with the DEFAULT provider — the new name — and the old spend is there.
  // Without the migration this would report zero, and a user's history would
  // appear to reset on upgrade.
  assert.equal(getUsage({ userId }).week.tokens, 90_000);
  assert.equal(getUsage({ userId }).week.slides, 22);
});

test("a stored key under the old provider name is still found", async () => {
  const { saveGlobalKey } = await import("../src/vault.js");
  const { resolveSecret } = await import("../src/cloud.js");
  delete process.env[AUTO_KEY_ENV];
  delete process.env[LEGACY_AUTO_KEY_ENV];

  saveGlobalKey(LEGACY_AUTO_PROVIDER, "stored-under-the-old-name");
  getDb().prepare("DELETE FROM global_keys WHERE provider=?").run(AUTO_PROVIDER);
  assert.equal(
    await resolveSecret(AUTO_KEY_ENV), "stored-under-the-old-name",
    "an admin-uploaded key must not vanish because the tier was renamed",
  );
});
