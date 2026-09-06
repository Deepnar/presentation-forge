#!/usr/bin/env node
/**
 * Verify a running one-command local install.
 *
 * Docker tells us a container is "up" even when it is pointed at no Ollama
 * endpoint, and browser users then meet a vague generation failure much later.
 * This check asks the app the three things a new self-hoster actually needs to
 * know: is Forge alive, is local mode active, and did the model picker find an
 * Ollama model?
 */

// A Docker-only user should not need Node on the host just to verify the
// install: `docker compose exec forge env FORGE_CHECK_URL=http://localhost:5174
// node tools/local-check.mjs` runs this in the app container. Source users can
// point the same check at their development API explicitly.
const base = process.env.FORGE_CHECK_URL ?? `http://127.0.0.1:${process.env.FORGE_PORT ?? 8090}`;

async function json(path) {
  let response;
  try {
    response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    throw new Error(`cannot reach Forge at ${base} — run \`docker compose up -d --build\` first (${err.message})`);
  }
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

try {
  const health = await json("/api/health");
  const models = await json("/api/models");
  const auto = models.auto ?? models.models?.auto;
  const localModels = Array.isArray(models.models) ? models.models : [];

  if (!health.ok) throw new Error("Forge answered but did not report healthy");
  // Hosted Auto is an object with its own model list; local mode correctly
  // exposes Ollama's installed models as the top-level picker array. Treating
  // only the former as success made a healthy local install report that it had
  // no Ollama model at all.
  const found = models.hosted ? auto?.models ?? [] : localModels;
  if (!found.length) {
    throw new Error(
      "Forge is running but cannot find Ollama. Start Ollama, pull a model (for example `ollama pull qwen3:4b`), " +
      "then confirm `FORGE_OLLAMA_HOST` points at it.",
    );
  }

  console.log(`  Forge healthy at ${base}`);
  console.log(`  local model: ${models.hosted ? found.join(", ") : models.default ?? found[0]}`);
  console.log("  research: bundled SearXNG configured");
} catch (err) {
  console.error(`  local check failed: ${err.message}`);
  process.exitCode = 1;
}
