import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "../src/paths.js";
import { withOllamaHost } from "../src/ai/ollama.js";

/**
 * The local bundle is a product contract, not an example somebody can let
 * drift. A first-time self-hoster should run one command and get Forge,
 * research and persistent state without a domain, mail account or operator
 * key. The production compose is deliberately different; these assertions make
 * sure a convenience edit cannot accidentally turn local setup into production
 * ceremony.
 */
const compose = YAML.parse(await readFile(path.join(ROOT, "compose.yaml"), "utf8"));
const production = YAML.parse(await readFile(path.join(ROOT, "docker", "docker-compose.app.yml"), "utf8"));
const dockerignore = await readFile(path.join(ROOT, ".dockerignore"), "utf8");
const dockerfile = await readFile(path.join(ROOT, "docker", "Dockerfile"), "utf8");

test("the root Compose file is local mode, not a disguised production deployment", () => {
  const forge = compose.services.forge;
  assert.equal(forge.environment.FORGE_HOSTED, "0");
  assert.equal(forge.environment.FORGE_OPEN_REGISTRATION, "1");
  assert.equal(forge.environment.FORGE_SWEEP_DAYS, "0");
  assert.equal(forge.environment.SEARXNG_URL, "http://searxng:8080");
  assert.ok(!("FORGE_KEY_PEPPER" in forge.environment), "a local clone must not need an operator secret");
  assert.ok(!("caddy" in compose.services), "TLS/domain belong to the production compose only");
  assert.deepEqual(forge.ports, ["127.0.0.1:${FORGE_PORT:-8090}:5174"]);
});

test("the local bundle includes research, keeps it private, and persists Forge state", () => {
  const forge = compose.services.forge;
  const search = compose.services.searxng;
  assert.ok(forge.depends_on.searxng, "research is part of the one-command product");
  assert.equal(search.ports, undefined, "SearXNG must not become a public metasearch service");
  assert.deepEqual(forge.volumes, ["forge_local_data:/data"]);
  // YAML parses an intentionally empty mapping value as null. Its presence is
  // the contract; requiring `{}` would test the parser's representation rather
  // than whether Compose has a named volume to create.
  assert.ok(Object.hasOwn(compose.volumes, "forge_local_data"));
});

test("the image whitelist cannot copy a self-hoster's identity or key file", () => {
  // `config/*.yaml` looked concise and was wrong: a local identity.yaml and
  // local.yaml are both YAML. The build image needs only the two committed
  // templates, not the host's personal configuration.
  assert.match(dockerignore, /^!config\/identity\.example\.yaml$/m);
  assert.match(dockerignore, /^!config\/models\.yaml$/m);
  assert.doesNotMatch(dockerignore, /^!config\/\*\.yaml$/m);
});

test("the local image includes the gallery the app's theme picker serves", () => {
  // The build stage copied app/ but the runtime stage used a selective copy.
  // Omitting this made every theme thumbnail a Docker-only 404.
  assert.match(dockerfile, /^COPY app\/gallery \.\/app\/gallery$/m);
});

test("a container reaches host Ollama without rewriting the user's models.yaml", () => {
  const cfg = { host: "http://localhost:11434", roles: { author: { model: "qwen3:4b" } } };
  const out = withOllamaHost(cfg, "http://host.docker.internal:11434");
  assert.equal(out.host, "http://host.docker.internal:11434");
  assert.equal(cfg.host, "http://localhost:11434", "the committed local config stays portable");
  assert.strictEqual(withOllamaHost(cfg, ""), cfg, "no override avoids an unnecessary clone");
});

test("the production Compose path keeps production controls and current quota names", () => {
  const forge = production.services.forge;
  assert.match(forge.environment.FORGE_HOSTED, /:-1/);
  assert.match(forge.environment.FORGE_KEY_PEPPER, /\?set FORGE_KEY_PEPPER/);
  assert.ok(production.services.caddy, "TLS belongs to production only");
  assert.ok(!("FORGE_OLLAMA_HOST" in forge.environment), "production must not accidentally reach an operator laptop");

  for (const key of [
    "FORGE_AUTO_WINDOW_HOURS", "FORGE_AUTO_WINDOW_REQUESTS", "FORGE_AUTO_WEEKLY_REQUESTS",
    "FORGE_AUTO_WINDOW_SLIDES", "FORGE_AUTO_WEEKLY_SLIDES", "FORGE_AUTO_WEEKLY_TOKENS",
    "FORGE_AUTO_TRIAL_TOKENS", "FORGE_AUTO_MAX_SLIDES_PER_DECK",
  ]) assert.ok(key in forge.environment, `production Compose is missing ${key}`);

  assert.ok(!("FORGE_AUTO_HOURLY_REQUESTS" in forge.environment));
  assert.ok(!("FORGE_AUTO_HOURLY_SLIDES" in forge.environment));
});
