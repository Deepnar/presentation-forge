import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "../src/validate.js";
import { slideCatalog, deckSchema } from "../src/ai/catalog.js";
import { buildOpsSchema } from "../src/ai/ops.js";

/**
 * Coverage for the 50-type vocabulary: every type validates with a realistic
 * payload, wrong shapes are rejected, the catalog auto-derives the details, and
 * the per-slide ops schema stays small for the diagram-ish types whose schemas
 * nest arrays of objects.
 */

const base = { title: "T", slides: [{ type: "title" }] };

const VALID = {
  chapter: { headline: "Part Two", standfirst: "A lighter pause in the argument." },
  closing: { headline: "Where the field is heading", body: "A closing statement.", cta: "Get in touch" },
  "numbered-list": { headline: "Steps", items: ["one", "two", "three", "four"] },
  checklist: { items: [{ text: "done", checked: true }, { text: "todo", checked: false }, { text: "maybe", checked: true }, { text: "later", checked: false }] },
  "feature-grid": {
    items: [{ icon: "⚡", title: "Fast", body: "sub-second" }, { icon: "🔒", title: "Local" }],
  },
  "grid-items": {
    items: [{ label: "A", value: "1" }, { label: "B", value: "2" }, { label: "C", value: "3" }],
  },
  "icon-list": { items: [{ icon: "★", text: "nice" }, { icon: "✎", text: "edit" }, { icon: "☀", text: "warm" }, { icon: "☂", text: "wet" }] },
  "stacked-list": { items: [{ title: "a", tag: "x" }, { title: "b" }, { title: "c" }, { title: "d" }] },
  "kpi-dashboard": {
    kpis: [
      { label: "A", value: "42%", trend: "up", change: "+3" },
      { label: "B", value: "7", trend: "down" },
      { label: "C", value: "1", trend: "flat" },
    ],
  },
  "data-cards": {
    cards: [{ value: "10x", label: "Speed", body: "b" }, { value: "99%", label: "Uptime" }],
  },
  "progress-bars": { bars: [{ label: "A", value: 60, target: 80 }, { label: "B", value: 30 }] },
  "ranking-list": {
    items: [
      { label: "Alpha", value: "9.4" },
      { label: "Beta", value: "8.1" },
      { label: "Gamma", value: "7.7" },
    ],
  },
  "metric-comparison": {
    left: { value: "180 GW", label: "target" },
    right: { value: "120 GW", label: "today" },
    delta: "+50%",
    body: "the gap",
  },
  sparklines: {
    items: [{ label: "load", values: [1, 2, 3, 4], value: "4" }, { label: "temp", values: [9, 8, 7], value: "7" }],
  },
  "before-after": {
    before: { title: "Old", body: "x" },
    after: { title: "New", body: "y" },
  },
  framework: {
    concept: { title: "Core", body: "c" },
    elements: [{ title: "E1" }, { title: "E2", body: "b" }],
  },
  matrix: {
    axes: {
      x: { label: "Effort", low: "low", high: "high" },
      y: { label: "Impact", low: "low", high: "high" },
    },
    quadrants: [{ title: "Q1" }, { title: "Q2" }, { title: "Q3" }, { title: "Q4" }],
  },
  scorecard: {
    criteria: [{ label: "C1", weight: "30%" }, { label: "C2", weight: "20%" }],
    options: [{ name: "A", scores: [5, 3] }, { name: "B", scores: [4, 4] }],
  },
  vs: { left: { title: "X" }, right: { title: "Y" }, left_body: "a", right_body: "b" },
  "side-by-side": {
    left: { image: "l.png", title: "L", body: "b" },
    right: { image: "r.png", title: "R", body: "b" },
  },
  funnel: {
    stages: [{ label: "All", value: "100%" }, { label: "Some", value: "40%" }, { label: "Few", value: "10%" }],
  },
  pipeline: { stages: [{ title: "S1", gate: "gate-a" }, { title: "S2" }, { title: "S3" }] },
  dependencies: {
    nodes: [{ title: "n0" }, { title: "n1", depends_on: [0] }, { title: "n2", depends_on: [1] }],
  },
  "branching-flow": {
    decision: "go?",
    branches: [{ label: "yes", steps: [{ title: "y" }] }, { label: "no", steps: [{ title: "n" }] }],
  },
  "layered-architecture": {
    layers: [{ label: "UI", items: ["a"] }, { label: "API", items: ["b"] }, { label: "DB", items: ["c"] }],
  },
  roadmap: {
    time_labels: ["Now", "Next", "Later"],
    phases: [{ label: "P1", items: [{ title: "i" }] }, { label: "P2", items: [{ title: "j" }] }, { label: "P3" }],
  },
  journey: {
    stages: [
      { label: "A", sentiment: "positive" },
      { label: "B", sentiment: "negative" },
      { label: "C", sentiment: "neutral" },
    ],
  },
  chronology: { events: [{ year: "2020", text: "x" }, { year: "2021", text: "y" }] },
  testimonial: { quote: "Great.", name: "A", role: "B" },
  "pull-quote": { headline: "H", quote: "Q", attribution: "A" },
  epigraph: { quote: "Q", attribution: "A", source: "S" },
  warning: { body: "Careful", label: "⚠" },
  tip: { body: "Do this" },
  takeaway: { body: "The point", points: ["p1"] },
  "image-grid": { images: [{ src: "a.png" }, { src: "b.png" }] },
  "hero-image": { image: "h.png", headline: "Hero", subtitle: "s" },
  "split-screen": { left: "l.png", right: "r.png" },
  "data-table": {
    headline: "H",
    columns: [{ label: "A", align: "right" }, { label: "B" }],
    rows: [{ text: "v1", highlight: true }, { text: "v2" }],
  },
  "decision-matrix": {
    headline: "H",
    criteria: [{ label: "C", weight: 2 }, { label: "D", weight: 1 }],
    options: [{ name: "A", scores: [3, 2] }, { name: "B", scores: [4, 1] }],
  },
  diagram: {
    layout: "vertical",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b" }],
  },
  pyramid: { levels: [{ label: "top" }, { label: "mid" }, { label: "base" }] },
  venn: { sets: [{ label: "S1", items: ["a"] }, { label: "S2", items: ["b"] }] },
  hierarchy: {
    root: { label: "R" },
    children: [{ label: "C1", children: [{ label: "C1a" }] }, { label: "C2" }],
  },
  glossary: { entries: [{ term: "T", definition: "D" }, { term: "U", definition: "E" }] },
  faq: { items: [{ question: "Q?", answer: "A" }, { question: "R?", answer: "B" }] },
  "team-grid": { members: [{ name: "N", role: "R" }, { name: "M", role: "S" }] },
  attribution: { items: [{ name: "N", contribution: "C" }] },
  contact: { items: [{ label: "email", value: "a@b.c" }] },
  equation: {
    formula: "E = mc²",
    body: "explain",
    variables: [{ symbol: "E", meaning: "energy" }],
  },
  bibliography: { entries: [{ citation: "x", annotation: "y" }, { citation: "z" }] },
  "data-source": {
    sources: [{ name: "N", url: "http://x", description: "d" }, { name: "M", url: "http://y" }],
  },
};

const SPECIFIC_BAD = {
  chapter: { headline: 5 },
  closing: { headline: 5 },
  "numbered-list": { items: [5] },
  checklist: { items: [{ text: "x", checked: "yes" }] },
  "feature-grid": { items: [{ title: 5 }] },
  "grid-items": { items: [{ label: 5, value: "v" }] },
  "icon-list": { items: [{ text: 5 }] },
  "stacked-list": { items: [{ title: 5 }] },
  "kpi-dashboard": { kpis: [{ label: "A", value: 5 }] },
  "data-cards": { cards: [{ value: 5, label: "L" }] },
  "progress-bars": { bars: [{ label: "A", value: "60" }] },
  "ranking-list": { items: [{ label: 5 }] },
  "metric-comparison": { left: { value: 5, label: "x" }, right: { value: "y", label: "z" }, delta: "+1" },
  sparklines: { items: [{ label: "x", values: ["a"] }] },
  "before-after": { before: { title: 5, body: "x" }, after: { title: "y", body: "z" } },
  framework: { concept: { title: 5 }, elements: [{ title: "E" }] },
  matrix: { axes: { x: { label: 5 }, y: { label: "y" } }, quadrants: [{ title: "Q" }, { title: "Q" }, { title: "Q" }, { title: "Q" }] },
  scorecard: { criteria: [{ label: 5 }], options: [{ name: "A", scores: [1] }] },
  vs: { left: { title: 5 }, right: { title: "y" } },
  "side-by-side": { left: { image: "a.png", title: 5 }, right: { image: "b.png" } },
  funnel: { stages: [{ label: 5 }] },
  pipeline: { stages: [{ title: 5 }] },
  dependencies: { nodes: [{ title: 5 }] },
  "branching-flow": { branches: [{ label: 5, steps: [{ title: "s" }] }] },
  "layered-architecture": { layers: [{ label: 5 }] },
  roadmap: { phases: [{ label: 5 }] },
  journey: { stages: [{ label: "A", sentiment: "happy" }] },
  chronology: { events: [{ year: 5, text: "x" }] },
  testimonial: { quote: "q", name: 5 },
  "pull-quote": { headline: "H", quote: 5 },
  epigraph: { quote: 5 },
  warning: { body: 5 },
  tip: { body: 5 },
  takeaway: { body: 5 },
  "image-grid": { images: [{ src: 5 }] },
  "hero-image": { image: "h.png", headline: 5 },
  "split-screen": { left: 5, right: "r.png" },
  "data-table": { headline: "H", columns: [{ label: 5 }], rows: [{ text: "v" }] },
  "decision-matrix": { headline: "H", criteria: [{ label: 5 }], options: [{ name: "A", scores: [1] }] },
  diagram: { nodes: [{ id: 5, label: "A" }] },
  pyramid: { levels: [{ label: 5 }] },
  venn: { sets: [{ label: 5 }] },
  hierarchy: { root: { label: 5 }, children: [{ label: "C" }] },
  glossary: { entries: [{ term: 5, definition: "d" }] },
  faq: { items: [{ question: 5, answer: "a" }] },
  "team-grid": { members: [{ name: 5, role: "r" }] },
  attribution: { items: [{ name: 5 }] },
  contact: { items: [{ label: 5, value: "v" }] },
  equation: { formula: 5, body: "b" },
  bibliography: { entries: [{ citation: 5 }] },
  "data-source": { sources: [{ name: 5 }] },
};

/**
 * Types where a headline legitimately does not apply — the deck's own title
 * card, the dividers, and the quote forms whose text IS the slide. Every other
 * content type requires one: a slide that reserves a heading band and gets no
 * headline renders as an empty band above stretched content, and a model omits
 * the field freely wherever the schema lets it.
 */
const NO_HEADLINE = new Set(["title", "section", "chapter", "epigraph", "quote", "freeform", "image", "contact", "closing"]);
const withHeadline = (type, payload) =>
  NO_HEADLINE.has(type) || "headline" in payload ? { type, ...payload } : { type, headline: "H", ...payload };

for (const [type, payload] of Object.entries(VALID)) {
  test(`${type}: valid payload passes, wrong field shapes are rejected`, async () => {
    const ok = await validateDeck({ ...base, slides: [...base.slides, withHeadline(type, payload)] });
    assert.equal(ok.ok, true, JSON.stringify(ok.errors));

    const wrong = await validateDeck({
      ...base,
      slides: [...base.slides, { ...withHeadline(type, payload), ...SPECIFIC_BAD[type] }],
    });
    assert.equal(wrong.ok, false, `expected ${type} bad payload to fail`);
    assert.ok(wrong.errors.some((e) => /must be|too short|needs at least|one of/.test(e)), wrong.errors.join("; "));
  });
}

test("speaker_note is a shared field that survives on any standard type", async () => {
  const ok = await validateDeck({
    ...base,
    slides: [...base.slides, { type: "bullets", headline: "H", bullets: ["a", "b", "c", "d"], speaker_note: "Ask the audience this." }],
  });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
});

test("the catalog derives every new type and family, and no grammar breaker leaks", async () => {
  const schema = await deckSchema();
  const enumTypes = schema.definitions.slide.properties.type.enum;
  for (const t of Object.keys(VALID)) assert.ok(enumTypes.includes(t), `${t} missing from enum`);

  const cat = await slideCatalog();
  assert.ok(cat.includes("PROCESS & FLOW: flow, funnel, pipeline"));
  assert.ok(cat.includes("DIAGRAM-ISH: diagram, pyramid, venn, hierarchy"));
  assert.ok(cat.includes("SPECIAL: equation, bibliography, data-source"));
  assert.ok(cat.includes("- hierarchy: root"));
});

test("per-slide ops schemas stay small for nested-object types", async () => {
  const schema = await deckSchema();
  // The hierarchy schema recurses three levels deep by explicit nesting (no
  // $refs), so the ops grammar for it must still be well-formed and bounded.
  const ops = buildOpsSchema(schema, { slideCount: 1, onlyTypes: ["hierarchy"] });
  // `headline` is required on every content type, so the ops grammar demands
  // one as well — which is the point: a model writing through this grammar
  // cannot omit the field the way it could when the schema left it optional.
  assert.deepEqual(ops.properties.ops.items.properties.slide.required.sort(), ["children", "headline", "root", "type"]);
  const children = ops.properties.ops.items.properties.slide.properties.children;
  assert.ok(children.maxItems === 4);
});

test("no schema string field has maxLength >= 2000 (the grammar-breaking threshold)", async () => {
  const schema = await deckSchema();
  // The freeform html field is the one documented exception — a whole slide of
  // HTML is deliberately large, and it is never part of a generated grammar
  // (freeform is written as a single html string, not constrained fields).
  const walk = (node, path = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (typeof node.maxLength === "number" && !path.endsWith("html")) {
      assert.ok(node.maxLength < 2000, `maxLength ${node.maxLength} too large at ${path}`);
    }
    Object.entries(node).forEach(([k, v]) => walk(v, `${path}.${k}`));
  };
  walk(schema);
});
