/**
 * Content grounding — the hallucination guard.
 *
 * Runs after slide generation: the writer was handed research/notes.md and told
 * to derive stats and factual claims from it, but a model can still emit "180 GW
 * by 2030" when no such figure exists anywhere in the notes. This pass compares
 * every slide's factual claims — numbers, dates, units, proper-noun phrases —
 * against the research text and flags whatever it cannot find, into the slide's
 * speaker notes and the render result's problems[]. It is honest by
 * construction: it flags what it cannot verify, and never rewrites or fabricates
 * a number to make the check pass.
 *
 * Without research text there is nothing to ground against, so the pass stays
 * silent — flagging every number would be noise, not honesty.
 */

/** Unit words that attach to a number and make a stronger claim. */
const UNITS = new Set([
  "%", "gw", "mw", "kw", "w", "kwh", "mwh", "twh", "gwh", "kg", "km", "m",
  "cm", "mm", "v", "a", "hz", "gb", "tb", "billion", "million", "trillion",
  "thousand", "years", "year", "yr", "people", "tonnes", "tonne", "tons",
  "ton", "usd", "eur", "inr", "°c", "c",
]);

/** Words a capitalized phrase must not start with — "The framework" is not a name. */
const NAME_STOP = new Set([
  "the", "a", "an", "in", "on", "at", "by", "to", "of", "for", "and", "or",
  "with", "from", "into", "over", "under", "this", "that", "these", "those",
  "first", "new", "key", "top", "best", "our", "their", "introduction",
  "conclusion", "how", "why", "what",
]);

const NUMBER_RE = /^\d[\d,]*(?:\.\d+)?$/;
const YEAR_RE = /^(?:19|20)\d{2}$/;

/**
 * Split text into words, keeping the numeric tokens tagged by position so a
 * number and its unit word can be glued back together.
 */
function words(text) {
  return String(text).split(/\s+/).filter(Boolean);
}

/** The unit word immediately following a number, if any. Case preserved for display. */
function unitAfter(tokens, i) {
  const next = tokens[i + 1]?.replace(/^\(/, "").replace(/[;,.)]+$/, "").toLowerCase();
  const original = tokens[i + 1];
  return next && UNITS.has(next) ? original.replace(/[;,.)]+$/, "") : null;
}

/**
 * Claims from one text: numbers (optionally with their unit), years, and
 * proper-noun phrases. Deduplicated so a repeated figure flags once.
 * `names: false` skips the phrase pass — headlines and standfirsts are
 * rhetorical, not claims, and "Global hydrogen capacity" is not a fact to
 * verify.
 */
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
    // A capitalized run ("The Inflation Reduction Act") must yield every
    // 2-3 word phrase inside it, not just the one the regex anchors on first —
    // otherwise a leading stopword like "The" swallows the actual name.
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

/** All displayable strings in a slide — content the writer produced. */
export function flattenSlide(slide) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  const { notes, cites, presenter, type, section, ...content } = slide;
  Object.values(content).forEach(walk);
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[\s,.'’]+/g, " ").trim();
}

/**
 * Is the claim supported by the research? A number with a unit matches the
 * research as the glued phrase ("180 gw"), the unit-spaced phrase ("180 gw"),
 * or the bare standalone number ("180"); a year or name matches as a literal.
 */
export function claimGrounded(claim, researchText) {
  const research = normalize(researchText);
  const n = normalize(claim);

  if (research.includes(n)) return true;

  const num = claim.match(/\b\d[\d,]*(?:\.\d+)?\b/)?.[0];
  if (num) {
    const bare = num.replace(/,/g, "");
    if (new RegExp(`(^|\\s)${escapeRegExp(bare)}(\\s|$)`).test(research)) return true;
    const unit = n.replace(normalize(num), "").trim();
    if (unit && research.includes(`${normalize(num)}${unit.replace(/\s+/g, "")}`)) return true;
  }
  return false;
}

/**
 * Is this field prose carrying a real figure? A unit-bearing number, a year, or
 * a 3+ digit number is a figure worth tying a name to; a bare "2" (from "H2")
 * or a label with no number is not.
 */
function strongField(text) {
  return extractClaims(text, { names: false }).some((c) => {
    const num = c.match(/\d[\d,]*\.?\d*/)?.[0].replace(/,/g, "");
    if (!num) return false;
    return /\d{3}/.test(num) || c.trim() !== num;
  });
}

/**
 * Ground a deck against its research. Returns findings and problems; applies
 * the notes so the caller can persist them.
 *
 * `findings`: [{ slide, type, claims }] — the ungrounded claims per slide.
 * `problems`: ready-to-display strings for the render result.
 * `notes`:    the deck clone with a grounding line appended to each flagged
 *             slide's notes, so the speaker sees exactly what to verify.
 */
export function groundDeck(deck, researchText) {
  if (!researchText?.trim()) return { findings: [], problems: [], notes: deck };

  const findings = [];
  (deck.slides ?? []).forEach((slide, i) => {
    // Headlines and standfirsts state the rhetorical frame, not a claim — their
    // numbers still get checked, their noun phrases do not. A name only becomes
    // a checkable claim when its field carries a real figure ("Inflation
    // Reduction Act unlocked 180 GW"); a bare card title or label ("Early
    // Innovator", "Electricity Required per kg H2") is a name, not a fact, and
    // flagging it is noise.
    const noNames = new Set([slide.headline, slide.standfirst].filter(Boolean));
    const claims = flattenSlide(slide)
      .flatMap((text) => extractClaims(text, { names: !noNames.has(text) && strongField(text) }))
      .filter((c) => !claimGrounded(c, researchText));
    if (claims.length) findings.push({ slide: i, type: slide.type, claims: [...new Set(claims)] });
  });

  const notes = structuredClone(deck);
  const problems = [];
  for (const f of findings) {
    const slide = notes.slides[f.slide];
    const line = `[grounding] unverified — not found in research/notes.md: ${f.claims.join("; ")}`;
    slide.notes = slide.notes ? `${slide.notes}\n${line}` : line;
    problems.push(`slide ${f.slide + 1} (${f.type}): ungrounded claim(s) — ${f.claims.join("; ")}`);
  }

  return { findings, problems, notes };
}
