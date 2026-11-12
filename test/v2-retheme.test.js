// Changing a project's theme recompiles its stored DeckIntent in the new
// theme and carries the person's edits across — the F3 foundation: a
// project keeps the structure it was compiled from, server-side.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-retheme-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { changeProjectTheme } = await import("../src/projects/retheme.js");
const store = await import("../src/projects/store.js");
const { createDocument } = await import("../packages/model/engine.ts");
const { validateScene } = await import("../packages/model/scene.ts");
const { closeDb } = await import("../src/db.js");

const owner = "owner@example.test";
const deck = {
  title: "Retheme", theme: "warm-humanist",
  slides: [
    { type: "title", headline: "Retheme" },
    { type: "bullets", headline: "Points", bullets: ["One point", "Two point", "Three point", "Four point"], presenter: "Ada" },
    { type: "cards", headline: "Cards", cards: [{ title: "A", body: "First" }, { title: "B", body: "Second" }, { title: "C", body: "Third" }] },
    { type: "table", headline: "Values", columns: ["Cell", "Score"], rows: [["A", "1"], ["B", "2"]] },
  ],
};
let serial = 0;
async function imported() {
  const slug = `retheme-${++serial}`, dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  return (await importGeneratedProject({ slug, requestId: `request-${serial}`, principal: { email: owner } })).project;
}
const save = (project, scenes) => store.saveProject({ owner, id: project.id, baseRevision: project.revision, title: project.title, scenes, theme: project.theme, origin: project.origin });

before(async () => mkdir(process.env.FORGE_DECKS_DIR, { recursive: true }));
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

test("an imported project keeps its DeckIntent and chrome recipe server-side", async () => {
  const project = await imported();
  const { intent } = await store.getProjectIntent({ owner, id: project.id });
  assert.equal(intent.deck.slides.length, 4);
  assert.equal(intent.chrome.slides.length, 4);
  assert.equal(intent.chrome.slides[1].presenterText, "Ada");
  assert.equal((await store.getProjectIntent({ owner: "someone@else.test", id: project.id })).intent, null, "owner-checked");
  assert.equal("intent" in project, false, "the browser's document never carries it");
});

test("a new theme restyles every slide and keeps the person's edits, order and deletions", async () => {
  const project = await imported();
  const doc = await createDocument(structuredClone(project.scenes));
  const [, points, cards] = project.scenes;
  const heading = points.elements.find((e) => e.id.endsWith(":title:heading"));
  const frame = cards.elements.find((e) => e.id.endsWith(":frame"));
  const apply = (slideId, op) => doc.apply({ id: `e-${Math.random()}`, slideId, op, baseRevision: doc.snapshot().revision, actor: "human" });
  await apply(points.id, { type: "element.updateText", id: heading.id, paragraphs: [{ runs: [{ ...heading.paragraphs[0].runs[0], text: "My heading" }] }] });
  await apply(cards.id, { type: "element.move", id: frame.id, x: frame.x + 0.5, y: frame.y });
  // The person moves the table slide first and deletes the title slide.
  const edited = doc.snapshot().scenes;
  const reordered = [edited[3], edited[1], edited[2]];
  const saved = await save(project, reordered);
  assert.equal(saved.status, "saved");

  const result = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "light", baseRevision: saved.doc.revision });
  assert.equal(result.status, "saved");
  const next = result.doc;
  assert.deepEqual(next.theme, { name: "editorial-magazine", variant: "light" });
  assert.deepEqual(next.scenes.map((s) => s.id), reordered.map((s) => s.id), "same slides, same order, the deleted one stays deleted");
  for (const scene of next.scenes) assert.ok((await validateScene(scene)).ok);
  assert.notDeepEqual(next.scenes[1].background, saved.doc.scenes[1].background, "the ground changed");
  assert.equal(next.scenes[1].elements.find((e) => e.id === heading.id).paragraphs[0].runs[0].text, "My heading", "their wording is kept");
  assert.equal(next.scenes[2].elements.find((e) => e.id === frame.id).x, frame.x + 0.5, "their move is kept");
  const number = next.scenes[0].elements.find((e) => e.id.endsWith(":chrome:slide-number"));
  assert.equal(number?.paragraphs[0].runs[0].text, "1 / 3", "numbering follows their order");
  const history = await store.listRevisions({ owner, id: project.id });
  assert.ok(history.revisions.some((r) => /Changed the theme to editorial-magazine/.test(r.summary ?? "")));
});

test("dark appearance, a stale revision, and a project without a stored intent", async () => {
  const project = await imported();
  const dark = await changeProjectTheme({ owner, id: project.id, theme: "warm-humanist", mode: "dark", baseRevision: 0 });
  assert.equal(dark.status, "saved");
  assert.deepEqual(dark.doc.theme, { name: "warm-humanist", variant: "dark" });
  assert.equal((await changeProjectTheme({ owner, id: project.id, theme: "warm-humanist", mode: "light", baseRevision: 0 })).status, "stale");
  const bare = await store.createProject({ owner, title: "Bare", scenes: project.scenes });
  await assert.rejects(changeProjectTheme({ owner, id: bare.doc.id, theme: "warm-humanist", mode: "dark", baseRevision: 0 }), { code: "no-intent" });
  await assert.rejects(changeProjectTheme({ owner: "someone@else.test", id: project.id, theme: "warm-humanist", baseRevision: 1 }), { code: "not-found" });
});
