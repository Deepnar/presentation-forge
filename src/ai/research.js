
import { chatJSON, DEFAULT_EXCERPT_CHARS } from "./ollama.js";
import { researchQuery } from "../search.js";

export const RESEARCH_EXCERPT = DEFAULT_EXCERPT_CHARS;

export function excerptResearch(text, cap = RESEARCH_EXCERPT) {
  if (!text) return "";
  if (text.length <= cap) return text;
  const cut = text.lastIndexOf("\n", cap);
  return text.slice(0, cut > 0 ? cut : cap);
}

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

const ANGLES = [
  { key: "keywords", hint: "the core terms and synonyms people search for" },
  { key: "science", hint: "the mechanism or concept behind the topic" },
  { key: "practical", hint: "how it is applied or done in practice" },
  { key: "regional", hint: "the local/Indian context and its specifics" },
  { key: "data", hint: "statistics, figures, benchmarks, studies" },
  { key: "counterpoint", hint: "opposing views, limitations, controversies" },
];

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

function missingFacts(facts, notes) {
  const norm = String(notes ?? "").toLowerCase().replace(/,/g, "");
  const out = [];
  for (const f of facts) {
    const key = f.toLowerCase().replace(/,/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
    const tokens = f.toLowerCase().split(/\s+/).filter((w) => /\d/.test(w) || w.length > 4);
    const hit = tokens.some((tok) => norm.includes(tok.toLowerCase().replace(/,/g, "")));
    if (!hit) out.push(f);
    else if (key && !norm.includes(key)) {
    }
  }
  return [...new Set(out)];
}

const TOPIC_STOP = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "their", "there",
  "what", "when", "which", "while", "about", "after", "before", "between",
  "road", "scale", "case", "study", "using", "used", "based", "toward", "towards",
  "new", "more", "most", "than", "then", "such", "also", "over", "under", "your",
]);

export function topicTerms(brief) {
  const out = new Set();
  for (const w of String(brief).toLowerCase().replace(/[^\p{L}\p{N}\s-]+/gu, " ").split(/\s+/)) {
    if (w.length >= 4 && !TOPIC_STOP.has(w)) out.add(w);
  }
  return [...out];
}

export function topicalDensity(text, terms) {
  if (!terms.length) return Infinity; // nothing to judge against: judge nothing
  const { hits, words } = topicalHits(text, terms);
  if (!words) return 0;
  return (hits / words) * 1000;
}

export function topicalHits(text, terms) {
  const lower = String(text ?? "").toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean).length;
  let hits = 0;
  for (const t of terms) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
    hits += (lower.match(re) ?? []).length;
  }
  return { hits, words };
}

export const RELEVANCE_FLOOR = 4.0;

export const RELEVANCE_MIN_HITS = 2;

export function hostDiversifier(pages, seenUrl, { maxPerHost = 4, minCorpus = 6, terms = [] } = {}) {
  const hostOf = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u); }
  };
  const hostCount = new Map();
  const overflow = [];

  const offtopic = [];

  const absorb = (batch) => {
    for (const item of batch ?? []) {
      if (!item?.ok || seenUrl.has(item.url)) continue;
      seenUrl.add(item.url);
      if (terms.length) {
        const { hits, words } = topicalHits(item.text, terms);
        const density = words ? (hits / words) * 1000 : 0;
        if (density < RELEVANCE_FLOOR || hits < RELEVANCE_MIN_HITS) {
          offtopic.push({ url: item.url, density, hits });
          continue;
        }
      }
      const host = hostOf(item.url);
      const seen = hostCount.get(host) ?? 0;
      if (seen >= maxPerHost) { overflow.push(item); continue; }
      hostCount.set(host, seen + 1);
      pages.push(item);
    }
  };

  const backfill = () => {
    while (pages.length < minCorpus && overflow.length) pages.push(overflow.shift());
  };

  return { absorb, backfill, offtopic };
}

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

  const { absorb, backfill, offtopic } = hostDiversifier(pages, seenUrl, {
    maxPerHost: p.max_per_host,
    minCorpus: p.min_corpus,
    terms: topicTerms(brief),
  });

  for (const q of queries) {
    onProgress?.({ query: q });
    absorb((await researchQuery(q, { limit: p.per_query_limit, read: p.per_query_read })).pages);
  }

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

  const sourceRecords = pages.map((page) => ({ url: page.url, title: page.title, words: page.words }));
  for (const q of await diversityFollowups(brief, sourceRecords, { max: p.diversity_max ?? 2 })) {
    onProgress?.({ query: `↳ ${q}` });
    absorb((await researchQuery(q, { limit: p.followup_limit, read: p.followup_read })).pages);
  }
  for (const q of await gapQueries(brief, pages.map((page) => page.text).join("\n\n").slice(0, 4000), { max: p.gap_max })) {
    onProgress?.({ query: `gap ↳ ${q}` });
    absorb((await researchQuery(q, { limit: p.gap_limit, read: p.gap_read })).pages);
  }

  if (facts.length) {
    const notesSoFar = pages.map((page) => page.text).join("\n\n");
    const missing = missingFacts(facts, notesSoFar);
    for (const f of missing.slice(0, 3)) {
      const q = `${f} ${String(brief).split("\n")[0].slice(0, 50)}`.slice(0, 120);
      onProgress?.({ query: `evidence ↳ ${q}` });
      absorb((await researchQuery(q, { limit: p.gap_limit, read: p.gap_read })).pages);
    }
  }

  backfill();

  if (offtopic.length) onProgress?.({ offtopic: offtopic.length });
  return { query: brief, pages, offtopic };
}
