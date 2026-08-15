import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { DECKS, ROOT } from "./paths.js";
import { deckSchema } from "./ai/catalog.js";

/**
 * The slide-type specimen deck: one valid example per slide type, used by the
 * deck detail's type-swap gallery to preview all 75 types in the current theme.
 *
 * The examples come from the committed type-batch demo decks (one real, valid
 * payload per type, so the previews never drift from what the renderer accepts)
 * plus hand-written specimens for the three types no demo deck exercises
 * (image, image-text, freeform — the image ones avoid a real file by using a
 * placeholder-capable payload; freeform is a small sandboxed HTML slide).
 *
 * This is build-on-demand: a single specimen deck is assembled, rendered in the
 * requested theme, and the per-slide PNGs are the gallery thumbnails. Cached by
 * theme so re-rendering the gallery is free.
 */

const DEMO_DECKS = [
  "tier1-types",
  "type-batch1", "type-batch2", "type-batch3", "type-batch4",
  "type-batch5", "type-batch6", "type-batch7", "type-batch8",
  "flow-ttb", "gpu-demo", "raytracing-ai",
];

const SPECIMEN_GAPS = {
  // An image slide with no real file renders a grey placeholder — exactly the
  // designed degrade, and honest as a preview: the gallery is about the layout,
  // and the user adds the actual image when they pick the type.
  image: {
    headline: "A headline over the image",
    image: "__placeholder__",
    caption: "The image lives here — picked when you choose this type.",
  },
  "image-text": {
    headline: "The point beside the image",
    image: "__placeholder__",
    body: ["Image on one side, the claim on the other.", "A supporting sentence that grounds the visual."],
  },
  freeform: {
    html:
      "<style>body{font-family:Inter,sans-serif;background:#F4F0E6;display:flex;" +
      "align-items:center;justify-content:center;height:100%;margin:0}" +
      ".card{background:#fff;padding:48px 64px;border-radius:16px;box-shadow:" +
      "0 24px 48px rgba(0,0,0,.18)}h1{margin:0 0 8px;font-size:40px}." +
      "sub{color:#666;font-size:18px}</style>" +
      "<div class=card><h1>Freeform slide</h1><div class=sub>Any layout you like — " +
      "this one is a simple card. Rasterised, not editable later.</div></div>",
  },
  // Neutral specimens for the types the demo decks cover with real content
  // (gpu-demo, raytracing-ai). The gallery shows the LAYOUT, never a real
  // deck — the same rule as the theme cards. A generic topic keeps every
  // field valid while reading as the design, not as someone else's slides.
  compare: {
    headline: "Two options, one trade-off",
    standfirst: "Both sides solve the same problem differently — the choice is what each gives up.",
    left: { title: "Option A", kicker: "The proven path", body: "Fast to adopt, established tooling, and a large pool of people who already know it." },
    right: { title: "Option B", kicker: "The efficient path", body: "Cheaper to run and simpler at scale, at the price of more setup today." },
    verdict: "Pick the one whose trade-off fits this brief.",
  },
  table: {
    headline: "The comparison at a glance",
    columns: ["Parameter", "Option A", "Option B"],
    rows: [
      ["Setup effort", "Low", "High"],
      ["Ongoing cost", "Higher", "Lower"],
      ["Ecosystem size", "Large", "Growing"],
    ],
  },
  stats: {
    headline: "The numbers that matter",
    standfirst: "Three figures that frame the decision.",
    stats: [
      { value: "2×", label: "Setup speed", sub: "for the common case" },
      { value: "40%", label: "Lower running cost", sub: "at comparable scale" },
      { value: "3", label: "Key integrations", sub: "you would manage yourself" },
    ],
  },
  bullets: {
    headline: "The argument in order",
    standfirst: "The core points, each a complete statement.",
    bullets: [
      "The current approach works but does not scale with the workload.",
      "The alternative removes the bottleneck at the price of more setup.",
      "Most teams should switch when the workload crosses this threshold.",
      "Adopting early compounds — the learning cost only rises later.",
    ],
  },
  timeline: {
    headline: "The road so far",
    events: [
      { when: "Year one", what: "The first version shipped and proved the approach." },
      { when: "Year three", what: "Early adopters reported real, measured gains." },
      { when: "Today", what: "The trade-offs are clear enough to decide." },
    ],
  },
  quote: {
    quote: "The best choice is the one you can commit to — the option itself matters less than the follow-through.",
    attribution: "A practitioner's rule of thumb",
  },
  callout: {
    headline: "Where this lands",
    label: "Takeaway",
    body: "The decision comes down to one question: does the extra setup buy enough in return? For this brief, the answer is yes.",
  },
  references: {
    headline: "References",
    items: [
      "Industry primer on the current landscape, 2024.",
      "Comparative field notes from three early adopters, 2025.",
      "Cost-model working paper, 2025.",
    ],
  },
  cards: {
    headline: "The four building blocks",
    cards: [
      { title: "Component one", body: "The foundation everything else sits on." },
      { title: "Component two", body: "Handles the core workload day to day." },
      { title: "Component three", body: "Adds the capabilities that differentiate." },
      { title: "Component four", body: "Pulls the parts together at the edge." },
    ],
  },
};

export async function specimenDeck() {
  const schema = await deckSchema();
  const all = schema.definitions.slide.properties.type.enum;

  const byType = new Map();
  // Hand-written neutral specimens win over demo-deck content: the gallery
  // shows the LAYOUT, never a real deck, and the demo decks (gpu-demo,
  // raytracing-ai) carry real content that would read as someone else's
  // slides. A type without a gap specimen falls back to a demo deck when one
  // covers it.
  for (const t of all) {
    if (SPECIMEN_GAPS[t]) byType.set(t, { type: t, ...SPECIMEN_GAPS[t] });
  }
  for (const name of DEMO_DECKS) {
    try {
      const deck = YAML.parse(await readFile(path.join(DECKS, name, "deck.yaml"), "utf8"));
      for (const slide of deck.slides ?? []) {
        if (!byType.has(slide.type)) byType.set(slide.type, slide);
      }
    } catch { /* a demo deck may not exist in a trimmed checkout */ }
  }

  const slides = [];
  for (const t of all) {
    if (byType.has(t)) {
      slides.push(byType.get(t));
    } else {
      // Any type with no specimen at all is still listed so the gallery shows
      // every option; a minimal valid payload degrades to a near-blank slide.
      slides.push({ type: t, headline: t.replace(/-/g, " ") });
    }
  }

  return {
    title: "Slide type specimens",
    theme: "warm-humanist",
    sections: ["Specimens"],
    slides,
  };
}

/** Map slide type → the specimen's index in the assembled deck. */
export async function specimenIndex() {
  const deck = await specimenDeck();
  const index = {};
  deck.slides.forEach((s, i) => { index[s.type] = i; });
  return index;
}

/** A small deck wrapping ONE slide, for a single-type preview re-render. */
export function wrapSlide(slide, { theme, headline = "Preview" } = {}) {
  return {
    title: "Single slide preview",
    ...(theme ? { theme } : {}),
    sections: ["Preview"],
    slides: [{ type: slide.type, ...slide, headline: headline ?? slide.headline }],
  };
}

export { ROOT };
