import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../paths.js";

/**
 * Renders the slide-type catalogue that goes into the model's prompt, derived
 * from deck.schema.json at run time.
 *
 * Hand-writing this list is the obvious shortcut and guarantees drift: the
 * schema gains a field, the prompt keeps describing the old shape, and the
 * model produces output that fails validation for reasons nothing explains.
 */

let _cache;
let _schema;

/** The parsed deck schema, loaded once. */
export async function deckSchema() {
  if (!_schema) {
    _schema = JSON.parse(await readFile(path.join(ROOT, "schema", "deck.schema.json"), "utf8"));
  }
  return _schema;
}

/**
 * Family grouping for the wider type vocabulary. Hand-maintained because the
 * schema has no family concept and its only job is to make 50 choices
 * navigable; the type *list* and every field still derive from the schema, so
 * a typo here mislabels a type, never invents one. Types absent from every
 * family (freeform) are the escape hatch, listed last.
 */
const FAMILIES = {
  Foundation: ["title", "section", "chapter", "closing", "agenda", "references"],
  "List & Grid": ["bullets", "numbered-list", "checklist", "feature-grid", "grid-items", "icon-list", "stacked-list"],
  "Data & Stats": ["stats", "big-number", "kpi-dashboard", "data-cards", "progress-bars", "ranking-list", "metric-comparison", "sparklines"],
  Comparison: ["compare", "pros-cons", "before-after", "framework", "matrix", "scorecard", "vs", "side-by-side"],
  "Process & Flow": ["flow", "cycle", "funnel", "pipeline", "dependencies", "branching-flow", "layered-architecture"],
  "Timeline & Milestone": ["timeline", "milestone", "roadmap", "journey", "chronology"],
  "Quote & Testimonial": ["quote", "testimonial", "pull-quote", "epigraph"],
  "Callout & Highlight": ["callout", "emphasis", "warning", "tip", "takeaway"],
  "Image & Visual": ["image", "image-text", "image-grid", "hero-image", "split-screen"],
  "Table & Matrix": ["table", "data-table", "decision-matrix"],
  Chart: ["chart"],
  "Diagram-ish": ["diagram", "pyramid", "venn", "hierarchy", "concept-map"],
  "Definitions & FAQ": ["definition", "glossary", "faq"],
  "Team & Attribution": ["team-grid", "attribution", "contact"],
  Special: ["equation", "bibliography", "data-source"],
};

export function familyFor(type) {
  for (const [name, list] of Object.entries(FAMILIES)) {
    if (list.includes(type)) return name;
  }
  return null;
}

/**
 * Per-family content budgets at each density. The sweep rewrites a deck's
 * content at a chosen density; these are the per-type targets the writer is
 * told to hit — sparse means few short bullets, dense means more, longer.
 * Families absent here fall back to the generic budget.
 */
export const DENSITY_BUDGETS = {
  sparse: {
    generic: "a few words — 1-2 short items where the type allows lists, one-line bodies",
    "List & Grid": "3-4 short bullets, each under 12 words; card bodies one short phrase",
    "Data & Stats": "3 stats maximum, each a figure and a short label",
    Comparison: "one key point per side, kept to a single line each",
    "Process & Flow": "3-4 steps, each a short phrase",
    "Timeline & Milestone": "3-4 milestones, each a year and a short phrase",
    "Callout & Highlight": "a single line callout — one sentence",
    "Definitions & FAQ": "1-2 terms, each a one-line definition",
  },
  balanced: {
    generic: "4-6 items where the type allows lists, 1-2 sentence bodies",
    "List & Grid": "4-6 bullets, each 12-25 words; card bodies 1-2 sentences",
    "Data & Stats": "3-4 stats, each a figure with a one-line label",
    Comparison: "2-3 points per side, each a short sentence",
    "Process & Flow": "4-5 steps, each a short sentence",
    "Timeline & Milestone": "4-5 milestones, each a date and a sentence",
    "Callout & Highlight": "a two-sentence callout",
    "Definitions & FAQ": "2-3 terms, each a one-to-two-line definition",
  },
  dense: {
    generic: "6-8 items where the type allows lists, 2-3 sentence bodies",
    "List & Grid": "6-8 bullets, each 20-40 words; card bodies 2-3 sentences",
    "Data & Stats": "4-5 stats, each a figure with a label and one-line context",
    Comparison: "3-4 points per side, each a full sentence",
    "Process & Flow": "5-6 steps, each a full sentence",
    "Timeline & Milestone": "5-6 milestones, each a date and a sentence of context",
    "Callout & Highlight": "a three-sentence callout",
    "Definitions & FAQ": "3-4 terms, each a two-to-three-line definition",
  },
};

/** The budget string for one slide type at one density, or the generic fallback. */
export function densityBudget(density, type, family) {
  const level = DENSITY_BUDGETS[density] ?? DENSITY_BUDGETS.balanced;
  return level[family] ?? level.generic;
}

/**
 * Plain-language slide descriptions for the outline review — "Stats — shows 4
 * big numbers with captions". One source of truth: the in-chat outline renders
 * exactly these, so a slide type reads as what it will contain rather than as a
 * schema enum value. Every type in the enum must have an entry; the guard at
 * the bottom of this file refuses to ship a drift.
 */
export const TYPE_DESCRIPTIONS = {
  title: "the cover with your team and guide",
  section: "a divider announcing the next part of the talk",
  chapter: "a larger opener with an agenda of what follows",
  closing: "the thank-you and wrap-up screen",
  agenda: "the talk's roadmap as a numbered list",
  bullets: "key points as short bullets",
  "numbered-list": "steps or priorities in order",
  checklist: "items with done-tick boxes",
  "feature-grid": "features laid out in a grid of small cards",
  "grid-items": "many small labelled tiles in rows",
  "icon-list": "points with an icon per row",
  "stacked-list": "rows stacked, each with a label and a detail line",
  cards: "a set of cards, each a headline plus a line of text",
  compare: "two options side by side, point for point",
  "pros-cons": "the wins and costs of one option in two columns",
  "before-after": "a change shown as two states",
  framework: "a boxed diagram showing how the pieces fit",
  matrix: "items scored against two axes",
  scorecard: "criteria scored in a simple table",
  vs: "two contenders head to head",
  "side-by-side": "two panels compared, image or text",
  stats: "big numbers with captions",
  "big-number": "one number made the whole slide",
  "kpi-dashboard": "a row of key-figure tiles",
  "data-cards": "stat cards, one figure per card",
  "progress-bars": "figures shown as filled bars",
  "ranking-list": "an ordered list with a rank number per row",
  "metric-comparison": "two sets of figures compared across metrics",
  sparklines: "small trend lines under the numbers",
  quote: "a quotation with its source",
  testimonial: "someone in their own words",
  "pull-quote": "one line pulled out for emphasis",
  epigraph: "a short motto opening a section",
  callout: "a highlighted note in its own box",
  emphasis: "one idea made visually loud",
  warning: "a caution the audience must not miss",
  tip: "a practical hint worth taking away",
  takeaway: "the one thing to remember",
  table: "rows and columns of data",
  "data-table": "figures laid out in a proper table",
  "decision-matrix": "options scored against weighted criteria",
  chart: "a live chart from the data",
  flow: "steps connected by arrows",
  cycle: "a loop of stages round a circle",
  funnel: "stages narrowing as the audience narrows",
  pipeline: "stages passing left to right into the next",
  dependencies: "boxes linked by who needs whom",
  "branching-flow": "one path splitting into branches",
  "layered-architecture": "stacked tiers of a system",
  image: "a full-width image with a caption",
  "image-text": "an image beside supporting text",
  "image-grid": "several images in a grid",
  "hero-image": "one large image as the slide",
  "split-screen": "two halves, an image and text",
  timeline: "events in time along a line",
  milestone: "key milestones marked in sequence",
  roadmap: "phases mapped toward a goal",
  journey: "a path travelled through stages",
  chronology: "dates in order with their events",
  references: "the sources cited",
  diagram: "a custom diagram of boxes and links",
  pyramid: "a hierarchy stacked from base to peak",
  venn: "overlapping sets and their intersections",
  hierarchy: "a tree of parent and child items",
  "concept-map": "ideas linked around a central topic",
  definition: "a term and what it means",
  glossary: "terms and meanings in a list",
  faq: "questions with short answers",
  "team-grid": "the team with names and rolls",
  attribution: "credit for sources and imagery",
  contact: "reach details at a glance",
  equation: "a formula presented alone",
  bibliography: "full citations in a list",
  "data-source": "where the figures came from",
  freeform: "a fully custom design — rasterised, not editable in PowerPoint",
};

/** "flow" in the outline; "Flow — six steps connected by arrows". */
export function describeType(type) {
  const meta = TYPE_DESCRIPTIONS[type];
  return meta ? `${meta}` : type;
}

export function typeLabel(type) {
  const pretty = (String(type ?? "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  return pretty || "Slide";
}

/**
 * The chart kinds the schema's `chart` type accepts, in one place so the
 * steering hint can name them without re-deriving the enum.
 */
export const CHART_KINDS = ["bar", "hbar", "line", "area", "pie", "doughnut", "scatter", "radar", "stacked-bar"];

/**
 * How many distinct numeric facts the research carries. A fact is a number
 * with a unit or percentage ("180 GW", "4.2%") or a 3+ digit figure ("1789",
 * "1.23"), deduplicated so one figure repeated across sources counts once.
 * This is the "≥2 numeric facts" threshold behind the data-affinity steering.
 */
export function numericFactCount(research) {
  const t = String(research ?? "");
  const facts = new Set();
  const re = /\b(\d[\d,]*(?:\.\d+)?)(\s*%|\s*(?:kwh?|gwh?|twh?|mwh?|gw|mw|kw|w|kg|km|mm|cm|v|a|hz|gb|tb|billion|million|thousand|people|years?|yr|tonnes?|tons?|usd|eur|inr)\b)?/gi;
  for (const m of t.matchAll(re)) {
    const num = m[1].replace(/,/g, "");
    if (m[2]) facts.add(`${m[1]} ${m[2].trim().toLowerCase()}`);
    else if (/^\d{3,}$/.test(num) || num.includes(".")) facts.add(num);
  }
  return facts.size;
}

/**
 * The data-affinity steering note: when the research carries real figures, a
 * data beat should be visualised as a chart, not restated as big numbers. The
 * planner (and the writer, for chart slides) is told the chart kinds and which
 * one matches which comparison. Returns null when the research is not numeric.
 */
export function dataAffinityNote(research) {
  const count = numericFactCount(research);
  if (count < 2) return null;
  return (
    `The research carries ${count} numeric facts — figures, percentages, comparisons, trends. ` +
    "Data beats should be CHART slides (type `chart`, kinds: " +
    `${CHART_KINDS.join("|")}) rather than stats/big-number/cards, so the numbers are actually ` +
    "visualised: scatter for correlations, radar for multi-attribute profiles, stacked-bar for " +
    "composition over time, bar/line/area for trends and comparisons, pie/doughnut for shares. " +
    "The chart's numbers must still come verbatim from the research."
  );
}

/**
 * The enum's plain-language descriptions, for the outline review and the inline
 * editor. Walks the schema so the set never drifts from the vocabulary, and
 * throws on a type the map has missed — the guard that keeps the two in lockstep.
 */
export async function typeDescriptions() {
  const schema = await deckSchema();
  const types = schema.definitions.slide.properties.type.enum;
  const out = {};
  for (const t of types) {
    if (!TYPE_DESCRIPTIONS[t]) {
      throw new Error(`TYPE_DESCRIPTIONS is missing an entry for "${t}"`);
    }
    out[t] = {
      label: typeLabel(t),
      description: TYPE_DESCRIPTIONS[t],
    };
  }
  return out;
}

export async function slideCatalog() {
  if (_cache) return _cache;

  const schema = await deckSchema();
  const slide = schema.definitions.slide;
  const types = slide.properties.type.enum;
  const shared = Object.keys(slide.properties).filter((k) => k !== "type");

  const byType = await fieldsByType(schema);

  const lines = types.map((t) => {
    const e = byType.get(t);
    if (!e.fields.length) return `- ${t}: (no type-specific fields)`;
    const req = new Set(e.required);
    const fields = e.fields
      .map((f) => (req.has(f.name) ? `${f.text} [required]` : f.text))
      .join("; ");
    return `- ${t}: ${fields}`;
  });

  const byFamily = new Map();
  const escape = [];
  for (const t of types) {
    const fam = familyFor(t);
    if (!fam) escape.push(t);
    else byFamily.set(fam, [...(byFamily.get(fam) ?? []), t]);
  }
  const familyLines = [
    ...[...byFamily.entries()].map(([fam, ts]) => `${fam.toUpperCase()}: ${ts.join(", ")}`),
    escape.length ? `ESCAPE HATCH (rasterised, text not editable): ${escape.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  _cache =
    `Shared fields on any slide: ${shared.join(", ")}.\n` +
    `"section" is a 0-based index into deck.sections.\n\n` +
    `Slide types by family:\n${familyLines}\n\n` +
    `Per-type fields:\n${lines.join("\n")}`;

  return _cache;
}

/** Each conditional branch → { type → { required, fields } }. Shared extraction
 *  for the full catalog and the per-type prompt. */
async function fieldsByType(schema) {
  const slide = schema.definitions.slide;
  const types = slide.properties.type.enum;
  const byType = new Map(types.map((t) => [t, { required: [], fields: [] }]));
  for (const rule of slide.allOf ?? []) {
    const type = rule.if?.properties?.type?.const;
    if (!type || !byType.has(type)) continue;
    const then = rule.then ?? {};
    const entry = byType.get(type);
    entry.required = then.required ?? [];
    entry.fields = Object.entries(then.properties ?? {}).map(([name, spec]) =>
      describeField(name, spec, schema),
    );
  }
  return byType;
}

/** The field spec for ONE slide type — a scoped catalog line for prompts that
 *  only touch a single slide (the density sweep), instead of the whole 75-type
 *  catalogue. Keeping the grammar-relevant contract while cutting prompt size. */
export async function catalogForType(type) {
  const schema = await deckSchema();
  const slide = schema.definitions.slide;
  const shared = Object.keys(slide.properties).filter((k) => k !== "type");
  const byType = await fieldsByType(schema);
  const e = byType.get(type) ?? { required: [], fields: [] };
  const req = new Set(e.required);
  const fields = e.fields
    .map((f) => (req.has(f.name) ? `${f.text} [required]` : f.text))
    .join("; ");
  return (
    `Shared fields on any slide: ${shared.join(", ")}. "section" is a 0-based index into deck.sections.\n` +
    `This slide is type "${type}". Fields: ${fields || "(none)"}.`
  );
}

function describeField(name, spec, schema) {
  const resolved = spec.$ref ? resolveRef(spec.$ref, schema) : spec;
  const bits = [];

  if (resolved.enum) bits.push(`one of ${resolved.enum.join("|")}`);
  else if (resolved.type === "array") {
    const item = resolved.items?.$ref ? resolveRef(resolved.items.$ref, schema) : resolved.items;
    const inner = item?.type === "object"
      ? `{${Object.keys(item.properties ?? {}).join(", ")}}`
      : item?.type ?? "value";
    const range = [
      resolved.minItems ? `min ${resolved.minItems}` : null,
      resolved.maxItems ? `max ${resolved.maxItems}` : null,
    ].filter(Boolean).join(", ");
    bits.push(`array of ${inner}${range ? ` (${range})` : ""}`);
  } else if (resolved.type === "object") {
    bits.push(`{${Object.keys(resolved.properties ?? {}).join(", ")}}`);
  }

  if (resolved.maxLength) bits.push(`≤${resolved.maxLength} chars`);

  return { name, text: `${name}${bits.length ? ` (${bits.join(", ")})` : ""}` };
}

function resolveRef(ref, schema) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], schema) ?? {};
}
