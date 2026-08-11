import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moveSlide,
  duplicateSlide,
  deleteSlide,
  replaceSlide,
  setPresenter,
} from "../app/web/src/lib/slides.js";

const S = (type, i) => ({ type, headline: `slide ${i}`, notes: `n${i}` });

test("moveSlide swaps neighbours and never leaves the bounds", () => {
  const a = [S("bullets", 1), S("cards", 2), S("quote", 3)];
  assert.deepEqual(moveSlide(a, 0, 1).map((s) => s.headline), ["slide 2", "slide 1", "slide 3"]);
  assert.deepEqual(moveSlide(a, 1, -1).map((s) => s.headline), ["slide 2", "slide 1", "slide 3"]);
  // First slide cannot move left, last cannot move right — unchanged reference.
  assert.equal(moveSlide(a, 0, -1), a);
  assert.equal(moveSlide(a, 2, 1), a);
});

test("moveSlide is immutable", () => {
  const a = [S("bullets", 1), S("cards", 2)];
  moveSlide(a, 0, 1);
  assert.equal(a[0].headline, "slide 1");
});

test("duplicateSlide deep-copies the slide after itself", () => {
  const a = [S("cards", 1)];
  const out = duplicateSlide(a, 0);
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], out[0]);
  assert.notEqual(out[1], out[0]); // a clone, not the same object
  // Mutating the copy must not touch the original.
  out[1].headline = "changed";
  assert.equal(a[0].headline, "slide 1");
});

test("deleteSlide removes the index and refuses to empty the deck", () => {
  const a = [S("bullets", 1), S("cards", 2), S("quote", 3)];
  assert.deepEqual(deleteSlide(a, 1).map((s) => s.headline), ["slide 1", "slide 3"]);
  const only = [S("title", 1)];
  assert.equal(deleteSlide(only, 0), only);
});

test("replaceSlide swaps the slide at an index", () => {
  const a = [S("bullets", 1), S("cards", 2)];
  const next = replaceSlide(a, 1, { type: "quote", quote: "q" });
  assert.equal(next[1].type, "quote");
  assert.equal(a[1].type, "cards");
});

test("setPresenter writes the field, and an empty value removes it", () => {
  const a = [S("bullets", 1)];
  const assigned = setPresenter(a, 0, "Deepesh");
  assert.equal(assigned[0].presenter, "Deepesh");
  assert.equal(a[0].presenter, undefined);
  const cleared = setPresenter(assigned, 0, "");
  assert.equal("presenter" in cleared[0], false);
});
