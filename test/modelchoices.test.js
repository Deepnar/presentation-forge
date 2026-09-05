import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

/**
 * The shape of `auto` on GET /api/models.
 *
 * Two endpoints hand the UI an object called `auto`: /api/auto/status (read by
 * HeaderBar, Sidebar, ProfileModal) and /api/models via useModels (read by
 * ChatView). They must agree, because the components read the same field names
 * off whichever one they were given.
 *
 * They did not. `modelChoices` built `auto` only when the key was set and then
 * projected away the `keySet` that proved it, so ChatView's `!auto.keySet` was
 * true on a box with a working gateway key — a permanent "the shared Auto model
 * has no key on this install" banner on the empty chat screen, pointing at
 * Settings to fix nothing. The same projection dropped `kind`, so a local
 * Ollama rendered the composer chip as "Auto" instead of "Local · Ollama".
 *
 * `paths.js` reads FORGE_CONFIG_DIR into a module-level const, so it is set
 * before the first src import rather than inside a test.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-modelchoices-"));
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
await mkdir(process.env.FORGE_CONFIG_DIR, { recursive: true });

/** A stand-in Ollama reporting exactly these models installed. */
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

/** `host` decides whether the local free tier has anything to offer. */
async function writeModelsYaml(host = "http://127.0.0.1:1") {
  await writeFile(
    path.join(process.env.FORGE_CONFIG_DIR, "models.yaml"),
    [
      `host: ${host}`,
      "roles:",
      "  author:",
      "    model: author-model:1b",
      "providers:",
      "  tcet-auto:",
      "    type: openai-compatible",
      "    baseURL: https://gateway.invalid/v1",
      "    apiKey: env:FORGE_TCET_API_KEY",
      "    label: TCET CoE Gateway",
      "    models:",
      "      - qwen3.6",
    ].join("\n") + "\n",
  );
}

await writeModelsYaml();

/** models.yaml is cached per module instance, so each case imports a fresh one. */
async function choicesWith({ key, hosted }) {
  if (key === null) delete process.env.FORGE_TCET_API_KEY;
  else process.env.FORGE_TCET_API_KEY = key;
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(hosted);
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  return mod.modelChoices();
}

test.after(async () => {
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(null);
  await rm(scratch, { recursive: true, force: true });
});

test("hosted with a gateway key: auto carries the keySet the UI tests", async () => {
  const { auto } = await choicesWith({ key: "a-real-looking-key", hosted: true });
  assert.ok(auto, "a configured gateway must produce an auto entry");
  // The bug was not a wrong value, it was an absent field: `undefined` is
  // falsy, so every consumer read it as "no key".
  assert.equal(auto.keySet, true);
  // The tier is named for its ROLE now, not for the institution that happened
  // to supply the gateway. Note the fixture above still writes the old
  // provider block and the old env var, which makes this a backward
  // compatibility test as much as a naming one: an install that has not been
  // touched must keep resolving.
  assert.equal(auto.kind, "auto");
  assert.deepEqual(auto.models, ["qwen3.6"]);
});

test("the same config under the new provider name resolves identically", async () => {
  const { writeFile } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const file = path.join(process.env.FORGE_CONFIG_DIR, "models.yaml");
  const legacy = await (await import("node:fs/promises")).readFile(file, "utf8");
  await writeFile(file, legacy.replace("  tcet-auto:", "  auto:").replace("FORGE_TCET_API_KEY", "FORGE_AUTO_API_KEY"));

  delete process.env.FORGE_TCET_API_KEY;
  process.env.FORGE_AUTO_API_KEY = "a-real-looking-key";
  const { setHostedForTest } = await import("../src/cloud.js");
  setHostedForTest(true);
  const mod = await import(`../src/ai/ollama.js?case=${Math.random()}`);
  const { auto } = await mod.modelChoices();

  assert.ok(auto, "the role-named provider must resolve");
  assert.equal(auto.keySet, true);
  assert.equal(auto.kind, "auto");
  delete process.env.FORGE_AUTO_API_KEY;
  await writeFile(file, legacy);
});

test("hosted with no gateway key: auto is absent, so the banner still fires", async () => {
  const { auto } = await choicesWith({ key: null, hosted: true });
  // Hosted has no local fallback, so this is the genuine "no key" state the
  // ChatView banner exists to report. Fixing the false positive must not have
  // silenced the true one.
  assert.equal(auto, null);
});

test("local with no gateway key: auto reports the kind the composer chip prints", async () => {
  const { server, url } = await fakeOllama(["author-model:1b", "another:7b"]);
  try {
    await writeModelsYaml(url);
    const { auto } = await choicesWith({ key: null, hosted: false });
    assert.ok(auto, "an installed Ollama is the local free tier");
    // ChatView prints "Local · Ollama" on `kind === "local"` and "Auto"
    // otherwise, so a dropped kind silently mislabels the backend in use.
    assert.equal(auto.kind, "local");
    assert.equal(auto.keySet, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
