
export const CALL_RESEARCH_CHARS = 12_000;

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has", "had", "are", "was", "were",
  "will", "would", "can", "could", "should", "their", "there", "these", "those", "than", "then",
  "them", "they", "its", "into", "onto", "over", "under", "such", "which", "what", "when", "where",
  "who", "whom", "how", "why", "not", "but", "all", "any", "own", "same", "some", "each", "more",
  "most", "other", "about", "also", "been", "being", "does", "did", "doing", "here", "very", "much",
  "may", "might", "must", "shall", "one", "two", "new", "use", "used", "using", "make", "makes",
  "slide", "slides", "deck", "section", "part", "point", "points", "write", "writes", "show",
]);

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
      heading = h[1].length <= 2 ? h[2] : (heading ? `${heading.split(" — ")[0]} — ${h[2]}` : h[2]);
      continue;
    }
    buf.push(line);
    const size = buf.join("\n").length;
    if (size >= max && !line.trim()) flush();
    else if (size >= target * 2 && !line.trim()) flush();
  }
  flush();

  for (const c of chunks) c.terms = terms(`${c.heading} ${c.body}`);
  return chunks;
}

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
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avgLen)));
    }
    return score;
  });
}

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

export function slideQuery({ spec, plan }) {
  const label = spec?.section != null ? plan?.sections?.[spec.section] : null;
  return [label, spec?.purpose].filter(Boolean).join(" ");
}
