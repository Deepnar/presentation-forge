import { deckSchema } from "./ai/catalog.js";
import { ROOT } from "./paths.js";

import { DEMO_SPECIMENS, SPECIMEN_GAPS } from "./specimens-data.js";

export async function specimenDeck() {
  const schema = await deckSchema();
  const all = schema.definitions.slide.properties.type.enum;

  const byType = new Map();
  for (const t of all) {
    if (SPECIMEN_GAPS[t]) byType.set(t, { type: t, ...SPECIMEN_GAPS[t] });
  }
  for (const [t, slide] of Object.entries(DEMO_SPECIMENS)) {
    if (!byType.has(t)) byType.set(t, slide);
  }

  const slides = [];
  for (const t of all) {
    if (byType.has(t)) {
      slides.push(byType.get(t));
    } else {
      slides.push({ type: t, headline: t.replace(/-/g, " ") });
    }
  }

  return {
    title: "",
    theme: "warm-humanist",
    sections: ["Specimens"],
    slides,
  };
}

export async function specimenIndex() {
  const deck = await specimenDeck();
  const index = {};
  deck.slides.forEach((s, i) => { index[s.type] = i; });
  return index;
}

export function wrapSlide(slide, { theme, headline = "Preview" } = {}) {
  return {
    title: "Single slide preview",
    ...(theme ? { theme } : {}),
    sections: ["Preview"],
    slides: [{ type: slide.type, ...slide, headline: headline ?? slide.headline }],
  };
}

export { ROOT };
