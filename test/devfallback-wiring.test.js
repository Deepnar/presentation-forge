import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

/**
 * The dev fallback, wired: a dead gateway and a live local Ollama, driven
 * through `chat()` rather than through the predicate.
 *
 * The predicate has its own tests and they pass whether or not anything calls
 * it — the briefing bug this session was exactly that shape, a correct pure
 * function whose caller was wrong. So this stands up both backends for real and
 * asserts on what comes back out of the transport.
 *
 * `paths.js` reads FORGE_CONFIG_DIR into a module-level const, so it is set
 * before the first src import.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-devfb-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
process.env.FORGE_TCET_API_KEY = "test-gateway-key";

/** A gateway that answers /models fine and hangs up on completions — the real
 *  failure shape: it looks healthy right up until you ask it to think. */
async function deadGateway(status = 524) {
  let completionCalls = 0;
  const server = createServer((req, res) => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "qwen3.6" }] }));
      return;
    }
    if (req.url.endsWith("/chat/completions")) {
      completionCalls++;
      res.writeHead(status, { "Content-Type": "text/html" });
      res.end("<html>error 524</html>");
      return;
    }
    res.writeHead(404).end();
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  return { server, url: `http://127.0.0.1:${port}/v1`, calls: () => completionCalls };
}

/** An Ollama with one model installed that answers a chat. */
async function fakeOllama(model) {
  let chatCalls = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: model }] }));
      return;
    }
    if (req.url === "/api/chat") {
      chatCalls++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: { content: "answered locally" },
        done_reason: "stop",
        eval_count: 3,
        prompt_eval_count: 5,
      }));
      return;
    }
    res.writeHead(404).end();
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  return { server, url: `http://127.0.0.1:${port}`, calls: () => chatCalls };
}

async function writeModelsYaml({ ollamaUrl, gatewayUrl, model }) {
  await writeFile(
    path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"),
    [
      `host: ${ollamaUrl}`,
      "roles:",
      "  author:",
      `    model: ${model}`,
      "    provider: tcet-auto",
      "defaults:",
      "  request_timeout_ms: 4000",
      "  max_retries: 1",
      "providers:",
      "  tcet-auto:",
      "    type: openai-compatible",
      `    baseURL: ${gatewayUrl}`,
      "    apiKey: env:FORGE_TCET_API_KEY",
      "    models:",
      `      - ${model}`,
    ].join("\n") + "\n",
  );
}

/** models.yaml is cached per module instance, so each case gets a fresh one. */
async function chatWith({ armed, gatewayStatus = 524 }) {
  const model = "author-model:1b";
  const gw = await deadGateway(gatewayStatus);
  const ol = await fakeOllama(model);
  await writeModelsYaml({ ollamaUrl: ol.url, gatewayUrl: gw.url, model });
  if (armed) process.env.FORGE_DEV_LOCAL_FALLBACK = "1";
  else delete process.env.FORGE_DEV_LOCAL_FALLBACK;
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  try {
    const res = await mod.chat({ role: "author", messages: [{ role: "user", content: "hi" }] });
    return { res, localCalls: ol.calls(), gatewayCalls: gw.calls() };
  } finally {
    await new Promise((r) => gw.server.close(r));
    await new Promise((r) => ol.server.close(r));
    delete process.env.FORGE_DEV_LOCAL_FALLBACK;
  }
}

test.after(() => rm(scratch, { recursive: true, force: true }));

test("unarmed, a dead gateway fails and nothing touches the local model", async () => {
  await assert.rejects(
    () => chatWith({ armed: false }),
    /failed after|Cloud 524/,
    "a dead gateway must surface as an error, not as a quietly different model",
  );
});

test("armed, a 524 is rescued by the local model and the result says so", async () => {
  const { res, localCalls, gatewayCalls } = await chatWith({ armed: true });
  assert.equal(res.content, "answered locally");
  assert.ok(gatewayCalls >= 1, "the gateway is tried first — local is the fallback, not the route");
  assert.equal(localCalls, 1);
  // The whole point: a caller can tell this apart from a real gateway answer.
  assert.equal(res.devLocalFallback, true);
  assert.equal(res.transport, "ollama");
});

test("armed, a 401 still fails — a bad key must not look like a working install", async () => {
  await assert.rejects(
    () => chatWith({ armed: true, gatewayStatus: 401 }),
    /failed after|Cloud 401/,
    "falling back on a rejected request hides the credential problem",
  );
});
