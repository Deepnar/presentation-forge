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

import { chatJSON, DEFAULT_EXCERPT_CHARS } from "./ollama.js";
import { researchQuery } from "../search.js";

/**
 * The cap the LOCAL author's 32768 num_ctx window has headroom for. On the
 * cloud transport the author role's `excerpt_chars` override raises it; callers
 * that know the transport pass the resolved cap explicitly.
 */
export const RESEARCH_EXCERPT = DEFAULT_EXCERPT_CHARS;

/** Cap to the excerpt budget, ending on a line boundary when truncated. */
export function excerptResearch(text, cap = RESEARCH_EXCERPT) {
  if (!text) return "";
  if (text.length <= cap) return text;
  const cut = text.lastIndexOf("\n", cap);
  return text.slice(0, cut > 0 ? cut : cap);
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
  let userProvided = 0;

  const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  };
  const looksAcademic = (url) =>
    /\.(edu|ac\.|gov|int)\b|arxiv\.org|doi\.org|wikipedia\.org|ncbi|researchgate|scholar\.google/i.test(url ?? "");
  const looksListicle = (host) =>
    /^(medium\.com|substack\.com|quora\.com|reddit\.com|slideshare\.net|pinterest|buzzfeed|lifehacker|hubspot|wordpress\.com)$/.test(host ?? "");

  for (const s of list) {
    // A user-provided source is the upload-only mode's whole document — it has
    // no URL, so it must never be counted as a web domain or an academic find.
    if (String(s.kind).toLowerCase() === "user-provided") {
      userProvided++;
      continue;
    }
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
    userProvided,
    notesWords: String(notes ?? "").trim().split(/\s+/).filter(Boolean).length,
  };
}

/* ----------------------------------------------------- the deep research pass */

/** The five query angles the research role expands a brief into. Each produces
 *  a distinct search so the pass covers the keyword, scientific, practical,
 *  regional and data/counterpoint sides rather than one listicle's top hits. */
const ANGLES = [
  { key: "keywords", hint: "the core terms and synonyms people search for" },
  { key: "science", hint: "the mechanism or concept behind the topic" },
  { key: "practical", hint: "how it is applied or done in practice" },
  { key: "regional", hint: "the local/Indian context and its specifics" },
  { key: "data", hint: "statistics, figures, benchmarks, studies" },
  { key: "counterpoint", hint: "opposing views, limitations, controversies" },
];

/**
 * Expand one brief into 5-`max` angle queries: the 6 angles above, each a
 * concrete search term. Falls back to the brief alone when the model is
 * unavailable, so a dead model degrades depth, never the pass. `max` is the
 * per-transport budget — the cloud research profile opens it up.
 *
 * `briefing` is the verbatim `briefingAnsweredText` (thesis/audience/emphasis/
 * evidence) so queries can target the figures the plan will need. When present
 * it is appended to the user message but never replaces the brief.
 */
export async function expandQueries(brief, { chat, max = 8, briefing = "" } = {}) {
  const schema = {
    type: "object",
    required: ["queries"],
    properties: {
      queries: {
        type: "array",
        minItems: 5,
        maxItems: max,
        items: { type: "string", minLength: 3, maxLength: 140 },
      },
    },
  };
  try {
    const run = chat ?? chatJSON;
    const angleList = ANGLES.map((a) => `${a.key}: ${a.hint}`).join("\n");
    const userBlock = briefing?.trim()
      ? `TOPIC\n${brief}\n\nBRIEFING (use thesis/evidence to steer data queries)\n${briefing}`
      : `TOPIC\n${brief}`;
    const res = await run({
      role: "research",
      schema,
      messages: [
        {
          role: "system",
          content:
            "You turn one topic into 5-7 concrete web-search queries, one per angle:\n" +
            angleList +
            "\nQueries must be specific search terms (plain noun phrases, not questions). " +
            "Each must retrieve DIFFERENT material and be 3-8 words, never a single generic word and never the whole topic sentence verbatim. " +
            "Include the evidence figures (numbers, scheme names from the briefing) in at least one data-angle query so the notes will contain the figures the plan needs. Return {queries}.",
        },
        { role: "user", content: userBlock },
      ],
    });
    const queries = (res.data?.queries ?? []).filter((q) => typeof q === "string" && q.trim().length >= 3);
    const base = String(brief).split("\n")[0].trim().slice(0, 120);
    return [...new Set([base, ...queries])].slice(0, max);
  } catch {
    return [String(brief).trim().split("\n")[0].trim()];
  }
}

/**
 * The source-diversity guard: after a pass, check that the notes cover enough
 * distinct domains and an academic/authoritative voice. Returns the follow-up
 * queries for whatever is missing, or [] when the pass is diverse enough.
 */
export async function diversityFollowups(brief, sources, { chat, max = 2 } = {}) {
  const s = researchSummary(sources);
  const follows = [];
  if (s.distinctDomains < 3) follows.push(`${brief} different sources sites`);
  if (s.academicCount === 0) follows.push(`${brief} journal article research study`);
  if (s.listicleCount > s.academicCount && s.academicCount === 0) {
    follows.push(`${brief} .edu OR .ac.in academic source`);
  }
  return follows.slice(0, max);
}

/**
 * Gap-driven follow-up: ask the research role what an examiner for this
 * subject would expect a strong submission to cover, and search those gaps.
 * Returns 1-`max` concrete queries, or [] when the model is unavailable.
 */
export async function gapQueries(brief, notes, { chat, max = 3 } = {}) {
  const schema = {
    type: "object",
    required: ["gaps"],
    properties: {
      gaps: {
        type: "array",
        minItems: 1,
        maxItems: max,
        items: { type: "string", minLength: 3, maxLength: 140 },
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
            "You review a research-notes excerpt about a topic and find what is still MISSING " +
            "for a strong academic submission. Think like an examiner: what would they expect " +
            "to be covered? Return 1-3 concrete web-search queries for the missing material.",
        },
        { role: "user", content: `TOPIC\n${brief}\n\nNOTES EXCERPT\n${String(notes ?? "").slice(0, 3000)}` },
      ],
    });
    return (res.data?.gaps ?? []).filter((q) => typeof q === "string" && q.trim().length >= 3).slice(0, max);
  } catch {
    return [];
  }
}

/** Extract the evidence figures/phrases the briefing says must not be invented — numbers with units etc. */
function evidenceFacts(evidence) {
  const t = String(evidence ?? "");
  if (!t.trim()) return [];
  const parts = t.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
  const facts = [];
  for (const p of parts) {
    if (/\d/.test(p)) facts.push(p.slice(0, 90));
  }
  if (!facts.length && parts.length) return parts.slice(0, 2).map((s) => s.slice(0, 90));
  return facts.slice(0, 4);
}

/** Which evidence facts are absent from the accumulated notes (normalized). */
function missingFacts(facts, notes) {
  const norm = String(notes ?? "").toLowerCase().replace(/,/g, "");
  const out = [];
  for (const f of facts) {
    const key = f.toLowerCase().replace(/,/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    // Check for any token of the fact (numbers or scheme name) in notes
    const tokens = f.toLowerCase().split(/\s+/).filter((w) => /\d/.test(w) || w.length > 4);
    const hit = tokens.some((tok) => norm.includes(tok.toLowerCase().replace(/,/g, "")));
    if (!hit) out.push(f);
    else if (key && !norm.includes(key)) {
      // still consider missing if the exact phrase not found, but token hit is enough for now
    }
  }
  // Dedupe by first token
  return [...new Set(out)];
}

/**
 * Host diversity across the CORPUS, not just within one query.
 *
 * `search()` caps results per host at 2 and says why: "SearXNG happily returns
 * eight pages from one domain and a model given those will write a report
 * sourced entirely from one site." But that cap is PER QUERY, and a deep
 * research run makes eight of them plus follow-ups, absorbing into a corpus
 * deduped by URL alone — so the guard bought nothing at the level it was
 * written to protect. A real run came back three-tenths Wikipedia, including
 * the mineralogy article for a deck about solar cells.
 *
 * Overflow is kept rather than discarded. On a topic where one authority
 * genuinely holds the material, starving the corpus to enforce variety is the
 * worse failure, so the surplus goes back if too little else arrives.
 */
export function hostDiversifier(pages, seenUrl, { maxPerHost = 4, minCorpus = 6 } = {}) {
  const hostOf = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u); }
  };
  const hostCount = new Map();
  const overflow = [];

  const absorb = (batch) => {
    for (const item of batch ?? []) {
      if (!item?.ok || seenUrl.has(item.url)) continue;
      seenUrl.add(item.url);
      const host = hostOf(item.url);
      const seen = hostCount.get(host) ?? 0;
      if (seen >= maxPerHost) { overflow.push(item); continue; }
      hostCount.set(host, seen + 1);
      pages.push(item);
    }
  };

  /** Put the surplus back when the diverse corpus is too thin to write from. */
  const backfill = () => {
    while (pages.length < minCorpus && overflow.length) pages.push(overflow.shift());
  };

  return { absorb, backfill };
}

/**
 * The deep research pass: expand the brief into angle queries, run each at a
 * higher read budget than the single-shot `researchQuery`, then follow up on
 * the top sources, then close the two gaps the diversity guard finds (missing
 * domains / missing academic voice). The `profile` is the research role's
 * per-transport depth budget — the cloud override runs every stage deeper.
 * `briefing` is the verbatim briefingAnsweredText so evidence figures steer queries
 * and the post-pass can verify coverage. Returns the deduplicated accumulated pages.
 */
export async function deepResearch(brief, { onProgress, profile, briefing = "" } = {}) {
  const p = {
    per_query_limit: 8, per_query_read: 4,
    followup_sources: 3, followup_limit: 6, followup_read: 3,
    gap_max: 3, gap_limit: 5, gap_read: 3,
    ...(profile ?? {}),
  };
  const evidence = (() => {
    const m = String(briefing).match(/Evidence \/ constraints:\s*(.+)/i);
    return m ? m[1] : "";
  })();
  const facts = evidenceFacts(evidence);
  const queries = await expandQueries(brief, { max: profile?.angle_max ?? 8, briefing });
  const pages = [];
  const seenUrl = new Set();

  const { absorb, backfill } = hostDiversifier(pages, seenUrl, {
    maxPerHost: p.max_per_host,
    minCorpus: p.min_corpus,
  });

  for (const q of queries) {
    onProgress?.({ query: q });
    absorb((await researchQuery(q, { limit: p.per_query_limit, read: p.per_query_read })).pages);
  }

  // Follow up the top sources: the richest extracted pages, queried for the
  // material around them. Capped so a degenerate brief cannot spin forever.
  backfill();

  const top = [...pages]
    .sort((a, b) => (b.words ?? 0) - (a.words ?? 0))
    .slice(0, p.followup_sources);
  for (const s of top) {
    const q = String(s.title ?? "").trim().slice(0, 90);
    if (!q) continue;
    onProgress?.({ query: `↳ ${q}` });
    absorb((await researchQuery(q, { limit: p.followup_limit, read: p.followup_read })).pages);
  }

  // Diversity + examiner-gap follow-ups: if the pass is one-domain or has no
  // academic voice, run the targeted queries the guard returns.
  const sourceRecords = pages.map((page) => ({ url: page.url, title: page.title, words: page.words }));
  for (const q of await diversityFollowups(brief, sourceRecords, { max: p.diversity_max ?? 2 })) {
    onProgress?.({ query: `↳ ${q}` });
    absorb((await researchQuery(q, { limit: p.followup_limit, read: p.followup_read })).pages);
  }
  for (const q of await gapQueries(brief, pages.map((page) => page.text).join("\n\n").slice(0, 4000), { max: p.gap_max })) {
    onProgress?.({ query: `gap ↳ ${q}` });
    absorb((await researchQuery(q, { limit: p.gap_limit, read: p.gap_read })).pages);
  }

  // Evidence-coverage post-pass: if the briefing named figures that the notes still lack,
  // re-query specifically for them — this is what makes "the notes contain the figures the plan will need" true.
  if (facts.length) {
    const notesSoFar = pages.map((page) => page.text).join("\n\n");
    const missing = missingFacts(facts, notesSoFar);
    for (const f of missing.slice(0, 3)) {
      const q = `${f} ${String(brief).split("\n")[0].slice(0, 50)}`.slice(0, 120);
      onProgress?.({ query: `evidence ↳ ${q}` });
      absorb((await researchQuery(q, { limit: p.gap_limit, read: p.gap_read })).pages);
    }
  }

  // Last chance to put the surplus back: the gap queries may have added little.
  backfill();

  return { query: brief, pages };
}
