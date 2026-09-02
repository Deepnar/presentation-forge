import { analyzeQuality } from "./ai/quality.js";
import { groundDeck } from "./ai/grounding.js";
import { placeholderSlides } from "./placeholders.js";
import { themeMatrix } from "./themematrix.js";

/**
 * A deterministic score for a generated deck.
 *
 * The gap this fills is stated plainly: every content question about this
 * product — does the deck argue anything, is the research any good — is
 * answered by reading it, on the gateway, by a person. That is right and it
 * does not scale, so it happens rarely and nothing accumulates between times.
 *
 * This measures the part that CAN be measured without a model and without an
 * opinion, and returns one comparable number so two runs can be set beside each
 * other: the same brief on Auto and on local, a deck before and after a prompt
 * change, this week's output against last month's.
 *
 * What it deliberately does NOT claim: that a high score is a good deck. Every
 * component here is necessary and none is sufficient. A deck can score 100 and
 * say nothing worth hearing. It exists so that a deck which is BROKEN in a way
 * somebody already found once cannot quietly come back.
 *
 * Each component is 0..1 and carries its own findings, so a fallen score always
 * names what fell.
 */

const WEIGHTS = {
  intact: 0.30,      // nothing is a placeholder, nothing structural is missing
  fits: 0.25,        // the text seats in every theme it could be switched to
  grounded: 0.20,    // figures on slides trace to the research
  varied: 0.15,      // the deck is not eight of the same slide
  whole: 0.10,       // no field was cut mid-sentence by the grammar
};

/**
 * Field names that hold a LABEL rather than prose. A headline, a stat value or
 * a CTA is a noun phrase and ends without a full stop by design, so measuring
 * it for mid-sentence truncation reports every deck as broken — the first run
 * of this scorer scored `whole` at 0% because it counted the deck's own title.
 */
const LABEL_FIELDS = new Set([
  "headline", "title", "subtitle", "standfirst", "label", "value", "name",
  "cta", "eyebrow", "caption", "tag", "unit", "quote", "author", "role", "term",
]);

/** The prose a reader actually reads: bodies, notes and list items. */
function proseFields(slide) {
  const out = [];
  const walk = (node, key) => {
    if (typeof node === "string") {
      if (!LABEL_FIELDS.has(key)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      // An array's items inherit their array's name: `bullets` holds prose,
      // `points` holds prose, and a list of labels is still labels.
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

/** A string that stops without terminal punctuation and is long enough that it
 *  was prose rather than a label — the shape a grammar cut leaves behind. */
function looksTruncated(text) {
  const t = String(text ?? "").trim();
  if (t.length < 60) return false;                       // labels are short
  if (/[.!?…:;)"'’”]$/.test(t)) return false;  // ended deliberately
  return /\s/.test(t);
}

/**
 * Score one deck. `research` enables the grounding component; without it that
 * component is skipped and its weight is redistributed, so a deck written from
 * an upload is not punished for having no notes.md.
 */
export async function scoreDeck(deck, { research = "", deckDir = null } = {}) {
  const slides = deck?.slides ?? [];
  const components = {};
  const findings = [];

  // 1. Intact — placeholders and empty structure are the loudest failure.
  const placeholders = placeholderSlides(deck);
  const emptyHeadlines = slides
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => !s.headline && !["title", "closing", "before-after", "quote", "epigraph"].includes(s.type));
  const noSection = slides.filter((s) => s.section == null).length;
  const intactPenalty = (placeholders.length * 2 + emptyHeadlines.length + noSection * 0.5) / Math.max(1, slides.length);
  components.intact = Math.max(0, 1 - intactPenalty);
  for (const p of placeholders) findings.push(`slide ${p.index + 1}: placeholder was never rewritten`);
  if (noSection) findings.push(`${noSection} slide(s) carry no section — the chrome eyebrow draws no label`);

  // 2. Fits — across every theme, because the theme picker re-renders this deck.
  let fitFailures = 0;
  try {
    const sweep = await themeMatrix({ deck, deckDir });
    fitFailures = sweep.total;
    components.fits = Math.max(0, 1 - fitFailures / Math.max(1, slides.length));
    if (fitFailures) findings.push(`${fitFailures} text element(s) below the readable floor across the 34 themes`);
  } catch {
    components.fits = null; // cannot render here; do not invent a number
  }

  // 3. Grounded — every figure on a slide traceable to the notes.
  if (research.trim()) {
    const g = groundDeck(structuredClone(deck), research);
    const ungrounded = (g.problems ?? []).length;
    components.grounded = Math.max(0, 1 - ungrounded / Math.max(1, slides.length));
    for (const p of (g.problems ?? []).slice(0, 5)) findings.push(p);
  } else {
    components.grounded = null;
  }

  // 4. Varied — the existing monotony and data-blindness checks.
  const quality = analyzeQuality(deck, research);
  components.varied = Math.max(0, 1 - quality.length * 0.25);
  for (const q of quality) findings.push(`${q.kind}: ${q.detail}`);

  // 5. Whole — no field stopped mid-sentence.
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

  // Weighted over the components that could actually be measured.
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
