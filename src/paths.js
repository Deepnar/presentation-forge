import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DECKS = process.env.FORGE_DECKS_DIR || path.join(ROOT, "decks");
export const THEMES = process.env.FORGE_THEMES_DIR || path.join(ROOT, "themes");
export const BRAND = process.env.FORGE_BRAND_DIR || path.join(ROOT, "brand");
export const CONFIG = process.env.FORGE_CONFIG_DIR || path.join(ROOT, "config");
export const REFERENCE = process.env.FORGE_REFERENCE_DIR || path.join(ROOT, "reference");
