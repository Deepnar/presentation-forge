import { extractClaims, claimGrounded, flattenSlide } from "./grounding.js";
import { DIVIDER_TYPES, FRONT_MATTER_TYPES, REFERENCE_TYPES } from "./team.js";

export { REFERENCE_TYPES };

export const MAX_REFERENCE_ITEMS = 10;

const isMappable = (slide) =>
  !DIVIDER_TYPES.has(slide?.type) &&
  !FRONT_MATTER_TYPES.has(slide?.type) &&
  !REFERENCE_TYPES.has(slide?.type);

function slideClaims(slide) {
  const found = new Set();
  for (const text of flattenSlide(slide)) {
    for (const claim of extractClaims(text, { names: false })) found.add(claim);
    for (const m of String(text).match(/\d[\d,.]*(?:\.\d+)?\s?[%°](?:C)?/g) ?? []) {
      found.add(m.trim());
    }
  }
  return [...found];
}

function hasUnit(claim) {
  return /[a-z%°]/i.test(String(claim).replace(/[\d\s,.\-+×x]/g, ""));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeStrict(s) {
  return String(s).toLowerCase().replace(/,/g, "").replace(/[\s'’]+/g, " ").trim();
}

function strictGrounded(claim, text) {
  const norm = normalizeStrict(text);
  const n = normalizeStrict(claim);
  if (hasUnit(claim)) {
    const re = new RegExp(`(^|\\s)${escapeRegExp(n)}(?=[\\s.,;:!?()\\[\\]]|$)`, "g");
    return (norm.match(re) ?? []).length;
  }
  const re = new RegExp(`(^|\\s)${escapeRegExp(n)}(?=[\\s.,;:!?()\\[\\]%°a-zA-Z]|$)`, "g");
  return (norm.match(re) ?? []).length;
}

export function slideSourceUse(slide, pages, section = null) {
  const claims = slideClaims(slide);
  if (!claims.length || !pages?.length) return [];
  const unit = claims.filter(hasUnit);
  const bare = claims.filter((c) => !hasUnit(c));
  const use = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] ?? {};
    const text = page.text ?? "";
    if (!text.trim()) continue;
    if (page.subtopic != null && section != null && page.subtopic !== section) continue;
    if (unit.some((c) => strictGrounded(c, text))) { use.push(i); continue; }
    let hits = 0;
    for (const c of bare) {
      hits += Math.min(2, strictGrounded(c, text));
      if (hits >= 2) break;
    }
    if (hits >= 2) use.push(i);
  }
  return use;
}

export function mapDeckSources(deck, pages) {
  const out = [];
  for (let i = 0; i < (deck?.slides ?? []).length; i++) {
    const slide = deck.slides[i];
    if (!isMappable(slide)) continue;
    const use = slideSourceUse(slide, pages, slide.section ?? null);
    if (use.length) out.push({ slide: i, pages: use });
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function itemText(page, slideNums) {
  const host = page.url ? hostOf(page.url) : "";
  const title = String(page.title ?? "").trim() || host || "Uploaded file";
  const tail = ` — used on slide${slideNums.length > 1 ? "s" : ""} ${slideNums.join(", ")}`;
  const head = host && title !== host ? `${title} (${host})` : title;
  const room = 220 - tail.length;
  const cut = head.length > room ? `${head.slice(0, Math.max(0, room - 1)).trimEnd()}…` : head;
  return `${cut}${tail}`;
}

export function buildReferencesSlide(deck, pages, { maxItems = MAX_REFERENCE_ITEMS } = {}) {
  if (!pages?.length) return null;
  const uses = mapDeckSources(deck, pages);
  if (!uses.length) return null;

  const byPage = new Map();
  for (const { slide, pages: idxs } of uses) {
    for (const p of idxs) {
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(slide + 1);
    }
  }
  const ranked = [...byPage.entries()].sort(
    ([a, sa], [b, sb]) => sb.length - sa.length || (pages[b]?.words ?? 0) - (pages[a]?.words ?? 0),
  );

  const items = ranked.slice(0, maxItems).map(([p, slides]) => itemText(pages[p], slides));
  if (!items.length) return null;
  return { type: "references", headline: "References", items };
}

export function insertReferencesSlide(deck, slide) {
  if (!slide) return { deck, inserted: false };
  if ((deck?.slides ?? []).some((s) => REFERENCE_TYPES.has(s?.type))) {
    return { deck, inserted: false };
  }
  const slides = [...(deck?.slides ?? [])];
  let at = slides.findIndex((s) => s?.type === "closing");
  if (at === -1) at = slides.length;
  const inherit = slides[at]?.section ?? [...slides].reverse().find((s) => Number.isInteger(s?.section))?.section ?? 0;
  const seated = slide.section == null ? { ...slide, section: inherit } : slide;
  slides.splice(at, 0, seated);
  return { deck: { ...deck, slides }, inserted: true, index: at };
}
