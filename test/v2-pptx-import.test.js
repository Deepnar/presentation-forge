// F8: a PowerPoint file becomes an editable project. The strongest check is a
// round trip through the product's own native export: what went out as
// OOXML comes back as the same scene elements, in the same places.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-pptx-import-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
const { pptxToScenes, importPptxProject } = await import("../src/projects/pptx-import.js");
const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
const { compileDeck } = await import("../packages/compiler/compile.js");
const { validateScene } = await import("../packages/model/scene.ts");
const store = await import("../src/projects/store.js");
const { closeDb } = await import("../src/db.js");
const { sampleDeckIntent, warmDesign } = await import("./v2-fixture.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

const textsOf = (scenes) => scenes.flatMap((s) => s.elements.flatMap((e) => (e.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join("")))).filter(Boolean);
const slide = (id, elements, extra = {}) => ({ id, width: 13.333, height: 7.5, background: { fill: "F4F1EA" }, layoutState: "detached", elements, ...extra });

test("a compiled deck survives export and import: every scene valid, every line of text, titles in place", async () => {
  const scenes = compileDeck(sampleDeckIntent(), await warmDesign());
  const back = await pptxToScenes(new Uint8Array(await renderPptx(scenes)), { filename: "Sample deck.pptx" });
  assert.equal(back.scenes.length, scenes.length);
  assert.equal(back.title, "Sample deck", "a tool's placeholder title gives way to the file name");
  for (const s of back.scenes) assert.ok((await validateScene(s)).ok, s.id);
  const got = textsOf(back.scenes).join("\n");
  for (const line of textsOf(scenes)) assert.ok(got.includes(line.split("\n")[0]), `"${line.slice(0, 40)}" came back`);
  const before = scenes[1].elements.find((e) => e.id.endsWith(":title:heading"));
  const title = back.scenes[1].elements.find((e) => e.kind === "text" && e.paragraphs[0].runs[0].text === before.paragraphs[0].runs[0].text);
  for (const k of ["x", "y", "w", "h"]) assert.ok(Math.abs(title[k] - before[k]) < 0.02, `title ${k}: ${title[k]} vs ${before[k]}`);
  assert.equal(title.paragraphs[0].runs[0].size, before.paragraphs[0].runs[0].size);
  assert.ok(back.scenes.every((s) => s.layoutState === "detached" && s.elements.every((e) => e.provenance === "human")), "the person's own");
});

test("pictures, tables, charts, lines and notes come back as native elements", async () => {
  const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const scene = slide("s", [
    { id: "pic", kind: "image", x: 1, y: 1, w: 2, h: 1, z: 0, provenance: "human", image: { src: `data:image/png;base64,${png.toString("base64")}`, alt: "Blue" } },
    { id: "tbl", kind: "table", x: 4, y: 1, w: 5, h: 1.5, z: 10, provenance: "human", table: { rows: [["Cell", "Score"], ["A", "1.25"], ["B", "12.5"]], header: true } },
    { id: "ch", kind: "chart", x: 1, y: 3, w: 5, h: 3, z: 20, provenance: "human", chart: { chartKind: "bar", categories: ["A", "B"], series: [{ name: "mS", values: [1.25, 12.5] }] } },
    { id: "ln", kind: "line", x: 7, y: 4, w: 3, h: 0.01, z: 30, provenance: "human", line: { x2: 10, y2: 4, stroke: "336699", strokeWidth: 2 } },
  ], { notes: "Say this out loud.", notesEdited: true });
  const back = await pptxToScenes(new Uint8Array(await renderPptx([scene])));
  const [s] = back.scenes;
  assert.ok((await validateScene(s)).ok);
  const kinds = s.elements.map((e) => e.kind);
  for (const k of ["image", "table", "chart", "line"]) assert.ok(kinds.includes(k), `${k} came back`);
  assert.equal(back.assets.length, 1, "the picture is an asset");
  assert.match(s.elements.find((e) => e.kind === "image").image.src, /^asset:[0-9a-f]{64}$/);
  assert.deepEqual(s.elements.find((e) => e.kind === "table").table.rows, [["Cell", "Score"], ["A", "1.25"], ["B", "12.5"]]);
  const chart = s.elements.find((e) => e.kind === "chart").chart;
  assert.deepEqual([chart.chartKind, chart.categories, chart.series[0].values], ["bar", ["A", "B"], [1.25, 12.5]]);
  const line = s.elements.find((e) => e.kind === "line");
  assert.ok(Math.abs(line.line.x2 - 10) < 0.02 && Math.abs(line.y - 4) < 0.02);
  assert.equal(s.notes, "Say this out loud.");
  assert.deepEqual(back.warnings, []);
});

test("a file that is not a PowerPoint is refused plainly", async () => {
  await assert.rejects(pptxToScenes(new Uint8Array([1, 2, 3])), { code: "pptx-invalid" });
  await assert.rejects(pptxToScenes(new Uint8Array()), { code: "pptx-invalid" });
});

test("importing creates the person's project with its pictures stored", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#cc3333" } }).png().toBuffer();
  const bytes = await renderPptx([slide("s", [{ id: "pic", kind: "image", x: 1, y: 1, w: 2, h: 2, z: 0, provenance: "human", image: { src: `data:image/png;base64,${png.toString("base64")}` } }])]);
  const { project, warnings } = await importPptxProject({ owner: "owner@example.test", bytes: new Uint8Array(bytes), filename: "Field trip.pptx" });
  assert.equal(project.title, "Field trip");
  assert.deepEqual(warnings, []);
  const src = project.scenes[0].elements.find((e) => e.kind === "image").image.src;
  const assets = await store.getProjectAssets({ owner: "owner@example.test", id: project.id, hashes: [src.slice(6)] });
  assert.equal(assets.size, 1);
  assert.equal((await store.getProject({ owner: "someone@else.test", id: project.id })).doc, null, "owner only");
});
