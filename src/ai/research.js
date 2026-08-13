/**
 * The model-facing research excerpt.
 *
 * The research artefact (decks/<slug>/research/notes.md) is first-class and
 * kept whole on disk; the model only ever sees a bounded excerpt of it. A
 * research pass can easily outgrow the author role's context window — 138 KB
 * of notes is ~40K tokens against a 32K num_ctx — and when the prompt
 * overflows, Ollama truncates and the model degrades to token loops or a
 * one-token reply. Capping well under the window keeps every prompt, schema
 * and output inside it.
 *
 * Every consumer (deck planning, slide writing, chat turns, report section
 * writing) reads research through this so the whole pipeline shares one
 * budget and one failure mode to think about.
 */

import { chatJSON } from "./ollama.js";
import { researchQuery } from "../search.js";

export const RESEARCH_EXCERPT = 80_000;

/** Cap to the excerpt budget, ending on a line boundary when truncated. */
export function excerptResearch(text) {
  if (!text) return "";
  if (text.length <= RESEARCH_EXCERPT) return text;
  const cut = text.lastIndexOf("\n", RESEARCH_EXCERPT);
  return text.slice(0, cut > 0 ? cut : RESEARCH_EXCERPT);
}

/**
 * The trust surface for the Research view: how many sources, how many distinct
 * domains, which look academic/authoritative vs listicle, and which sources
 * carry the single-source claims the grounding pass flagged. Built from
 * sources.json so the CLI can produce it too, not just the UI.
 */
export function researchSummary(sources = [], notes = "") {
  const list = Array.isArray(sources) ? sources : [];
  const domains = new Set();
  const academic = [];
  const listicle = [];
  let paperCount = 0;

  const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  };
  const looksAcademic = (url) =>
    /\.(edu|ac\.|gov|int)\b|arxiv\.org|doi\.org|wikipedia\.org|ncbi|researchgate|scholar\.google/i.test(url ?? "");
  const looksListicle = (host) =>
    /^(medium\.com|substack\.com|quora\.com|reddit\.com|slideshare\.net|pinterest|buzzfeed|lifehacker|hubspot|wordpress\.com)$/.test(host ?? "");

  for (const s of list) {
    const host = hostOf(s.url);
    if (host) domains.add(host);
    if (String(s.kind).toLowerCase() === "paper" || /arxiv\.org|doi\.org/.test(s.url ?? "")) {
      paperCount++;
      academic.push(s);
    } else if (looksAcademic(s.url)) {
      academic.push(s);
    } else if (looksListicle(host)) {
      listicle.push(s);
    }
  }

  // Single-source claims: the grounding pass writes `[grounding] …` lines into
  // the slide notes, not into notes.md, so the closest proxy in the research
  // view is noting how many sources each domain contributes and which are
  // alone. A domain appearing once is a single-source bullet point.
  const domainCount = {};
  for (const d of domains) domainCount[d] = 0;
  for (const s of list) {
    const host = hostOf(s.url);
    if (host) domainCount[host] = (domainCount[host] ?? 0) + 1;
  }
  const singleSourceDomains = Object.entries(domainCount).filter(([, n]) => n === 1).map(([d]) => d);

  return {
    total: list.length,
    domains: [...domains],
    distinctDomains: domains.size,
    academicCount: academic.length,
    listicleCount: listicle.length,
    paperCount,
    academic,
    listicle,
    singleSourceDomains,
    notesWords: String(notes ?? "").trim().split(/\s+/).filter(Boolean).length,
  };
}

/* ----------------------------------------------------- the deep research pass */

/**
 * Expand one brief into the 2..4 queries a deep pass runs. A tiny schema on the
 * research role (the query-formulation model) splits the topic into subtopics —
 * "ray tracing" → the rasterisation pipeline, GPU hardware, industrial usage.
 * Falls back to the brief alone when the model is unavailable, so a dead Ollama
 * degrades depth, never the pass.
 */
export async function expandQueries(brief, { chat } = {}) {
  const schema = {
    type: "object",
    required: ["queries"],
    properties: {
      queries: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string", minLength: 3, maxLength: 120 },
      },
    },
  };
  try {
    const run = chat ?? chatJSON;
    const res = await run({
      role: "research",
      schema,
      messages: [
        {
          role: "system",
          content:
            "You split one topic into 2-4 concrete web-search queries covering its distinct " +
            "subtopics. Queries must be specific search terms, not questions — plain noun " +
            "phrases. Each should retrieve different material. Return {queries}.",
        },
        { role: "user", content: `TOPIC\n${brief}` },
      ],
    });
    const queries = (res.data?.queries ?? []).filter((q) => typeof q === "string" && q.trim().length >= 3);
    return [String(brief).trim(), ...queries].slice(0, 4);
  } catch {
    return [String(brief).trim()];
  }
}

/**
 * The deep research pass: expand the brief into several queries, run each at a
 * higher read budget than the single-shot `researchQuery`, then follow up each
 * of the top extracted sources with a query of its own. Returns the deduplicated
 * accumulated pages — the whole point is that a deck (and its report) draw from
 * several sources per subtopic rather than one search's top five.
 */
export async function deepResearch(brief, { onProgress } = {}) {
  const queries = await expandQueries(brief);
  const pages = [];
  const seenUrl = new Set();

  const absorb = (batch) => {
    for (const p of batch) {
      if (p.ok && !seenUrl.has(p.url)) {
        seenUrl.add(p.url);
        pages.push(p);
      }
    }
  };

  for (const q of queries) {
    onProgress?.({ query: q });
    absorb((await researchQuery(q, { limit: 10, read: 6 })).pages);
  }

  // Follow up the top sources: the richest extracted pages, queried for the
  // material around them. Capped so a degenerate brief cannot spin forever.
  const top = [...pages]
    .sort((a, b) => (b.words ?? 0) - (a.words ?? 0))
    .slice(0, 3);
  for (const s of top) {
    const q = String(s.title ?? "").trim().slice(0, 90);
    if (!q) continue;
    onProgress?.({ query: `↳ ${q}` });
    absorb((await researchQuery(q, { limit: 6, read: 3 })).pages);
  }

  return { query: brief, pages };
}
