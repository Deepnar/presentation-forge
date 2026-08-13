import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

/**
 * Local research: metasearch via SearXNG, plus readable extraction of pages.
 *
 * Extraction quality matters more here than search quality. A small local model
 * handed raw HTML spends its context on nav chrome, cookie banners and footers,
 * and starts quoting them. Readability strips a page to its article body before
 * the model ever sees it.
 */

const SEARX = process.env.SEARXNG_URL ?? "http://localhost:8888";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/**
 * The Jina Reader (https://r.jina.ai/<url>) is a second extraction path for
 * pages Readability mangles — JS-heavy, paywalled, behind redirects. It is a
 * free cloud service, so it stays OPT-IN: without this flag the pipeline is
 * exactly as local as before, and the fallback only ever fires on a page that
 * Readability already failed to extract.
 */
const JINA_ENABLED = process.env.RESEARCH_JINA === "1";

const FETCH_TIMEOUT = 12_000;
const MAX_BYTES = 4 * 1024 * 1024;   // pathological pages exist; cap before parsing
const MAX_CONCURRENT = 4;            // politeness, and SearXNG's upstreams throttle

/** Hosts that never yield usable article text. */
const BLOCKED_HOSTS = new Set([
  "pinterest.com", "www.pinterest.com",
  "facebook.com", "www.facebook.com",
  "x.com", "twitter.com",
  "instagram.com", "www.instagram.com",
]);

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
// Images carry no information once the page is text; links become noise at
// citation density, so keep the anchor text and drop the target.
turndown.remove(["script", "style", "noscript", "iframe", "form"]);
turndown.addRule("stripImages", { filter: "img", replacement: () => "" });
turndown.addRule("unwrapLinks", { filter: "a", replacement: (content) => content });

class Semaphore {
  #active = 0;
  #queue = [];
  constructor(limit) { this.limit = limit; }
  async run(fn) {
    if (this.#active >= this.limit) await new Promise((r) => this.#queue.push(r));
    this.#active++;
    try { return await fn(); }
    finally {
      this.#active--;
      this.#queue.shift()?.();
    }
  }
}
const gate = new Semaphore(MAX_CONCURRENT);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return null; }
}

async function withTimeout(url, options = {}, ms = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Metasearch. Returns results deduped by URL and diversified by host, because
 * SearXNG happily returns eight pages from one domain and a model given those
 * will write a report sourced entirely from one site.
 */
export async function search(query, {
  limit = 10,
  perHost = 2,
  categories = "general",
  language = "en",
  timeRange = "",
} = {}) {
  const params = new URLSearchParams({ q: query, format: "json", categories, language });
  if (timeRange) params.set("time_range", timeRange);

  let res;
  try {
    res = await withTimeout(`${SEARX}/search?${params}`, { headers: { "User-Agent": UA } }, 20_000);
  } catch (err) {
    throw new Error(
      `SearXNG unreachable at ${SEARX} (${err.message}). ` +
      `Start it with: docker compose -f docker/docker-compose.yml up -d`,
    );
  }
  if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);

  const body = await res.json();
  const seenUrl = new Set();
  const hostCount = new Map();
  const out = [];

  for (const r of body.results ?? []) {
    if (!r.url || seenUrl.has(r.url)) continue;
    const host = hostOf(r.url);
    if (!host || BLOCKED_HOSTS.has(host)) continue;

    const n = hostCount.get(host) ?? 0;
    if (n >= perHost) continue;

    seenUrl.add(r.url);
    hostCount.set(host, n + 1);
    out.push({
      title: r.title?.trim() ?? "",
      url: r.url,
      host,
      snippet: r.content?.trim() ?? "",
      engine: r.engine ?? "",
      score: r.score ?? 0,
      published: r.publishedDate ?? null,
    });
    if (out.length >= limit) break;
  }

  return {
    query,
    results: out,
    answers: body.answers ?? [],
    // SearXNG's own suggested refinements — useful for a second research pass.
    suggestions: (body.suggestions ?? []).slice(0, 5),
  };
}

/**
 * Fetch one page and reduce it to readable markdown.
 * Never throws — a dead link during research should degrade that source, not
 * abort the run — so callers must check `ok`.
 */
export async function fetchPage(url) {
  return gate.run(async () => {
    const base = { url, host: hostOf(url), ok: false, title: "", text: "", error: null };
    try {
      const res = await withTimeout(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      });
      if (!res.ok) return { ...base, error: `HTTP ${res.status}` };

      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(type)) {
        return { ...base, error: `unsupported content-type: ${type.split(";")[0]}` };
      }

      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return { ...base, error: "page too large" };
      const html = new TextDecoder("utf-8").decode(buf);

      // linkedom rather than jsdom: Readability needs only a DOM shape, and
      // jsdom's full browser emulation costs seconds per page.
      const { document } = parseHTML(html);
      const article = new Readability(document, { charThreshold: 250 }).parse();

      if (article?.content) {
        const text = turndown.turndown(article.content)
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (text.length >= 200) {
          return {
            url: res.url || url,
            host: hostOf(res.url || url),
            ok: true,
            title: (article.title || document.title || "").trim(),
            byline: article.byline?.trim() ?? null,
            siteName: article.siteName?.trim() ?? null,
            excerpt: article.excerpt?.trim() ?? null,
            words: text.split(/\s+/).length,
            text,
            error: null,
          };
        }
      }

      // Readability failed or the body was too thin — a JS-heavy or paywalled
      // page is exactly what the Jina Reader exists for. It is a cloud service,
      // so this path is gated behind RESEARCH_JINA=1; without it the page is
      // reported as unextractable exactly as before.
      if (JINA_ENABLED) {
        const jina = await jinaRead(url, res.url || url);
        if (jina?.text) return { ...jina, error: null };
      }

      return { ...base, error: article?.content ? "article body too short to be useful" : "no extractable article body" };
    } catch (err) {
      return { ...base, error: err.name === "AbortError" ? "timed out" : err.message };
    }
  });
}

/**
 * The Jina Reader extraction path: GET https://r.jina.ai/<url> returns the
 * page as clean markdown, which is exactly the shape Readability produces, so
 * a Jina result slots into the same { title, text, words } contract. Capped to
 * the same size budget as a Readability parse.
 */
async function jinaRead(originalUrl, finalUrl) {
  const target = `https://r.jina.ai/${encodeURIComponent(finalUrl || originalUrl)}`;
  let res;
  try {
    res = await withTimeout(target, { headers: { "User-Agent": UA, Accept: "text/plain" } }, 20_000);
  } catch {
    return { ok: false, error: "jina timeout" };
  }
  if (!res.ok) return { ok: false, error: `jina HTTP ${res.status}` };

  const text = (await res.text()).trim();
  if (text.length < 200) return { ok: false, error: "jina body too short" };

  const firstLine = text.split("\n").find((l) => l.trim());
  const title = firstLine?.replace(/^#+\s*/, "").trim() ?? finalUrl;
  return {
    ok: true,
    url: finalUrl || originalUrl,
    host: hostOf(finalUrl || originalUrl),
    title: title.slice(0, 200),
    words: text.split(/\s+/).length,
    text: text.slice(0, MAX_BYTES),
  };
}

/** Search, then extract the top N in parallel. The unit a research turn uses. */
export async function researchQuery(query, { limit = 8, read = 5, ...opts } = {}) {
  const found = await search(query, { limit, ...opts });
  const pages = await Promise.all(found.results.slice(0, read).map((r) => fetchPage(r.url)));

  return {
    query,
    results: found.results,
    answers: found.answers,
    suggestions: found.suggestions,
    pages: pages.filter((p) => p.ok),
    failed: pages.filter((p) => !p.ok).map(({ url, error }) => ({ url, error })),
  };
}

export async function searxngHealthy() {
  try {
    const res = await withTimeout(`${SEARX}/healthz`, {}, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------- CLI */

if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.error('usage: node src/search.js "<query>"');
    process.exit(2);
  }
  const r = await researchQuery(query);
  console.log(`\n  "${r.query}" — ${r.results.length} results, ${r.pages.length} extracted\n`);
  for (const p of r.pages) {
    console.log(`  ${p.title.slice(0, 68)}`);
    console.log(`    ${p.host} · ${p.words} words`);
  }
  for (const f of r.failed) console.log(`  skipped ${hostOf(f.url)} — ${f.error}`);
  if (r.suggestions.length) console.log(`\n  refine: ${r.suggestions.join(" · ")}`);
}
