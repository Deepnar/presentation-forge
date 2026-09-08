import { chatJSON, authorTransport } from "./ollama.js";
import { runTurn } from "./turn.js";
import { loadTheme } from "../theme.js";
import { validateDeck } from "../validate.js";

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

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "from",
  "by", "as", "at", "is", "are", "be", "its", "their", "this", "that", "these",
  "our", "your", "it", "we", "can", "will", "must", "how", "why", "what", "not",
]);

function stem(w) {
  for (const suffix of ["ations", "ation", "ements", "ement", "ingly", "edly", "ing", "ies", "ied", "ed", "es", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, w.length - suffix.length);
      break;
    }
  }
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

const DECK_LEVEL = new Set(["title", "agenda"]);

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

export function repetitionFindings(deck) {
  const slides = deck?.slides ?? [];
  const said = (i) => slides[i]?.headline ?? slides[i]?.quote ?? slides[i]?.title ?? "";
  return nearDuplicateHeadlines(slides).flatMap((group) => {
    const keep = group[0];
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

export async function coherenceFindings({ deck, sections = [], model, signal, chat = chatJSON }) {
  const reviewed = await coherenceReview({ deck, sections, model, signal, chat });
  const seen = new Set(reviewed.map((f) => f.index));
  return [...reviewed, ...repetitionFindings(deck).filter((f) => !seen.has(f.index))];
}

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
