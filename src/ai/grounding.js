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

/**
 * All displayable strings in a slide — content the writer produced. Numbers
 * join as bare-string claims so a chart value or journey value that the
 * research never states is flagged like any fabricated figure: "180" in a
 * chart's series is a claim to verify. The one structural exception is
 * `depends_on` — dependency indices, integers that reference other nodes, not
 * measurements.
 *
 * `relativeChart` resolves the series values of a chart drawn on a RELATIVE
 * axis ("% of baseline", or a "(relative)" category) to their percentage
 * claims, because on such an axis the raw value is a coordinate, not a fact:
 * "125" on a "% of MPI+OpenMP" axis encodes "25% higher" and the research
 * states the percentage, never the normalised coordinate. Flagging the raw
 * coordinate is a false positive; flagging the delta ("25") is the honest
 * check. The 100-baseline itself is the scale origin, not a measurement, and
 * is dropped so it never flags. `deckFigures` leaves this off so the Research
 * view lists the numbers the geometry actually draws.
 */
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

/** Is this chart drawn on a relative "% of baseline" axis — where a value V
 *  means "V% of baseline" and the real claim is the delta from 100? Signalled
 *  by a "% of X" unit or a "(relative)" category label. */
export function isRelativeChart(slide) {
  const c = slide?.chart;
  if (!c) return false;
  return /^%?\s*of\b/i.test(c.unit ?? "") ||
    /relative/i.test(c.unit ?? "") ||
    (c.categories ?? []).some((x) => /relative/i.test(String(x)));
}

/**
 * The figures a data-bearing deck claims, deduplicated in slide order — chart
 * and journey values, progress-bar/sparkline/scorecard numbers, stat values
 * and unit-bearing labels. The Research view lists these so a human can
 * cross-check every number the geometry draws against the sources the deck was
 * built from — the "are the graphs reflective of real numbers?" question the
 * user wants answered before presenting, not after.
 */
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
    // Headlines, standfirsts and structural fields are not figures to verify.
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
  // Keep the decimal point: stripping it turns "18.84 gigawatts" into
  // "18 84 gigawatts", so the bare-number check for "18.84 GW" could never
  // match a figure the notes carry with a full unit word. Commas and
  // apostrophes still collapse so "18,000" and "18 000" agree.
  return String(s).toLowerCase().replace(/[\s,'’]+/g, " ").trim();
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
    // The comma-normalized form: research "1,232 MW" normalizes to "1 232 mw",
    // so "1,232 MW" must also match "1,232 megawatts" via the spaced digits.
    const spaced = normalize(num);
    if (spaced !== bare && new RegExp(`(^|\\s)${escapeRegExp(spaced)}(\\s|$)`).test(research)) return true;
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
 * `label`:    what the notes are named in that line — "research/notes.md" for a
 *             web research pass, "your uploaded file" for upload-only mode,
 *             where the fidelity contract is stricter and worth naming.
 */
export function groundDeck(deck, researchText, { label = "research/notes.md" } = {}) {
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
