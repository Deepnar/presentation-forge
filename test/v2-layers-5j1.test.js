// V2-5J1: system-chrome lock boundary. The adapter always refused
// unlocking protected chrome, but the shared engine accepted the
// same envelope directly — a bypass for any headless or future
// agent caller. Enforcement now lives in the canonical primitive
// (applyCommand) over one shared predicate, so every path refuses.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { isSystemChrome } from "../packages/model/scene-constants.ts";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import JSZip from "jszip";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

// Compiler-shaped system chrome (see packages/compiler/chrome.ts):
// locked, compiler provenance, no authored-block semanticRef.
function chromeScene() {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      {
        id: "s:chrome:content-mark", kind: "image", x: 12, y: 0.2, w: 1, h: 0.6, z: 0,
        provenance: "compiler", locked: true, image: { src: "", alt: "crest" },
      },
      {
        id: "s:body", kind: "text", x: 1, y: 1, w: 6, h: 2, z: 1,
        provenance: "compiler", semanticRef: "body",
        paragraphs: [{ runs: [{ text: "words", size: 13, color: "111111" }], align: "left" }],
      },
    ],
  }];
}

async function rig(scenes) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: () => {},
  });
  return { document, root, viewer, doc, editor, errors };
}

function chromeOf(r) {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:chrome:content-mark");
}

describe("v2-5j1 engine bypass repro", () => {
  it("direct unlock of system chrome is rejected with state intact", async () => {
    const r = await rig(chromeScene());
    assert.equal(isSystemChrome(chromeOf(r)), true, "fixture matches the guarded classification");
    const before = JSON.stringify(r.doc.snapshot().scenes);
    const result = await r.doc.apply({
      id: "bypass-1", slideId: "s",
      op: { type: "element.setLocked", id: "s:chrome:content-mark", locked: false },
      baseRevision: 0, actor: "human",
    });
    assert.equal(result.ok, false, "authoritative boundary refuses");
    assert.match(result.message, /system chrome/);
    assert.equal(chromeOf(r).locked, true, "lock remains set");
    assert.equal(chromeOf(r).provenance, "compiler", "provenance unchanged");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "scene byte-identical");
    assert.equal(r.doc.snapshot().revision, 0, "revision does not advance");
    assert.equal(r.doc.status().historyLength, 0, "no history entry created");
  });

  it("batch unlock plus valid edit rejects atomically", async () => {
    const r = await rig(chromeScene());
    const before = JSON.stringify(r.doc.snapshot().scenes);
    const result = await r.doc.applyBatch({
      id: "bypass-batch", baseRevision: 0, actor: "human",
      ops: [
        { slideId: "s", op: { type: "element.setLocked", id: "s:chrome:content-mark", locked: false } },
        { slideId: "s", op: { type: "element.move", id: "s:body", x: 2, y: 2 } },
      ],
    });
    assert.equal(result.ok, false, "the whole batch rejects");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "valid companion rolled back too");
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("actor strings buy no privilege", async () => {
    const r = await rig(chromeScene());
    for (const actor of ["agent", "human"]) {
      const result = await r.doc.apply({
        id: `bypass-${actor}`, slideId: "s",
        op: { type: "element.setLocked", id: "s:chrome:content-mark", locked: false },
        baseRevision: 0, actor, agentId: "root",
      });
      assert.equal(result.ok, false, `actor=${actor} still refused`);
    }
    assert.equal(chromeOf(r).locked, true);
  });
});

describe("v2-5j1 ordinary locking still works", () => {
  it("human-added shape locks and unlocks", async () => {
    const r = await rig(chromeScene());
    const added = await r.doc.apply({
      id: "add", slideId: "s",
      op: { type: "element.add", element: { id: "h-box", kind: "shape", x: 1, y: 1, w: 2, h: 2, provenance: "human", shape: { form: "rect", fill: "AABBCC" } } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(added.ok, true);
    assert.equal((await r.editor.setElementLocked("h-box", true)).ok, true);
    assert.equal((await r.editor.setElementLocked("h-box", false)).ok, true);
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "h-box").locked, undefined);
  });

  it("compiler-authored user content locks and unlocks", async () => {
    const r = await rig(chromeScene());
    assert.equal(isSystemChrome(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:body")), false);
    assert.equal((await r.editor.setElementLocked("s:body", true)).ok, true);
    assert.equal((await r.editor.setElementLocked("s:body", false)).ok, true);
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:body").locked, undefined);
  });

  it("lock, undo, redo restores exactly", async () => {
    const r = await rig(chromeScene());
    const before = structuredClone(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:body"));
    await r.editor.setElementLocked("s:body", true);
    await r.editor.undo();
    assert.deepEqual(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:body"), before);
    await r.editor.redo();
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:body").locked, true);
  });

  it("locked ordinary content rejects move, resize, edit, and delete", async () => {
    const r = await rig(chromeScene());
    await r.editor.setElementLocked("s:body", true);
    const rev = r.doc.snapshot().revision;
    const ops = [
      { type: "element.move", id: "s:body", x: 5, y: 5 },
      { type: "element.resize", id: "s:body", w: 2, h: 2 },
      { type: "element.updateText", id: "s:body", paragraphs: [{ runs: [{ text: "x" }] }] },
      { type: "element.delete", id: "s:body" },
    ];
    for (const [i, op] of ops.entries()) {
      const result = await r.doc.apply({ id: `frozen-${i}`, slideId: "s", op, baseRevision: rev, actor: "human" });
      assert.equal(result.code, "locked", `${op.type} refused on user-locked content`);
    }
    assert.equal(r.doc.snapshot().revision, rev, "no revision advance across refusals");
  });

  it("duplicate slides keep copied chrome protected", async () => {
    const r = await rig(chromeScene());
    const dup = await r.doc.apply({ id: "dup", slideId: null, op: { type: "slide.duplicate", id: "s" }, baseRevision: 0, actor: "human" });
    assert.equal(dup.ok, true);
    const scenes = r.doc.snapshot().scenes;
    const copyId = scenes.map((s) => s.id).find((id) => id !== "s");
    const copyChrome = scenes.find((s) => s.id === copyId).elements.find((e) => /chrome/.test(e.id));
    assert.ok(copyChrome, "chrome copied with the slide");
    assert.equal(isSystemChrome(copyChrome), true, "copy retains the guarded classification");
    const result = await r.doc.apply({
      id: "bypass-copy", slideId: copyId,
      op: { type: "element.setLocked", id: copyChrome.id, locked: false },
      baseRevision: 1, actor: "human",
    });
    assert.equal(result.ok, false, "copied chrome refuses too");
    assert.equal(scenes.find((s) => s.id === copyId).elements.find((e) => e.id === copyChrome.id).locked, true);
  });

  it("nested locked groups still inherit through the panel path", async () => {
    const scenes = chromeScene();
    scenes[0].elements.push({
      id: "s:grp", kind: "group", x: 1, y: 1, w: 5, h: 4, z: 2, provenance: "human",
      group: { children: [{ id: "s:grp:kid", kind: "shape", x: 0, y: 0, w: 2, h: 1, z: 0, provenance: "human", shape: { form: "rect", fill: "00FF00" } }] },
    });
    const r = await rig(scenes);
    await r.editor.setElementLocked("s:grp", true);
    assert.equal((await r.editor.setElementHidden("s:grp:kid", true)).code, "locked");
  });

  it("unrelated ordering and visibility are unaffected", async () => {
    const r = await rig(chromeScene());
    assert.equal((await r.editor.reorderElement("s:body", 0)).ok, true);
    assert.equal((await r.editor.setElementHidden("s:body", true)).ok, true);
    assert.equal(r.doc.status().historyLength, 2);
    assert.equal(chromeOf(r).locked, true, "chrome untouched by neighboring ops");
  });
});

describe("v2-5j1 regeneration and export compatibility", () => {
  it("chrome stays locked and user locks carry through recompile", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const { scenes } = await deckRigLocal();
    const slideIdx = scenes.findIndex((s) => s.elements.some((e) => e.kind === "text" && !e.locked));
    const slide = scenes[slideIdx];
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const planned = planDeckComposition(intent, design).plan.slides.find((x) => x.slideId === slide.id);
    const recompile = (prev) => recompileSlide(intent.slides[slideIdx], prev, design, planned);
    const r = await rig(structuredClone(scenes));
    r.viewer.api.goTo(slideIdx);
    const victim = slide.elements.find((e) => e.kind === "text" && !e.locked).id;
    await r.editor.setElementLocked(victim, true);
    const recompiled = recompile(structuredClone(r.doc.snapshot().scenes[slideIdx]));
    assert.equal(recompiled.elements.find((e) => e.id === victim).locked, true, "user lock carried");
    await r.editor.undo();
    const recompiled2 = recompile(structuredClone(r.doc.snapshot().scenes[slideIdx]));
    assert.equal(recompiled2.elements.find((e) => e.id === victim).locked, undefined, "abandoned lock recompiles fresh");
  });

  async function deckRigLocal() {
    const design = await warmDesign();
    return { design, scenes: compileDeck(sampleDeckIntent(), design) };
  }

  it("protected chrome exports locked and native", async () => {
    const r = await rig(chromeScene());
    const refused = await r.editor.setElementLocked("s:chrome:content-mark", false);
    assert.equal(refused.ok, false);
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    assert.ok(bytes instanceof Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    assert.equal(names.length, 1, "single slide exports");
  });
});
