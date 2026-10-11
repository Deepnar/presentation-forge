// V2-5C D1: regeneration tombstones. Deleting a compiler-owned
// element records slide-scoped suppression; regeneration skips
// those IDs instead of resurrecting them, while human-added
// deletions record nothing and detached slides pass through.
// Case A fails on `4d16a2f` (resurrection); the rest pin the
// contract. Uses real compile/recompile paths throughout.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../packages/model/engine.ts";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

async function setup() {
  const design = await warmDesign();
  const slide = JSON.parse(JSON.stringify(sampleDeckIntent().slides[2]));
  const scene = compileSlide(slide, design);
  return { design, slide, scene };
}

function byRef(scene, ref) {
  return scene.elements.find((e) => e.semanticRef === ref);
}

async function deleteViaEngine(scene, id, base = 0) {
  const doc = await createDocument([scene]);
  const r = await doc.apply({ id: `del-${id}`, slideId: scene.id, op: { type: "element.delete", id }, baseRevision: base, actor: "human" });
  assert.equal(r.ok, true, `delete commits: ${r.code ?? ""} ${r.message ?? ""}`);
  return doc;
}

describe("v2-5c tombstones", () => {
  it("Case A — deleted compiler text stays suppressed on regeneration", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    const suppressed = doc.snapshot().scenes[0].suppressed ?? [];
    assert.deepEqual(suppressed, [{ id: target.id, semanticRef: "s3left" }], "exact tombstone recorded");
    const out = recompileSlide(slide, doc.snapshot().scenes[0], design);
    assert.ok(!out.elements.some((e) => e.id === target.id), "no resurrection");
    assert.deepEqual(out.suppressed, suppressed, "tombstones carry forward");
  });

  it("Case B — undo restores the element and clears suppression", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    await doc.undo();
    const snap = doc.snapshot().scenes[0];
    assert.ok(snap.elements.some((e) => e.id === target.id), "element restored");
    assert.equal(snap.suppressed, undefined, "prior suppression state restored (none)");
    const out = recompileSlide(slide, snap, design);
    assert.ok(out.elements.some((e) => e.id === target.id), "regeneration includes it again");
  });

  it("Case C — redo restores deletion and suppression", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    await doc.undo();
    await doc.redo();
    const snap = doc.snapshot().scenes[0];
    assert.ok(!snap.elements.some((e) => e.id === target.id), "element gone again");
    assert.deepEqual(snap.suppressed, [{ id: target.id, semanticRef: "s3left" }], "suppression back");
    const out = recompileSlide(slide, snap, design);
    assert.ok(!out.elements.some((e) => e.id === target.id), "regeneration suppresses again");
  });

  it("Case D — deleting a human-added element records no tombstone", async () => {
    const { design, slide, scene } = await setup();
    const doc = await createDocument([scene]);
    const added = await doc.apply({
      id: "add-note", slideId: scene.id, baseRevision: 0, actor: "human",
      op: { type: "element.add", element: { kind: "text", x: 1, y: 6, w: 4, h: 1, paragraphs: [{ runs: [{ text: "Note", size: 12, color: "111111" }] }] } },
    });
    assert.equal(added.ok, true);
    const noteId = doc.snapshot().scenes[0].elements.at(-1).id;
    assert.match(noteId, /^h-/, "human id minted");
    await doc.apply({ id: "del-note", slideId: scene.id, baseRevision: 1, actor: "human", op: { type: "element.delete", id: noteId } });
    assert.equal(doc.snapshot().scenes[0].suppressed, undefined, "no compiler suppression for human content");
    const out = recompileSlide(slide, doc.snapshot().scenes[0], design);
    assert.ok(out.elements.some((e) => e.semanticRef === "s3left"), "compiler content unaffected");
  });

  it("Case E — customized deletion suppresses by identity", async () => {
    const { design, slide, scene } = await setup();
    const doc = await createDocument([scene]);
    const target = byRef(scene, "s3left");
    await doc.apply({ id: "mv", slideId: scene.id, baseRevision: 0, actor: "human", op: { type: "element.move", id: target.id, x: 5, y: 5 } });
    await doc.apply({ id: "dl", slideId: scene.id, baseRevision: 1, actor: "human", op: { type: "element.delete", id: target.id } });
    const snap = doc.snapshot().scenes[0];
    assert.deepEqual(snap.suppressed, [{ id: target.id, semanticRef: "s3left" }], "customized delete suppresses");
    const out = recompileSlide(slide, snap, design);
    assert.ok(!out.elements.some((e) => e.id === target.id), "custom geometry does not resurrect");
  });

  it("Case F — detached slides keep suppression untouched", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    const snap = doc.snapshot().scenes[0];
    const detached = { ...structuredClone(snap), layoutState: "detached" };
    const edited = JSON.parse(JSON.stringify(slide));
    edited.title = "Unrecognizable headline";
    const out = recompileSlide(edited, detached, design);
    assert.equal(out, detached, "hands off");
    assert.deepEqual(out.suppressed, [{ id: target.id, semanticRef: "s3left" }], "suppression preserved as-is");
  });

  it("Case G — siblings and unrelated content survive", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const sibling = byRef(scene, "s3right");
    const doc = await deleteViaEngine(scene, target.id);
    const out = recompileSlide(slide, doc.snapshot().scenes[0], design);
    assert.ok(out.elements.some((e) => e.id === sibling.id), "sibling present");
    assert.ok(out.elements.some((e) => e.semanticRef === "s3v"), "callout present");
    assert.equal(out.suppressed.length, 1, "exactly one tombstone");
  });

  it("Case H1 — renamed identity leaves the tombstone inert but retained", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    const renamed = JSON.parse(JSON.stringify(slide));
    renamed.blocks.find((b) => b.id === "s3left").id = "s3left2";
    const out = recompileSlide(renamed, doc.snapshot().scenes[0], design);
    assert.ok(out.elements.some((e) => e.semanticRef === "s3left2"), "new identity renders (never guessed away)");
    assert.deepEqual(out.suppressed, [{ id: target.id, semanticRef: "s3left" }], "tombstone retained, inert");
  });

  it("Case H2 — same identity under another theme stays suppressed", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const doc = await deleteViaEngine(scene, target.id);
    const swiss = normalizeDesign({ theme: await loadThemeDocument("swiss-international"), mode: "light" });
    const out = recompileSlide(slide, doc.snapshot().scenes[0], swiss);
    assert.ok(!out.elements.some((e) => e.id === target.id), "same logical element stays suppressed");
  });

  it("Case I — atomic batch failure records half nothing", async () => {
    const { design, slide, scene } = await setup();
    const target = byRef(scene, "s3left");
    const locked = byRef(scene, "s3right");
    const tampered = structuredClone(scene);
    tampered.elements.find((e) => e.id === locked.id).locked = true;
    const doc = await createDocument([tampered]);
    const r = await doc.applyBatch({
      id: "batch-del", baseRevision: 0, actor: "human",
      ops: [
        { slideId: scene.id, op: { type: "element.delete", id: target.id } },
        { slideId: scene.id, op: { type: "element.delete", id: locked.id } },
      ],
    });
    assert.equal(r.code, "locked");
    const snap = doc.snapshot().scenes[0];
    assert.ok(snap.elements.some((e) => e.id === target.id), "first deletion rolled back");
    assert.equal(snap.suppressed, undefined, "no half tombstone");
    assert.equal(doc.snapshot().revision, 0);
  });
});
