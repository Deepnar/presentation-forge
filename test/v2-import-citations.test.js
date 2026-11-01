// A generated deck's claim citations arrive as the project's own retained
// sources and slide citations, created with the project in one step.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-import-cites-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const store = await import("../src/projects/store.js");
const { createSourceRegistry } = await import("../src/projects/sources.js");
const { createProjectCitations } = await import("../src/projects/citations.js");
const { closeDb } = await import("../src/db.js");
const { blankSlide } = await import("../packages/editor/scene-text.js");

const owner = "owner@example.test";
const bullets = (headline, cites) => ({ type: "bullets", headline, bullets: ["First claim", "Second claim", "Third claim", "Fourth claim"], ...(cites ? { cites } : {}) });
let serial = 0;
async function importDeck(slides) {
  const slug = `cited-${++serial}`, dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Cited", slides }));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  return importGeneratedProject({ slug, requestId: `request-${serial}`, principal: { email: owner } });
}

before(async () => mkdir(process.env.FORGE_DECKS_DIR, { recursive: true }));
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

test("cites become retained sources and current slide citations", async () => {
  const paper = { url: "https://example.test/paper#section-2", title: "A study of interfaces", accessed: "2026-08-01" };
  const { project } = await importDeck([
    { type: "title", headline: "Cited" },
    bullets("Evidence", [paper, { url: "https://example.test/other" }]),
    bullets("More evidence", [structuredClone(paper)]),
  ]);
  const binding = { id: project.id, owner };
  const inspected = await createSourceRegistry(store).inspect(binding);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.catalog.count, 2, "one source per distinct cite");
  const listed = await createSourceRegistry(store).list(binding, { generation: inspected.catalog.generation, revision: inspected.catalog.revision });
  const byUrl = new Map(listed.sources.map(s => [s.url, s]));
  assert.equal(byUrl.get("https://example.test/paper").title, "A study of interfaces", "the fragment is dropped");
  assert.equal(byUrl.get("https://example.test/other").title, "example.test", "an untitled cite is named by its host");
  assert.equal(byUrl.get("https://example.test/paper").retrievedAt, "2026-08-01T00:00:00.000Z");

  const ids = project.scenes.flatMap(s => (s.citations ?? []).map(c => c.id));
  assert.equal(ids.length, 3);
  assert.equal(project.scenes[1].citations.length, 2);
  const view = await createProjectCitations(store).inspect(binding, {
    projectRevision: project.revision, citationIds: ids,
    sourceGeneration: inspected.catalog.generation, sourceRevision: inspected.catalog.revision,
  });
  assert.equal(view.ok, true, JSON.stringify(view));
  assert.ok(view.citations.every(c => c.target === "present" && c.content === "current" && c.source === "retained"), JSON.stringify(view.citations));
});

test("a cite that cannot be a web source refuses the import with its slide", async () => {
  await assert.rejects(importDeck([bullets("Evidence", [{ url: "ftp://example.test/file" }])]),
    e => e.code === "unsupported-content" && e.details.some(d => d.path === "slides[0].cites"));
  await assert.rejects(importDeck([bullets("Evidence", [{ url: "https://user:pw@example.test/" }])]),
    e => e.code === "unsupported-content");
});

test("plain project creation still refuses citations without their sources", async () => {
  const scene = blankSlide();
  scene.citations = [{ version: 1, id: "cit_" + "a".repeat(32), target: { kind: "slide", slideId: scene.id },
    source: { projectId: "p", id: "src_" + "b".repeat(64), generation: 0 }, anchor: { kind: "content-sha256-v1", digest: "c".repeat(64) } }];
  await assert.rejects(store.createProject({ owner, title: "x", scenes: [scene] }), e => e.code === "invalid-document");
});
