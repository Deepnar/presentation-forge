import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderSlide, placeholderSlides, placeholderGateError } from "../src/placeholders.js";
import { placeholderFor } from "../src/ai/generate.js";

test("isPlaceholderSlide recognises the current placeholder markers", () => {
  assert.equal(isPlaceholderSlide({
    type: "bullets",
    headline: "A point",
    bullets: ["Real content.", "Details in the full briefing."],
  }), true);
  assert.equal(isPlaceholderSlide({
    type: "bullets",
    headline: "A point",
    bullets: ["Real content one.", "Real content two."],
  }), false);
});

test("isPlaceholderSlide recognises the explicit regeneration marker", () => {
  assert.equal(isPlaceholderSlide({
    type: "bullets",
    headline: "A point",
    bullets: ["Real.", "This slide's generation was cut short and was not re-attempted."],
  }), true);
});

test("placeholderFor writes a slide that is detected as a placeholder", () => {
  const p = placeholderFor({ type: "bullets", section: 0, purpose: "Talk about the topic" });
  assert.equal(isPlaceholderSlide(p), true);
});

test("placeholderSlides lists only the placeholder slides by index", () => {
  const deck = {
    title: "T",
    slides: [
      { type: "title", headline: "T" },
      { type: "bullets", headline: "A", bullets: ["real", "content", "here", "still"] },
      { type: "bullets", headline: "B", bullets: ["real", "Details in the full briefing."] },
    ],
  };
  assert.deepEqual(placeholderSlides(deck).map((s) => s.index), [2]);
  assert.equal(placeholderSlides(deck)[0].type, "bullets");
});

test("placeholderGateError names the placeholder slides and is null when clean", () => {
  const clean = { title: "T", slides: [{ type: "bullets", headline: "H", bullets: ["a", "b", "c", "d"] }] };
  assert.equal(placeholderGateError(clean), null);
  const dirty = {
    title: "T",
    slides: [
      { type: "bullets", headline: "H", bullets: ["a", "b", "c", "Details in the full briefing."] },
      { type: "bullets", headline: "G", bullets: ["a", "b", "c", "d"] },
    ],
  };
  const msg = placeholderGateError(dirty);
  assert.ok(msg.includes("slide 1"));
  assert.ok(msg.includes("render"));
});
