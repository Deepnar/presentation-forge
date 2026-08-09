import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DECKS = path.join(ROOT, "decks");
export const THEMES = path.join(ROOT, "themes");
export const BRAND = path.join(ROOT, "brand");
export const CONFIG = path.join(ROOT, "config");
