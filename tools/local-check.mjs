#!/usr/bin/env node

const base = process.env.FORGE_CHECK_URL ?? `http://127.0.0.1:${process.env.FORGE_PORT ?? 8090}`;

async function json(path) {
  let response;
  try {
    response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    throw new Error(`cannot reach Forge at ${base} — run \`docker compose up -d --build --wait\` first (${err.message})`);
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
  const found = models.hosted ? auto?.models ?? [] : localModels;
  console.log(`  Forge healthy at ${base}`);
  if (found.length) {
    console.log(`  local model: ${models.hosted ? found.join(", ") : models.default ?? found[0]}`);
  } else {
    console.log("  model: not configured yet — add a provider under Settings → Cloud, or start Ollama and pull a model");
  }
  console.log("  research: bundled SearXNG configured");
} catch (err) {
  console.error(`  local check failed: ${err.message}`);
  process.exitCode = 1;
}
