import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

const script = path.resolve("tools/local-check.mjs");

async function withForgeStub(models, run) {
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/health") return res.end(JSON.stringify({ ok: true }));
    if (req.url === "/api/models") return res.end(JSON.stringify({ ok: true, hosted: false, models, default: models[0] ?? null }));
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function invoke(base) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, FORGE_CHECK_URL: base },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("a healthy BYOK-ready install passes before Ollama is configured", async () => {
  const result = await withForgeStub([], invoke);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Forge healthy/);
  assert.match(result.stdout, /not configured yet/);
  assert.equal(result.stderr, "");
});

test("the install check reports a visible local model", async () => {
  const result = await withForgeStub(["qwen3:4b"], invoke);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /local model: qwen3:4b/);
  assert.doesNotMatch(result.stdout, /not configured yet/);
});
