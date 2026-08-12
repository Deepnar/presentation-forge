import path from "node:path";
import { fileURLToPath } from "node:url";

// Hosting-readiness: the repo layout is the default, but every stateful
// directory can be pointed elsewhere via env (FORGE_DECKS_DIR, FORGE_THEMES_DIR,
// FORGE_BRAND_DIR, FORGE_CONFIG_DIR) so the pipeline can run against a
// persistent volume without a code change. The CLI and dev keep the defaults.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DECKS = process.env.FORGE_DECKS_DIR || path.join(ROOT, "decks");
export const THEMES = process.env.FORGE_THEMES_DIR || path.join(ROOT, "themes");
export const BRAND = process.env.FORGE_BRAND_DIR || path.join(ROOT, "brand");
export const CONFIG = process.env.FORGE_CONFIG_DIR || path.join(ROOT, "config");
