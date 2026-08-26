import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBrand } from "../src/chrome.js";

/**
 * The institutional mark is the real crest, on every surface.
 *
 * The renderer used to substitute a single-colour knockout on dark or strongly
 * coloured grounds. It is the owner of the mark who decides that, and the
 * decision is that the crest is never rendered black or white — a flattened
 * silhouette reads as a stamp, and a mark that changes slide to slide reads as
 * a mistake. This pins the loader's shape so the variants stay available to an
 * identity that asks for one by path.
 */

test("loadBrand resolves every declared variant, and misses are not fatal", async () => {
  const brand = await loadBrand({ brand: {} });
  assert.equal(brand.crest, null);
  assert.equal(brand.crestLight, null);
  assert.equal(brand.crestDark, null);
  // Nothing declared is nothing missing — the warning is for a path that fails.
  assert.deepEqual(brand.missing, []);
});

test("a declared mark that does not exist is reported, not silently dropped", async () => {
  const brand = await loadBrand({ brand: { crest: "brand/generated/nope.png" } });
  assert.equal(brand.crest, null);
  assert.deepEqual(brand.missing, ["brand/generated/nope.png"]);
});
