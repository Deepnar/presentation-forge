/**
 * Placeholder detection — the seam that keeps a degraded slide from shipping
 * as real content.
 *
 * When a slide's generation fails (cut-short JSON, a model that never lands a
 * slide), the pipeline writes a validating placeholder so the deck stays whole
 * and the promised count holds. The placeholder text is designed to be
 * UNMISTAKABLE: a marker bullet that no real writer would produce, plus an
 * explicit "regenerate" instruction. This module is the single place that
 * recognises them, so the UI badge, the render gate and the deck's problems[]
 * all agree about which slides are placeholders.
 *
 * The marker must be stable across time — the sweep regenerates decks written
 * by older placeholders too, so detection matches both the current phrasing
 * and the historical one ("Details in the full briefing.").
 */

export const PLACEHOLDER_MARKERS = [
  // The current marker set: the regenerate instructions a real writer never
  // emits, and the historical marker old placeholders carried.
  "Details in the full briefing.",
  "This slide's generation was cut short and was not re-attempted.",
  "Regenerate this slide to replace the placeholders above.",
];

const MARKER_LOW = PLACEHOLDER_MARKERS.map((m) => m.toLowerCase());

/** Does one slide look like a placeholder? Checks its content strings only —
 *  headline, bullets, items, bodies — never the type or the structure. */
export function isPlaceholderSlide(slide) {
  if (!slide || typeof slide !== "object") return false;
  const haystack = [];
  const push = (v) => {
    if (typeof v === "string") haystack.push(v);
  };
  const walk = (v, depth = 0) => {
    if (depth > 4 || v == null) return;
    if (typeof v === "string") push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === "object") Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(slide);
  const low = haystack.join("\n").toLowerCase();
  return MARKER_LOW.some((m) => low.includes(m));
}

/** Which slides of a deck are placeholders: [{ index, type, headline }]. */
export function placeholderSlides(deck) {
  return (deck?.slides ?? [])
    .map((s, index) => ({ index, slide: s }))
    .filter(({ slide }) => isPlaceholderSlide(slide))
    .map(({ index, slide }) => ({
      index,
      type: slide.type,
      headline: slide.headline ?? slide.type,
    }));
}

/** Render-gate message for a deck with placeholder slides. */
export function placeholderGateError(deck) {
  const found = placeholderSlides(deck);
  if (!found.length) return null;
  return (
    `This deck contains ${found.length} placeholder slide${found.length === 1 ? "" : "s"} ` +
    `(${found.map((s) => `slide ${s.index + 1}`).join(", ")}) whose generation failed ` +
    `and were never completed. Regenerate them before rendering — a deck must not ` +
    `ship placeholders as if they were content.`
  );
}
