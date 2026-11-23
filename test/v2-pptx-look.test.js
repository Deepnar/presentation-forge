// F8: a PowerPoint's look — its theme's colours and fonts — taken over a
// project's theme. Read deterministically from the file, contrast-checked,
// fonts only when this server has them; kept with the project so later
// recompiles keep it, and removable.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";
import JSZip from "jszip";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-look-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { extractLook, contrast } = await import("../src/projects/pptx-look.js");
const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
const { blankSlide } = await import("../packages/editor/scene-text.js");
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { changeProjectTheme } = await import("../src/projects/retheme.js");
const store = await import("../src/projects/store.js");
const { closeDb } = await import("../src/db.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

const theme = (c, major, minor) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Custom"><a:themeElements>
<a:clrScheme name="Custom"><a:dk1><a:srgbClr val="${c.dk1}"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="${c.lt1}"/></a:lt1>
<a:dk2><a:srgbClr val="${c.dk2}"/></a:dk2><a:lt2><a:srgbClr val="E8E2D0"/></a:lt2><a:accent1><a:srgbClr val="${c.accent1}"/></a:accent1>
<a:accent2><a:srgbClr val="17BEBB"/></a:accent2><a:accent3><a:srgbClr val="333333"/></a:accent3><a:accent4><a:srgbClr val="444444"/></a:accent4>
<a:accent5><a:srgbClr val="555555"/></a:accent5><a:accent6><a:srgbClr val="666666"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Custom"><a:majorFont><a:latin typeface="${major}"/></a:majorFont><a:minorFont><a:latin typeface="${minor}"/></a:minorFont></a:fontScheme>
</a:themeElements></a:theme>`;

async function pptxWith(c, major = "Playfair Display", minor = "Calibri") {
  const zip = await JSZip.loadAsync(await renderPptx([blankSlide()]));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n));
  for (const n of names) zip.file(n, theme(c, major, minor));
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}
const SCHEME = { dk1: "1F2A44", lt1: "FAF7F0", dk2: "0B3954", accent1: "E4572E" };

test("a PowerPoint's colours and installed fonts become a look; the rest is kept and said", async () => {
  const look = await extractLook(await pptxWith(SCHEME), "Brand.pptx");
  assert.equal(look.source, "Brand.pptx");
  assert.equal(look.tokens.palette.bg, "#FAF7F0", "a system colour's last value is read");
  assert.equal(look.tokens.palette.ink, "#1F2A44");
  assert.equal(look.tokens.palette.accent, "#E4572E");
  assert.equal(look.tokens.palette.accent_alt, "#17BEBB");
  assert.ok(contrast(look.tokens.palette.ink.slice(1), look.tokens.palette.bg.slice(1)) >= 4.5);
  assert.equal(look.tokens.surfaces.title.bg, "#0B3954");
  assert.equal(look.tokens.type.heading.family, "Playfair Display");
  assert.equal(look.tokens.type.body, undefined, "Calibri is not installed here");
  assert.match(look.notes.join(" "), /Calibri is not available here/);
});

test("colours that would not read are refused; a file with nothing usable is refused plainly", async () => {
  const pale = await extractLook(await pptxWith({ ...SCHEME, dk1: "EEEEEE" }), "pale.pptx");
  assert.equal(pale.tokens.palette, undefined);
  assert.match(pale.notes.join(" "), /too close to read/);
  await assert.rejects(extractLook(await pptxWith({ ...SCHEME, dk1: "EEEEEE" }, "Calibri", "Calibri")), { code: "no-look" });
  await assert.rejects(extractLook(new Uint8Array([1, 2, 3])), { code: "file-unreadable" });
});

test("a look restyles the project, survives a theme change, and comes off again", async () => {
  const owner = "owner@example.test", slug = "looked", dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Looked", theme: "warm-humanist", slides: [
    { type: "title", headline: "Looked" },
    { type: "bullets", headline: "Points", bullets: ["One point", "Two point", "Three point", "Four point"] },
  ] }));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  const { project } = await importGeneratedProject({ slug, requestId: "request-looked", principal: { email: owner } });
  const look = await extractLook(await pptxWith(SCHEME), "Brand.pptx");
  const colours = (doc) => JSON.stringify(doc.scenes[1]);

  const took = await changeProjectTheme({ owner, id: project.id, theme: "warm-humanist", mode: "light", baseRevision: project.revision, look });
  assert.equal(took.status, "saved");
  assert.match(colours(took.doc), /1F2A44/i, "its ink is on the slide");
  assert.match(colours(took.doc), /FAF7F0/i, "and its ground");
  assert.equal(took.doc.theme.look.source, "Brand.pptx", "kept in the project's theme record");
  const history = await store.listRevisions({ owner, id: project.id });
  assert.ok(history.revisions.some((r) => /Took the look of Brand\.pptx/.test(r.summary ?? "")));

  const other = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "light", baseRevision: took.doc.revision });
  assert.match(colours(other.doc), /1F2A44/i, "a theme change keeps the look");

  const off = await changeProjectTheme({ owner, id: project.id, theme: "warm-humanist", mode: "light", baseRevision: other.doc.revision, look: null });
  assert.doesNotMatch(colours(off.doc), /1F2A44/i, "removed, the theme's own colours return");
  assert.equal(off.doc.theme.look, undefined);

  // History: restoring the revision that had the look brings back its
  // slides, its theme and the look, so later compiles agree with them.
  const back = await store.restoreRevision({ owner, id: project.id, targetRevision: took.doc.revision, baseRevision: off.doc.revision, provenance: { actor: "human" } });
  assert.equal(back.status, "restored");
  assert.deepEqual([back.doc.theme.name, back.doc.theme.look?.source], ["warm-humanist", "Brand.pptx"]);
  assert.match(colours(back.doc), /1F2A44/i);
  const after = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "light", baseRevision: back.doc.revision });
  assert.match(colours(after.doc), /1F2A44/i, "a theme change after the restore keeps the restored look");
});

test("restoring an older revision brings back the theme its slides were drawn in", async () => {
  const owner = "owner@example.test", slug = "themed", dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Themed", theme: "warm-humanist", slides: [
    { type: "title", headline: "Themed" },
    { type: "bullets", headline: "Points", bullets: ["One point", "Two point", "Three point", "Four point"] },
  ] }));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  const { project } = await importGeneratedProject({ slug, requestId: "request-themed", principal: { email: owner } });
  const dark = await changeProjectTheme({ owner, id: project.id, theme: "editorial-magazine", mode: "dark", baseRevision: project.revision });
  const back = await store.restoreRevision({ owner, id: project.id, targetRevision: project.revision, baseRevision: dark.doc.revision, provenance: { actor: "human" } });
  assert.deepEqual(back.doc.theme, project.theme, "the original theme with its slides");
  assert.equal(back.doc.title, "Themed", "the title stays current");
});

test("a regenerated deck updating its project is drawn in the project's look", async () => {
  const owner = "owner@example.test", slug = "relooked", dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  const deck = (point) => YAML.stringify({ title: "Relooked", theme: "warm-humanist", slides: [
    { type: "title", headline: "Relooked" },
    { type: "bullets", headline: "Points", bullets: [point, "Two point", "Three point", "Four point"] },
  ] });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "deck.yaml"), deck("One point"));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  const { project } = await importGeneratedProject({ slug, requestId: "request-relooked", principal: { email: owner } });
  const look = await extractLook(await pptxWith(SCHEME), "Brand.pptx");
  await changeProjectTheme({ owner, id: project.id, theme: "warm-humanist", mode: "light", baseRevision: project.revision, look });

  await writeFile(path.join(dir, "deck.yaml"), deck("A regenerated point"));
  const updated = await importGeneratedProject({ slug, requestId: "request-relooked", principal: { email: owner } });
  assert.equal(updated.project.id, project.id, "the same project, updated");
  const text = JSON.stringify(updated.project.scenes[1]);
  assert.ok(text.includes("A regenerated point"), "the new content arrived");
  assert.match(text, /1F2A44/i, "drawn in the project's look");
  assert.equal(updated.project.theme.look?.source, "Brand.pptx", "and the look stays on the project");
});
