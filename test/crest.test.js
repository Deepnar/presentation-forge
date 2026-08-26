import { test } from "node:test";
import assert from "node:assert/strict";
import { crestFor } from "../src/chrome.js";

/**
 * Which institutional mark goes on which ground.
 *
 * The mark is the one element of a deck that is actually graded, and it is
 * drawn on whatever surface the layout painted — a bone page, a terracotta
 * divider, a charcoal title. Picking the variant by a luminance threshold took
 * the wrong mark on every light chromatic ground.
 */

const brand = {
  crest: { path: "/crest.png", ratio: 0.94 },
  crestLight: { path: "/crest-light.png", ratio: 0.94 },
  crestDark: { path: "/crest-dark.png", ratio: 0.94 },
};

test("a neutral page keeps the real full-colour mark", () => {
  for (const bg of ["#FFFFFF", "#EBEBE6", "#F7F3EA"]) {
    assert.equal(crestFor(brand, bg).path, "/crest.png", bg);
  }
});

test("a dark ground takes the reversed mark", () => {
  for (const bg of ["#000000", "#0B0E14", "#1C3A6B", "#6D4AE0"]) {
    assert.equal(crestFor(brand, bg).path, "/crest-light.png", bg);
  }
});

test("a light chromatic ground takes the dark mark, not the reversed one", () => {
  // The reported case: a white shield on terracotta read as a pale sticker.
  // Salmon is the clearer failure — white is 3.1:1 there and dark is 5.6:1, and
  // the old luminance rule took white on both.
  assert.equal(crestFor(brand, "#C05D4E").path, "/crest-dark.png"); // terracotta
  assert.equal(crestFor(brand, "#E2725B").path, "/crest-dark.png"); // salmon
  assert.equal(crestFor(brand, "#F5A623").path, "/crest-dark.png"); // drafting amber
});

test("an install that has not regenerated its marks still gets a legible one", () => {
  // crest-dark is new, so a brand directory built before it exists must fall
  // back rather than lose the mark entirely.
  const older = { crest: brand.crest, crestLight: brand.crestLight };
  assert.equal(crestFor(older, "#C05D4E").path, "/crest-light.png");
  const bare = { crest: brand.crest };
  assert.equal(crestFor(bare, "#0B0E14").path, "/crest.png");
});
