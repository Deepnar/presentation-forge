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
    "List & Grid": "4 short bullets (minimum the schema allows), each under 12 words; card bodies one short phrase",
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
 * Per-type content invitations — the substance a layout is BUILT to hold,
 * beyond the schema's minimum. The 75-type visual audit showed several types
 * render sparse because the writer filled the schema minima: 2 stats on a
 * four-up grid, a 3-row table on a full-width slide, title-only framework
 * elements round a ring. These tell the writer how much the layout invites, so
 * a slide fills its space instead of reading as an empty shell. Types absent
 * here get no extra guidance — the family density budget governs.
 */
export const TYPE_BUDGETS = {
  framework: "a full ring of 6 elements, EACH with its own one-line body — a title-only element reads as an empty node",
  "concept-map": "4-6 branches, each with 2-3 SHORT leaf items (one or two words — long leaves cannot fit a radial layout)",
  stats: "4 stats — the layout is a four-up grid; two stats on it read half-empty",
  "big-number": "the number, a short label, and a two-to-three-line body plus source",
  table: "5-8 rows — the table is full-width and a 3-row table leaves the slide empty",
  "data-table": "5-8 rows — the table is full-width and a 3-row table leaves the slide empty",
  definition: "the term, a full definition, an example, and one line on why it matters",
  glossary: "5-8 terms — the list is built for a full page of vocabulary",
  faq: "5-6 questions with real answers — the list is built for a full page",
  "pros-cons": "5-6 items per side — the two columns have room for a full trade-off",
  milestone: "4 milestones, each with a body sentence — the rail is a full-height layout",
  chronology: "6-10 events with a sentence each — the list fills the slide",
  bibliography: "6-10 entries, with an annotation where it earns one",
  references: "6-10 citations — a short list on this full-width layout reads empty",
  "data-source": "4-8 sources, each with a one-line description of what it provides",
  journey: "5-8 stages, each with a sentence body — the rail spans the full width. Only give a stage a numeric `value` when the RESEARCH carries that measurement (the line is then real); a qualitative high/low is `sentiment` only, and the journey renders as an illustrative flat rail — never invent values or sentiments",
  timeline: "4-6 events — the line spans the full width and a 3-event timeline reads thin",
  cycle: "4-5 steps, each with a one-line body round the ring",
  pipeline: "4-6 stages, each with a body and a gate",
  funnel: "4-6 stages, each with a label and a one-line body where it earns one. Give every stage a number value ONLY when the research carries the conversions — the taper is real then; a single missing value renders equal-width steps",
  flow: "4-5 steps, each a title plus a short body (a 6-step vertical flow drops bodies to stay readable)",
  "layered-architecture": "4-5 layers, each with a body and 2-3 item pills",
  agenda: "as many entries as there are parts, each with a one-line detail",
  "decision-matrix": "enough rows and columns that the grid reads as a real comparison, 4-6 rows",
  scorecard: "3-4 options scored against 3-5 criteria — the grid should be visibly full",
  roadmap: "3 phases with 2-4 items each — the grid is built for a full board",
};

/**
 * The per-type content invitation for one type, or the empty string when the
 * family budget governs. Rides the planner and writer catalogues so the model
 * fills what the layout invites.
 */
export function typeBudget(type) {
  return TYPE_BUDGETS[type] ?? "";
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

/**
 * Per-type selection guidance — "use this type when…" in one line. The
 * description says WHAT a type is; this says WHEN to pick it, so the writer's
 * and planner's type choice is grounded in intent, not the type name alone.
 * Every enum type must have an entry (the guard below refuses to ship a
 * drift, exactly like TYPE_DESCRIPTIONS).
 */
export const TYPE_USE_WHEN = {
  title: "use for the opening cover — one shot to say what the talk is, who presents and for whom",
  section: "use to open a new major part of the talk — it announces the next section, carries no presenter",
  chapter: "use for a large opener with a mini-agenda when a major part deserves a heavier landing than a divider",
  closing: "use for the final screen — the thank-you, the wrap-up, the call to keep the conversation going",
  agenda: "use early to show the talk's roadmap so the audience knows where it is going",
  bullets: "use for the default explanatory beat — key points as short complete statements, the workhorse slide",
  "numbered-list": "use when order matters — steps, priorities, a ranked sequence the audience should follow in sequence",
  checklist: "use for items with a done/not-done reading — readiness, adoption, requirements met",
  "feature-grid": "use to present a set of features or capabilities as small cards, each a headline plus a line",
  "grid-items": "use for many small labelled tiles — a vocabulary, a catalog, a set of names",
  "icon-list": "use for points where each row earns an icon — categories, principles, distinctions",
  "stacked-list": "use for rows that each carry a label AND a detail line — steps with an explanation per step",
  cards: "use for 2-4 related ideas, each a headline and a body — the compare-free alternative to bullets",
  compare: "use to put TWO options side by side so the audience weighs them point for point",
  "pros-cons": "use for ONE option's wins and costs in two columns — an honest trade-off read",
  "before-after": "use to show a change as two states — the old way versus the new way, the problem versus the fix",
  framework: "use to show how the pieces of a system fit together in a boxed structure",
  matrix: "use to score items against two axes — effort versus impact, cost versus benefit",
  scorecard: "use to grade options against fixed criteria in a simple table",
  vs: "use for two contenders head to head — sharper and more direct than compare",
  "side-by-side": "use to put two panels beside each other where at least one is visual (image or text block)",
  stats: "use for a handful of headline figures that frame the argument — numbers with captions",
  "big-number": "use for ONE number that is the slide's whole point — make it the loudest thing on screen",
  "kpi-dashboard": "use for a row of key-figure tiles when several metrics matter at once",
  "data-cards": "use for stat cards — one figure per card, a small set of independent metrics",
  "progress-bars": "use to show figures as filled bars — shares, completion, capacity against a target",
  "ranking-list": "use for an ordered list where the RANK is the point — top five, best to worst",
  "metric-comparison": "use to compare two sets of figures across the same metrics — who wins on what",
  sparklines: "use for small trend lines under the numbers — direction matters more than exact values",
  quote: "use for a quotation with its source — let someone else make the point in their words",
  testimonial: "use for someone in their own words — a first-hand voice on the topic",
  "pull-quote": "use to pull ONE line out of the argument for emphasis — the line worth remembering",
  epigraph: "use for a short motto opening a section — a tone-setter, not an argument",
  callout: "use for a highlighted note in its own box — an aside that must not be missed",
  emphasis: "use to make ONE idea visually loud — the point everything else supports",
  warning: "use for a caution the audience must not miss — a risk, a misconception, a cost",
  tip: "use for a practical hint worth taking away — how to apply what was just argued",
  takeaway: "use for the ONE thing to remember — the closing claim of a section or the talk",
  table: "use for rows and columns of data the audience should read directly",
  "data-table": "use for figures laid out in a proper table when precise values matter",
  "decision-matrix": "use to score options against weighted criteria so the best choice falls out",
  chart: "use to VISUALISE the data — trends, comparisons, shares, correlations (prefer it when the research carries numbers)",
  flow: "use for steps connected by arrows — a process the audience should see move left to right or top to bottom",
  cycle: "use for a loop of stages round a circle — something that repeats or feeds back",
  funnel: "use for stages narrowing as the audience narrows — conversion, qualification, adoption",
  pipeline: "use for stages passing left to right into the next — an assembly line, a data path",
  dependencies: "use for boxes linked by who needs whom — a dependency graph, a build order",
  "branching-flow": "use for one path splitting into branches — options, decision trees, outcomes",
  "layered-architecture": "use for stacked tiers of a system — layers, abstractions, responsibilities",
  image: "use for a full-width image with a caption — the visual IS the slide (needs a real image)",
  "image-text": "use for an image beside supporting text — the claim next to its visual proof",
  "image-grid": "use for several images in a grid — a gallery, a set of examples",
  "hero-image": "use for one large image as the slide — a dramatic opening or closer",
  "split-screen": "use for two halves, one image and one text — a contrast anchored by a visual",
  timeline: "use for events in time along a line — how things developed, what happened when",
  milestone: "use for key milestones marked in sequence — the moments that mattered",
  roadmap: "use for phases mapped toward a goal — a plan, a trajectory, a future path",
  journey: "use for a path travelled through stages — a user journey, a learning arc. Give stages a numeric `value` only when the research carries real measurements; a qualitative shape is `sentiment` alone (the layout draws a flat rail, never a fake line)",
  chronology: "use for dates in order with their events — a historical account, a changelog",
  references: "use to list the sources cited on this slide or in this section",
  diagram: "use for a custom diagram of boxes and links when no stock layout fits",
  pyramid: "use for a hierarchy stacked from base to peak — priorities, Maslow, tiers",
  venn: "use for overlapping sets and their intersections — what is shared, what is exclusive",
  hierarchy: "use for a tree of parent and child items — org charts, taxonomies, decomposition",
  "concept-map": "use for ideas linked around a central topic — how the concepts relate",
  definition: "use for ONE term and what it means — the key word the talk hinges on",
  glossary: "use for terms and meanings in a list — the vocabulary the audience needs",
  faq: "use for questions with short answers — common doubts, objections, clarifications",
  "team-grid": "use for the team with names and rolls — who did what, who presents what",
  attribution: "use to credit sources and imagery on the slide or in the section",
  contact: "use for reach details at a glance — email, links, how to follow up",
  equation: "use for a formula presented alone — the maths IS the message",
  bibliography: "use for full citations in a list — the complete source record",
  "data-source": "use to state where the figures came from — provenance the audience can check",
  freeform: "use sparingly for a hero moment no native layout can express — the whole slide rasterises and text stops being editable",
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
    if (!TYPE_USE_WHEN[t]) {
      throw new Error(`TYPE_USE_WHEN is missing an entry for "${t}"`);
    }
    out[t] = {
      label: typeLabel(t),
      description: TYPE_DESCRIPTIONS[t],
      use_when: TYPE_USE_WHEN[t],
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
    const invite = TYPE_BUDGETS[t] ? ` — ${TYPE_BUDGETS[t]}` : "";
    return `- ${t}: ${fields}${invite}`;
  });

  const useWhen = types.map((t) => `- ${t}: ${TYPE_USE_WHEN[t] ?? "(no guidance — pick by the name)"}`);

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
    `Per-type fields:\n${lines.join("\n")}\n\n` +
    `WHEN TO USE EACH TYPE (choose by intent, not by the name alone):\n${useWhen.join("\n")}`;

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
    `This slide is type "${type}". Use it when: ${TYPE_USE_WHEN[type] ?? "(pick by the name)"}.\n` +
    `Content it is built to hold: ${TYPE_BUDGETS[type] ?? "the family density budget (see the sweep guidance)"}.\n` +
    `Fields: ${fields || "(none)"}.`
  );
}

function describeField(name, spec, schema) {
  const resolved = spec.$ref ? resolveRef(spec.$ref, schema) : spec;
  const bits = [];

  if (resolved.enum) bits.push(`one of ${resolved.enum.join("|")}`);
  else {
    const shape = shapeOf(resolved, schema);
    if (shape) bits.push(shape);
  }

  return { name, text: `${name}${bits.length ? ` (${bits.join(", ")})` : ""}` };
}

/** A compact shape description including the per-field length caps, so the
 *  writer sees the real budget for nested fields ("layers[] body ≤80 chars"),
 *  not just the array bounds. The caps are the schema's hard limits — a model
 *  that cannot see them overflows a field and its slide is rejected. */
function shapeOf(spec, schema) {
  const resolved = spec.$ref ? resolveRef(spec.$ref, schema) : spec;
  if (resolved.type === "string") return resolved.maxLength ? `≤${resolved.maxLength} chars` : null;

  const range = [
    resolved.minItems ? `min ${resolved.minItems}` : null,
    resolved.maxItems ? `max ${resolved.maxItems}` : null,
  ].filter(Boolean).join(", ");

  if (resolved.type === "array") {
    const item = resolved.items?.$ref ? resolveRef(resolved.items.$ref, schema) : resolved.items;
    if (item?.type === "object") {
      const inner = Object.entries(item.properties ?? {})
        .map(([k, v]) => {
          const cap = shapeOf(v, schema);
          return cap ? `${k} ${cap}` : k;
        })
        .join(", ");
      return `array of {${inner}}${range ? ` (${range})` : ""}`;
    }
    const itemCap = item?.maxLength ? ` ≤${item.maxLength} chars` : "";
    return `array of ${item?.type ?? "value"}${itemCap}${range ? ` (${range})` : ""}`;
  }

  if (resolved.type === "object") {
    const inner = Object.entries(resolved.properties ?? {})
      .map(([k, v]) => {
        const cap = shapeOf(v, schema);
        return cap ? `${k} ${cap}` : k;
      })
      .join(", ");
    return `{${inner}}`;
  }

  return null;
}

function resolveRef(ref, schema) {
  return ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], schema) ?? {};
}
