import { createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { search } from "../search.js";

const SEARX = process.env.SEARXNG_URL ?? "http://localhost:8888";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/**
 * Image supply — auto, not just upload.
 *
 * The writer never writes a URL. When it wants an image it emits `[image] description`
 * into the slide's `notes` (sanitized in `src/ai/generate.js:800` and `convertSlide:951`).
 * This module closes the loop: given that description, find a CC-licenced image,
 * cache it under `decks/<slug>/assets/auto/`, and return the relative path the
 * renderer can `resolveAsset` to. No model writes a URL, every file is local.
 *
 * Two sources, no keys:
 * - SearXNG `images` category (img_src from results) — primary, respects instance's engines
 * - Unsplash Source fallback `https://source.unsplash.com/featured/?<query>` — 302 to a real photo
 *
 * The deck opts in via `meta.imageSupply === "auto"` (or any deck with an `[image]` note
 * today — manual upload still works, `assets/` wins over `auto/` in `resolveAsset`).
 */

function hash(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

async function searxngImage(query) {
  const params = new URLSearchParams({ q: query, format: "json", categories: "images", language: "en" });
  try {
    const res = await fetch(`${SEARX}/search?${params}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    for (const r of body.results ?? []) {
      const src = r.img_src || r.url;
      if (src && /^https?:\/\//i.test(src) && !/pinterest\.com|facebook\.com|instagram\.com/i.test(src)) {
        // Prefer direct image URLs
        if (/\.(jpe?g|png|webp)(\?|$)/i.test(src)) return src;
      }
    }
    // Fallback: first img_src even without extension
    for (const r of body.results ?? []) {
      if (r.img_src && /^https?:\/\//i.test(r.img_src)) return r.img_src;
    }
    return null;
  } catch {
    return null;
  }
}

async function unsplashImage(query) {
  // Unsplash Source — no key, 302 to a photo. We follow the redirect and return the final URL.
  const url = `https://source.unsplash.com/featured/800x600?${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    const loc = res.headers.get("location");
    if (loc && /^https?:\/\//i.test(loc)) return loc;
    // Some deployments return 200 with the image directly — use the original URL then
    if (res.ok) return url;
    return null;
  } catch {
    return null;
  }
}

async function downloadImage(src, dest) {
  try {
    const res = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\//i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8_000) return null; // too small
    if (buf.length > 8_000_000) return null;
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    return dest;
  } catch {
    return null;
  }
}

/**
 * Find and cache one image for a description.
 * @param {string} description - the `[image] ...` text without the prefix
 * @param {string} deckDir - absolute path to decks/<slug>
 * @returns {string|null} relative path `assets/auto/<hash>.jpg` or null
 */
export async function supplyImage(description, deckDir) {
  const query = String(description ?? "").trim().slice(0, 120);
  if (!query) return null;
  const slug = path.basename(deckDir);
  const key = hash(`${slug}:${query}`);
  const rel = `assets/auto/${key}.jpg`;
  const abs = path.join(deckDir, rel);
  try {
    await access(abs);
    return rel; // already cached
  } catch {}

  let src = await searxngImage(query);
  if (!src) src = await unsplashImage(query);
  if (!src) return null;
  const out = await downloadImage(src, abs);
  if (!out) return null;
  return rel;
}

/**
 * Scan a deck for `[image]` notes and supply each missing image.
 * Mutates deck slides in place: sets `slide.image = rel` and removes the `[image]` line from notes.
 * Returns the list of supplied { index, rel, query }.
 */
export async function supplyDeckImages(deck, deckDir) {
  const supplied = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const s = deck.slides[i];
    const notes = String(s.notes ?? "");
    const m = notes.match(/\[image\]\s*([^\n]+)/i);
    if (!m) continue;
    // Don't overwrite a real uploaded image
    if (s.image) continue;
    const query = m[1].trim();
    const rel = await supplyImage(query, deckDir);
    if (!rel) continue;
    s.image = rel;
    // Remove the [image] line from notes so the badge clears
    s.notes = notes.replace(/\[image\][^\n]*\n?/gi, "").trim() || undefined;
    // If notes became empty, delete it
    if (!s.notes) delete s.notes;
    supplied.push({ index: i, rel, query });
  }
  return supplied;
}
