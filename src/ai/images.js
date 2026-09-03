import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { deckSchema } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { themeMatrix } from "../themematrix.js";
import { parseFloorProblems } from "./trim.js";
import { COVERING_THEMES } from "../coverage.js";

/**
 * Image supply — auto, not just upload.
 *
 * The writer never writes a URL. When a slide wants a picture the writer emits
 * `[image] description` into `notes` (and the sanitisers in `src/ai/generate.js`
 * strip any URL it invents into the same shape). This module closes that loop:
 * take the description, find a freely-licenced image, cache it under
 * `decks/<slug>/assets/auto/`, seat it on the slide, and record the licence.
 * No model ever sees or writes a URL; every file the renderer opens is local.
 *
 * WHY NOT SEARXNG. Research uses it and the instance has an `openverse` engine,
 * so the obvious move is to reuse `src/search.js`. It does not work: SearXNG's
 * result rows carry `img_src` and `title` and DROP the licence, for every
 * engine including Openverse. An image whose licence cannot be established
 * cannot be shipped in an academic submission, so the sources here are the two
 * upstreams that state the licence themselves.
 *
 * WHY NOT UNSPLASH SOURCE. `source.unsplash.com` was the documented fallback
 * and it is retired — it answers 503 to every request. It is not a degraded
 * path, it is a dead one, and code that lists it as a fallback reads as though
 * a second source exists when none does.
 *
 * THE TWO SOURCES, in order:
 *  - Wikimedia Commons. Primary. It states the licence and `AttributionRequired`
 *    per file, has no punitive rate limit, and — the reason it leads rather than
 *    follows — it is deep in exactly the diagrams and technical figures an
 *    academic deck asks for, where the photo aggregators are empty. It also
 *    rasterises SVG server-side via `iiurlwidth`, so a vector diagram arrives as
 *    a PNG the renderer can place.
 *  - Openverse. Secondary, for photographic subjects. Its anonymous budget is
 *    20/min and 200/day, which one greedy deck could spend, so `Budget` caps it
 *    and reads the ceiling back off the response headers.
 *
 * THE LICENCE RULE. Widest pool, no legal debt that is not written down:
 * public domain and CC0 first (nothing is owed), then CC BY, then CC BY-SA.
 * NonCommercial and NoDerivatives are refused outright, and so is a file whose
 * licence cannot be read — "unknown" is not a licence. Every supplied image is
 * written to `assets/auto/credits.json` and rendered into `CREDITS.md`, because
 * a CC BY image with its attribution nowhere is the licence breach the tier
 * ladder exists to avoid.
 */

/** Wikimedia asks for a descriptive agent; the default names the project, not an institution. */
const UA = process.env.FORGE_IMAGE_UA
  ?? "PresentationForge/1.0 (presentation deck generator; +https://codeberg.org/presentation-forge)";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE = "https://api.openverse.org/v1/images/";

/**
 * Words that carry no search signal, and words that describe the KIND of
 * picture rather than its subject.
 *
 * The second list is why the ladder works. Openverse matches all terms, so
 * "electrolysis cell diagram" returns nothing while "electrolysis" returns 240
 * — the word that made the query fail is the one the writer added to say it
 * wanted a diagram. Dropping the picture-kind words is therefore the first
 * widening step, and it is generic vocabulary, not topic knowledge: the code
 * must never learn what deck it is rendering.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "in", "on", "at", "to", "with", "and", "or",
  "showing", "shows", "that", "this", "its", "it", "as", "by", "from", "into",
  "is", "are", "be", "being", "over", "under", "between", "about", "via",
]);

const PICTURE_KIND = new Set([
  "diagram", "photo", "photograph", "image", "picture", "illustration", "chart",
  "graphic", "graph", "visual", "view", "shot", "closeup", "render", "rendering",
  "artwork", "icon", "infographic", "schematic", "figure", "drawing", "sketch",
  "screenshot", "map",
]);

/** What pptxgenjs can place and LibreOffice can rasterise without surprises. */
const FORMATS = [
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "gif", mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
];

const MIN_BYTES = 8_000;
const MAX_BYTES = 8_000_000;
/** Below this a full-bleed placement on a 13.33in canvas is visibly soft. */
const MIN_WIDTH = 640;
/** A panorama or a totem pole fills an image box with letterboxing, not picture. */
const ASPECT = { min: 0.3, max: 3.5 };

/**
 * Licence to tier: 0 nothing owed, 1 credit owed, 2 credit and share-alike owed.
 * `null` means refuse — NC and ND are not usable, and neither is a blank.
 *
 * Both upstreams are normalised through here so the ranking compares like with
 * like: Commons says `cc-by-sa-4.0`, Openverse says `by-sa`.
 */
export function licenceTier(code) {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return null;
  // Order matters: `by-nc-sa` must be refused before `by-sa` would accept it.
  if (/(^|[-_])nc([-_]|$)/.test(c) || /(^|[-_])nd([-_]|$)/.test(c)) return null;
  if (/^(cc0|pdm|pd|public[-_ ]?domain)/.test(c)) return 0;
  if (/^cc[-_]?by[-_]?sa/.test(c) || /^by[-_]?sa/.test(c)) return 2;
  if (/^cc[-_]?by/.test(c) || /^by(\b|[-_])/.test(c)) return 1;
  return null;
}

/** Commons hands back HTML in `Artist`; a credit line wants the text. */
function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The description reduced to ordered content words. */
export function queryTerms(description) {
  return String(description ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Queries to try, widest match first, each a strict superset-drop of the last.
 *
 * A description is a phrase a person wrote, and both upstreams AND their terms,
 * so the phrase almost always returns nothing. Widening in defined steps —
 * drop the picture-kind words, then keep the two most distinctive, then the
 * single most distinctive — turns one failed query into a search that lands.
 * "Most distinctive" is approximated by length: a long word is a rare word, and
 * the alternative (asking a model which word matters) would put the model back
 * in a loop it is deliberately kept out of.
 */
export function queryLadder(description) {
  const terms = queryTerms(description);
  if (!terms.length) return [];
  const subject = terms.filter((w) => !PICTURE_KIND.has(w));
  const ranked = [...(subject.length ? subject : terms)].sort((a, b) => b.length - a.length);
  const inOrder = (keep) => {
    const want = new Set(keep);
    return (subject.length ? subject : terms).filter((w) => want.has(w));
  };

  const rungs = [
    terms,
    subject,
    inOrder(ranked.slice(0, 2)),
    inOrder(ranked.slice(0, 1)),
  ];

  const seen = new Set();
  const out = [];
  for (const r of rungs) {
    const q = r.join(" ").trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    out.push(q);
  }
  return out;
}

/**
 * The request allowance for one deck.
 *
 * Openverse anonymously permits 20/min and 200/day, and it reports what is left
 * on every response. A deck with eight image notes walking a four-rung ladder
 * would spend a sixth of a day's budget, so the ceiling is enforced here rather
 * than discovered as a 429 halfway through a render.
 */
export function makeBudget({ openverse = 24 } = {}) {
  return { openverse, commons: 60, notes: [] };
}

async function getJSON(url, { headers = {}, signal, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        signal: signal ?? AbortSignal.timeout(20_000),
      });
    } catch (err) {
      if (attempt >= retries) return { error: String(err?.message ?? err) };
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    // Wikimedia sheds load with a 503 under its own name, and both upstreams
    // 429 rather than queue. Neither is a reason to give up on the deck.
    if ((res.status >= 500 || res.status === 429) && attempt < retries) {
      const after = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Number.isFinite(after) && after > 0 ? after * 1000 : 600 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return { error: `HTTP ${res.status}`, headers: res.headers };
    try {
      return { body: await res.json(), headers: res.headers };
    } catch (err) {
      return { error: `bad JSON: ${String(err?.message ?? err)}` };
    }
  }
}

/** Commons candidates for one query, already licence-filtered. */
async function commonsSearch(query, { signal, budget }) {
  if (budget.commons <= 0) return [];
  budget.commons--;
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*",
    generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "12",
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600",
  });
  const { body, error } = await getJSON(`${COMMONS}?${params}`, { signal });
  if (error || !body) {
    if (error) budget.notes.push(`commons "${query}": ${error}`);
    return [];
  }
  const pages = body.query?.pages ?? {};
  const out = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const em = info.extmetadata ?? {};
    const code = em.License?.value ?? "";
    const tier = licenceTier(code);
    if (tier === null) continue;
    // `thumburl` is the rasterised, width-capped copy — for an SVG it is the
    // only form the renderer can place, and for a 40MP scan it is the only one
    // worth downloading.
    const src = info.thumburl || info.url;
    if (!src) continue;
    const width = info.thumbwidth || info.width;
    const height = info.thumbheight || info.height;
    out.push({
      src,
      source: "wikimedia-commons",
      title: plainText(page.title).replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      creator: plainText(em.Artist?.value) || null,
      licence: plainText(em.LicenseShortName?.value) || code,
      licence_code: code,
      licence_url: em.LicenseUrl?.value ?? null,
      attribution_required: tier > 0,
      landing: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      width, height, tier, query,
    });
  }
  return out;
}

/** Openverse candidates for one query, already licence-filtered. */
async function openverseSearch(query, { signal, budget }) {
  if (budget.openverse <= 0) return [];
  budget.openverse--;
  const params = new URLSearchParams({
    q: query, page_size: "20",
    // Ask the upstream to exclude NC and ND rather than filtering them here:
    // a refused result still costs a row of the page budget.
    license_type: "commercial,modification",
  });
  const token = process.env.OPENVERSE_API_TOKEN;
  const { body, error, headers } = await getJSON(`${OPENVERSE}?${params}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  // The remaining daily allowance is on every response; believe it over the
  // local counter, which cannot know what other runs have already spent.
  const left = Number(headers?.get?.("x-ratelimit-available-anon_sustained"));
  if (Number.isFinite(left) && left < 20 && !token) budget.openverse = 0;
  if (error || !body) {
    if (error) budget.notes.push(`openverse "${query}": ${error}`);
    return [];
  }
  const out = [];
  for (const r of body.results ?? []) {
    const tier = licenceTier(r.license);
    if (tier === null) continue;
    if (!r.url) continue;
    out.push({
      src: r.url,
      source: r.source ? `openverse/${r.source}` : "openverse",
      title: r.title ?? null,
      creator: r.creator ?? null,
      licence: [r.license, r.license_version].filter(Boolean).join(" ").toUpperCase(),
      licence_code: r.license,
      licence_url: r.license_url ?? null,
      attribution: r.attribution ?? null,
      attribution_required: tier > 0,
      landing: r.foreign_landing_url ?? null,
      width: r.width, height: r.height, tier, query,
    });
  }
  return out;
}

/** Dimensions a slide can actually use. Unknown dimensions are allowed — the download verifies. */
function usable(c) {
  if (c.width && c.width < MIN_WIDTH) return false;
  if (c.width && c.height) {
    const a = c.width / c.height;
    if (a < ASPECT.min || a > ASPECT.max) return false;
  }
  return true;
}

/**
 * Best first: least licence debt, then largest.
 *
 * Ranking by tier rather than filtering to tier 0 is what "widest pool, no
 * legal issues" means in practice — a public-domain image is taken when one
 * exists, and a CC BY one is taken rather than leaving the slide bare, with
 * the credit written down either way.
 */
export function rankCandidates(list) {
  return [...list].filter(usable).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.width ?? 0) - (a.width ?? 0);
  });
}

function sniff(buf) {
  return FORMATS.find((f) => f.magic.every((b, i) => buf[i] === b)) ?? null;
}

/**
 * Fetch one candidate and write it, named by what it actually is.
 *
 * The extension is taken from the magic bytes, never from the URL: pptxgenjs
 * derives the OOXML relationship type from the file extension, so a PNG saved
 * as `.jpg` produces a deck that writes without complaint and shows a broken
 * picture in PowerPoint.
 */
async function download(src, absNoExt, { signal }) {
  let res;
  try {
    res = await fetch(src, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BYTES) return null;
  let buf;
  try {
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;
  const fmt = sniff(buf);
  if (!fmt) return null;
  const abs = `${absNoExt}.${fmt.ext}`;
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return { abs, ext: fmt.ext, bytes: buf.length };
}

const key = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/** An already-downloaded file for this key, whatever extension it landed with. */
async function cached(dir, k) {
  try {
    const files = await readdir(dir);
    return files.find((f) => f.startsWith(`${k}.`) && f !== `${k}.json`) ?? null;
  } catch {
    return null;
  }
}

/**
 * The credits already recorded for this deck.
 *
 * `credits.json` is the durable half of the cache, and it has to be, because a
 * cached file with no credit is an image sitting in a deck whose attribution
 * has been lost — the precise failure the licence tiers exist to prevent. The
 * second run of a supply is the common case (a resumed finalize, a re-render,
 * a critic pass), so this is the normal path rather than a repair.
 */
async function readCredits(deckDir) {
  try {
    const raw = await readFile(path.join(deckDir, "assets", "auto", "credits.json"), "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Find, download and cache one image for a description.
 *
 * Returns `{ rel, credit }` or null. `rel` is deck-relative, which is what
 * `resolveAsset` in `src/render.js` resolves and what keeps every path in a
 * deck portable between machines.
 */
export async function supplyImage(description, deckDir, { signal, budget = makeBudget() } = {}) {
  const ladder = queryLadder(description);
  if (!ladder.length) return null;
  const autoDir = path.join(deckDir, "assets", "auto");
  const k = key(`${path.basename(deckDir)}:${ladder[0]}`);

  const hit = await cached(autoDir, k);
  if (hit) {
    const rel = `assets/auto/${hit}`;
    const known = (await readCredits(deckDir)).find((c) => c.file === rel) ?? null;
    return { rel, credit: known, cachedFile: true };
  }

  for (const query of ladder) {
    let candidates = await commonsSearch(query, { signal, budget });
    if (!rankCandidates(candidates).length) {
      candidates = candidates.concat(await openverseSearch(query, { signal, budget }));
    }
    for (const c of rankCandidates(candidates).slice(0, 4)) {
      const got = await download(c.src, path.join(autoDir, k), { signal });
      if (!got) continue;
      return {
        rel: `assets/auto/${path.basename(got.abs)}`,
        credit: {
          file: `assets/auto/${path.basename(got.abs)}`,
          query, description: String(description ?? "").trim(),
          title: c.title, creator: c.creator,
          licence: c.licence, licence_code: c.licence_code, licence_url: c.licence_url,
          attribution: c.attribution ?? null,
          attribution_required: c.attribution_required,
          source: c.source, landing: c.landing,
          width: c.width ?? null, height: c.height ?? null, bytes: got.bytes,
          fetched: new Date().toISOString(),
        },
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ seating */

const _imageSeats = new Map();

/**
 * The top-level `image` field a type declares, if it has one.
 *
 * Derived from the schema rather than listed, so a new image-carrying type is
 * seated the day it is added and a renamed field cannot rot into a slide
 * property nothing draws.
 */
export async function imageSeat(type) {
  if (_imageSeats.has(type)) return _imageSeats.get(type);
  const schema = await deckSchema();
  const rule = schema.definitions.slide.allOf?.find((r) => {
    const t = r.if?.properties?.type;
    return t?.const === type || (Array.isArray(t?.enum) && t.enum.includes(type));
  });
  const props = rule?.then?.properties ?? {};
  const required = new Set(rule?.then?.required ?? []);
  // A type that REQUIRES its image can never be waiting for one: a slide of
  // that type without the field would not have validated. Only an optional
  // seat is fillable in place.
  const seat = props.image && !required.has("image") ? "image" : null;
  _imageSeats.set(type, seat);
  return seat;
}

/** The list field a type carries, and the cap on it, for a lossless promotion. */
const LIST_FIELD = {
  bullets: "bullets",
  "numbered-list": "items",
  "takeaway": "points",
};

/**
 * `image-text`'s `body` takes at most four lines of at most 180 characters.
 * A list longer than that cannot be promoted without dropping a point the
 * writer meant to make, and dropping it silently to make room for a decorative
 * photograph is the wrong trade — the note stays and the user keeps the
 * "add image" door.
 */
const BODY_MAX_ITEMS = 4;
const BODY_MAX_CHARS = 180;

/**
 * Put `rel` on the slide, or report why it cannot go there.
 *
 * Two ways in. A type with an OPTIONAL image field takes it in place, changing
 * nothing else. Any other type has to become `image-text`, which is what the
 * upload flow in `DeckDetail` already does by hand — but only when the mapping
 * is lossless, because this one runs without a human watching.
 *
 * Returns the new slide, or null when the image cannot be seated.
 */
export async function seatImage(slide, rel) {
  const seat = await imageSeat(slide.type);
  if (seat) return { ...slide, [seat]: rel };

  if (!slide.headline?.trim()) return null;
  const field = LIST_FIELD[slide.type];
  if (!field) return null;
  const list = slide[field];
  if (!Array.isArray(list) || !list.length) return null;
  if (list.length > BODY_MAX_ITEMS) return null;
  const body = list.map((x) => (typeof x === "string" ? x : x?.text ?? x?.title ?? ""));
  if (body.some((x) => !x.trim() || x.length > BODY_MAX_CHARS)) return null;

  const { [field]: _dropped, ...rest } = slide;
  return { ...rest, type: "image-text", image: rel, body };
}

/* ------------------------------------------------------------------ credits */

function creditLine(c) {
  const who = c.creator ? ` by ${c.creator}` : "";
  const what = c.title || c.query;
  const lic = c.licence_url ? `[${c.licence}](${c.licence_url})` : c.licence;
  const where = c.landing ? ` — [source](${c.landing})` : "";
  return `- **${what}**${who}. ${lic}${where}`;
}

/**
 * The credits the licences oblige, in a file a person can actually use.
 *
 * `credits.json` is the machine record beside the files; `CREDITS.md` is the
 * page a student pastes into an appendix slide. Public-domain entries are
 * listed too — not because anything is owed, but because "where did this
 * picture come from" is asked of an academic submission regardless of licence.
 */
async function writeCredits(deckDir, credits) {
  if (!credits.length) return;
  const autoDir = path.join(deckDir, "assets", "auto");
  await mkdir(autoDir, { recursive: true });

  // Merge on `file`: a run where some images came from the cache and others
  // were fetched must not drop the credits it did not re-fetch.
  const byFile = new Map((await readCredits(deckDir)).map((c) => [c.file, c]));
  for (const c of credits) byFile.set(c.file, c);
  const all = [...byFile.values()];
  await writeFile(path.join(autoDir, "credits.json"), `${JSON.stringify(all, null, 2)}\n`, "utf8");

  const owed = all.filter((c) => c.attribution_required);
  const free = all.filter((c) => !c.attribution_required);
  const lines = ["# Image credits", ""];
  if (owed.length) {
    lines.push(
      "These images are used under licences that REQUIRE attribution. Keep this",
      "list with the deck — on a credits slide, or in the report's appendix.",
      "",
      ...owed.map(creditLine),
      "",
    );
  }
  if (free.length) {
    lines.push(
      "Public domain / CC0 — no attribution required, listed for provenance.",
      "",
      ...free.map(creditLine),
      "",
    );
  }
  await writeFile(path.join(deckDir, "CREDITS.md"), lines.join("\n"), "utf8");
}

/* ------------------------------------------------------------------- supply */

const NOTE = /^[ \t]*\[image\][ \t]*([^\n]*)\r?\n?/gim;

/** The `[image]` description on a slide, if it carries one. */
function imageNote(slide) {
  NOTE.lastIndex = 0;
  const m = NOTE.exec(String(slide.notes ?? ""));
  return m ? m[1].trim() : null;
}

function withoutNote(notes) {
  const left = String(notes ?? "").replace(NOTE, "").trim();
  return left || undefined;
}

/**
 * Which slides do not fit, by index.
 *
 * The schema cap is not the operative constraint on a promotion. `image-text`
 * lets `body` run to 180 characters, but it draws that body in HALF the width
 * a full-bleed list gets, so four bullets that were comfortable as `bullets`
 * overflow as `image-text` while every cap check stays green. Measured on the
 * real generated deck: a promotion that passed the schema took the fit sweep
 * from 5 problems to 20.
 *
 * The covering eight rather than the deck's own theme, and rather than all 34,
 * for the reason `trimDeckToFit` already sweeps every theme: fit is decided by
 * typeface metrics, the theme is switchable from the deck page afterwards, and
 * a picture that fits today must not break the slide when the theme changes.
 */
async function floorProblems(deck, deckDir) {
  const { runs } = await themeMatrix({ deck: structuredClone(deck), deckDir, themes: COVERING_THEMES });
  return parseFloorProblems(runs.flatMap((r) => r.problems.map((p) => p.raw)));
}

/** The validation errors attributable to one slide, by its JSON pointer. */
async function slideErrors(deck, index) {
  const { ok, errors } = await validateDeck(deck);
  if (ok) return [];
  // `/slides/1` is a prefix of `/slides/12`, so the boundary has to be explicit.
  const at = new RegExp(`/slides/${index}(?![0-9])`);
  return (errors ?? []).filter((e) => at.test(String(e)));
}

/**
 * Supply every `[image]` note in a deck that can be supplied.
 *
 * Opt-in: the caller decides, from `meta.imageSupply`. Never mutates the deck
 * passed in — a supply that fails validation must leave the deck exactly as it
 * was, and an in-place mutation cannot be taken back.
 *
 * Returns `{ deck, supplied, skipped, credits, notes }`. `skipped` is the
 * honest half: a slide whose note could not be seated keeps its note, so the
 * UI's "add image" badge still offers the manual door.
 */
export async function supplyDeckImages(deck, deckDir, { signal, budget = makeBudget(), onProgress, fitGate = true } = {}) {
  const wanted = [];
  for (const [index, slide] of deck.slides.entries()) {
    const description = imageNote(slide);
    if (description) wanted.push({ index, description });
  }
  if (!wanted.length) return { deck, supplied: [], skipped: [], credits: [], notes: [] };

  let out = deck;
  const supplied = [];
  const skipped = [];
  const credits = [];

  for (const [n, { index, description }] of wanted.entries()) {
    onProgress?.({ index, description, done: n, total: wanted.length });
    const slide = out.slides[index];
    // Ask whether it can be seated BEFORE spending a request on finding it.
    const probe = await seatImage(slide, "assets/auto/probe.png");
    if (!probe) {
      skipped.push({ index, description, reason: `type "${slide.type}" cannot carry an image without losing content` });
      continue;
    }

    const found = await supplyImage(description, deckDir, { signal, budget });
    if (!found) {
      skipped.push({ index, description, reason: "no freely-licenced image found" });
      continue;
    }

    const seated = await seatImage(slide, found.rel);
    if (!seated) {
      skipped.push({ index, description, reason: "could not be seated" });
      continue;
    }
    seated.notes = withoutNote(seated.notes);
    if (seated.notes === undefined) delete seated.notes;

    const next = { ...out, slides: out.slides.map((s, i) => (i === index ? seated : s)) };
    // The promotion rewrites the slide's type and fields, so it has to be
    // checked — but only against the damage IT does. A real generated deck
    // arrives carrying schema errors of its own (`loadDeck` warns on an
    // over-long field rather than refusing, so decks ship slightly invalid and
    // still render), and a whole-deck ok/not-ok gate reads those pre-existing
    // errors as this slide's fault and refuses every supply on every real deck.
    // Compare the errors on THIS slide before and after instead.
    const beforeErrs = await slideErrors(out, index);
    const afterErrs = await slideErrors(next, index);
    if (afterErrs.length > beforeErrs.length) {
      skipped.push({ index, description, reason: `promotion to ${seated.type} did not validate` });
      continue;
    }
    out = next;
    supplied.push({
      index, rel: found.rel, description, type: seated.type, from: slide.type,
      credit: found.credit ?? null, was: slide,
    });
  }

  // The fit gate. Seating is only lossless if the page still holds the words:
  // a promotion halves the text column, and the schema cap cannot see that.
  //
  // The test is "does the slide now fit cleanly", NOT "does it fit worse than
  // before". A promotion changes the slide's type, so it changes which FIELD
  // the fitter names — a slide that failed on `bullets` and now fails on `body`
  // has the same number of problems and is no less broken, and a count
  // comparison reads that as an improvement. It also makes the gate cheap:
  // one sweep of the result, no baseline.
  //
  // A slide that was ALREADY overfull is refused too. Reverting does not repair
  // it, but a slide with more words than it can hold is the last place to spend
  // half the width on a decorative picture.
  if (fitGate && supplied.length) {
    const after = await floorProblems(out, deckDir);
    const worse = supplied.filter(({ index }) => (after.get(index)?.size ?? 0) > 0);
    if (worse.length) {
      const revert = new Map(worse.map((w) => [w.index, w.was]));
      out = { ...out, slides: out.slides.map((sl, i) => revert.get(i) ?? sl) };
      for (const w of worse) {
        skipped.push({
          index: w.index, description: w.description,
          reason: "the picture would not leave room for the slide's own words",
        });
      }
      const dropped = new Set(worse.map((w) => w.index));
      for (let i = supplied.length - 1; i >= 0; i--) {
        if (dropped.has(supplied[i].index)) supplied.splice(i, 1);
      }
    }
  }

  for (const { index, credit } of supplied) {
    if (credit) credits.push({ ...credit, slide: index + 1 });
  }
  // The record is written only for pictures that survived the gate — a credit
  // for an image no slide carries is worse than no credit at all.
  await writeCredits(deckDir, credits);
  return {
    deck: out,
    supplied: supplied.map(({ was: _was, credit: _credit, ...rest }) => rest),
    skipped, credits, notes: budget.notes,
  };
}
