import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The precedence rules for admin-changeable settings.
 *
 * There are two directions in this codebase and they are deliberately
 * opposite: an operating setting stored by an admin WINS over the environment
 * (otherwise it could not be changed without a redeploy, which is the point),
 * while a SECRET resolves env-first (so a key rotated in the deployment always
 * beats one typed into a browser months earlier).
 *
 * The cost of the first direction is that a stored value silently shadows a
 * deploy-time change, so nothing may be silent: every value reports its source.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-runtime-"));
process.env.FORGE_CONFIG_DIR = scratch;
delete process.env.FORGE_SWEEP_DAYS;
delete process.env.FORGE_OPEN_REGISTRATION;
delete process.env.FORGE_AUTO_WINDOW_REQUESTS;

const { setting, settingValue, setSetting, settingsReport, SETTING_KEYS } = await import("../src/runtime.js");

test("with nothing set, a setting is its documented default", () => {
  const s = setting("autoWindowRequests");
  assert.equal(s.value, 12);
  assert.equal(s.source, "default");
  assert.equal(s.shadowsEnv, false);
});

test("retention defaults to OFF — the server must not delete decks unasked", () => {
  const s = setting("sweepDays");
  assert.equal(s.value, null);
  assert.equal(s.source, "default");
});

test("the environment is used when nothing is stored", () => {
  process.env.FORGE_AUTO_WINDOW_REQUESTS = "20";
  try {
    const s = setting("autoWindowRequests");
    assert.equal(s.value, 20);
    assert.equal(s.source, "env");
  } finally { delete process.env.FORGE_AUTO_WINDOW_REQUESTS; }
});

test("a stored value wins over the environment, and says that it is doing so", async () => {
  process.env.FORGE_AUTO_WINDOW_REQUESTS = "20";
  try {
    await setSetting("autoWindowRequests", 5);
    const s = setting("autoWindowRequests");
    assert.equal(s.value, 5, "the stored value is the effective one");
    assert.equal(s.source, "stored");
    assert.equal(s.shadowsEnv, true, "and it reports that an env var is being suppressed");
    assert.equal(s.envValue, 20, "including what that env var says");
  } finally { delete process.env.FORGE_AUTO_WINDOW_REQUESTS; }
});

test("clearing an override hands the setting back to the environment", async () => {
  process.env.FORGE_AUTO_WINDOW_REQUESTS = "20";
  try {
    await setSetting("autoWindowRequests", 5);
    assert.equal(settingValue("autoWindowRequests"), 5);
    await setSetting("autoWindowRequests", null);
    const s = setting("autoWindowRequests");
    assert.equal(s.value, 20);
    assert.equal(s.source, "env", "not 'stored' with a null in it");
    // "unset" and "set to nothing" are different answers; the file must be
    // able to say both, so a cleared key is removed rather than nulled.
    const raw = JSON.parse(await readFile(path.join(scratch, "runtime.json"), "utf8"));
    assert.equal("autoWindowRequests" in raw.settings, false);
  } finally { delete process.env.FORGE_AUTO_WINDOW_REQUESTS; }
});

test("a value that cannot be a setting is refused, not stored", async () => {
  await assert.rejects(() => setSetting("sweepDays", "banana"), /not a valid value/);
  await assert.rejects(() => setSetting("sweepDays", -3), /not a valid value/);
  await assert.rejects(() => setSetting("sweepDays", 0), /not a valid value/);
  assert.equal(setting("sweepDays").value, null, "and the setting is untouched");
});

test("an unknown setting name is refused — the writer is not a free-form store", async () => {
  await assert.rejects(() => setSetting("rmMinusRf", 1), /unknown setting/);
  assert.throws(() => setting("nope"), /unknown setting/);
});

test("booleans round-trip, including the falsey one", async () => {
  await setSetting("openRegistration", false);
  assert.equal(setting("openRegistration").value, false);
  assert.equal(setting("openRegistration").source, "stored", "false is a stored value, not an absent one");
  await setSetting("openRegistration", true);
  assert.equal(setting("openRegistration").value, true);
  await setSetting("openRegistration", null);
  assert.equal(setting("openRegistration").value, true, "default");
  assert.equal(setting("openRegistration").source, "default");
});

test("every declared setting reports a source and a label", () => {
  const report = settingsReport();
  assert.deepEqual(Object.keys(report).sort(), [...SETTING_KEYS].sort());
  for (const [k, v] of Object.entries(report)) {
    assert.ok(["stored", "env", "default"].includes(v.source), `${k}: ${v.source}`);
    assert.ok(v.label, `${k} has no label`);
    assert.ok(v.env?.startsWith("FORGE_"), `${k} names no env var`);
  }
});

test("the spend caps read through to limitConfig without a restart", async () => {
  const { limitConfig } = await import("../src/limits.js");
  await setSetting("autoWindowRequests", 3);
  assert.equal(limitConfig().windowRequests, 3, "read per call, never cached");
  await setSetting("autoWindowRequests", null);
  assert.equal(limitConfig().windowRequests, 12);
});

test.after(() => rm(scratch, { recursive: true, force: true }));
