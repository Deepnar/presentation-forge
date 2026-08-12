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
