// F9: once a generation has become a project, the project needs nothing
// from the deck's directory — its pictures, intent and sources are in the
// database — so the retention sweep can delete the directory (the 5–15 MB
// of previews that dominate disk) without breaking the project: it still
// opens, restyles and exports.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-outlives-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { sweep } = await import("../src/sweep.js");
const { changeProjectTheme } = await import("../src/projects/retheme.js");
const store = await import("../src/projects/store.js");
const { scenesForExport } = await import("../src/projects/assets.js");
const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
const { closeDb } = await import("../src/db.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

const owner = "owner@example.test";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("a project keeps working after the sweep deletes the deck it came from", async () => {
  const slug = "outlived", dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "assets", "photo.png"), PNG);
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Outlived", theme: "warm-humanist", slides: [
    { type: "title", headline: "Outlived" },
    { type: "bullets", headline: "Points", bullets: ["One point", "Two point", "Three point", "Four point"] },
    { type: "image", headline: "A picture", image: "assets/photo.png", caption: "Kept in the database" },
  ] }));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  const { project } = await importGeneratedProject({ slug, requestId: "request-outlives", principal: { email: owner } });

  const swept = await sweep({ olderThanDays: 0 });
  assert.deepEqual(swept.deleted.map((d) => d.slug), [slug]);
  await assert.rejects(access(dir), "the deck directory is gone");

  const { doc } = await store.getProject({ owner, id: project.id });
  assert.equal(doc.scenes.length, 3, "the project opens");
  const pptx = await renderPptx(await scenesForExport(store, { owner, id: project.id }, doc.scenes));
  assert.ok(pptx.byteLength > 1000, "and exports, its picture read from the database");
  const themed = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "light", baseRevision: doc.revision });
  assert.equal(themed.status, "saved", "and restyles from its stored intent");
});
