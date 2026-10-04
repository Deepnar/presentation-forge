// @forge/model — legacy bridge. The 73-type deck.yaml vocabulary becomes a
// compatibility format: old slides convert INTO SlideIntent, and old decks
// stay readable during migration. Only the six vertical-slice types map
// here; the rest follow the same shape as recipes land in the compiler.
//
// Bridge input is structurally loose by nature (unvalidated legacy YAML),
// so boundary casts below are erasable and change no runtime behaviour:
// AJV owns the truth about the produced intent downstream.

import type { SlideIntent, DeckIntent, ContentBlock } from "./intent.generated.ts";

export interface LegacySlide {
  type: string;
  headline?: string;
  speaker_note?: string;
  bullets?: string[];
  left?: { title?: string; body?: string; points?: string[] };
  right?: { title?: string; body?: string; points?: string[] };
  verdict?: string;
  image?: string;
  side?: string;
  body?: string[];
  caption?: string;
  chart?: { kind?: string; categories?: string[]; series?: { name: string; values: number[] }[]; unit?: string };
  steps?: { title?: string; body?: string }[];
  stats?: { value?: string; label?: string }[];
  value?: string;
  label?: string;
}

export interface LegacyDeck {
  title?: string;
  slides?: LegacySlide[];
}

function block(id: string, kind: ContentBlock["kind"], extra: Partial<ContentBlock> = {}): ContentBlock {
  return { id, kind, ...extra };
}

// Map one legacy slide object to a SlideIntent. Returns null when the type
// has no recipe yet — the caller keeps the slide as legacy rather than
// degrading it silently.
export function legacySlideToIntent(slide: LegacySlide, index: number): SlideIntent | null {
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
        ] as SlideIntent["blocks"],
        layoutHint: { recipe: "comparison" },
      };
    case "image-text":
    case "hero-image":
      return {
        ...base,
        blocks: [
          block(`${id}-img`, "image", { src: slide.image ?? "", caption: slide.caption }),
          block(`${id}-body`, "list", { items: slide.body ?? [] }),
        ] as SlideIntent["blocks"],
        layoutHint: { recipe: "media", mediaSide: slide.side === "left" ? "left" : "right" },
      };
    case "chart":
      return {
        ...base,
        blocks: [
          block(`${id}-chart`, "chart", {
            chartKind: (slide.chart?.kind ?? "bar") as NonNullable<ContentBlock["chartKind"]>,
            categories: slide.chart?.categories ?? [],
            series: (slide.chart?.series ?? []) as NonNullable<ContentBlock["series"]>,
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
        blocks: ((slide.steps ?? []).map((s, i) =>
          block(`${id}-step${i + 1}`, "text", { label: s.title, text: s.body ?? "" }),
        )) as SlideIntent["blocks"],
        layoutHint: { recipe: "process" },
      };
    case "stats":
    case "big-number":
      return {
        ...base,
        blocks: ((slide.stats ?? [{ value: slide.value, label: slide.label }])
          .filter(Boolean)
          .map((s, i) => block(`${id}-stat${i + 1}`, "stat", { value: s.value ?? "", label: s.label ?? "" }))) as SlideIntent["blocks"],
        layoutHint: { recipe: "content" },
      };
    default:
      return null;
  }
}

export function legacyDeckToIntent(deck: LegacyDeck): { intent: DeckIntent; unmapped: { index: number; type: string }[] } {
  const slides: SlideIntent[] = [];
  const unmapped: { index: number; type: string }[] = [];
  (deck.slides ?? []).forEach((s, i) => {
    const intent = legacySlideToIntent(s, i);
    if (intent) slides.push(intent);
    else unmapped.push({ index: i, type: s.type });
  });
  return {
    intent: {
      id: deck.title ?? "legacy-deck",
      title: deck.title ?? "Legacy deck",
      slides: slides as DeckIntent["slides"],
    },
    unmapped,
  };
}
