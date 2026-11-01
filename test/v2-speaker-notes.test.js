// Speaker notes travel intent -> scene -> engine -> native PPTX, and a
// human's notes survive regeneration.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { convertGeneratedDeck } from "../src/projects/legacy-conversion.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function withNotes() {
  const intent = sampleDeckIntent();
  intent.slides[0].speakerNotes = "Open with the leak statistic.\nPause for questions.";
  return intent;
}

let seq = 0;
const env = (op, baseRevision) => ({ id: `notes-${++seq}`, slideId: null, op, baseRevision, actor: "human" });

async function notesOf(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const out = [];
  for (let i = 1; zip.file(`ppt/slides/slide${i}.xml`); i++) {
    const rels = await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`).async("string");
    const target = rels.match(/Target="\.\.\/notesSlides\/([^"]+)"/)?.[1];
    const xml = target ? await zip.file(`ppt/notesSlides/${target}`).async("string") : "";
    const body = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].find((m) => /type="body"/.test(m[0]))?.[0] ?? "";
    out.push([...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("\n"));
  }
  return out;
}

test("the compiler carries intent speaker notes onto the scene, and only where authored", async () => {
  const scenes = compileDeck(withNotes(), await warmDesign());
  assert.equal(scenes[0].notes, "Open with the leak statistic.\nPause for questions.");
  assert.equal(scenes[1].notes, undefined);
  for (const scene of scenes) assert.ok((await validateScene(scene)).ok);
});

test("slide.setNotes is validated, undoable and marks the notes as human-written", async () => {
  const doc = await createDocument(compileDeck(withNotes(), await warmDesign()));
  const id = doc.snapshot().scenes[0].id;
  for (const op of [
    { type: "slide.setNotes", id, notes: 3 },
    { type: "slide.setNotes", id, notes: "x".repeat(20001) },
    { type: "slide.setNotes", id, notes: "ok", extra: true },
  ]) assert.equal((await doc.apply(env(op, 0))).ok, false);
  assert.equal((await doc.apply(env({ type: "slide.setNotes", id: "missing", notes: "x" }, 0))).code, "unknown-slide");

  assert.ok((await doc.apply(env({ type: "slide.setNotes", id, notes: "My own script" }, 0))).ok);
  let scene = doc.snapshot().scenes[0];
  assert.equal(scene.notes, "My own script");
  assert.equal(scene.notesEdited, true);

  assert.ok((await doc.undo()).ok);
  scene = doc.snapshot().scenes[0];
  assert.equal(scene.notes, "Open with the leak statistic.\nPause for questions.");
  assert.equal(scene.notesEdited, undefined);

  assert.ok((await doc.redo()).ok);
  assert.equal(doc.snapshot().scenes[0].notes, "My own script");

  assert.ok((await doc.apply(env({ type: "slide.setNotes", id, notes: "" }, doc.snapshot().revision))).ok);
  scene = doc.snapshot().scenes[0];
  assert.equal(scene.notes, undefined);
  assert.equal(scene.notesEdited, true, "cleared notes stay a human decision");
});

test("regeneration keeps human notes and follows the intent for untouched ones", async () => {
  const design = await warmDesign();
  const intent = withNotes();
  const scenes = compileDeck(intent, design);
  const { plan } = planDeckComposition(intent, design);
  const planned = plan.slides[0];

  intent.slides[0].speakerNotes = "Regenerated script";
  assert.equal(recompileSlide(intent.slides[0], scenes[0], design, planned).notes, "Regenerated script");

  const edited = { ...scenes[0], notes: "Human script", notesEdited: true };
  const kept = recompileSlide(intent.slides[0], edited, design, planned);
  assert.equal(kept.notes, "Human script");
  assert.equal(kept.notesEdited, true);

  const cleared = { ...scenes[0], notesEdited: true };
  delete cleared.notes;
  assert.equal(recompileSlide(intent.slides[0], cleared, design, planned).notes, undefined);
});

test("native PPTX carries each slide's notes and nothing on slides without them", async () => {
  const scenes = compileDeck(withNotes(), await warmDesign());
  const notes = await notesOf(await renderPptx(scenes));
  assert.equal(notes.length, scenes.length);
  assert.match(notes[0], /Open with the leak statistic\./);
  assert.match(notes[0], /Pause for questions\./);
  assert.equal(notes[1], "");
});

test("conversion keeps a generated deck's speaker notes instead of refusing it", async () => {
  const { intent } = await convertGeneratedDeck({
    title: "Cell choice",
    slides: [
      { type: "bullets", headline: "Evidence", bullets: ["First claim", "Second claim", "Third claim", "Fourth claim"], notes: "Say the second claim slowly." },
      { type: "bullets", headline: "More", bullets: ["One", "Two", "Three", "Four"], notes: "   " },
    ],
  });
  assert.equal(intent.slides[0].speakerNotes, "Say the second claim slowly.");
  assert.equal(intent.slides[1].speakerNotes, undefined);
});
