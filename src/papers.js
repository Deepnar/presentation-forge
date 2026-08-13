/**
 * Academic paper search — the "proper way to search and research papers"
 * half of the research pass. Two public APIs, no keys, no cloud:
 *
 * - arXiv: export.arxiv.org/api/query — the preprint server, returns Atom XML
 *   with title, authors, abstract and the pdf/html links.
 * - Crossref: api.crossref.org — the DOI registry, returns JSON with title,
 *   abstract (when the publisher supplies one), DOI, journal and year.
 *
 * Results are deduped (arXiv IDs and DOIs are canonical), ranked by how many
 * of the brief's key terms appear in the title+abstract, and shaped into the
 * same source record the rest of the research pass writes to sources.json —
 * plus a `kind: "paper"` marker and an arXiv id / DOI for the Research view to
 * link. Full text for the top paper(s) is pulled from arXiv's HTML page (the
 * paper's own abstract.txt is short; the HTML carries the full text) through
 * the shared extraction pipeline.
 */

import { researchQuery, fetchPage } from "./search.js";
import { researchSummary } from "./ai/research.js";

const ARXIV = "https://export.arxiv.org/api/query";
const CROSSREF = "https://api.crossref.org/works";

const TIMEOUT = 25_000;

async function getJSON(url, params) {
  const q = new URLSearchParams(params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${url}?${q}`, {
      headers: { "User-Agent": "presentation-forge/1.0 (mailto:local@forge)", Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getAtom(url, params) {
  const q = new URLSearchParams(params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${url}?${q}`, {
      headers: { "User-Agent": "presentation-forge/1.0 (mailto:local@forge)", Accept: "application/atom+xml" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return xml;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract <title>, <summary> and <id> from an arXiv Atom feed. */
function parseArxiv(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  return entries.map(([, body]) => {
    const tag = (name) => {
      const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
      return m ? m[1].trim() : "";
    };
    const id = (body.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)/) ?? [])[1] ?? "";
    return {
      id,
      title: tag("title").replace(/\s+/g, " "),
      summary: tag("summary").replace(/\s+/g, " ").trim(),
      published: tag("published"),
      pdf: id ? `https://arxiv.org/pdf/${id}` : "",
      html: id ? `https://arxiv.org/html/${id}` : "",
      authors: [...body.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).slice(0, 4),
    };
  });
}

function terms(brief) {
  return String(brief ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+.-]+/)
    .filter((w) => w.length > 2)
    .filter((w) => !["and", "the", "for", "with", "how", "what", "why"].includes(w));
}

function rankByBrief(scoreText, brief) {
  const ts = terms(brief);
  if (!ts.length) return 0;
  const lower = String(scoreText ?? "").toLowerCase();
  let hits = 0;
  for (const t of ts) if (lower.includes(t)) hits++;
  return hits / ts.length;
}

/** Query both APIs, dedupe by canonical id, rank by brief term overlap. */
export async function searchPapers(brief, { limit = 6 } = {}) {
  const term = String(brief ?? "").slice(0, 200);
  const out = [];
  const seen = new Set();

  const absorb = (paper) => {
    const key = paper.id || paper.doi || paper.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(paper);
  };

  try {
    const xml = await getAtom(ARXIV, { search_query: `all:${term}`, start: 0, max_results: 12 });
    for (const p of parseArxiv(xml)) {
      absorb({
        kind: "paper",
        id: p.id,
        url: p.pdf,
        title: p.title,
        abstract: p.summary,
        authors: p.authors,
        year: (p.published ?? "").slice(0, 4),
        domain: "arxiv.org",
        words: p.summary?.split(/\s+/).length ?? 0,
        html: p.html,
      });
    }
  } catch (err) {
    out.unshift({ kind: "paper_error", url: ARXIV, title: "arXiv search failed", error: err.message });
  }

  try {
    const json = await getJSON(CROSSREF, {
      query: term, rows: 12, select: "DOI,title,author,published,abstract,container-title,URL",
    });
    for (const item of json.message?.items ?? []) {
      const doi = item.DOI ?? "";
      absorb({
        kind: "paper",
        doi,
        id: null,
        url: item.URL || (doi ? `https://doi.org/${doi}` : ""),
        title: (item.title ?? [])[0] ?? "",
        abstract: item.abstract ?? "",
        authors: (item.author ?? []).slice(0, 4).map((a) => a.given && a.family ? `${a.given} ${a.family}` : a.name ?? ""),
        year: item.published?.["date-parts"]?.[0]?.[0] ?? "",
        journal: (item["container-title"] ?? [])[0] ?? "",
        domain: "doi.org",
        words: (item.abstract ?? "").split(/\s+/).length,
      });
    }
  } catch (err) {
    out.push({ kind: "paper_error", url: CROSSREF, title: "Crossref search failed", error: err.message });
  }

  const ranked = out
    .filter((p) => p.kind === "paper")
    .map((p) => ({ ...p, score: rankByBrief(`${p.title} ${p.abstract}`, brief) }))
    .sort((a, b) => b.score - a.score || (b.words - a.words))
    .slice(0, limit);

  return { papers: ranked, errors: out.filter((p) => p.kind === "paper_error") };
}

/**
 * Pull the full text for the top-ranked paper(s): arXiv HTML first (its own
 * reading view), else the arXiv PDF's abstract via the shared fetcher. Returns
 * the extracted text records the research pass merges into its notes.
 */
export async function paperFullTexts(papers, { top = 2 } = {}) {
  const targets = papers
    .filter((p) => p.html || /arxiv\.org/.test(p.url ?? ""))
    .slice(0, top);
  const records = [];
  for (const p of targets) {
    const page = await fetchPage(p.html || p.url).catch(() => ({ ok: false }));
    if (page.ok) {
      records.push({
        url: page.url,
        host: "arxiv.org",
        title: page.title,
        words: page.words,
        text: page.text,
      });
    }
  }
  return records;
}

/** Merge paper search results into the source list a research pass writes. */
export function mergePapers(sources, papers) {
  return [
    ...sources,
    ...papers.filter((p) => p.kind === "paper").map((p) => ({
      kind: "paper",
      url: p.url || (p.doi ? `https://doi.org/${p.doi}` : ""),
      title: p.title,
      doi: p.doi ?? null,
      arxivId: p.id ?? null,
      year: p.year ?? "",
      journal: p.journal ?? "",
      domain: p.domain ?? "arxiv.org",
      words: p.words ?? 0,
    })),
  ];
}

export { researchSummary };
