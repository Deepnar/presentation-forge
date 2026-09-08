
const UNITS = new Set([
  "%", "gw", "mw", "kw", "w", "kwh", "mwh", "twh", "gwh", "kg", "km", "m",
  "cm", "mm", "v", "a", "hz", "gb", "tb", "billion", "million", "trillion",
  "thousand", "years", "year", "yr", "people", "tonnes", "tonne", "tons",
  "ton", "usd", "eur", "inr", "°c", "c",
]);

const NAME_STOP = new Set([
  "the", "a", "an", "in", "on", "at", "by", "to", "of", "for", "and", "or",
  "with", "from", "into", "over", "under", "this", "that", "these", "those",
  "first", "new", "key", "top", "best", "our", "their", "introduction",
  "conclusion", "how", "why", "what",
]);

const NUMBER_RE = /^\d[\d,]*(?:\.\d+)?$/;
const YEAR_RE = /^(?:19|20)\d{2}$/;

function words(text) {
  return String(text).split(/\s+/).filter(Boolean);
}

function unitAfter(tokens, i) {
  const next = tokens[i + 1]?.replace(/^\(/, "").replace(/[;,.)]+$/, "").toLowerCase();
  const original = tokens[i + 1];
  return next && UNITS.has(next) ? original.replace(/[;,.)]+$/, "") : null;
}

export function extractClaims(text, { names = true } = {}) {
  const claims = new Set();
  const t = String(text ?? "");

  const toks = words(t);
  toks.forEach((tok, i) => {
    const num = tok.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
    if (num) {
      const unit = unitAfter(toks, i);
      claims.add(unit ? `${num} ${unit}` : num);
    }
  });

  if (names) {
    const caps = toks.map((w) => /^[A-Z][a-z]+$/.test(w));
    for (let i = 0; i < toks.length; i++) {
      if (!caps[i]) continue;
      for (let len = 2; len <= 3; len++) {
        if (i + len > toks.length || !caps.slice(i, i + len).every(Boolean)) break;
        const phrase = toks.slice(i, i + len).join(" ");
        if (!NAME_STOP.has(toks[i].toLowerCase())) claims.add(phrase);
      }
    }
  }
  return [...claims];
}

export function flattenSlide(slide, { relativeChart = false } = {}) {
  const out = [];
  const walk = (v, key) => {
    if (typeof v === "string") out.push(v);
    else if (typeof v === "number" && key !== "depends_on") {
      if (relativeChart && key === "values" && v === 100) return; // baseline origin
      out.push(relativeChart && key === "values" ? String(Math.round(Math.abs(100 - v) * 100) / 100) : String(v));
    }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  const { notes, cites, presenter, type, section, ...content } = slide;
  Object.entries(content).forEach(([k, v]) => walk(v, k));
  return out;
}

export function isRelativeChart(slide) {
  const c = slide?.chart;
  if (!c) return false;
  return /^%?\s*of\b/i.test(c.unit ?? "") ||
    /relative/i.test(c.unit ?? "") ||
    (c.categories ?? []).some((x) => /relative/i.test(String(x)));
}

export function deckFigures(deck) {
  const FIGURE_TYPES = new Set([
    "chart", "journey", "progress-bars", "sparklines", "scorecard",
    "decision-matrix", "stats", "data-cards", "kpi-dashboard", "ranking-list",
    "metric-comparison", "big-number",
  ]);
  const figures = [];
  const seen = new Set();
  for (const slide of deck.slides ?? []) {
    if (!FIGURE_TYPES.has(slide.type)) continue;
    const { headline, standfirst, notes, cites, presenter, type, section, ...rest } = slide;
    for (const text of flattenSlide(rest)) {
      for (const claim of extractClaims(text, { names: false })) {
        if (!seen.has(claim)) { seen.add(claim); figures.push(claim); }
      }
    }
  }
  return figures;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[\s,'’]+/g, " ").trim();
}

export function claimGrounded(claim, researchText) {
  const research = normalize(researchText);
  const n = normalize(claim);

  if (research.includes(n)) return true;

  const num = claim.match(/\b\d[\d,]*(?:\.\d+)?\b/)?.[0];
  if (num) {
    const bare = num.replace(/,/g, "");
    if (new RegExp(`(^|\\s)${escapeRegExp(bare)}(\\s|$)`).test(research)) return true;
    const spaced = normalize(num);
    if (spaced !== bare && new RegExp(`(^|\\s)${escapeRegExp(spaced)}(\\s|$)`).test(research)) return true;
    const unit = n.replace(normalize(num), "").trim();
    if (unit && research.includes(`${normalize(num)}${unit.replace(/\s+/g, "")}`)) return true;
  }
  return false;
}

function strongField(text) {
  return extractClaims(text, { names: false }).some((c) => {
    const num = c.match(/\d[\d,]*\.?\d*/)?.[0].replace(/,/g, "");
    if (!num) return false;
    return /\d{3}/.test(num) || c.trim() !== num;
  });
}

export function groundDeck(deck, researchText, { label = "research/notes.md" } = {}) {
  if (!researchText?.trim()) return { findings: [], problems: [], notes: deck };

  const findings = [];
  (deck.slides ?? []).forEach((slide, i) => {
    const noNames = new Set([slide.headline, slide.standfirst].filter(Boolean));
    const claims = flattenSlide(slide, { relativeChart: isRelativeChart(slide) })
      .flatMap((text) => extractClaims(text, { names: !noNames.has(text) && strongField(text) }))
      .filter((c) => !claimGrounded(c, researchText));
    if (claims.length) findings.push({ slide: i, type: slide.type, claims: [...new Set(claims)] });
  });

  const notes = structuredClone(deck);
  const problems = [];
  for (const f of findings) {
    const slide = notes.slides[f.slide];
    const line = `[grounding] unverified — not found in ${label}: ${f.claims.join("; ")}`;
    slide.notes = slide.notes ? `${slide.notes}\n${line}` : line;
    problems.push(`slide ${f.slide + 1} (${f.type}): ungrounded claim(s) — ${f.claims.join("; ")}`);
  }

  return { findings, problems, notes };
}
