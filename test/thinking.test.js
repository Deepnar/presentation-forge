import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

/**
 * Reasoning depth, sent only where the provider serves it.
 *
 * The CoE gateway runs with thinking OFF by default and takes it per request
 * (Student Developer Guide v1.0, §6), so the passes that actually reason —
 * planning a deck, reviewing whether it coheres, reading a rendered slide —
 * have to ask for it. Everything else stays fast and cheap.
 *
 * Gated on the PROVIDER declaring support. An unknown top-level field being
 * ignored is a convention of OpenAI-compatible servers, not a contract someone
 * else's BYOK endpoint owes us.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-thinking-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });
process.env.FORGE_TCET_API_KEY = "a-key";

/** A provider that records the body it was sent. */
async function recordingProvider() {
  let body = null;
  const server = createServer((req, res) => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ data: [{ id: "qwen3.6" }] }));
    }
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      body = JSON.parse(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { completion_tokens: 1, prompt_tokens: 1 },
      }));
    });
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  return { server, url: `http://127.0.0.1:${port}/v1`, sent: () => body };
}

async function callWith({ url, thinking, effort, providerSupports }) {
  const lines = [
    "host: http://127.0.0.1:1",
    "roles:",
    "  author:",
    "    model: qwen3.6",
    ...(thinking ? ["    thinking: true"] : []),
    ...(effort ? [`    reasoning_effort: ${effort}`] : []),
    "providers:",
    "  tcet-auto:",
    "    type: openai-compatible",
    `    baseURL: ${url}`,
    "    apiKey: env:FORGE_TCET_API_KEY",
    "    models:",
    "      - qwen3.6",
    ...(providerSupports ? ["    supports_thinking: true"] : []),
  ];
  await writeFile(path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"), lines.join("\n") + "\n");
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  await mod.chat({ role: "author", model: "qwen3.6", messages: [{ role: "user", content: "hi" }] });
}

test.after(() => rm(scratch, { recursive: true, force: true }));

test("a thinking role on a supporting provider asks for reasoning", async () => {
  const p = await recordingProvider();
  try {
    await callWith({ url: p.url, thinking: true, effort: "medium", providerSupports: true });
    assert.deepEqual(p.sent().chat_template_kwargs, { enable_thinking: true, reasoning_effort: "medium" });
  } finally {
    await new Promise((r) => p.server.close(r));
  }
});

test("a provider that does not declare support is never sent the field", async () => {
  const p = await recordingProvider();
  try {
    await callWith({ url: p.url, thinking: true, effort: "medium", providerSupports: false });
    assert.equal(p.sent().chat_template_kwargs, undefined, "BYOK must not receive a field it never claimed");
  } finally {
    await new Promise((r) => p.server.close(r));
  }
});

test("a role that does not ask for thinking stays fast", async () => {
  const p = await recordingProvider();
  try {
    await callWith({ url: p.url, thinking: false, providerSupports: true });
    assert.equal(p.sent().chat_template_kwargs, undefined);
  } finally {
    await new Promise((r) => p.server.close(r));
  }
});

test("effort is optional — thinking alone is a valid request", async () => {
  const p = await recordingProvider();
  try {
    await callWith({ url: p.url, thinking: true, providerSupports: true });
    assert.deepEqual(p.sent().chat_template_kwargs, { enable_thinking: true });
  } finally {
    await new Promise((r) => p.server.close(r));
  }
});
