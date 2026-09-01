import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

/**
 * Whether every role is running the model it was configured to run.
 *
 * `resolveRole` has always recorded a substitution and nothing ever read it, so
 * a role quietly running a different model was invisible — section 9 traced a
 * thin outline to exactly that once. These pin the three answers the audit has
 * to give, including the one it must give when Ollama is not there at all: a
 * diagnostic that throws when the thing it is diagnosing is down is worse than
 * no diagnostic.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-roleaudit-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });

/** A stand-in Ollama that reports exactly these models installed. */
async function fakeOllama(names) {
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: names.map((name) => ({ name })) }));
      return;
    }
    res.writeHead(404).end();
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  return { server, url: `http://127.0.0.1:${port}` };
}

async function writeModelsYaml({ host, roles, fallbacks = [] }) {
  const lines = [`host: ${host}`, "roles:"];
  for (const [role, spec] of Object.entries(roles)) {
    lines.push(`  ${role}:`);
    lines.push(`    model: ${spec.model}`);
    if (spec.provider) lines.push(`    provider: ${spec.provider}`);
  }
  if (fallbacks.length) {
    lines.push("fallbacks:");
    for (const f of fallbacks) lines.push(`  - ${f}`);
  }
  lines.push("providers:");
  lines.push("  somecloud:");
  lines.push("    type: openai-compatible");
  lines.push("    baseURL: https://example.invalid/v1");
  await writeFile(path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"), lines.join("\n") + "\n");
}

/** models.yaml is cached per process, so each case gets a fresh module. */
async function auditWith(config) {
  await writeModelsYaml(config);
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  return mod.roleAudit();
}

test.after(() => rm(scratch, { recursive: true, force: true }));

test("a role whose model is installed reports ok", async () => {
  const { server, url } = await fakeOllama(["author-model:1b", "utility-model:1b"]);
  try {
    const audit = await auditWith({
      host: url,
      roles: { author: { model: "author-model:1b" }, utility: { model: "utility-model:1b" } },
    });
    assert.equal(audit.reachable, true);
    assert.equal(audit.ok, true);
    assert.deepEqual(audit.roles.map((r) => r.status), ["ok", "ok"]);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("a missing model that has a fallback is reported as a substitution, not as fine", async () => {
  const { server, url } = await fakeOllama(["the-fallback:1b"]);
  try {
    const audit = await auditWith({
      host: url,
      roles: { author: { model: "not-installed:70b" } },
      fallbacks: ["the-fallback:1b"],
    });
    assert.equal(audit.reachable, true);
    // The run would still work. That is exactly the problem: it works, and
    // the only symptom is output quietly worse than it should be.
    assert.equal(audit.ok, false);
    assert.deepEqual(audit.roles[0], {
      role: "author",
      configured: "not-installed:70b",
      resolved: "the-fallback:1b",
      status: "fallback",
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("a missing model with no usable fallback is reported as missing", async () => {
  const { server, url } = await fakeOllama(["something-else:1b"]);
  try {
    const audit = await auditWith({
      host: url,
      roles: { author: { model: "not-installed:70b" } },
      fallbacks: ["also-not-installed:13b"],
    });
    assert.equal(audit.ok, false);
    assert.equal(audit.roles[0].status, "missing");
    assert.equal(audit.roles[0].resolved, null);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("a role pointed at a cloud provider is not judged on what is installed locally", async () => {
  const { server, url } = await fakeOllama([]);
  try {
    const audit = await auditWith({
      host: url,
      roles: { author: { model: "gpt-whatever", provider: "somecloud" } },
    });
    // Its model lives on someone else's machine; "installed" means nothing.
    assert.equal(audit.roles[0].status, "provider");
    assert.equal(audit.ok, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("an unreachable Ollama answers, it does not throw", async () => {
  // A diagnostic that fails when the thing it diagnoses is down is not a
  // diagnostic. Boot calls this, and boot must not depend on Ollama running.
  const audit = await auditWith({
    host: "http://127.0.0.1:1",
    roles: { author: { model: "anything:1b" } },
  });
  assert.equal(audit.reachable, false);
  assert.match(audit.reason, /unreachable/i);
  assert.deepEqual(audit.roles, []);
});
