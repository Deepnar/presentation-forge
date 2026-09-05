import { chatJSON, authorTransport } from "./ollama.js";
import { runTurn } from "./turn.js";
import { loadTheme } from "../theme.js";
import { validateDeck } from "../validate.js";

/**
 * The coherence pass — the post-generation check that every slide serves the
 * deck's topic AND is presenter-ready.
 *
 * Three failure modes, all real:
 *
 * 1. TOPICAL DRIFT — a slide whose content is grounded in the research but
 *    disconnected from the deck's argument (a flight-attendant demographics
 *    chart inside a first-impressions deck). The data is real; the slide does
 *    not earn its place.
 * 2. DATA WITHOUT A POINT — a slide that lands a statistic with no framing,
 *    so the presenter cannot voice the "so what" without improvising.
 * 3. REPETITION — two or three slides making the same point in different
 *    words. Slides 18, 21 and 22 of one real deck each said a version of
 *    "Scaling V2G Requires Cross-Sector Collaboration" and nothing caught it,
 *    because the reviewer was only ever asked about 1 and 2. Repetition is
 *    also the one of the three a MODEL is worst at: judging whether two
 *    headlines say the same thing means holding the whole deck in view at
 *    once, and the reviewer sees a digest. So it is computed rather than
 *    asked about — see `nearDuplicateHeadlines` — and the findings are merged
 *    with the reviewer's own.
 *
 * The check is one bounded review call: the deck's title, sections and each
 * slide's headline + content against a tiny findings schema (the critic's
 * lesson — small grammars only). Flagged slides are then rewritten through
 * `runTurn` with a per-slide instruction naming the exact fix, so the rewrite
 * goes through the same validation/repair loop as every other edit.
 *
 * It runs after generation (generateFromPlan) and after a density sweep — the
 * two places a deck's content is written wholesale. The report generator is
 * coherent by construction (same plan, same research), so the pass targets
 * the deck; both artefacts share the research the writer is told to stay on.
 */

const MAX_ROUNDS = 2;

const findingsSchema = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        required: ["index", "kind", "detail"],
        properties: {
          index: { type: "integer", description: "0-based slide index" },
          kind: { type: "string", enum: ["topic", "framing", "repetition"] },
          detail: { type: "string", maxLength: 220, description: "Why this slide fails the coherence check" },
          fix: { type: "string", maxLength: 220, description: "How to rewrite it so it serves the deck's argument" },
        },
      },
    },
  },
};

/**
 * Content words of a headline, crudely stemmed, for comparing what two slides
 * SAY rather than how they spell it.
 *
 * Both halves earn their place on the real case. "Scaling V2G Requires
 * Cross-Sector Collaboration" against "Cross-Sector Collaboration Is Required
 * To Scale V2G" shares only three raw tokens of seven — under any threshold
 * worth setting — because `scaling`/`scale` and `requires`/`required` are
 * different strings, and `cross-sector` is one token in one and two in the
 * other. Split the hyphens and strip the suffixes and the two are the same
 * set.
 *
 * The stemmer is deliberately small. It is comparing two headlines from the
 * same deck about the same topic, so it needs to survive inflection, not to
 * be linguistically right.
 */
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "from",
  "by", "as", "at", "is", "are", "be", "its", "their", "this", "that", "these",
  "our", "your", "it", "we", "can", "will", "must", "how", "why", "what", "not",
]);

function stem(w) {
  // Longest suffix first, stripped whole — a partial strip is how `requires`
  // and `required` end up as different stems, which is the pair the real case
  // turned on.
  for (const suffix of ["ations", "ation", "ements", "ement", "ingly", "edly", "ing", "ies", "ied", "ed", "es", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, w.length - suffix.length);
      break;
    }
  }
  // `scale`/`scaling` and `study`/`studies` only meet after this.
  return w.length > 3 ? w.replace(/[ey]$/, "") : w;
}

function headWords(text) {
  const words = String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return new Set(words.filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
}

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

/**
 * Slides whose headlines say the same thing.
 *
 * Deterministic on purpose. A reviewer model reading a digest is asked to
 * notice that slide 18 and slide 22 are the same point in different words,
 * fourteen slides apart — which is exactly the comparison a bounded prompt is
 * worst at, and it demonstrably missed on a real deck. Content-word overlap
 * finds it in a loop, costs nothing, and cannot be talked out of it.
 *
 * Dividers are COMPARED but never reported — which is the distinction the real
 * case turned on. Slide 18 of the V2G deck is a section divider reading
 * "Scaling V2G Requires Cross-Sector Collaboration" and slide 21 is a
 * `framework` with the identical headline. Excluding dividers from the
 * comparison entirely, which is the obvious way to protect structure, hides
 * exactly that: a content slide restating its own section's title adds
 * nothing, and it is the content slide that is wrong, not the divider.
 *
 * Only the deck-level slides are left out — a title and an agenda name the
 * whole deck, so of course they resemble its parts.
 *
 * Returns one group per cluster, each a list of slide indices, first occurrence
 * first — the first is the one to keep.
 */
const DECK_LEVEL = new Set(["title", "agenda"]);

/** Structure. Compared, so a content slide echoing one is caught; never
 *  rewritten, because announcing the next part is its whole job. */
export const STRUCTURAL_TYPES = new Set(["section", "chapter", "closing", "epigraph"]);

export function nearDuplicateHeadlines(slides = [], { threshold = 0.6 } = {}) {
  const heads = slides.map((s, i) => ({
    i,
    words: DECK_LEVEL.has(s?.type) ? new Set() : headWords(s?.headline ?? s?.quote ?? s?.title),
  })).filter((h) => h.words.size >= 2);

  const groups = [];
  const claimed = new Set();
  for (let a = 0; a < heads.length; a++) {
    if (claimed.has(heads[a].i)) continue;
    const group = [heads[a].i];
    for (let b = a + 1; b < heads.length; b++) {
      if (claimed.has(heads[b].i)) continue;
      if (jaccard(heads[a].words, heads[b].words) >= threshold) {
        group.push(heads[b].i);
        claimed.add(heads[b].i);
      }
    }
    if (group.length > 1) {
      claimed.add(heads[a].i);
      groups.push(group);
    }
  }
  return groups;
}

/** The repetition findings for a deck, in the reviewer's own finding shape so
 *  the rewrite step cannot tell them apart. */
export function repetitionFindings(deck) {
  const slides = deck?.slides ?? [];
  const said = (i) => slides[i]?.headline ?? slides[i]?.quote ?? slides[i]?.title ?? "";
  return nearDuplicateHeadlines(slides).flatMap((group) => {
    const keep = group[0];
    // The first stands; every later echo is rewritten. Rewriting all of them
    // would leave the point unmade. Structure is never rewritten — a section
    // divider announcing its part is doing its job, so a group of nothing but
    // dividers produces no findings at all.
    return group.slice(1)
      .filter((i) => !STRUCTURAL_TYPES.has(slides[i]?.type))
      .map((i) => ({
      index: i,
      kind: "repetition",
      detail: `"${said(i)}" repeats slide ${keep + 1}, "${said(keep)}"`,
      fix: `Make a different point from slide ${keep + 1} — advance the argument rather than restating it, and keep the headline's claim distinct.`,
    }));
  });
}

/** A compact per-slide digest for the reviewer: index, type, headline, content. */
export function digestSlide(slide, i) {
  const head = slide.headline ?? slide.quote ?? slide.title ?? slide.type;
  const body = [];
  if (Array.isArray(slide.bullets)) body.push(`bullets: ${slide.bullets.slice(0, 3).join(" | ")}`);
  if (Array.isArray(slide.items)) body.push(`items: ${slide.items.map((x) => (typeof x === "string" ? x : x.title ?? x.label ?? x.text ?? "")).slice(0, 3).join(" | ")}`);
  if (Array.isArray(slide.cards)) body.push(`cards: ${slide.cards.map((c) => c.title ?? c.headline ?? "").slice(0, 3).join(" | ")}`);
  if (Array.isArray(slide.events)) body.push(`events: ${slide.events.map((e) => `${e.when ?? ""} ${e.what ?? ""}`).slice(0, 3).join(" | ")}`);
  if (slide.quote) body.push(`quote: ${slide.quote}`);
  if (slide.body) body.push(`body: ${Array.isArray(slide.body) ? slide.body.join(" ") : slide.body}`);
  if (Array.isArray(slide.stats)) body.push(`stats: ${slide.stats.map((s) => `${s.value} ${s.label}`).slice(0, 3).join(" | ")}`);
  return `[${i}] ${slide.type} "${head}"${body.length ? ` — ${body.join(" · ")}` : ""}`;
}

function reviewPrompt(deck, sections) {
  const slides = deck.slides.map(digestSlide).join("\n");
  return [
    "You are the coherence reviewer for a presentation deck. The deck must tell ONE story,",
    "and every slide must serve it.",
    "",
    `DECK TITLE: ${deck.title ?? "(untitled)"}`,
    sections?.length ? `SECTIONS: ${sections.map((s, i) => `${i}=${s}`).join(", ")}` : "",
    "",
    "For each slide, ask two questions:",
    "1. TOPIC: does the headline AND the content clearly serve the deck's central topic",
    "   and this section? A slide that drifts — however well-researched — is a failure.",
    "2. FRAMING: is the slide presenter-ready? The headline should be the CLAIM, the",
    "   body the SUPPORT, and there must be an implied 'so what' the presenter can voice.",
    "   A statistic with no link to the section's point (data without an argument) is a failure.",
    "",
    "Flag ONLY slides that genuinely fail. A clean slide is not a finding.",
    "",
    `SLIDES\n${slides}`,
  ].join("\n");
}

export function buildFixInstruction(findings, sections) {
  const lines = findings.map((f) => {
    const sec = sections && f.section != null ? ` (section: ${sections[f.section]})` : "";
    return (
      `- Slide ${f.index + 1}${sec}: ${
        f.kind === "topic" ? "topically disconnected"
          : f.kind === "repetition" ? "repeats another slide"
            : "data without a point"} — ${f.detail}.` +
      (f.fix ? ` Fix: ${f.fix}.` : "")
    );
  });
  return (
    "The coherence reviewer found slides that do not serve this deck's argument. " +
    "Rewrite EACH flagged slide so it clearly serves the deck's central topic: tie its " +
    "content back to the deck's argument (re-frame the headline as a claim, make the " +
    "'so what' explicit), or replace the content with something that serves the deck. " +
    "A slide marked as repeating another must make a DIFFERENT point, not the same one " +
    "reworded — if the deck has nothing further to say there, say the next thing in the " +
    "argument instead. " +
    "Keep each slide's type and presenter. Every figure must still come from the research.\n" +
    lines.join("\n")
  );
}

/**
 * Review a deck for coherence against its topic and sections. Returns the
 * findings (slide-index-keyed) or an empty list. Pure model call — never
 * throws on a bad response; a reviewer that fails to answer is treated as
 * finding nothing rather than blocking the pipeline.
 */
export async function coherenceReview({ deck, sections = [], model, signal, chat = chatJSON }) {
  try {
    const res = await chat({
      role: "author",
      model,
      signal,
      schema: findingsSchema,
      messages: [
        { role: "system", content: reviewPrompt(deck, sections) },
        { role: "user", content: "Review the deck's coherence." },
      ],
    });
    return (res.data?.findings ?? []).filter((f) => Number.isInteger(f.index));
  } catch {
    return [];
  }
}

/**
 * Everything wrong with the deck's coherence: what the reviewer found, plus
 * the repetition it is not asked about. A slide the reviewer already flagged
 * is not flagged twice — one instruction per slide, or the rewrite is told two
 * different things about the same slide in the same breath.
 */
export async function coherenceFindings({ deck, sections = [], model, signal, chat = chatJSON }) {
  const reviewed = await coherenceReview({ deck, sections, model, signal, chat });
  const seen = new Set(reviewed.map((f) => f.index));
  return [...reviewed, ...repetitionFindings(deck).filter((f) => !seen.has(f.index))];
}

/**
 * The full coherence pass: review, then rewrite every flagged slide through
 * runTurn, capped at two rounds like the critic. Returns the final deck, the
 * findings and the problems list. A deck with no findings is returned
 * unchanged with zero problems.
 */
export async function coherencePass({
  deck, sections = [], model, signal, onProgress, chat = chatJSON,
}) {
  let current = deck;
  const problems = [];
  const allFindings = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    onProgress?.({ status: "coherence", round });
    const findings = await coherenceFindings({ deck: current, sections, model, signal, chat });
    if (!findings.length) return { deck: current, findings: allFindings, problems };
    allFindings.push(...findings);

    onProgress?.({ status: "coherence_fixing", count: findings.length });
    const themeObj = current.theme ? await loadTheme(current.theme) : undefined;
    const turn = await runTurn({
      deck: current,
      instruction: buildFixInstruction(findings, sections),
      theme: themeObj,
      model,
      signal,
      chat,
    });
    if (!turn.ok) {
      problems.push(`coherence: ${(turn.errors ?? []).slice(0, 3).join("; ")}`);
      return { deck: current, findings: allFindings, problems };
    }
    const { ok, errors } = await validateDeck(turn.deck);
    if (!ok) {
      problems.push(`coherence: rewrite failed validation — ${(errors ?? []).slice(0, 3).join("; ")}`);
      return { deck: current, findings: allFindings, problems };
    }
    current = turn.deck;
  }

  return { deck: current, findings: allFindings, problems };
}
