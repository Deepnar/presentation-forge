// This boundary is deliberately stricter than the historical six-family bridge:
// a saved project cannot recover a field that conversion silently discards.
import { readFile } from "node:fs/promises";
import { validateDeck } from "../validate.js";
import { normalizeIntent, validateDeckIntent } from "../../packages/model/intent.ts";
import { findDangerousKey } from "../../packages/projects/document.js";
import { placeholderSlides } from "../placeholders.js";

export function importError(code, message, details = []) {
  return Object.assign(new Error(message), { code, details });
}

const COMMON = ["type", "headline", "standfirst", "presenter", "speaker_note", "notes", "cites", "section"];
const schema = JSON.parse(await readFile(new URL("../../schema/deck.schema.json", import.meta.url), "utf8"));
function slideSchema(type) {
  const properties = { ...schema.definitions.slide.properties };
  for (const branch of schema.definitions.slide.allOf ?? []) {
    const condition = branch.if?.properties?.type;
    if (condition?.const === type || condition?.enum?.includes(type)) Object.assign(properties, branch.then?.properties);
  }
  return { type: "object", properties };
}

// The legacy schema deliberately permits extra slide/nested properties. Only
// declared, typed fields are safe to consume; shared converters must not coerce
// another family's untyped extensions into strings or lose their structure.
function auditFields(value, node, path, refuse) {
  if (node.$ref) node = node.$ref.slice(2).split("/").reduce((part, key) => part[key], schema);
  if (node.anyOf) node = node.anyOf.find(branch => branch.type === (Array.isArray(value) ? "array" : typeof value)) ?? node;
  if (Array.isArray(value)) value.forEach((item, index) => auditFields(item, node.items ?? {}, `${path}[${index}]`, refuse));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(node.properties ?? {}, key)) refuse(`${path}.${key}`, "field is not declared and typed for this source family");
    else auditFields(item, node.properties[key], `${path}.${key}`, refuse);
  }
}
const RULES = {};
function rule(types, fields, convert) {
  for (const type of types.split(" ")) RULES[type] = { fields: [...COMMON, ...fields], convert };
}
rule("title section chapter", [], (s, c) => {
  c.slide.rhetoricalRole = s.type === "title" ? "opening" : "transition";
  c.text(s.type === "title" ? c.deck.subtitle : undefined);
  if (!c.blocks.length) c.text(s.headline ?? c.deck.title);
});
rule("closing", ["body", "cta"], (s, c) => {
  c.slide.rhetoricalRole = "conclusion"; c.text(s.body); c.text(s.cta, "Call to action");
});
rule("bullets", ["bullets"], (s, c) => c.add("list", { items: s.bullets }));
rule("numbered-list references", ["items"], (s, c) => c.add("list", { items: s.type === "numbered-list" ? s.items.map((text, i) => `${i + 1}. ${text}`) : s.items }));
rule("checklist", ["items"], (s, c) => {
  s.items.forEach((item, i) => c.keys(item, ["text", "checked"], `${c.path}.items[${i}]`));
  c.add("list", { items: s.items.map(item => `${item.checked ? "[x]" : "[ ]"} ${item.text}`) });
});
rule("cards", ["cards"], (s, c) => {
  s.cards.forEach((card, i) => {
    c.keys(card, ["title", "body", "kicker"], `${c.path}.cards[${i}]`);
    c.text([card.kicker, card.body].filter(Boolean).join("\n"), card.title);
  });
});
const comparison = (s, c) => {
  c.slide.relationship = "comparison";
  const names = s.type === "before-after" ? ["before", "after"] : ["left", "right"];
  for (const name of names) {
    const side = s[name];
    c.keys(side, s.type === "vs" ? ["title"] : s.type === "before-after" ? ["title", "body"] : ["title", "kicker", "body", "points"], `${c.path}.${name}`);
    const label = s.type === "before-after" ? `${name === "before" ? "Before" : "After"}: ${side.title}` : side.title;
    c.text([side.kicker, side.body, s[`${name}_body`], ...(side.points ?? [])].filter(Boolean).join("\n"), label);
  }
  if (s.verdict) c.add("callout", { text: s.verdict });
};
rule("compare", ["left", "right", "verdict"], comparison);
rule("before-after", ["before", "after"], comparison);
rule("vs", ["left", "right", "left_body", "right_body"], comparison);
rule("pros-cons", ["pros", "cons"], (s, c) => {
  c.slide.relationship = "comparison";
  c.text(s.pros.join("\n"), "Pros"); c.text(s.cons.join("\n"), "Cons");
});
rule("stats", ["stats"], (s, c) => {
  s.stats.forEach((stat, i) => {
    c.keys(stat, ["value", "label", "sub"], `${c.path}.stats[${i}]`);
    c.add("stat", { value: stat.value, label: [stat.label, stat.sub].filter(Boolean).join("\n") });
  });
});
rule("big-number", ["value", "label", "body", "sub"], (s, c) => {
  c.add("stat", { value: s.value, label: s.label }); c.text(s.body); c.text(s.sub);
});
rule("quote pull-quote epigraph", ["quote", "attribution", "source"], (s, c) => {
  c.add("quote", { text: s.quote }); c.text(s.attribution, "Attribution"); c.text(s.source, "Source");
});
rule("callout emphasis warning tip takeaway", ["label", "body", "points"], (s, c) => {
  c.add("callout", { text: s.body, label: s.label ?? s.type });
  if (s.points) c.add("list", { items: s.points });
});
rule("table", ["columns", "rows"], (s, c) => {
  if (s.rows.some(row => row.length !== s.columns.length)) c.refuse(`${c.path}.rows`, "table row widths must match columns exactly");
  c.add("table", { rows: [s.columns, ...s.rows], header: true });
});
rule("chart", ["chart", "aside"], (s, c) => {
  const chart = s.chart;
  c.keys(chart, ["kind", "categories", "series", "unit"], `${c.path}.chart`);
  if (!["bar", "hbar", "line", "pie", "doughnut", "area"].includes(chart.kind)) c.refuse(`${c.path}.chart.kind`, `chart kind ${chart.kind} has no faithful accepted primitive`);
  chart.series.forEach((series, i) => {
    c.keys(series, ["name", "values"], `${c.path}.chart.series[${i}]`);
    if (series.values.length !== chart.categories.length) c.refuse(`${c.path}.chart.series[${i}].values`, "chart cardinality must match categories exactly");
  });
  c.add("chart", { chartKind: chart.kind, categories: chart.categories, series: chart.series, ...(chart.unit !== undefined ? { unit: chart.unit } : {}) });
  if (s.aside?.length) c.add("list", { items: s.aside });
});
rule("flow", ["steps", "direction"], (s, c) => {
  if (s.direction !== undefined) c.refuse(`${c.path}.direction`, "authored flow orientation cannot be preserved by the accepted semantic compiler");
  c.slide.relationship = "sequence";
  s.steps.forEach((step, i) => { c.keys(step, ["title", "body"], `${c.path}.steps[${i}]`); c.text(step.body ?? "", step.title); });
});
rule("definition", ["term", "definition", "example"], (s, c) => { c.text(s.definition, s.term); c.text(s.example, "Example"); });
rule("glossary", ["entries"], (s, c) => {
  s.entries.forEach((entry, i) => { c.keys(entry, ["term", "definition"], `${c.path}.entries[${i}]`); c.text(entry.definition, entry.term); });
});
rule("faq", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["question", "answer"], `${c.path}.items[${i}]`); c.text(item.answer, item.question); });
});
rule("agenda", ["items"], (s, c) => {
  c.slide.relationship = "sequence";
  s.items.forEach((item, i) => { c.keys(item, ["title", "desc"], `${c.path}.items[${i}]`); c.text(item.desc ?? "", item.title); });
});
rule("feature-grid", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["title", "body"], `${c.path}.items[${i}]`); c.text(item.body ?? "", item.title); });
});
rule("grid-items", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["label", "value"], `${c.path}.items[${i}]`); c.text(item.value, item.label); });
});
rule("stacked-list", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["tag", "title", "body"], `${c.path}.items[${i}]`); c.text([item.tag, item.body].filter(Boolean).join("\n"), item.title); });
});
rule("data-cards", ["cards"], (s, c) => {
  s.cards.forEach((item, i) => {
    c.keys(item, ["value", "label", "body"], `${c.path}.cards[${i}]`);
    c.add("stat", { value: item.value, label: [item.label, item.body].filter(Boolean).join("\n") });
  });
});
rule("kpi-dashboard", ["kpis"], (s, c) => {
  s.kpis.forEach((item, i) => {
    c.keys(item, ["value", "label", "trend", "change"], `${c.path}.kpis[${i}]`);
    c.add("stat", { value: item.value, label: [item.label, ...(item.trend !== undefined ? [`Trend: ${item.trend}`] : []), ...(item.change !== undefined ? [`Change: ${item.change}`] : [])].join("\n") });
  });
});
rule("data-table", ["columns", "rows", "row_labels"], (s, c) => {
  s.columns.forEach((column, i) => {
    c.keys(column, ["label", "align"], `${c.path}.columns[${i}]`);
    if (column.align && column.align !== "left") c.refuse(`${c.path}.columns[${i}].align`, "authored cell alignment is not represented in accepted semantic tables");
  });
  const labeled = s.row_labels?.length > 0;
  if (labeled && s.row_labels.length !== s.rows.length) c.refuse(`${c.path}.row_labels`, "row labels must match rows exactly");
  const rows = [[...(labeled ? [""] : []), ...s.columns.map(column => column.label)]];
  s.rows.forEach((row, i) => {
    c.keys(row, ["text", "highlight"], `${c.path}.rows[${i}]`);
    if (row.highlight) c.refuse(`${c.path}.rows[${i}].highlight`, "authored row emphasis is not represented in accepted semantic tables");
    const cells = Array.isArray(row.text) ? row.text : [row.text];
    if (cells.length !== s.columns.length) c.refuse(`${c.path}.rows[${i}].text`, "table rows must match columns exactly");
    rows.push([...(labeled ? [s.row_labels[i]] : []), ...cells]);
  });
  c.add("table", { rows, header: true });
});
rule("metric-comparison", ["left", "right", "delta", "body"], (s, c) => {
  for (const side of ["left", "right"]) { c.keys(s[side], ["value", "label"], `${c.path}.${side}`); c.add("stat", s[side]); }
  c.text(s.delta, "Difference"); c.text(s.body);
});
rule("ranking-list", ["items"], (s, c) => {
  s.items.forEach((item, i) => {
    c.keys(item, ["rank", "label", "detail", "value"], `${c.path}.items[${i}]`);
    c.text([item.value, item.detail].filter(Boolean).join("\n"), `${item.rank ?? i + 1}. ${item.label}`);
  });
});
rule("scorecard decision-matrix", ["criteria", "options"], (s, c) => {
  s.criteria.forEach((criterion, i) => c.keys(criterion, ["label", "weight"], `${c.path}.criteria[${i}]`));
  const rows = [["Option", ...s.criteria.map(criterion => criterion.label)]];
  s.options.forEach((option, i) => {
    c.keys(option, ["name", "scores"], `${c.path}.options[${i}]`);
    if (option.scores?.length !== s.criteria.length) c.refuse(`${c.path}.options[${i}].scores`, "scores must explicitly match every criterion");
    rows.push([option.name, ...(option.scores ?? []).map(String)]);
  });
  c.add("table", { rows, header: true });
  if (s.criteria.some(criterion => criterion.weight !== undefined)) c.add("table", { rows: [["Criterion", "Authored weight"], ...s.criteria.map(criterion => [criterion.label, criterion.weight === undefined ? "Unspecified" : String(criterion.weight)])], header: true });
});
rule("pipeline", ["stages"], (s, c) => {
  c.slide.relationship = "sequence";
  s.stages.forEach((stage, i) => {
    c.keys(stage, ["title", "body", "gate"], `${c.path}.stages[${i}]`);
    c.text([stage.body, ...(stage.gate ? [`Gate: ${stage.gate}`] : [])].filter(Boolean).join("\n"), stage.title);
  });
});
rule("timeline chronology", ["events"], (s, c) => {
  c.slide.relationship = "sequence";
  s.events.forEach((event, i) => {
    const chronology = s.type === "chronology";
    c.keys(event, chronology ? ["year", "text"] : ["when", "what"], `${c.path}.events[${i}]`);
    c.text(chronology ? event.text : event.what, chronology ? event.year : event.when);
  });
});
rule("milestone", ["milestones"], (s, c) => {
  c.slide.relationship = "sequence";
  s.milestones.forEach((event, i) => { c.keys(event, ["when", "title", "body"], `${c.path}.milestones[${i}]`); c.text([event.title, event.body].filter(Boolean).join("\n"), event.when); });
});
rule("team-grid", ["members"], (s, c) => {
  s.members.forEach((member, i) => { c.keys(member, ["name", "role"], `${c.path}.members[${i}]`); c.text(member.role, member.name); });
});
rule("attribution", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["name", "contribution"], `${c.path}.items[${i}]`); c.text(item.contribution ?? "", item.name); });
});
rule("contact", ["items"], (s, c) => {
  s.items.forEach((item, i) => { c.keys(item, ["label", "value"], `${c.path}.items[${i}]`); c.text(item.value, item.label); });
});
rule("equation", ["formula", "body", "variables"], (s, c) => {
  c.text(s.formula); c.text(s.body);
  (s.variables ?? []).forEach((variable, i) => { c.keys(variable, ["symbol", "meaning"], `${c.path}.variables[${i}]`); c.text(variable.meaning, variable.symbol); });
});
rule("bibliography", ["entries"], (s, c) => {
  s.entries.forEach((entry, i) => { c.keys(entry, ["citation", "annotation"], `${c.path}.entries[${i}]`); c.text(entry.annotation ?? "", entry.citation); });
});
rule("data-source", ["sources"], (s, c) => {
  s.sources.forEach((source, i) => { c.keys(source, ["name", "url", "description"], `${c.path}.sources[${i}]`); c.text([source.url, source.description].filter(Boolean).join("\n"), source.name); });
});

const MEDIA = new Set(["image", "image-text", "illustrated-points", "image-grid", "hero-image", "split-screen", "side-by-side", "testimonial"]);
function refusalFor(type) {
  if (type === "freeform") return "freeform HTML is raster-only and cannot become native editable content";
  if (MEDIA.has(type)) return `${type} requires the separately approved portable asset boundary`;
  return `${type} has no audited, faithful conversion using the accepted semantic/compiler primitives`;
}

export async function importCoverage() {
  const declared = type => Object.keys(slideSchema(type).properties).sort();
  return Object.fromEntries(schema.definitions.slide.properties.type.enum.map(type => [type, {
    status: RULES[type] ? "supported-with-field-gates" : "refused",
    fields: RULES[type]?.fields.filter(field => declared(type).includes(field)) ?? [],
    schemaFields: declared(type),
    refusedFields: declared(type).filter(field => !RULES[type]?.fields.includes(field) || ["notes", "cites"].includes(field)),
    reason: RULES[type] ? "All populated fields must pass explicit gates; notes/cites, unknown nested fields, capacity and unsupported chart/flow semantics refuse the whole deck." : refusalFor(type),
  }]));
}

export async function convertGeneratedDeck(deck) {
  try { if (JSON.stringify(deck).length > 2 * 1024 * 1024) throw new Error(); }
  catch { throw importError("invalid-source", "source is cyclic, too deep or exceeds the import bound"); }
  if (!deck || typeof deck !== "object" || findDangerousKey(deck)) throw importError("invalid-source", "source contains unsafe structure");
  const validation = await validateDeck(deck);
  if (!validation.ok) throw importError("invalid-source", "source deck is invalid", validation.errors);
  if (!deck.title.trim() || deck.slides.length > 60) throw importError("invalid-source", "source needs a title and 1..60 slides");
  if (placeholderSlides(deck).length) throw importError("invalid-source", "source contains incomplete placeholder slides");
  const details = [];
  const usedSections = new Set();
  const refuse = (path, reason) => details.push({ path, reason });
  deck.slides.forEach((source, index) => auditFields(source, slideSchema(source.type), `slides[${index}]`, refuse));
  if (details.length) throw importError("unsupported-content", "source has fields without an audited typed conversion", details);
  const keys = (record, allowed, path) => {
    for (const key of Object.keys(record)) if (!allowed.includes(key)) refuse(`${path}.${key}`, "field has no audited semantic conversion");
  };
  const slides = deck.slides.map((source, index) => {
    const path = `slides[${index}]`;
    const id = `legacy-s${index + 1}`;
    const slide = { id, purpose: `Preserve the meaning of the ${source.type} slide`, ...(source.headline ? { title: source.headline } : source.type === "title" ? { title: deck.title } : {}), blocks: [] };
    const add = (kind, values) => slide.blocks.push({ id: `${id}-b${slide.blocks.length + 1}`, kind, ...structuredClone(values) });
    const text = (value, label) => { if (value !== undefined && value !== null) add("text", { text: value, ...(label ? { label } : {}) }); };
    const contextText = (value, label) => { if (value !== undefined && value !== null) add("callout", { text: value, label, emphasis: "context" }); };
    const rule = RULES[source.type];
    if (!rule) { refuse(`${path}.${source.type}`, refusalFor(source.type)); return slide; }
    keys(source, rule.fields, path);
    if (source.notes) refuse(`${path}.notes`, "real speaker notes have no storage/export field in the accepted scene contract");
    if (source.cites?.length) refuse(`${path}.cites`, "claim citations require a source registry absent from the accepted scene contract");
    if (source.section !== undefined) {
      if (!Number.isInteger(source.section) || source.section < 0 || typeof deck.sections?.[source.section] !== "string") refuse(`${path}.section`, "section index does not resolve to an authored label");
      else { usedSections.add(source.section); contextText(deck.sections[source.section], `Section ${String(source.section + 1).padStart(2, "0")}`); }
    }
    contextText(source.standfirst, "Context");
    rule.convert(source, { deck, path, slide, blocks: slide.blocks, add, text, keys, refuse });
    if (source.type !== "title" && index === 0) contextText(deck.subtitle, "Deck context");
    if (source.speaker_note) add("callout", { label: "Audience note", text: source.speaker_note });
    if (!slide.blocks.length) text(source.headline ?? deck.title);
    return slide;
  });
  (deck.sections ?? []).forEach((_label, index) => { if (!usedSections.has(index)) refuse(`sections[${index}]`, "unreferenced section metadata cannot be silently discarded"); });
  if (details.length) throw importError("unsupported-content", "source content cannot be preserved by this import", details);
  const intent = normalizeIntent({ id: "legacy-import", title: deck.title, slides });
  const verdict = await validateDeckIntent(intent);
  if (!verdict.ok) throw importError("unsupported-content", "source exceeds the accepted semantic contract", verdict.errors.map(reason => ({ path: "intent", reason })));
  return { intent, presenters: deck.slides.map(slide => slide.presenter ?? "") };
}
