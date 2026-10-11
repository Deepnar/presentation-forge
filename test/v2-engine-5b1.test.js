// V2-5B-1: concurrent command safety and exact undo/redo state
// restoration. Concurrency cases use call-ordered Promise.all over
// real async validation — no sleeps, deterministic by FIFO queue
// order. Ownership cases compare full authoritative snapshots, not
// just visible values. Fails on `8e863f5` (pre-check race accepts
// both racers; inverse undo leaves ownership marked) and passes
// after the serialized snapshot-history correction.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument } from "../packages/model/engine.ts";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { compileDeck } from "../packages/compiler/compile.js";

async function deck2() {
  const design = await warmDesign();
  return compileDeck(sampleDeckIntent(), design).slice(0, 2);
}

let seq = 1000;
function envAt(slideId, op, baseRevision, extra = {}) {
  return { id: `c-${++seq}`, slideId, op, baseRevision, actor: "human", ...extra };
}

function deckJson(doc) {
  return JSON.stringify(doc.snapshot().scenes);
}

function firstTextId(scene) {
  return scene.elements.find((e) => e.kind === "text" && !e.locked).id;
}

function paras(text) {
  return [{ runs: [{ text, size: 13, color: "111111" }] }];
}

describe("v2-5b1 concurrent serialization", () => {
  it("two concurrent applies commit exactly once", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const [sid, other] = scenes.map((s) => s.id);
    const x = firstTextId(scenes[0]);
    const y = firstTextId(scenes[1]);
    const [ra, rb] = await Promise.all([
      doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0)),
      doc.apply(envAt(other, { type: "element.move", id: y, x: 8, y: 8 }, 0)),
    ]);
    assert.equal(ra.ok, true, "first caller commits");
    assert.equal(rb.ok, false, "second caller does not");
    assert.equal(rb.code, "stale-revision", "explicit conflict, never silent rebase");
    assert.equal(rb.expectedRevision, 1);
    assert.equal(doc.snapshot().revision, 1, "single advance");
    assert.equal(doc.status().historyLength, 1);
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === x).x, 7, "winner preserved");
    assert.notEqual(doc.snapshot().scenes[1].elements.find((e) => e.id === y).x, 8, "loser absent");
  });

  it("concurrent apply and batch serialize with one winner", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const [ra, rb] = await Promise.all([
      doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0)),
      doc.applyBatch({ id: "cb-1", baseRevision: 0, actor: "human", ops: [{ slideId: sid, op: { type: "element.move", id: x, x: 9, y: 9 } }] }),
    ]);
    assert.equal(ra.ok, true);
    assert.equal(rb.code, "stale-revision");
    assert.equal(doc.snapshot().revision, 1);
  });

  it("concurrent apply and undo serialize in call order", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const before = deckJson(doc);
    const [ra, ru] = await Promise.all([
      doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0)),
      doc.undo(),
    ]);
    assert.equal(ra.ok, true, "apply commits first");
    assert.equal(ru.ok, true, "undo then restores inside its own turn");
    assert.equal(deckJson(doc), before, "net effect is the original document");
    assert.equal(doc.snapshot().revision, 2, "both turns advance");
    assert.equal(doc.status().historyLength, 0);
    assert.ok(doc.status().canRedo, "undone entry preserved for redo");
  });

  it("undo before any commit fails while a concurrent apply wins", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const [ru, ra] = await Promise.all([
      doc.undo(),
      doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0)),
    ]);
    assert.equal(ru.code, "empty-history");
    assert.equal(ra.ok, true);
    assert.equal(doc.snapshot().revision, 1);
  });

  it("two concurrent undos restore once and report once", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const before = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0));
    const [r1, r2] = await Promise.all([doc.undo(), doc.undo()]);
    const oks = [r1, r2].filter((r) => r.ok);
    const fails = [r1, r2].filter((r) => !r.ok);
    assert.equal(oks.length, 1);
    assert.equal(fails.length, 1);
    assert.equal(fails[0].code, "empty-history");
    assert.equal(deckJson(doc), before, "exactly one restoration");
    assert.equal(doc.snapshot().revision, 2, "single advance for one undo");
  });

  it("concurrent duplicate envelope ids apply exactly once", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const envelope = () => ({ id: "same-id", slideId: sid, op: { type: "element.move", id: x, x: 6, y: 6 }, baseRevision: 0, actor: "human" });
    const [ra, rb] = await Promise.all([doc.apply(envelope()), doc.apply(envelope())]);
    assert.equal([ra.ok, rb.ok].filter(Boolean).length, 1, "exactly one commits");
    const loser = ra.ok ? rb : ra;
    assert.equal(loser.code, "duplicate-id", "duplicate check holds inside the turn");
    assert.equal(doc.snapshot().revision, 1);
  });

  it("failures never poison the queue", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    assert.equal((await doc.apply(envAt(sid, { type: "element.move", id: x, x: 2, y: 2 }, 0))).revision, 1);
    assert.equal((await doc.apply(envAt(sid, { type: "element.move", id: x, x: 3, y: 3 }, 0, { id: "stale-q" }))).code, "stale-revision");
    assert.equal((await doc.apply(envAt(sid, { type: "element.move", id: x, y: 3 }, 1, { id: "bad-q" }))).code, "bad-envelope");
    const last = await doc.apply(envAt(sid, { type: "element.move", id: x, x: 5, y: 5 }, 1, { id: "good-q" }));
    assert.equal(last.ok, true, "valid command succeeds after failures");
    assert.equal(last.revision, 2);
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === x).x, 5);
  });
});

describe("v2-5b1 exact ownership restoration", () => {
  it("Case A — first move undoes to compiler ownership exactly", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const before = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: 7, y: 7 }, 0));
    const moved = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.equal(moved.provenance, "human");
    assert.equal(moved.customized, true);
    await doc.undo();
    assert.equal(deckJson(doc), before, "coordinates and ownership both restored");
    const restored = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.equal(restored.provenance, "compiler");
    assert.ok(!("customized" in restored), "no leftover geometry flag");
    assert.equal(doc.snapshot().scenes[0].layoutState, "managed", "slide state restored");
  });

  it("Case B — first resize undoes dimensions and metadata", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const before = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.resize", id: x, w: 9, h: 3 }, 0));
    await doc.undo();
    assert.equal(deckJson(doc), before);
  });

  it("Case C — first text edit undoes paragraphs and the content flag", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const before = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.updateText", id: x, paragraphs: paras("Rewritten") }, 0));
    const edited = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.equal(edited.contentCustomized, true);
    await doc.undo();
    assert.equal(deckJson(doc), before, "paragraphs and flags restored together");
    const restored = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.ok(!("contentCustomized" in restored), "flag absent, not merely false");
    assert.equal(restored.provenance, "compiler");
  });

  it("Case D — undo preserves pre-existing customization", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === x);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: el.x + 1, y: el.y }, 0));
    const between = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: el.x + 5, y: el.y }, 1));
    await doc.undo();
    assert.equal(deckJson(doc), between, "undo restores the prior customized state, not compiler state");
    const kept = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.equal(kept.provenance, "human", "ownership not indiscriminately reset");
    assert.equal(kept.customized, true);
    assert.equal(kept.x, el.x + 1);
  });

  it("Case E/F — stacked move and text edit undo and redo in order", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === x);
    const original = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: el.x + 2, y: el.y }, 0));
    const movedOnly = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.updateText", id: x, paragraphs: paras("Stacked") }, 1));
    const both = deckJson(doc);
    await doc.undo();
    assert.equal(deckJson(doc), movedOnly, "text undo returns the moved-only state with its flags");
    const mid = doc.snapshot().scenes[0].elements.find((e) => e.id === x);
    assert.equal(mid.x, el.x + 2);
    assert.match(mid.paragraphs[0].runs[0].text, /./);
    assert.ok(!("contentCustomized" in mid), "no content flag at the moved-only stage");
    await doc.undo();
    assert.equal(deckJson(doc), original, "movement undo returns the compiler state");
    await doc.redo();
    assert.equal(deckJson(doc), movedOnly, "redo restores the first stage exactly");
    await doc.redo();
    assert.equal(deckJson(doc), both, "redo restores the second stage exactly");
  });

  it("Case G — batch undoes to the precise pre-batch state", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const texts = scenes[0].elements.filter((e) => e.kind === "text" && !e.locked).slice(0, 2);
    assert.equal(texts.length, 2);
    const before = deckJson(doc);
    await doc.applyBatch({
      id: "g-batch", baseRevision: 0, actor: "human",
      ops: [
        { slideId: sid, op: { type: "element.move", id: texts[0].id, x: 3, y: 3 } },
        { slideId: sid, op: { type: "element.updateText", id: texts[1].id, paragraphs: paras("Batch words") } },
      ],
    });
    await doc.undo();
    assert.equal(deckJson(doc), before, "all metadata restored, both elements");
  });

  it("Case H — undone text edits regenerate as never-customized; redone edits protect", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const base = compileSlide(slide, design);
    const doc = await createDocument([base]);
    const sid = base.id;
    const body = base.elements.find((e) => e.semanticRef === "s2b1").id;
    await doc.apply(envAt(sid, { type: "element.updateText", id: body, paragraphs: paras("Human wording") }, 0));
    await doc.undo();
    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].items[0] = "Compiler tries to overwrite";
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const regen = recompileSlide(edited, doc.snapshot().scenes[0], design);
    const rl = regen.elements.find((e) => e.id === body).paragraphs[0].runs[0].text;
    assert.match(rl, /Compiler tries to overwrite/, "undone customization behaves as never-existed");
    await doc.redo();
    const regen2 = recompileSlide(edited, doc.snapshot().scenes[0], design);
    const rl2 = regen2.elements.find((e) => e.id === body).paragraphs[0].runs[0].text;
    assert.match(rl2, /Human wording/, "redone customization protects again");
  });

  it("slide delete and duplicate undo to exact deck JSON", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const before = deckJson(doc);
    await doc.apply(envAt(null, { type: "slide.delete", id: scenes[1].id }, 0));
    await doc.undo();
    assert.equal(deckJson(doc), before, "order and content restored");
    await doc.apply(envAt(null, { type: "slide.duplicate", id: scenes[0].id }, 1));
    await doc.undo();
    assert.equal(deckJson(doc), before, "duplicate fully retracted");
  });
});

describe("v2-5b1 atomic history semantics", () => {
  it("apply/undo/redo round-trips the full authoritative state", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const original = deckJson(doc);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: 4, y: 4 }, 0));
    const committed = deckJson(doc);
    await doc.undo();
    assert.equal(deckJson(doc), original);
    await doc.redo();
    assert.equal(deckJson(doc), committed, "redo returns the exact committed post-apply state");
  });

  it("failed undo and redo leave history and scenes unchanged", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const before = deckJson(doc);
    assert.equal((await doc.undo()).code, "empty-history");
    assert.equal((await doc.redo()).code, "empty-history");
    assert.equal(deckJson(doc), before);
    assert.equal(doc.status().historyLength, 0);
    assert.equal(doc.snapshot().revision, 0);
  });

  it("revisions stay monotonic across mixed operations", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    const seen = [0];
    seen.push((await doc.apply(envAt(sid, { type: "element.move", id: x, x: 2, y: 2 }, 0))).revision);
    seen.push((await doc.applyBatch({ id: "mono-b", baseRevision: 1, actor: "human", ops: [{ slideId: sid, op: { type: "element.move", id: x, x: 3, y: 3 } }] })).revision);
    seen.push((await doc.undo()).revision);
    seen.push((await doc.redo()).revision);
    seen.push((await doc.undo()).revision);
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5], "strictly increasing with no gaps");
  });

  it("stale agents stay rejected after undo and redo", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: 2, y: 2 }, 0));
    await doc.undo();
    const s1 = await doc.apply({ id: "ag-1", slideId: sid, op: { type: "element.move", id: x, x: 9, y: 9 }, baseRevision: 0, actor: "agent" });
    assert.equal(s1.code, "stale-revision");
    assert.equal(s1.expectedRevision, 2);
    await doc.redo();
    const s2 = await doc.apply({ id: "ag-2", slideId: sid, op: { type: "element.move", id: x, x: 9, y: 9 }, baseRevision: 2, actor: "agent" });
    assert.equal(s2.code, "stale-revision");
    assert.equal(s2.expectedRevision, 3);
  });

  it("undo never removes an unrelated later change", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const texts = scenes[0].elements.filter((e) => e.kind === "text" && !e.locked).slice(0, 2);
    assert.equal(texts.length, 2);
    await doc.apply(envAt(sid, { type: "element.move", id: texts[0].id, x: 6, y: 6 }, 0));
    await doc.apply(envAt(sid, { type: "element.move", id: texts[1].id, x: 5, y: 5 }, 1));
    await doc.undo();
    const snap = doc.snapshot().scenes[0];
    assert.equal(snap.elements.find((e) => e.id === texts[0].id).x, 6, "earlier change intact");
    assert.notEqual(snap.elements.find((e) => e.id === texts[1].id).x, 5, "latest change reverted");
  });

  it("no mutable references escape snapshots or logs", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const x = firstTextId(scenes[0]);
    await doc.apply(envAt(sid, { type: "element.move", id: x, x: 2, y: 2 }, 0));
    const snap = doc.snapshot();
    assert.ok(Object.isFrozen(snap.scenes));
    const log1 = doc.log();
    log1[0].actor = "robot";
    log1.length = 0;
    const log2 = doc.log();
    assert.equal(log2.length, 1);
    assert.equal(log2[0].actor, "human");
  });
});
