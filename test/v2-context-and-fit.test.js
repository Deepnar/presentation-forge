// What kept real decks out of the editor even after every type converted:
// section and standfirst lines swaying the layout, and long text refusing
// the whole deck.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-context-fit-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";
const { compileDeck } = await import("../packages/compiler/compile.js");
const { planDeckComposition } = await import("../packages/compiler/composition.ts");
const { convertGeneratedDeck } = await import("../src/projects/legacy-conversion.js");
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { closeDb } = await import("../src/db.js");
const { warmDesign } = await import("./v2-fixture.js");
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

const framed = {
  title: "Framed", sections: ["Evidence"],
  slides: [{ type: "feature-grid", headline: "What changes", section: 0, standfirst: "Four shifts in one year",
    items: ["Faster", "Safer", "Lighter", "Denser"].map((title, i) => ({ icon: "⚡🛡️🪶🔋".split(/(?=\p{Extended_Pictographic})/u)[i] ?? "•", title, body: "Short reason" })) }],
};

test("context lines never decide the layout, and an arrangement always does", async () => {
  const design = await warmDesign();
  const { intent } = await convertGeneratedDeck(framed);
  assert.equal(intent.slides[0].blocks.filter(b => b.emphasis === "context").length, 2);
  assert.equal(planDeckComposition(intent, design).plan.slides[0].family, "card-grid");
  const roadmap = (await convertGeneratedDeck({ title: "R", sections: ["Plan"], slides: [{ type: "roadmap", headline: "Plan", section: 0, standfirst: "Three phases",
    phases: [{ label: "A", items: [{ title: "One" }] }, { label: "B", items: [{ title: "Two" }] }, { label: "C", items: [{ title: "Three" }] }] }] })).intent;
  assert.equal(planDeckComposition(roadmap, design).plan.slides[0].family, "card-grid");
});

test("context lines sit between the title and the content, one per line", async () => {
  const { intent } = await convertGeneratedDeck(framed);
  const [scene] = compileDeck(intent, await warmDesign());
  const title = scene.elements.find(e => e.id.endsWith(":title:heading"));
  const lines = scene.elements.filter(e => e.id.endsWith(":context"));
  assert.equal(lines.length, 2);
  assert.ok(lines.every(l => l.y >= title.y + title.h - 1e-9));
  const content = scene.elements.filter(e => e.id.endsWith(":frame"));
  const lastLine = Math.max(...lines.map(l => l.y + l.h));
  assert.ok(content.every(f => f.y >= lastLine - 1e-9), "cards start below the context lines");
  assert.ok(JSON.stringify(lines).includes("Four shifts in one year"));
  assert.equal(scene.elements.filter(e => e.id.endsWith(":icon")).length, 4, "the grid still draws its icons");
});

test("text too long for its box imports with a warning instead of refusing the deck", async () => {
  const slug = "too-long", dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(dir, { recursive: true });
  const long = "A claim that goes on far longer than any slide box can hold at a readable size ".repeat(6).trim();
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Long", slides: [{ type: "cards", headline: "Too much", cards: [{ title: "One", body: long }, { title: "Two", body: long }, { title: "Three", body: long }] }] }));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner: "owner@example.test", status: "ready" }));
  const result = await importGeneratedProject({ slug, requestId: "request-long", principal: { email: "owner@example.test" } });
  assert.ok(result.project.id);
  assert.ok(result.fitWarnings.length > 0);
  assert.ok(result.fitWarnings.every(w => w.slideId && w.message));
});

test("a context line too long for one line gets two, and the content starts below it", async () => {
  const long = "A standfirst that runs on well past the width of the slide, so that at the caption size it cannot sit on a single line without shrinking below the floor";
  const { intent } = await convertGeneratedDeck({ title: "Long", slides: [{ type: "feature-grid", headline: "What changes", standfirst: long,
    items: ["Faster", "Safer", "Lighter", "Denser"].map((title) => ({ icon: "•", title, body: "Short reason" })) }] });
  const fit = [];
  const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
  const { scenes, fitDiagnostics } = compileDeckDetailed(intent, await warmDesign());
  fit.push(...fitDiagnostics.filter((d) => /:context$/.test(d.elementId)));
  const [line] = scenes[0].elements.filter((e) => e.id.endsWith(":context"));
  assert.ok(line.h > 0.5, `two lines tall (${line.h})`);
  assert.deepEqual(fit, [], "and no floor warning for it");
  const frames = scenes[0].elements.filter((e) => e.id.endsWith(":frame"));
  assert.ok(frames.every((f) => f.y >= line.y + line.h - 1e-9), "cards start below it");
});

test("an agenda too long to seat its descriptions shows its titles, with the descriptions in the notes", async () => {
  const desc = "A description long enough that seven of them cannot all sit on one slide at a readable size, in any arrangement";
  const items = ["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((title) => ({ title: `Stop ${title}`, desc }));
  const { intent } = await convertGeneratedDeck({ title: "A", slides: [{ type: "agenda", headline: "Seven stops", items }] });
  const { compileDeckDetailed } = await import("../packages/compiler/compile.js");
  const { scenes, fitDiagnostics } = compileDeckDetailed(intent, await warmDesign());
  const text = scenes[0].elements.flatMap((e) => (e.paragraphs ?? []).map((p) => p.runs.map((r) => r.text).join(""))).join("\n");
  for (const it of items) assert.ok(text.includes(it.title), `${it.title} is on the slide`);
  assert.ok(!text.includes(desc), "no description is drawn half-fitted");
  assert.equal((scenes[0].notes.match(/A description long enough/g) ?? []).length, 7, "every description is in the notes");
  assert.deepEqual(fitDiagnostics.filter((d) => d.slideId === scenes[0].id && !/:context$/.test(d.elementId)), []);
});

test("an agenda whose descriptions fit keeps them on the slide", async () => {
  const items = ["One", "Two", "Three"].map((title) => ({ title: `Stop ${title}`, desc: "Short note" }));
  const { intent } = await convertGeneratedDeck({ title: "A", slides: [{ type: "agenda", headline: "Three stops", items }] });
  const [scene] = compileDeck(intent, await warmDesign());
  assert.ok(JSON.stringify(scene.elements).includes("Short note"));
  assert.equal(scene.notes ?? "", "");
});
