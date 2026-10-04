// @forge/model — legacy bridge. The 73-type deck.yaml vocabulary becomes a
// compatibility format: old slides convert INTO SlideIntent, and old decks
// stay readable during migration. Only the six vertical-slice types map
// here; the rest follow the same shape as recipes land in the compiler.

function block(id, kind, extra = {}) {
  return { id, kind, ...extra };
}

// Map one legacy slide object to a SlideIntent. Returns null when the type
// has no recipe yet — the caller keeps the slide as legacy rather than
// degrading it silently.
export function legacySlideToIntent(slide, index) {
  const id = `legacy-s${index + 1}`;
  const base = {
    id,
    purpose: `Legacy ${slide.type} slide: ${slide.headline ?? slide.type}`,
    title: slide.headline,
    speakerNotes: slide.speaker_note,
  };
  switch (slide.type) {
    case "title":
      return { ...base, blocks: [block(`${id}-b1`, "text", { text: slide.headline ?? "" })], layoutHint: { recipe: "title" } };
    case "bullets":
    case "numbered-list":
    case "checklist":
      return { ...base, blocks: [block(`${id}-b1`, "list", { items: slide.bullets ?? [] })], layoutHint: { recipe: "content" } };
    case "compare":
    case "vs":
    case "pros-cons":
    case "before-after":
    case "side-by-side":
      return {
        ...base,
        blocks: [
          block(`${id}-left`, "text", { label: slide.left?.title, text: slide.left?.body ?? (slide.left?.points ?? []).join("\n") }),
          block(`${id}-right`, "text", { label: slide.right?.title, text: slide.right?.body ?? (slide.right?.points ?? []).join("\n") }),
          ...(slide.verdict ? [block(`${id}-verdict`, "callout", { text: slide.verdict })] : []),
        ],
        layoutHint: { recipe: "comparison" },
      };
    case "image-text":
    case "hero-image":
      return {
        ...base,
        blocks: [
          block(`${id}-img`, "image", { src: slide.image ?? "", caption: slide.caption }),
          block(`${id}-body`, "list", { items: slide.body ?? [] }),
        ],
        layoutHint: { recipe: "media", mediaSide: slide.side === "left" ? "left" : "right" },
      };
    case "chart":
      return {
        ...base,
        blocks: [
          block(`${id}-chart`, "chart", {
            chartKind: slide.chart?.kind ?? "bar",
            categories: slide.chart?.categories ?? [],
            series: slide.chart?.series ?? [],
            unit: slide.chart?.unit,
          }),
        ],
        layoutHint: { recipe: "chart" },
      };
    case "flow":
    case "pipeline":
    case "cycle":
      return {
        ...base,
        blocks: (slide.steps ?? []).map((s, i) =>
          block(`${id}-step${i + 1}`, "text", { label: s.title, text: s.body ?? "" }),
        ),
        layoutHint: { recipe: "process" },
      };
    case "stats":
    case "big-number":
      return {
        ...base,
        blocks: (slide.stats ?? [{ value: slide.value, label: slide.label }])
          .filter(Boolean)
          .map((s, i) => block(`${id}-stat${i + 1}`, "stat", { value: s.value ?? "", label: s.label ?? "" })),
        layoutHint: { recipe: "content" },
      };
    default:
      return null;
  }
}

export function legacyDeckToIntent(deck) {
  const slides = [];
  const unmapped = [];
  (deck.slides ?? []).forEach((s, i) => {
    const intent = legacySlideToIntent(s, i);
    if (intent) slides.push(intent);
    else unmapped.push({ index: i, type: s.type });
  });
  return {
    intent: {
      id: deck.title ?? "legacy-deck",
      title: deck.title ?? "Legacy deck",
      slides,
    },
    unmapped,
  };
}
