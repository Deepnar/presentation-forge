import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { convertGeneratedDeck, importCoverage } from "../src/projects/legacy-conversion.js";
import { validateDeckIntent } from "../packages/model/intent.ts";
import { validateDeck } from "../src/validate.js";
import { validateScene } from "../packages/model/scene.ts";
import { blankSlide } from "../packages/editor/scene-text.js";
import { browserSceneValidatorSource } from "../app/web/scene-validator-plugin.js";
import { specimenDeck } from "../src/specimens.js";

const deck = (slides, extra = {}) => ({ title: "Cell choice", slides, ...extra });
const bullets = { type: "bullets", headline: "Evidence", bullets: ["First claim", "Second claim", "Third claim", "Fourth claim"] };

test("concurrent cold source validation accepts every caller without duplicate schema registration", async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => validateDeck(deck([bullets]))));
  assert.ok(results.every(result => result.ok));
});

test("static browser scene validation matches Node for nested, malformed and Unicode scenes without runtime generation", async t => {
  const output = fileURLToPath(new URL("../out/", import.meta.url));
  await mkdir(output, { recursive: true }); const scratch = await mkdtemp(path.join(output, "validator-parity-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const file = path.join(scratch, "validator.mjs"); const code = browserSceneValidatorSource();
  assert.doesNotMatch(code, /\brequire\s*\(|\beval\s*\(|\bnew Function\b/);
  await writeFile(file, code); const validate = (await import(pathToFileURL(file).href)).sceneValidator();
  const good = blankSlide(); good.id = "scene-🌸";
  const shape = { id: "shape-a", kind: "shape", x: 1, y: 1, w: 2, h: 1, z: 1, provenance: "human", shape: { form: "rect", fill: "FFFFFF" } };
  const nested = { ...good, elements: [{ id: "group-a", kind: "group", x: 0.5, y: 0.5, w: 5, h: 4, z: 1, provenance: "human", group: { children: [shape] } }] };
  const cases = [good, nested, { ...good, id: "" }, { ...good, width: 12 }, { ...good, unexpected: true },
    { ...good, elements: [{ ...shape, extra: true }] }, { ...good, elements: [{ ...shape, w: -1 }] },
    { ...nested, elements: [{ ...nested.elements[0], group: { children: [{ ...shape, shape: { form: "rect", fill: "#FFFFFF" } }] } }] }];
  for (const scene of cases) {
    const ok = validate(scene); const actual = { ok, errors: ok ? [] : validate.errors.map(error => `${error.instancePath || "(root)"} ${error.message}`) };
    assert.deepEqual(actual, await validateScene(scene));
  }
});

test("coverage accounts for every current legacy type and its field gates", async () => {
  const schema = JSON.parse(await readFile(new URL("../schema/deck.schema.json", import.meta.url)));
  const coverage = await importCoverage();
  assert.deepEqual(Object.keys(coverage).sort(), [...schema.definitions.slide.properties.type.enum].sort());
  assert.equal(Object.keys(coverage).length, 74);
  for (const entry of Object.values(coverage)) {
    assert.ok(["supported-with-field-gates", "refused"].includes(entry.status));
    assert.ok(Array.isArray(entry.fields) && entry.reason);
  }
});

test("conversion preserves slide order, section context, visible notes and both comparison bodies and points", async () => {
  const source = deck([
    { type: "title", headline: "Cell choice" },
    { ...bullets, section: 0, speaker_note: "Explain the caveat", presenter: "Presenter A" },
    { type: "compare", headline: "Trade-off", left: { title: "Liquid", kicker: "Mature", body: "Easy to make", points: ["Flammable"] }, right: { title: "Solid", body: "Safer", points: ["Costly"] }, verdict: "Trial solid" },
  ], { subtitle: "A grounded decision", sections: ["Evidence"] });
  const { intent, presenters } = await convertGeneratedDeck(source);
  assert.equal(intent.slides.length, source.slides.length);
  assert.equal((await validateDeckIntent(intent)).ok, true);
  assert.deepEqual(intent.slides.map(s => s.id), ["legacy-s1", "legacy-s2", "legacy-s3"]);
  const content = JSON.stringify({ intent, presenters });
  assert.equal(presenters[1], "Presenter A");
  assert.ok(!JSON.stringify(intent).includes("Presenter A"));
  for (const text of ["First claim", "Explain the caveat", "Presenter A", "A grounded decision", "Mature", "Easy to make", "Flammable", "Costly", "Trial solid"]) assert.ok(content.includes(text), text);
  assert.equal(intent.slides[1].speakerNotes, undefined);
});

test("native chart series, units and table cells survive semantic conversion exactly", async () => {
  const chart = { kind: "line", categories: ["A", "B"], series: [{ name: "Score", values: [-1.25, 0] }], unit: "mS/cm" };
  const { intent } = await convertGeneratedDeck(deck([
    { type: "chart", headline: "Results", chart },
    { type: "table", headline: "Values", columns: ["Sample", "Score"], rows: [["A", "-1.25"], ["B", "0"]] },
  ]));
  const actual = intent.slides[0].blocks.find(b => b.kind === "chart");
  assert.deepEqual(actual.series, chart.series);
  assert.deepEqual(actual.categories, chart.categories);
  assert.equal(actual.unit, chart.unit);
  assert.deepEqual(intent.slides[1].blocks.find(b => b.kind === "table").rows, [["Sample", "Score"], ["A", "-1.25"], ["B", "0"]]);
});

for (const [label, slide, pointer] of [
  ["real speaker notes", { ...bullets, notes: "Private speaker instructions" }, "notes"],
  ["citations", { ...bullets, cites: [{ url: "https://example.test/source", title: "Evidence" }] }, "cites"],
  ["unknown populated fields", { ...bullets, invented: "Do not lose me" }, "invented"],
  ["nested unknown fields", { type: "compare", headline: "Options", left: { title: "A", body: "One", surprise: "Keep me" }, right: { title: "B", body: "Two" } }, "surprise"],
  ["untyped vs body", { type: "vs", headline: "Options", left: { title: "A", body: { detail: "Authored fact" } }, right: { title: "B" } }, "left.body"],
  ["untyped before-after kicker", { type: "before-after", headline: "Change", before: { title: "A", body: "Old", kicker: { detail: "Authored fact" } }, after: { title: "B", body: "New" } }, "before.kicker"],
  ["untyped quote source", { type: "quote", quote: "Evidence", attribution: "A", source: { detail: "Authored fact" } }, "source"],
  ["untyped callout points", { type: "callout", headline: "Finding", body: "Evidence", points: [{ detail: "Authored fact" }] }, "points"],
  ["unsupported chart kinds", { type: "chart", headline: "Correlation", chart: { kind: "scatter", categories: ["A"], series: [{ name: "X", values: [1] }] } }, "chart.kind"],
  ["image references", { type: "image", image: "../../private.png" }, "image"],
  ["raster-only freeform", { type: "freeform", html: "<h1>Opaque</h1>" }, "freeform"],
]) test(`${label} refuse the whole deck with a field-specific diagnosis`, async () => {
  await assert.rejects(convertGeneratedDeck(deck([bullets, slide])), error => error.code === "unsupported-content" && error.details.some(d => d.path.includes(pointer) || d.reason.includes(pointer)));
});

test("strict validation refuses invalid lengths, empty decks and excessive slide counts", async () => {
  for (const source of [deck([{ ...bullets, headline: "x".repeat(151) }]), deck([]), deck(Array.from({ length: 61 }, () => bullets))]) {
    await assert.rejects(convertGeneratedDeck(source), error => ["invalid-source", "unsupported-content"].includes(error.code));
  }
});

test("chart cardinality, inconsistent table rows and invalid section references refuse rather than repair", async () => {
  for (const source of [
    deck([{ type: "chart", headline: "Data", chart: { kind: "bar", categories: ["A", "B"], series: [{ name: "X", values: [1] }] } }]),
    deck([{ type: "table", headline: "Data", columns: ["A", "B"], rows: [["Missing"]] }]),
    deck([{ ...bullets, section: 1 }], { sections: ["Only section"] }),
  ]) await assert.rejects(convertGeneratedDeck(source), error => ["invalid-source", "unsupported-content"].includes(error.code));
});

const specimenTypes = ["agenda", "cards", "stats", "kpi-dashboard", "data-cards", "ranking-list", "metric-comparison", "scorecard", "decision-matrix", "pipeline", "timeline", "milestone", "chronology", "definition", "glossary", "faq", "team-grid", "attribution", "contact", "equation", "bibliography", "data-source"];
for (const type of specimenTypes) test(`${type} preserves every authored text fact using typed semantic carriers`, async () => {
  const source = (await specimenDeck()).slides.find(slide => slide.type === type);
  const { intent } = await convertGeneratedDeck(deck([source], source.section === undefined ? {} : { sections: ["Specimens"] }));
  const facts = [];
  const walk = (value, key) => {
    if (typeof value === "string" && key !== "type") facts.push(value);
    else if (Array.isArray(value)) value.forEach(item => walk(item));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, key));
  };
  walk(source); const authored = JSON.stringify(intent);
  for (const fact of facts) assert.ok(authored.includes(JSON.stringify(fact).slice(1, -1)), `lost ${type} fact: ${fact}`);
});
