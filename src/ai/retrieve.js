/**
 * The research a single slide needs, rather than all of it.
 *
 * `excerptResearch` answers "how much research fits in the window", which was
 * the only question while the window was the constraint. It is not the only
 * constraint any more. `writeSlide` puts the whole excerpt in the user message
 * of every slide call, so a 22-slide deck sends it 26 times — 26 x 60,000
 * tokens on the cloud transport, about 1.6M tokens for one deck, 98.9% of it
 * input and almost all of that input the same text again. `docs/ECONOMICS.md`
 * has the arithmetic and what it costs on a paid key.
 *
 * Sending less is also better writing, which is the unusual part. A model
 * writing slide 14 currently receives 60,000 tokens of which perhaps 1,500
 * bear on slide 14; the rest is distractor, competing for attention with the
 * material the slide is actually about. The grounding guard and the coherence
 * pass both exist to catch failures that noise contributes to.
 *
 * The retrieval query is not invented here either — it already exists. The
 * plan says what every slide is for (`purpose`) and which part it belongs to
 * (`section`, into the plan's section labels). That is a query, and it was
 * computed before the writer was ever called.
 *
 * BM25 over heading-anchored passages: lexical, deterministic, no dependency
 * and no model. An embedding index would score better and cannot be justified
 * here — it needs a model to build, a store to keep, and an invalidation rule,
 * to improve on a job where the query and the corpus share a vocabulary by
 * construction (both are about the deck's topic).
 */

/**
 * How much research ONE call is shown, in characters.
 *
 * ~3,000 tokens: eight to ten passages, more material than a slide of sixty
 * words or a report paragraph can use. The excerpt cap in config/models.yaml
 * still bounds what is read off disk; this bounds what any single call
 * carries, and it is therefore the number that decides what a deck costs.
 * `src/usage.js` estimates against it — see docs/ECONOMICS.md.
 */
export const CALL_RESEARCH_CHARS = 12_000;

/** Words too common to discriminate between passages of the same document. */
const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "had", "are", "was", "were",
  "will", "would", "can", "could", "should", "their", "there", "these", "those", "than", "then",
  "them", "they", "its", "into", "onto", "over", "under", "such", "which", "what", "when", "where",
  "who", "whom", "how", "why", "not", "but", "all", "any", "own", "same", "some", "each", "more",
  "most", "other", "about", "also", "been", "being", "does", "did", "doing", "here", "very", "much",
  "may", "might", "must", "shall", "one", "two", "new", "use", "used", "using", "make", "makes",
  "slide", "slides", "deck", "section", "part", "point", "points", "write", "writes", "show",
]);

/**
 * Lowercase terms, stopwords out.
 *
 * Words need three characters to be worth indexing. FIGURES need two, and the
 * difference matters: a slide is very often about a number, and most numbers
 * in prose are two or three digits — "EUR 41 per bus", "60 kW", "2.3%". A flat
 * three-character floor silently dropped exactly the terms a "prove adoption
 * with the pilot's discharge metrics" query is trying to find. Single digits
 * stay out; they are noise at this granularity.
 */
export function terms(text) {
  const out = [];
  for (const raw of String(text ?? "").toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? []) {
    const t = raw.replace(/['’-]+$/, "");
    const min = /^\d+$/.test(t) ? 2 : 3;
    if (t.length < min || STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Split the notes into passages that can stand alone in a prompt.
 *
 * Markdown headings are the natural seam — the research writer emits one `##`
 * per source and `###` within it — but a heading's body can be a whole
 * article, so a long one is split further on blank lines. Every passage keeps
 * the heading above it, because a paragraph presented without the source it
 * came from is exactly the kind of context-free claim the grounding guard
 * exists to catch.
 */
export function chunkResearch(text, { target = 1400, max = 2600 } = {}) {
  const src = String(text ?? "");
  if (!src.trim()) return [];

  const lines = src.split("\n");
  const chunks = [];
  let heading = "";
  let buf = [];
  let order = 0;

  const flush = () => {
    const body = buf.join("\n").trim();
    buf = [];
    if (!body) return;
    chunks.push({ heading, body, order: order++ });
  };

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (h) {
      flush();
      // A deeper heading refines the source rather than replacing it, so keep
      // the top-level one alongside: "Source — Subsection".
      heading = h[1].length <= 2 ? h[2] : (heading ? `${heading.split(" — ")[0]} — ${h[2]}` : h[2]);
      continue;
    }
    buf.push(line);
    const size = buf.join("\n").length;
    // Split a long run on a paragraph break rather than mid-sentence.
    if (size >= max && !line.trim()) flush();
    else if (size >= target * 2 && !line.trim()) flush();
  }
  flush();

  for (const c of chunks) c.terms = terms(`${c.heading} ${c.body}`);
  return chunks;
}

/**
 * BM25. k1 saturates term frequency — a passage saying "grid" nine times is
 * not nine times more about the grid — and b normalises for passage length so
 * a long passage does not win simply by containing more words.
 */
const K1 = 1.2;
const B = 0.75;

export function scoreChunks(chunks, query) {
  const q = [...new Set(terms(query))];
  if (!q.length || !chunks.length) return chunks.map(() => 0);

  const N = chunks.length;
  const avgLen = chunks.reduce((s, c) => s + c.terms.length, 0) / N || 1;
  const df = new Map();
  for (const c of chunks) {
    for (const t of new Set(c.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  return chunks.map((c) => {
    const tf = new Map();
    for (const t of c.terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    const len = c.terms.length || 1;
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      // +1 inside the log keeps the idf of a term present in every passage at
      // a small positive rather than zero or negative, so a query that only
      // matches ubiquitous terms still orders passages by frequency.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avgLen)));
    }
    return score;
  });
}

/**
 * The passages of `text` most relevant to `query`, up to `budget` characters,
 * returned in document order.
 *
 * Document order rather than score order on purpose: the notes are several
 * sources concatenated, and presenting fragments in relevance order shuffles
 * two sources together in a way that reads as one argument contradicting
 * itself. Order also keeps the output stable to re-ranking.
 *
 * Falls back to the leading `budget` characters when nothing matches — a slide
 * whose purpose shares no vocabulary with the research is a slide the writer
 * still has to produce, and no research is worse than arbitrary research.
 */
export function selectResearch(text, query, { budget = CALL_RESEARCH_CHARS, minChunks = 2 } = {}) {
  const src = String(text ?? "");
  if (!src.trim()) return "";
  if (src.length <= budget) return src;

  const chunks = chunkResearch(src);
  if (!chunks.length) return src.slice(0, budget);

  const scores = scoreChunks(chunks, query);
  const ranked = chunks
    .map((c, i) => ({ c, score: scores[i] }))
    .sort((a, b) => b.score - a.score || a.c.order - b.c.order);

  if (!ranked[0] || ranked[0].score <= 0) {
    const cut = src.lastIndexOf("\n", budget);
    return src.slice(0, cut > 0 ? cut : budget);
  }

  const picked = [];
  let used = 0;
  for (const { c, score } of ranked) {
    const cost = c.heading.length + c.body.length + 8;
    if (used + cost > budget && picked.length >= minChunks) continue;
    if (score <= 0 && picked.length >= minChunks) break;
    picked.push(c);
    used += cost;
    if (used >= budget) break;
  }

  picked.sort((a, b) => a.order - b.order);
  const out = [];
  let lastHeading = null;
  for (const c of picked) {
    if (c.heading && c.heading !== lastHeading) {
      out.push(`## ${c.heading}`);
      lastHeading = c.heading;
    }
    out.push(c.body);
  }
  return out.join("\n\n");
}

/**
 * The query for one slide, from what the plan already knows about it.
 *
 * The section label carries the part's argument and the purpose carries this
 * slide's job within it. Both are already computed before the writer is
 * called.
 *
 * The deck TITLE is deliberately absent, and that is the whole difference
 * between this working and not. Every passage in the corpus is about the
 * deck's topic — that is why it was researched — so the title's terms are
 * ubiquitous, and including them pulled every slide's query toward the same
 * generically-on-topic passages. Measured on a real 22-slide deck: with the
 * title, any two slides shared 62% of their top passages and the whole deck
 * touched 16 of 55; without it, 24% and 36 of 55.
 *
 * The section label is kept even though it is shared within a part, because
 * that clustering is correct — slides in the same part SHOULD draw on related
 * material, and a slide drifting from its part's argument is what the
 * coherence pass exists to catch.
 */
export function slideQuery({ spec, plan }) {
  const label = spec?.section != null ? plan?.sections?.[spec.section] : null;
  return [label, spec?.purpose].filter(Boolean).join(" ");
}
