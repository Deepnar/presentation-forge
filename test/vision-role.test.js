import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

/**
 * `vision: true` has to be a constraint, not a comment.
 *
 * config/models.yaml declares it on the critic role, which reads rendered slide
 * PNGs — and nothing read the flag. That is the same shape as `fellBack`: a
 * field that looked like it enforced something and enforced nothing. It matters
 * most exactly where it was least true. In hosted mode `resolveRole` sends
 * every non-author role to the gateway, so `--critic` would post base64 images
 * to a text model and then edit the deck from whatever came back. Findings
 * invented about an image the model never saw are worse than no critic at all,
 * because the fix turn acts on them.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-vision-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });

async function fakeOllama(names) {
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: names.map((name) => ({ name })) }));
      return;
    }
    if (req.url === "/api/show") {
      // Ollama reports capabilities; a name containing "vision" stands in for
      // a model that can see, which is what the real /api/show would say.
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const model = (() => { try { return JSON.parse(body).model ?? ""; } catch { return ""; } })();
        const caps = ["completion", "tools", ...(/vision/.test(model) ? ["vision"] : [])];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ capabilities: caps }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
  return { server, url: `http://127.0.0.1:${port}` };
}

async function writeModels({ host, criticModel, fallbacks = [], visionModels = null }) {
  const lines = [
    `host: ${host}`,
    "roles:",
    "  author:",
    "    model: author-model:1b",
    "  critic:",
    `    model: ${criticModel}`,
    "    vision: true",
  ];
  if (fallbacks.length) {
    lines.push("fallbacks:");
    for (const f of fallbacks) lines.push(`  - ${f}`);
  }
  lines.push("providers:", "  tcet-auto:", "    type: openai-compatible",
    "    baseURL: https://gateway.invalid/v1", "    apiKey: env:FORGE_TCET_API_KEY",
    "    models:", "      - qwen3.6");
  if (visionModels) {
    lines.push("    vision_models:");
    for (const m of visionModels) lines.push(`      - ${m}`);
  }
  await writeFile(path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"), lines.join("\n") + "\n");
}

async function sightWith(cfg, { hosted }) {
  await writeModels(cfg);
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(hosted);
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  return mod.roleCanSeeImages("critic");
}

test.after(async () => {
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(null);
  await rm(scratch, { recursive: true, force: true });
});

test("local, running its configured vision model: the critic may look", async () => {
  const { server, url } = await fakeOllama(["vision-model:26b"]);
  try {
    const r = await sightWith({ host: url, criticModel: "vision-model:26b" }, { hosted: false });
    assert.equal(r.ok, true);
    assert.equal(r.model, "vision-model:26b");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("a fallback off the vision model is not a vision model", async () => {
  // The substitution is exactly the case that must not silently proceed: the
  // role still says vision:true, and the model it actually got cannot see.
  const { server, url } = await fakeOllama(["some-text-model:7b"]);
  try {
    const r = await sightWith(
      { host: url, criticModel: "vision-model:26b", fallbacks: ["some-text-model:7b"] },
      { hosted: false },
    );
    assert.equal(r.ok, false);
    assert.match(r.reason, /cannot read images/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("hosted, routed to a gateway that declares no vision model: refused", async () => {
  process.env.FORGE_TCET_API_KEY = "a-key";
  const { server, url } = await fakeOllama(["vision-model:26b"]);
  try {
    const r = await sightWith({ host: url, criticModel: "vision-model:26b" }, { hosted: true });
    assert.equal(r.ok, false, "a text gateway must not be handed slide images");
    assert.match(r.reason, /does not declare it as a vision model/);
  } finally {
    await new Promise((r) => server.close(r));
    delete process.env.FORGE_TCET_API_KEY;
  }
});

test("a provider that declares the model as vision-capable is allowed", async () => {
  // The escape hatch: when the gateway does serve a vision model, saying so in
  // models.yaml is what turns the critic back on.
  process.env.FORGE_TCET_API_KEY = "a-key";
  const { server, url } = await fakeOllama(["vision-model:26b"]);
  try {
    const r = await sightWith(
      { host: url, criticModel: "vision-model:26b", visionModels: ["qwen3.6"] },
      { hosted: true },
    );
    assert.equal(r.ok, true);
    assert.equal(r.model, "qwen3.6");
  } finally {
    await new Promise((r) => server.close(r));
    delete process.env.FORGE_TCET_API_KEY;
  }
});

test("a role that never declared vision cannot look", async () => {
  const { server, url } = await fakeOllama(["author-model:1b"]);
  try {
    await writeModels({ host: url, criticModel: "vision-model:26b" });
    const { setHostedForTest } = await import("../src/cloud.js");
    setHostedForTest(false);
    const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
    const r = await mod.roleCanSeeImages("author");
    assert.equal(r.ok, false);
    assert.match(r.reason, /not declared as a vision role/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
