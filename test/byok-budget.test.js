import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-byok-budget-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = scratch;
process.env.FORGE_BYOK_DAILY_TOKENS = "10000";

const auth = await import("../src/auth.js");
const {
  BYOK_OUTPUT_CAP,
  byokBudgetFor,
  byokUsage,
  clearByokUsage,
  estimateByokActual,
  estimateByokInput,
  estimateByokReservation,
  byokCostAcceptedAt,
  recordByokCostAcceptance,
  reserveByokCall,
  setByokBudget,
  settleByokCall,
} = await import("../src/byok-budget.js");

await auth.register({ name: "Key owner", email: "key@example.test", password: "test-password-123" });
const userId = auth.getUserId("key@example.test");

test.after(() => rm(scratch, { recursive: true, force: true }));
test.beforeEach(() => clearByokUsage(userId));

test("a BYOK call is reserved before it can cross the rolling budget", () => {
  assert.equal(byokBudgetFor(userId), 10000);
  reserveByokCall({ userId, provider: "openai", tokens: 8000 });
  assert.throws(
    () => reserveByokCall({ userId, provider: "openai", tokens: 2001 }),
    /BYOK safety budget reached/,
  );
  assert.equal(byokUsage(userId).tokens, 8000);
});

test("settlement replaces a conservative reservation with reported usage", () => {
  const r = reserveByokCall({ userId, provider: "openai", tokens: 9000 });
  assert.equal(settleByokCall(r.eventId, 1234), true);
  assert.equal(byokUsage(userId).tokens, 1234);
});

test("the account owner can raise the guard without changing another setting", async () => {
  const { setRoutingPreference, routingPreference } = await import("../src/cloud.js");
  await setRoutingPreference("cloud", userId);
  assert.equal(setByokBudget(userId, 250000), 250000);
  assert.equal(byokBudgetFor(userId), 250000);
  assert.equal(await routingPreference(userId), "cloud");
});

test("cost acknowledgement is recorded without replacing routing or budget", async () => {
  const { setRoutingPreference, routingPreference } = await import("../src/cloud.js");
  await setRoutingPreference("cloud", userId);
  setByokBudget(userId, 250000);
  const accepted = recordByokCostAcceptance(userId);
  assert.equal(byokCostAcceptedAt(userId), accepted);
  assert.equal(byokBudgetFor(userId), 250000);
  assert.equal(await routingPreference(userId), "cloud");
});

test("implausibly low and effectively unbounded values are refused", () => {
  assert.throws(() => setByokBudget(userId, 9999), /between 10,000 and 5,000,000/);
  assert.throws(() => setByokBudget(userId, 5000001), /between 10,000 and 5,000,000/);
});

test("missing provider usage falls back to a conservative text estimate", () => {
  const body = {
    messages: [{ role: "system", content: "a".repeat(400) }, { role: "user", content: "b".repeat(400) }],
    max_tokens: BYOK_OUTPUT_CAP,
  };
  assert.ok(estimateByokInput(body) >= 200);
  assert.equal(estimateByokReservation(body), estimateByokInput(body) + BYOK_OUTPUT_CAP);
  assert.equal(estimateByokActual(body, "c".repeat(400)), estimateByokInput(body) + 100);
  assert.equal(estimateByokActual(body, "ignored", 80, 20), 100);
});

test("concurrent-looking reservations cannot both observe an unspent budget", () => {
  setByokBudget(userId, 10000);
  const accepted = [];
  for (let i = 0; i < 3; i++) {
    try {
      reserveByokCall({ userId, provider: "openai", tokens: 4000 });
      accepted.push(i);
    } catch {}
  }
  assert.equal(accepted.length, 2);
  assert.equal(byokUsage(userId).tokens, 8000);
});
