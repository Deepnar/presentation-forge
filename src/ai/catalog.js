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

function familyFor(type) {
  for (const [name, list] of Object.entries(FAMILIES)) {
    if (list.includes(type)) return name;
  }
  return null;
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

  // Each conditional branch declares one type and the fields it requires.
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
