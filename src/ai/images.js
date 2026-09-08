import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { deckSchema } from "./catalog.js";
import { validateDeck } from "../validate.js";
import { readCredits, writeCredits } from "../credits.js";
import { themeMatrix } from "../themematrix.js";
import { parseFloorProblems } from "./trim.js";
import { COVERING_THEMES } from "../coverage.js";

const UA = process.env.FORGE_IMAGE_UA
  ?? "PresentationForge/1.0 (presentation deck generator; +https://codeberg.org/presentation-forge)";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE = "https://api.openverse.org/v1/images/";

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

const FORMATS = [
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "gif", mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
];

const MIN_BYTES = 8_000;
const MAX_BYTES = 8_000_000;
const MIN_WIDTH = 640;
const ASPECT = { min: 0.3, max: 3.5 };

export function licenceTier(code) {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return null;
  if (/(^|[-_])nc([-_]|$)/.test(c) || /(^|[-_])nd([-_]|$)/.test(c)) return null;
  if (/^(cc0|pdm|pd|public[-_ ]?domain)/.test(c)) return 0;
  if (/^cc[-_]?by[-_]?sa/.test(c) || /^by[-_]?sa/.test(c)) return 2;
  if (/^cc[-_]?by/.test(c) || /^by(\b|[-_])/.test(c)) return 1;
  return null;
}

function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function queryTerms(description) {
  return String(description ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

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

async function openverseSearch(query, { signal, budget }) {
  if (budget.openverse <= 0) return [];
  budget.openverse--;
  const params = new URLSearchParams({
    q: query, page_size: "20",
    license_type: "commercial,modification",
  });
  const token = process.env.OPENVERSE_API_TOKEN;
  const { body, error, headers } = await getJSON(`${OPENVERSE}?${params}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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

function usable(c) {
  if (c.width && c.width < MIN_WIDTH) return false;
  if (c.width && c.height) {
    const a = c.width / c.height;
    if (a < ASPECT.min || a > ASPECT.max) return false;
  }
  return true;
}

export function rankCandidates(list) {
  return [...list].filter(usable).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (b.width ?? 0) - (a.width ?? 0);
  });
}

function sniff(buf) {
  return FORMATS.find((f) => f.magic.every((b, i) => buf[i] === b)) ?? null;
}

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

async function cached(dir, k) {
  try {
    const files = await readdir(dir);
    return files.find((f) => f.startsWith(`${k}.`) && f !== `${k}.json`) ?? null;
  } catch {
    return null;
  }
}

function stem(term) {
  const t = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (t.length > 4 && /(?:es)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && /s$/.test(t)) return t.slice(0, -1);
  return t;
}

export function subjectMatches(candidate, terms) {
  if (!terms.length) return 1;                 // nothing to judge against
  const text = [candidate?.title, candidate?.attribution, candidate?.creator]
    .filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return 0;
  return terms.filter((t) => new RegExp(`\\b${stem(t)}`).test(text)).length;
}

export function rankBySubject(list, terms) {
  if (!terms.length) return [...list];
  const floor = Math.min(3, Math.max(2, Math.ceil(terms.length * 0.6)));
  return list
    .map((c) => ({ c, n: subjectMatches(c, terms) }))
    .filter((x) => x.n >= floor)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.c);
}

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

  const subject = queryTerms(description).filter((w) => !PICTURE_KIND.has(w));

  for (const query of ladder) {
    let candidates = await commonsSearch(query, { signal, budget });
    if (!rankCandidates(candidates).length) {
      candidates = candidates.concat(await openverseSearch(query, { signal, budget }));
    }
    for (const c of rankBySubject(rankCandidates(candidates), subject).slice(0, 4)) {
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

const _imageSeats = new Map();

export async function imageSeat(type) {
  if (_imageSeats.has(type)) return _imageSeats.get(type);
  const schema = await deckSchema();
  const rule = schema.definitions.slide.allOf?.find((r) => {
    const t = r.if?.properties?.type;
    return t?.const === type || (Array.isArray(t?.enum) && t.enum.includes(type));
  });
  const props = rule?.then?.properties ?? {};
  const required = new Set(rule?.then?.required ?? []);
  const seat = props.image && !required.has("image") ? "image" : null;
  _imageSeats.set(type, seat);
  return seat;
}

const LIST_FIELD = {
  bullets: "bullets",
  "numbered-list": "items",
  "takeaway": "points",
};

const BODY_MAX_ITEMS = 4;
const BODY_MAX_CHARS = 180;

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

const NOTE = /^[ \t]*\[image\][ \t]*([^\n]*)\r?\n?/gim;

function imageNote(slide) {
  NOTE.lastIndex = 0;
  const m = NOTE.exec(String(slide.notes ?? ""));
  return m ? m[1].trim() : null;
}

function withoutNote(notes) {
  const left = String(notes ?? "").replace(NOTE, "").trim();
  return left || undefined;
}

async function floorProblems(deck, deckDir) {
  const { runs } = await themeMatrix({ deck: structuredClone(deck), deckDir, themes: COVERING_THEMES });
  return parseFloorProblems(runs.flatMap((r) => r.problems.map((p) => p.raw)));
}

async function slideErrors(deck, index) {
  const { ok, errors } = await validateDeck(deck);
  if (ok) return [];
  const at = new RegExp(`/slides/${index}(?![0-9])`);
  return (errors ?? []).filter((e) => at.test(String(e)));
}

export async function supplyDeckImages(deck, deckDir, { signal, budget = makeBudget(), onProgress, fitGate = true, describeSeat = null } = {}) {
  const wanted = [];
  for (const [index, slide] of deck.slides.entries()) {
    const description = imageNote(slide);
    if (description) { wanted.push({ index, description }); continue; }
    const seat = await imageSeat(slide.type);
    if (seat && !slide[seat] && describeSeat) {
      const description = (await describeSeat(slide, index))?.trim();
      if (description) wanted.push({ index, description, fromSeat: true });
    }
  }
  if (!wanted.length) return { deck, supplied: [], skipped: [], credits: [], notes: [] };

  let out = deck;
  const supplied = [];
  const skipped = [];
  const credits = [];

  for (const [n, { index, description, fromSeat }] of wanted.entries()) {
    onProgress?.({ index, description, done: n, total: wanted.length });
    const slide = out.slides[index];
    const probe = await seatImage(slide, "assets/auto/probe.png");
    if (!probe) {
      skipped.push({ index, description, optional: fromSeat, reason: `type "${slide.type}" cannot carry an image without losing content` });
      continue;
    }

    const found = await supplyImage(description, deckDir, { signal, budget });
    if (!found) {
      skipped.push({ index, description, optional: fromSeat, reason: "no freely-licenced image found" });
      continue;
    }

    const seated = await seatImage(slide, found.rel);
    if (!seated) {
      skipped.push({ index, description, optional: fromSeat, reason: "could not be seated" });
      continue;
    }
    seated.notes = withoutNote(seated.notes);
    if (seated.notes === undefined) delete seated.notes;

    const next = { ...out, slides: out.slides.map((s, i) => (i === index ? seated : s)) };
    const beforeErrs = await slideErrors(out, index);
    const afterErrs = await slideErrors(next, index);
    if (afterErrs.length > beforeErrs.length) {
      skipped.push({ index, description, optional: fromSeat, reason: `promotion to ${seated.type} did not validate` });
      continue;
    }
    out = next;
    supplied.push({
      index, rel: found.rel, description, type: seated.type, from: slide.type,
      credit: found.credit ?? null, was: slide,
    });
  }

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
  await writeCredits(deckDir, credits);
  return {
    deck: out,
    supplied: supplied.map(({ was: _was, credit: _credit, ...rest }) => rest),
    skipped, credits, notes: budget.notes,
  };
}
