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

// The legacy schema deliberately permits extra slide/nested properties, and
// the renderer draws only declared ones. Undeclared fields were never on the
// page, so the copy that converts drops them (and says so) rather than
// refusing the deck or coercing another family's extension into text.
function stripUndeclared(value, node, path, dropped, consumed = null) {
  if (node.$ref) node = node.$ref.slice(2).split("/").reduce((part, key) => part[key], schema);
  if (node.anyOf) node = node.anyOf.find(branch => branch.type === (Array.isArray(value) ? "array" : typeof value)) ?? node;
  if (Array.isArray(value)) return value.map((item, index) => stripUndeclared(item, node.items ?? {}, `${path}[${index}]`, dropped));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    // A few fields the layouts draw were never declared on their type
    // (quote.source, callout.points); a rule that consumes one keeps it.
    if (consumed?.includes(key) && !Object.hasOwn(node.properties ?? {}, key)) {
      const textual = typeof item === "string" || (Array.isArray(item) && item.every(x => typeof x === "string"));
      if (textual) out[key] = item;
      else dropped.push({ path: `${path}.${key}`, reason: "field is not text, so the renderer could not have drawn it" });
      continue;
    }
    if (!Object.hasOwn(node.properties ?? {}, key)) { dropped.push({ path: `${path}.${key}`, reason: "undeclared field the renderer never drew" }); continue; }
    out[key] = stripUndeclared(item, node.properties[key], `${path}.${key}`, dropped);
  }
  return out;
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
    // The cards layout never drew a card's image; it was a request the image
    // step had not filled. Dropped like any field that was never on the page.
    if (card.image !== undefined) c.drop(`${c.path}.cards[${i}].image`, "the cards layout never drew card images");
    c.keys(card, ["title", "body", "kicker", "image"], `${c.path}.cards[${i}]`);
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
// Image paths stay deck-relative here; the importer reads each file into the
// project's asset store and swaps in the asset reference before compiling.
// An image the supply step never filled is still "[image] <description>":
// it becomes an empty image slot carrying the description, for the owner to
// fill in the editor, rather than a missing file that refuses the deck.
const PENDING_IMAGE = /^\[image\]\s*/i;
const image = (c, src, extra = {}) => PENDING_IMAGE.test(src)
  ? c.add("image", { src: "", alt: src.replace(PENDING_IMAGE, "").slice(0, 300), ...extra })
  : c.add("image", { src, alt: extra.caption ?? c.slide.title ?? "", ...extra });
rule("image", ["image", "caption", "fit"], (s, c) => {
  image(c, s.image, { emphasis: "primary", ...(s.caption ? { caption: s.caption } : {}), ...(s.fit ? { fit: s.fit } : {}) });
});
rule("image-text illustrated-points", ["image", "side", "body", "points", "caption"], (s, c) => {
  c.slide.layoutHint = { mediaSide: s.side === "left" ? "left" : "right" };
  if (s.image) image(c, s.image, { mediaRole: "explanatory", ...(s.caption ? { caption: s.caption } : {}) });
  const items = s.type === "image-text" ? s.body : s.points;
  if (items?.length) c.add("list", { items });
});
rule("image-grid", ["images"], (s, c) => {
  s.images.forEach((item, i) => {
    c.keys(item, ["src", "caption"], `${c.path}.images[${i}]`);
    image(c, item.src, item.caption ? { caption: item.caption } : {});
  });
});
rule("hero-image", ["image", "subtitle"], (s, c) => {
  image(c, s.image, { emphasis: "primary", ...(s.subtitle ? { caption: s.subtitle } : {}) });
});
// Two pictures side by side read as a grid of images; the comparison family
// would lay them out as text cards.
rule("split-screen", ["left", "right", "left_caption", "right_caption"], (s, c) => {
  image(c, s.left, s.left_caption ? { caption: s.left_caption } : {});
  image(c, s.right, s.right_caption ? { caption: s.right_caption } : {});
});
rule("side-by-side", ["left", "right"], (s, c) => {
  for (const name of ["left", "right"]) {
    const panel = s[name];
    c.keys(panel, ["image", "title", "body"], `${c.path}.${name}`);
    const caption = [panel.title, panel.body].filter(Boolean).join("\n");
    image(c, panel.image, caption ? { caption } : {});
  }
});
rule("testimonial", ["quote", "name", "role", "image"], (s, c) => {
  if (s.image) image(c, s.image, { mediaRole: "decorative", fit: "cover", caption: s.name });
  c.add("quote", { text: s.quote });
  c.text([s.name, s.role].filter(Boolean).join(", "), "Attribution");
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
  c.slide.relationship = "sequence";
  if (s.direction === "ttb") c.slide.layoutHint = { flowDirection: "down" };
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
  s.items.forEach((item, i) => {
    c.keys(item, ["icon", "title", "body"], `${c.path}.items[${i}]`);
    c.add("text", { text: item.body ?? "", label: item.title, ...(String(item.icon ?? "").trim() ? { icon: String(item.icon).trim() } : {}) });
  });
});
// A framework is a concept and its parts: the concept sits at the centre of
// a ring of its elements, as the legacy layout drew it.
rule("framework", ["concept", "elements"], (s, c) => {
  c.slide.relationship = "hierarchy";
  c.slide.layoutHint = { arrangement: "radial" };
  c.keys(s.concept, ["title", "body"], `${c.path}.concept`);
  c.add("text", { text: s.concept.body ?? "", label: s.concept.title, emphasis: "primary" });
  s.elements.forEach((element, i) => { c.keys(element, ["title", "body"], `${c.path}.elements[${i}]`); c.text(element.body ?? "", element.title); });
});
// Layers stack top to bottom in authored order, each a band with its label,
// a short description and its components as pills.
rule("layered-architecture", ["layers"], (s, c) => {
  c.slide.relationship = "hierarchy";
  c.slide.layoutHint = { arrangement: "layers" };
  s.layers.forEach((layer, i) => {
    c.keys(layer, ["label", "body", "items"], `${c.path}.layers[${i}]`);
    c.add("text", { text: layer.body ?? "", label: layer.label, ...(layer.items?.length ? { items: layer.items } : {}) });
  });
});
// A diagram is nodes and the links between them. Node ids are the deck's own
// labels for linking; links become slide connections between the blocks the
// nodes turned into. A link naming a node that does not exist was never drawn.
rule("diagram", ["nodes", "edges", "layout"], (s, c) => {
  c.slide.relationship = "hierarchy";
  c.slide.layoutHint = s.layout === "radial" ? { arrangement: "radial" }
    : { arrangement: "graph", ...(s.layout === "horizontal" ? { flowDirection: "across" } : {}) };
  const blockOf = new Map();
  s.nodes.forEach((node, i) => {
    c.keys(node, ["id", "label", "body"], `${c.path}.nodes[${i}]`);
    c.text(node.body ?? "", node.label);
    blockOf.set(node.id, c.blocks[c.blocks.length - 1].id);
  });
  const connections = [];
  (s.edges ?? []).forEach((edge, i) => {
    c.keys(edge, ["from", "to", "label"], `${c.path}.edges[${i}]`);
    const from = blockOf.get(edge.from), to = blockOf.get(edge.to);
    if (!from || !to || from === to) { c.drop(`${c.path}.edges[${i}]`, "the link names a node the diagram does not have"); return; }
    connections.push({ from, to, ...(edge.label ? { label: edge.label } : {}) });
  });
  if (connections.length) c.slide.connections = connections;
});
const axisOf = (axis, path, c) => {
  if (!axis) return undefined;
  c.keys(axis, ["label", "low", "high"], path);
  return Object.fromEntries(["label", "low", "high"].filter(k => axis[k]).map(k => [k, axis[k]]));
};
// A 2x2: quadrants in reading order between two labelled axes.
rule("matrix", ["axes", "quadrants"], (s, c) => {
  c.slide.layoutHint = { arrangement: "quadrants" };
  c.keys(s.axes, ["x", "y"], `${c.path}.axes`);
  const x = axisOf(s.axes.x, `${c.path}.axes.x`, c), y = axisOf(s.axes.y, `${c.path}.axes.y`, c);
  c.slide.axes = { ...(x ? { x } : {}), ...(y ? { y } : {}) };
  s.quadrants.forEach((q, i) => { c.keys(q, ["title", "body"], `${c.path}.quadrants[${i}]`); c.text(q.body ?? "", q.title); });
});
// Phases are lanes; each phase's items are its cards; time labels head the
// lanes as ticks along the x axis.
rule("roadmap", ["phases", "time_labels"], (s, c) => {
  c.slide.layoutHint = { arrangement: "lanes" };
  if (s.time_labels?.length) c.slide.axes = { x: { ticks: s.time_labels } };
  const seen = new Set();
  s.phases.forEach((phase, i) => {
    c.keys(phase, ["label", "items"], `${c.path}.phases[${i}]`);
    if (seen.has(phase.label)) { c.refuse(`${c.path}.phases[${i}].label`, "two phases share a label, so their lanes cannot be told apart"); return; }
    seen.add(phase.label);
    const items = phase.items ?? [];
    if (!items.length) c.add("text", { text: "", group: phase.label });
    items.forEach((item, j) => {
      c.keys(item, ["title", "body"], `${c.path}.phases[${i}].items[${j}]`);
      c.add("text", { text: item.body ?? "", label: item.title, group: phase.label });
    });
  });
});
rule("icon-list", ["items"], (s, c) => {
  s.items.forEach((item, i) => {
    c.keys(item, ["icon", "text"], `${c.path}.items[${i}]`);
    c.add("text", { text: item.text, ...(String(item.icon ?? "").trim() ? { icon: String(item.icon).trim() } : {}) });
  });
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

function refusalFor(type) {
  if (type === "freeform") return "freeform HTML is raster-only and cannot become native editable content";
  return `${type} has no audited, faithful conversion using the accepted semantic/compiler primitives`;
}

export async function importCoverage() {
  const declared = type => Object.keys(slideSchema(type).properties).sort();
  return Object.fromEntries(schema.definitions.slide.properties.type.enum.map(type => [type, {
    status: RULES[type] ? "supported-with-field-gates" : "refused",
    fields: RULES[type]?.fields.filter(field => declared(type).includes(field)) ?? [],
    schemaFields: declared(type),
    refusedFields: declared(type).filter(field => !RULES[type]?.fields.includes(field)),
    reason: RULES[type] ? "All populated fields must pass explicit gates; capacity and unsupported chart/flow semantics refuse the whole deck." : refusalFor(type),
  }]));
}

// The title slide's credits as the legacy cover printed them: team and
// members, guide, then subject and year. They become ordinary editable text —
// a student fixing a misspelt name should not need to regenerate.
export function titleCredits(identity) {
  const clean = value => String(value ?? "").trim();
  const team = identity?.team ?? {};
  const names = (team.members ?? []).map(m => clean(m?.name) && (clean(m.roll) ? `${clean(m.name)} (${clean(m.roll)})` : clean(m.name))).filter(Boolean).join(" · ");
  const guide = clean(identity?.guide?.name);
  return [
    [clean(team.label), names].filter(Boolean).join(" — "),
    guide ? `Guide: ${guide}${clean(identity.guide.designation) ? ` · ${clean(identity.guide.designation)}` : ""}` : "",
    [clean(identity?.academic?.subject), clean(identity?.academic?.year)].filter(Boolean).join("  ·  "),
  ].filter(Boolean);
}

export async function convertGeneratedDeck(deck, { identity = null } = {}) {
  try { if (JSON.stringify(deck).length > 2 * 1024 * 1024) throw new Error(); }
  catch { throw importError("invalid-source", "source is cyclic, too deep or exceeds the import bound"); }
  if (!deck || typeof deck !== "object" || findDangerousKey(deck)) throw importError("invalid-source", "source contains unsafe structure");
  const validation = await validateDeck(deck);
  // Same rule the renderer applies (loadDeck): length caps move as the fitter
  // learns what fits, so an older deck over today's caps is still a deck. The
  // compiler fits its text; only structural damage refuses.
  if (validation.structural.length) throw importError("invalid-source", "source deck is invalid", validation.structural);
  if (!deck.title.trim() || deck.slides.length > 60) throw importError("invalid-source", "source needs a title and 1..60 slides");
  if (placeholderSlides(deck).length) throw importError("invalid-source", "source contains incomplete placeholder slides");
  const details = [], dropped = [], cites = [];
  const refuse = (path, reason) => details.push({ path, reason });
  deck = { ...deck, slides: deck.slides.map((source, index) => stripUndeclared(source, slideSchema(source.type), `slides[${index}]`, dropped, RULES[source.type]?.fields ?? null)) };
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
    if (source.notes !== undefined) {
      if (typeof source.notes !== "string" || source.notes.length > 20000) refuse(`${path}.notes`, "speaker notes must be text of at most 20000 characters");
      else if (source.notes.trim()) slide.speakerNotes = source.notes;
    }
    (source.cites ?? []).forEach((cite, i) => {
      if (!cite || typeof cite.url !== "string" || !cite.url.trim()) refuse(`${path}.cites[${i}]`, "a citation needs a URL");
      else cites.push({ slide: index, url: cite.url.trim(), title: String(cite.title ?? "").trim(), accessed: cite.accessed ?? null });
    });
    if (source.section !== undefined) {
      if (!Number.isInteger(source.section) || source.section < 0 || typeof deck.sections?.[source.section] !== "string") refuse(`${path}.section`, "section index does not resolve to an authored label");
      else contextText(deck.sections[source.section], `Section ${String(source.section + 1).padStart(2, "0")}`);
    }
    contextText(source.standfirst, "Context");
    rule.convert(source, { deck, path, slide, blocks: slide.blocks, add, text, keys, refuse, drop: (at, reason) => dropped.push({ path: at, reason }) });
    if (source.type !== "title" && index === 0) contextText(deck.subtitle, "Deck context");
    if (source.type === "title" && identity) {
      const credits = titleCredits(identity);
      if (credits.length) add("text", { text: credits.join("\n"), emphasis: "context" });
    }
    if (source.speaker_note) add("callout", { label: "Audience note", text: source.speaker_note });
    if (!slide.blocks.length) text(source.headline ?? deck.title);
    return slide;
  });
  if (details.length) throw importError("unsupported-content", "source content cannot be preserved by this import", details);
  const intent = normalizeIntent({ id: "legacy-import", title: deck.title, slides });
  const verdict = await validateDeckIntent(intent);
  if (!verdict.ok) throw importError("unsupported-content", "source exceeds the accepted semantic contract", verdict.errors.map(reason => ({ path: "intent", reason })));
  return { intent, dropped, cites };
}
