import { analyzeQuality } from "./ai/quality.js";
import { groundDeck } from "./ai/grounding.js";
import { placeholderSlides } from "./placeholders.js";
import { themeMatrix } from "./themematrix.js";

const WEIGHTS = {
  intact: 0.30,      // nothing is a placeholder, nothing structural is missing
  fits: 0.25,        // the text seats in every theme it could be switched to
  grounded: 0.20,    // figures on slides trace to the research
  varied: 0.15,      // the deck is not eight of the same slide
  whole: 0.10,       // no field was cut mid-sentence by the grammar
};

const LABEL_FIELDS = new Set([
  "headline", "title", "subtitle", "standfirst", "label", "value", "name",
  "cta", "eyebrow", "caption", "tag", "unit", "quote", "author", "role", "term",
]);

function proseFields(slide) {
  const out = [];
  const walk = (node, key) => {
    if (typeof node === "string") {
      if (!LABEL_FIELDS.has(key)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v) => walk(v, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "type" || k === "section" || k === "presenter" || k === "cites") continue;
        walk(v, k);
      }
    }
  };
  walk(slide, null);
  return out;
}

function looksTruncated(text) {
  const t = String(text ?? "").trim();
  if (t.length < 60) return false;                       // labels are short
  if (/[.!?…:;)"'’”]$/.test(t)) return false;  // ended deliberately
  return /\s/.test(t);
}

export async function scoreDeck(deck, { research = "", deckDir = null } = {}) {
  const slides = deck?.slides ?? [];
  const components = {};
  const findings = [];

  const placeholders = placeholderSlides(deck);
  const emptyHeadlines = slides
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => !s.headline && !["title", "closing", "before-after", "quote", "epigraph"].includes(s.type));
  const noSection = slides.filter((s) => s.section == null).length;
  const intactPenalty = (placeholders.length * 2 + emptyHeadlines.length + noSection * 0.5) / Math.max(1, slides.length);
  components.intact = Math.max(0, 1 - intactPenalty);
  for (const p of placeholders) findings.push(`slide ${p.index + 1}: placeholder was never rewritten`);
  if (noSection) findings.push(`${noSection} slide(s) carry no section — the chrome eyebrow draws no label`);

  let fitFailures = 0;
  try {
    const sweep = await themeMatrix({ deck, deckDir });
    fitFailures = sweep.total;
    components.fits = Math.max(0, 1 - fitFailures / Math.max(1, slides.length));
    if (fitFailures) findings.push(`${fitFailures} text element(s) below the readable floor across the 34 themes`);
  } catch {
    components.fits = null; // cannot render here; do not invent a number
  }

  if (research.trim()) {
    const g = groundDeck(structuredClone(deck), research);
    const ungrounded = (g.problems ?? []).length;
    components.grounded = Math.max(0, 1 - ungrounded / Math.max(1, slides.length));
    for (const p of (g.problems ?? []).slice(0, 5)) findings.push(p);
  } else {
    components.grounded = null;
  }

  const quality = analyzeQuality(deck, research);
  const VARIETY_KINDS = new Set(["monotony", "data_unused"]);
  const variety = quality.filter((q) => VARIETY_KINDS.has(q.kind));
  components.varied = Math.max(0, 1 - variety.length * 0.25);
  for (const q of quality) findings.push(`${q.kind}: ${q.detail}`);

  const shapeBroken = quality.filter((q) => q.kind === "chart_shape").length;
  if (shapeBroken) {
    components.intact = Math.max(0, components.intact - shapeBroken / Math.max(1, slides.length));
  }

  let truncated = 0;
  let fields = 0;
  for (const slide of slides) {
    for (const text of proseFields(slide)) {
      fields++;
      if (looksTruncated(text)) {
        truncated++;
        if (truncated <= 3) findings.push(`a field ends mid-sentence: "…${String(text).slice(-48)}"`);
      }
    }
  }
  components.whole = fields ? Math.max(0, 1 - truncated / fields * 4) : 1;

  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (components[k] == null) continue;
    total += components[k] * w;
    weight += w;
  }
  const score = weight ? Math.round((total / weight) * 100) : null;

  return {
    score,
    components,
    findings,
    counts: { slides: slides.length, placeholders: placeholders.length, fitFailures, truncated, fields },
  };
}
