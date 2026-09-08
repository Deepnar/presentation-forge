
export const PLACEHOLDER_MARKERS = [
  "Details in the full briefing.",
  "This slide's generation was cut short and was not re-attempted.",
  "Regenerate this slide to replace the placeholders above.",
];

const MARKER_LOW = PLACEHOLDER_MARKERS.map((m) => m.toLowerCase());

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
