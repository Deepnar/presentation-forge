// F3: a compiled slide's other layouts — its stored intent compiled under
// each layout choice, the person's wording and additions carried, moves in
// the old arrangement dropped. The choice travels on the scene, so a theme
// change keeps the layout the person picked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-slide-layouts-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { slideLayoutOptions } = await import("../src/projects/slide-layouts.js");
const { changeProjectTheme } = await import("../src/projects/retheme.js");
const { withLayoutChoice, choiceKey } = await import("../packages/compiler/layout-choice.js");
const store = await import("../src/projects/store.js");
const { createDocument } = await import("../packages/model/engine.ts");
const { validateScene } = await import("../packages/model/scene.ts");
const { closeDb } = await import("../src/db.js");

const owner = "owner@example.test";
const deck = {
  title: "Layouts", theme: "warm-humanist",
  slides: [
    { type: "title", headline: "Layouts" },
    { type: "cards", headline: "Three parts", cards: [{ title: "Anode", body: "Lithium metal" }, { title: "Separator", body: "Solid electrolyte" }, { title: "Cathode", body: "Layered oxide" }] },
    { type: "table", headline: "Values", columns: ["Cell", "Score"], rows: [["A", "1"], ["B", "2"]] },
  ],
};
let serial = 0;
async function imported() {
  const slug = `layouts-${++serial}`, dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  return (await importGeneratedProject({ slug, requestId: `request-${serial}`, principal: { email: owner } })).project;
}

before(async () => mkdir(process.env.FORGE_DECKS_DIR, { recursive: true }));
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

test("a choice replaces the intent's own structural hints", () => {
  const slide = { id: "s", purpose: "p", blocks: [{ id: "b", kind: "text", text: "x" }], relationship: "comparison", layoutHint: { recipe: "comparison", emphasis: "x" } };
  assert.deepEqual(withLayoutChoice(slide, { relationship: "hierarchy", arrangement: "radial" }),
    { ...slide, relationship: "hierarchy", layoutHint: { emphasis: "x", arrangement: "radial" } });
  assert.equal(withLayoutChoice(slide, null), slide, "no choice is the slide as written");
  assert.equal(choiceKey(undefined), "auto");
  assert.equal(choiceKey({ relationship: "sequence", flowDirection: "down" }), "steps-down");
});

test("a card slide offers other layouts that fit, each carrying the person's work", async () => {
  const project = await imported();
  const cards = project.scenes[1];
  const doc = await createDocument(structuredClone(project.scenes));
  const apply = async (op) => assert.equal((await doc.apply({ id: `e-${Math.random()}`, slideId: cards.id, op, baseRevision: doc.snapshot().revision, actor: "human" })).ok, true, op.type);
  const heading = cards.elements.find((e) => e.id.endsWith(":title:heading"));
  const frame = cards.elements.find((e) => e.id.endsWith(":frame"));
  await apply({ type: "element.updateText", id: heading.id, paragraphs: [{ runs: [{ ...heading.paragraphs[0].runs[0], text: "My three parts" }] }] });
  await apply({ type: "element.move", id: frame.id, x: frame.x + 0.4, y: frame.y });
  await apply({ type: "element.add", element: { id: "h-000000000001", kind: "shape", x: 12, y: 6.5, w: 0.5, h: 0.5, z: 999, provenance: "human", shape: { form: "ellipse", fill: "FF0000" } } });
  const saved = await store.saveProject({ owner, id: project.id, baseRevision: project.revision, title: project.title, scenes: doc.snapshot().scenes, theme: project.theme, origin: project.origin });
  assert.equal(saved.status, "saved");

  const { current, options } = await slideLayoutOptions({ owner, id: project.id, slideId: cards.id });
  assert.equal(current, "auto");
  assert.equal(options[0].key, "auto");
  assert.equal(options[0].current, true);
  assert.ok(options.length >= 4, `several layouts offered: ${options.map((o) => o.key).join(", ")}`);
  assert.equal(new Set(options.map((o) => o.family + JSON.stringify(o.scene.elements.map((e) => [e.x, e.y])))).size, options.length, "no two options draw the same");
  for (const o of options) {
    assert.ok((await validateScene(o.scene)).ok, o.key);
    assert.equal(o.scene.id, cards.id);
    assert.ok(o.fits || o.current, `${o.key} fits`);
    const text = JSON.stringify(o.scene.elements);
    for (const word of ["My three parts", "Anode", "Separator", "Cathode"]) assert.ok(text.includes(word), `${o.key} keeps ${word}`);
    assert.ok(o.scene.elements.some((e) => e.id === "h-000000000001"), `${o.key} keeps what they added`);
  }
  const steps = options.find((o) => o.key === "steps");
  assert.ok(steps, "steps is offered for three parts");
  assert.equal(steps.family, "sequence");
  assert.deepEqual(steps.scene.layoutChoice, { relationship: "sequence", flowDirection: "across" });
  assert.equal(steps.scene.elements.some((e) => e.id === frame.id && e.x === frame.x + 0.4), false, "a move made in the old arrangement does not follow");

  // Picked, then the theme changes: the slide keeps the layout picked.
  const next = await store.saveProject({ owner, id: project.id, baseRevision: saved.doc.revision, title: project.title, scenes: saved.doc.scenes.map((s) => (s.id === cards.id ? steps.scene : s)), theme: project.theme, origin: project.origin });
  const again = await slideLayoutOptions({ owner, id: project.id, slideId: cards.id });
  assert.equal(again.current, "steps");
  assert.equal(again.options.find((o) => o.current).key, "steps");
  const themed = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "light", baseRevision: next.doc.revision });
  const after = themed.doc.scenes.find((s) => s.id === cards.id);
  assert.equal(after.recipeId, "sequence");
  assert.deepEqual(after.layoutChoice, steps.scene.layoutChoice);
  assert.ok(JSON.stringify(after.elements).includes("My three parts"));
});

test("title and table slides have no other layouts, and other people's projects are refused", async () => {
  const project = await imported();
  for (const scene of [project.scenes[0], project.scenes[2]]) {
    const out = await slideLayoutOptions({ owner, id: project.id, slideId: scene.id });
    assert.deepEqual(out.options, [], scene.recipeId);
  }
  await assert.rejects(slideLayoutOptions({ owner: "someone@else.test", id: project.id, slideId: project.scenes[1].id }), { code: "not-found" });
  await assert.rejects(slideLayoutOptions({ owner, id: project.id, slideId: "nope" }), { code: "not-found" });
});

test("the Assistant's change_layout lays a stored slide out by name, and its names are the picker's", async () => {
  const { compileSlide } = await import("../src/projects/slide-compile.js");
  const { VARIANTS } = await import("../src/projects/slide-layouts.js");
  const { readFile } = await import("node:fs/promises");
  const request = JSON.parse(await readFile(new URL("../packages/tools/request.schema.json", import.meta.url)));
  const branch = request.oneOf.find((b) => b.properties.tool.const === "change_layout");
  assert.deepEqual(branch.properties.args.properties.layout.enum, VARIANTS.map((v) => v.key));
  const project = await imported();
  const cards = project.scenes[1];
  const hub = await compileSlide({ owner, id: project.id }, { layout: "hub", replaces: cards.id, index: 1, total: 3 });
  assert.equal(hub.id, cards.id);
  assert.deepEqual(hub.layoutChoice, { relationship: "hierarchy", arrangement: "radial" });
  assert.ok((await validateScene(hub)).ok);
  assert.equal(await compileSlide({ owner, id: project.id }, { layout: "hub", replaces: project.scenes[0].id, index: 0, total: 3 }), null, "a title slide has one layout");
  assert.equal(await compileSlide({ owner, id: project.id }, { layout: "nope", replaces: cards.id, index: 1, total: 3 }), null);
  assert.equal(await compileSlide({ owner, id: project.id }, { layout: "quadrants", replaces: cards.id, index: 1, total: 3 }), null, "three parts are not quadrants: the compiler would draw its own card grid");
});
