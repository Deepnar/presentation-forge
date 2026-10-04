// Node/local theme adapter: canonical raw document IO (filesystem +
// YAML). Returns parsed documents; normalization lives in
// packages/core (normalizeDesign). Legacy src/theme.js delegates its
// raw reads to this module while keeping its own public output shape.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ROOT, THEMES } from "./paths.js";

export async function listThemeNames() {
  const files = await readdir(THEMES);
  return files.filter((f) => f.endsWith(".yaml") && !f.startsWith("_")).map((f) => f.replace(/\.yaml$/, ""));
}

export async function listStyleNames() {
  const files = await readdir(path.join(ROOT, "styles"));
  return files.filter((f) => f.endsWith(".yaml") && !f.startsWith("_")).map((f) => f.replace(/\.yaml$/, ""));
}

export async function readThemeFile(name) {
  return readFile(path.join(THEMES, `${name}.yaml`), "utf8");
}

export async function readStyleFile(name) {
  return readFile(path.join(ROOT, "styles", `${name}.yaml`), "utf8");
}

export function parseThemeDocument(text) {
  return YAML.parse(text);
}

export async function loadThemeDocument(name) {
  return parseThemeDocument(await readThemeFile(name));
}

export async function loadStyleDocument(name) {
  return parseThemeDocument(await readStyleFile(name));
}
