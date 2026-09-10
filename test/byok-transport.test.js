import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-byok-transport-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_KEY_PEPPER = "test-only-byok-budget-pepper-32-chars";
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
await writeFile(path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"), `
host: http://127.0.0.1:1
providers:
  paid:
    type: openai-compatible
    session_header: true
    responses_models: [paid-model]
    baseURL: https://paid.invalid/v1
    apiKey: env:PAID_API_KEY
    models: [paid-model]
roles:
  author:
    model: local-model
    num_predict: 24000
    transports:
      cloud:
        num_predict: 24000
defaults:
  max_retries: 2
  request_timeout_ms: 1000
`);

const auth = await import("../src/auth.js");
const { runAsAccount } = await import("../src/account.js");
const { setUserApiKey, testCloudConnection } = await import("../src/cloud.js");
const { setHostedForTest } = await import("../src/cloud.js");
const { BYOK_OUTPUT_CAP, byokUsage, clearByokUsage, setByokBudget } = await import("../src/byok-budget.js");
const { chat } = await import("../src/ai/ollama.js");

await auth.register({ name: "Key owner", email: "owner@example.test", password: "test-password-123" });
const userId = auth.getUserId("owner@example.test");
await setUserApiKey(userId, "paid", "sk-test-key-12345678");

const originalFetch = global.fetch;
test.after(() => {
  global.fetch = originalFetch;
  setHostedForTest(null);
  return rm(scratch, { recursive: true, force: true });
});
test.beforeEach(() => {
  clearByokUsage(userId);
  setByokBudget(userId, 180000);
  setHostedForTest(false);
});

const asOwner = (fn) => runAsAccount({ userId, email: "owner@example.test" }, fn);

test("a draft key is tested without persistence through the provider's Responses model", async () => {
  let request;
  global.fetch = async (url, init) => {
    request = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      status: "completed",
      output_text: "ok",
      usage: { input_tokens: 3, output_tokens: 1 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await asOwner(() => testCloudConnection({ key: "sk-draft-key-87654321" }));

  assert.equal(result.ok, true);
  assert.equal(result.model, "paid-model");
  assert.equal(request.url, "https://paid.invalid/v1/responses");
  assert.equal(request.body.model, "paid-model");
  assert.equal(request.body.max_output_tokens, 1);
  assert.equal(request.headers.Authorization, "Bearer sk-draft-key-87654321");
  assert.match(request.headers["x-opencode-session"], /^[0-9a-f-]{36}$/);
});

test("BYOK uses the conservative output ceiling in local and hosted mode", async () => {
  const caps = [];
  const sessions = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(String(url), "https://paid.invalid/v1/responses");
    caps.push(body.max_output_tokens);
    sessions.push(init.headers["x-opencode-session"]);
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
      usage: { input_tokens: 8, output_tokens: 2 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await asOwner(() => chat({ role: "author", model: "paid-model", messages: [{ role: "user", content: "local" }] }));
  setHostedForTest(true);
  await asOwner(() => chat({ role: "author", model: "paid-model", messages: [{ role: "user", content: "hosted" }] }));

  assert.deepEqual(caps, [BYOK_OUTPUT_CAP, BYOK_OUTPUT_CAP]);
  assert.match(sessions[0], /^[0-9a-f-]{36}$/);
  assert.notEqual(sessions[0], sessions[1]);
  assert.equal(byokUsage(userId).tokens, 20);
});

test("a failed provider attempt keeps its reserve and the next call is refused", async () => {
  setByokBudget(userId, 13000);
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("provider disconnected after accepting the request");
  };

  await assert.rejects(
    asOwner(() => chat({ role: "author", model: "paid-model", messages: [{ role: "user", content: "spend once" }] })),
    /BYOK safety budget reached/,
  );
  assert.equal(calls, 1, "the second transport attempt must be refused before fetch");
  assert.ok(byokUsage(userId).tokens >= BYOK_OUTPUT_CAP);
});

test("BYOK retries at most once even when the provider keeps failing", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error("temporary provider failure");
  };
  await assert.rejects(
    asOwner(() => chat({ role: "author", model: "paid-model", messages: [{ role: "user", content: "retry" }] })),
    /failed after 2 attempts/,
  );
  assert.equal(calls, 2);
  assert.equal(byokUsage(userId).calls, 2);
});

test("missing usage metadata is estimated instead of becoming free", async () => {
  global.fetch = async () => new Response(JSON.stringify({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: "answer without usage metadata" }] }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  await asOwner(() => chat({ role: "author", model: "paid-model", messages: [{ role: "user", content: "hello" }] }));
  const usage = byokUsage(userId);
  assert.ok(usage.tokens > 1);
  assert.ok(usage.tokens < BYOK_OUTPUT_CAP, "a success settles below its worst-case reservation");
});
