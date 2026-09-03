import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listThemes, loadTheme } from "../src/theme.js";

/**
 * The font manifest against the themes it claims to serve.
 *
 * `tools/fonts.manifest.json` drives `install-fonts.mjs`, and its `used_by`
 * field is documentation the install step never reads — so nothing noticed when
 * it stopped being true. It had drifted on eighteen of twenty-seven families
 * and listed six that no theme used at all, which is six typefaces downloaded
 * and installed on every machine and in every container for nothing.
 *
 * Wrong documentation is worse than none: the field's whole purpose is to say
 * which themes break if a family is dropped, and answering that wrongly is how
 * a family gets dropped.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function familiesInUse() {
  const byFamily = new Map();
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    for (const token of Object.values(theme.type ?? {})) {
      if (!token?.family) continue;
      if (!byFamily.has(token.family)) byFamily.set(token.family, new Set());
      byFamily.get(token.family).add(name);
    }
  }
  return byFamily;
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "tools", "fonts.manifest.json"), "utf8"));

test("every family the themes ask for is in the manifest", async () => {
  // This is the direction that breaks a render: a theme naming a face nothing
  // installs falls back to DejaVu and the slide is quietly the wrong typeface.
  const inUse = await familiesInUse();
  const missing = [...inUse.keys()].filter((f) => !manifest.families[f]).sort();
  assert.deepEqual(missing, [], "a theme names a family the install step never fetches");
});

test("the manifest carries no family no theme uses", async () => {
  const inUse = await familiesInUse();
  const spare = Object.keys(manifest.families).filter((f) => !inUse.has(f)).sort();
  assert.deepEqual(spare, [], "these are downloaded and installed everywhere for nothing");
});

test("used_by names exactly the themes that use the family", async () => {
  // Derived, never hand-written. It drifted on eighteen of twenty-seven
  // families precisely because it was maintained by hand and read by nobody.
  const inUse = await familiesInUse();
  const wrong = [];
  for (const [family, spec] of Object.entries(manifest.families)) {
    const actual = [...(inUse.get(family) ?? [])].sort();
    const declared = [...(spec.used_by ?? [])].sort();
    if (actual.join(",") !== declared.join(",")) {
      wrong.push(`${family}: declared [${declared.join(", ")}] but used by [${actual.join(", ")}]`);
    }
  }
  assert.deepEqual(wrong, [], "used_by has drifted from the themes");
});
