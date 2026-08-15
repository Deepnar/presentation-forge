import { chatJSON, authorTransport } from "./ollama.js";
import { runTurn } from "./turn.js";
import { loadTheme } from "../theme.js";
import { validateDeck } from "../validate.js";

/**
 * The coherence pass — the post-generation check that every slide serves the
 * deck's topic AND is presenter-ready.
 *
 * Two failure modes, both real:
 *
 * 1. TOPICAL DRIFT — a slide whose content is grounded in the research but
 *    disconnected from the deck's argument (a flight-attendant demographics
 *    chart inside a first-impressions deck). The data is real; the slide does
 *    not earn its place.
 * 2. DATA WITHOUT A POINT — a slide that lands a statistic with no framing,
 *    so the presenter cannot voice the "so what" without improvising.
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
          kind: { type: "string", enum: ["topic", "framing"] },
          detail: { type: "string", maxLength: 220, description: "Why this slide fails the coherence check" },
          fix: { type: "string", maxLength: 220, description: "How to rewrite it so it serves the deck's argument" },
        },
      },
    },
  },
};

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
      `- Slide ${f.index + 1}${sec}: ${f.kind === "topic"
        ? "topically disconnected"
        : "data without a point"} — ${f.detail}.` +
      (f.fix ? ` Fix: ${f.fix}.` : "")
    );
  });
  return (
    "The coherence reviewer found slides that do not serve this deck's argument. " +
    "Rewrite EACH flagged slide so it clearly serves the deck's central topic: tie its " +
    "content back to the deck's argument (re-frame the headline as a claim, make the " +
    "'so what' explicit), or replace the content with something that serves the deck. " +
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
    const findings = await coherenceReview({ deck: current, sections, model, signal, chat });
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
