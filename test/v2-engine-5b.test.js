// V2-5B: atomic command engine. Headless, framework-free: envelope
// validation, optimistic revisions, copy-on-write atomicity (single
// and batch), inverse undo/redo, slide operations, duplicate
// rejection, ownership tracking, and export compatibility. No DOM,
// no server, no AI SDK. Fails on `06a0211` (no engine module).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument, MAX_HISTORY } from "../packages/model/engine.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";

async function deck2() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design);
  return scenes.slice(0, 2);
}

function env(slideId, op, extra = {}) {
  return { id: `e-${Math.random().toString(36).slice(2)}`, slideId, op, baseRevision: 0, actor: "human", ...extra };
}

let seq = 0;
function envAt(slideId, op, baseRevision, extra = {}) {
  return { id: `e-${++seq}`, slideId, op, baseRevision, actor: "human", ...extra };
}

function firstTextId(scene) {
  return scene.elements.find((e) => e.kind === "text" && !e.locked).id;
}

describe("v2-5b envelope validation", () => {
  it("rejects malformed envelopes without touching state", async () => {
    const doc = await createDocument(await deck2());
    const bad = [
      null, "x", {},
      { id: "", slideId: "s", op: { type: "element.move", id: "a", x: 1, y: 1 }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.move", id: "a", x: 1, y: 1 }, baseRevision: -1, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.move", id: "a", x: 1, y: 1 }, baseRevision: 0, actor: "robot" },
      { id: "a", slideId: "s", op: { type: "element.teleport", id: "a" }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.move", id: "a", x: NaN, y: 1 }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.resize", id: "a", w: -2, h: 1 }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.updateText", id: "a", paragraphs: [] }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.add", element: { kind: "text" } }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "slide.delete", id: "x" }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: null, op: { type: "element.move", id: "a", x: 1, y: 1 }, baseRevision: 0, actor: "human" },
      { id: "a", slideId: "s", op: { type: "element.move", id: "a", x: () => 1, y: 1 }, baseRevision: 0, actor: "human" },
    ];
    for (const [i, e] of bad.entries()) {
      const r = await doc.apply(e);
      assert.equal(r.ok, false, `case ${i} rejected`);
      assert.equal(r.code, "bad-envelope", `case ${i} coded`);
    }
    assert.equal(doc.snapshot().revision, 0, "nothing committed");
    assert.equal(doc.status().historyLength, 0, "no history");
  });

  it("starts at revision zero and advances deterministically", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    assert.equal(doc.snapshot().revision, 0);
    const id = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === id);
    const r = await doc.apply(envAt(scenes[0].id, { type: "element.move", id, x: el.x + 1, y: el.y }, 0));
    assert.equal(r.ok, true);
    assert.equal(r.revision, 1);
    assert.equal(doc.snapshot().revision, 1);
  });

  it("stale envelopes report expected and actual revisions untouched", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const id = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === id);
    await doc.apply(envAt(scenes[0].id, { type: "element.move", id, x: el.x + 1, y: el.y }, 0));
    const frozen = JSON.stringify(doc.snapshot().scenes);
    const r = await doc.apply(envAt(scenes[0].id, { type: "element.move", id, x: 1, y: 1 }, 0, { id: "stale-1" }));
    assert.equal(r.ok, false);
    assert.equal(r.code, "stale-revision");
    assert.equal(r.expectedRevision, 1);
    assert.equal(r.actualRevision, 0);
    assert.equal(JSON.stringify(doc.snapshot().scenes), frozen, "scenes unchanged");
    assert.equal(doc.status().historyLength, 1, "history unchanged");
  });

  it("no-op commands succeed without advancing revision or history", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const id = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === id);
    const r = await doc.apply(envAt(scenes[0].id, { type: "element.move", id, x: el.x, y: el.y }, 0));
    assert.equal(r.ok, true);
    assert.equal(r.noop, true);
    assert.equal(doc.snapshot().revision, 0, "revision untouched by no-ops");
    assert.equal(doc.status().historyLength, 0, "no-ops leave no history");
  });
});

describe("v2-5b atomicity", () => {
  it("unknown elements, locked targets, and bad slides change nothing", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const frozen = JSON.stringify(doc.snapshot().scenes);
    const miss = await doc.apply(envAt("nope", { type: "element.move", id: "x", x: 1, y: 1 }, 0));
    assert.equal(miss.code, "unknown-slide");
    const missEl = await doc.apply(envAt(scenes[0].id, { type: "element.move", id: "nope", x: 1, y: 1 }, 0));
    assert.equal(missEl.code, "unknown-element");
    assert.equal(JSON.stringify(doc.snapshot().scenes), frozen);
    assert.equal(doc.snapshot().revision, 0);
    assert.equal(doc.status().historyLength, 0);
  });

  it("element commands move, resize, retext, add, and delete through the engine", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const el = scenes[0].elements.find((e) => e.id === id);
    let rev = 0;
    rev = (await doc.apply(envAt(sid, { type: "element.move", id, x: el.x + 2, y: el.y + 1 }, rev))).revision;
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, el.x + 2);
    rev = (await doc.apply(envAt(sid, { type: "element.resize", id, w: 6, h: 2 }, rev))).revision;
    rev = (await doc.apply(envAt(sid, {
      type: "element.updateText", id,
      paragraphs: [{ runs: [{ text: "Edited", size: 13, color: "111111" }] }],
    }, rev))).revision;
    assert.match(doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text, /Edited/);
    const added = await doc.apply(envAt(sid, {
      type: "element.add",
      element: { kind: "shape", x: 1, y: 1, w: 2, h: 2, shape: { fill: "FF0000" } },
    }, rev));
    assert.equal(added.ok, true);
    rev = added.revision;
    const addedId = doc.snapshot().scenes[0].elements.at(-1).id;
    assert.match(addedId, /^h-/, "human ids minted");
    rev = (await doc.apply(envAt(sid, { type: "element.delete", id: addedId }, rev))).revision;
    assert.ok(!doc.snapshot().scenes[0].elements.some((e) => e.id === addedId));
    assert.equal(doc.status().historyLength, 5);
  });

  it("locked targets reject with identity intact", async () => {
    const scenes = await deck2();
    scenes[0].elements.push({
      id: "s1:lock", kind: "shape", x: 1, y: 1, w: 2, h: 2, z: 50,
      provenance: "compiler", locked: true, shape: { fill: "000000" },
    });
    const doc = await createDocument(scenes);
    const r = await doc.apply(envAt(scenes[0].id, { type: "element.move", id: "s1:lock", x: 5, y: 5 }, 0));
    assert.equal(r.code, "locked");
    assert.deepEqual(doc.snapshot().scenes[0].elements.find((e) => e.id === "s1:lock").x, 1);
  });

  it("nested group children resolve and locked descendants reject", async () => {
    const scenes = await deck2();
    scenes[0].elements.push({
      id: "s1:g", kind: "group", x: 2, y: 2, w: 6, h: 3, z: 40, provenance: "compiler",
      group: {
        children: [
          { id: "s1:g:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 1, provenance: "compiler", shape: { fill: "00FF00" } },
          { id: "s1:g:lock", kind: "shape", x: 3, y: 0.5, w: 2, h: 1, z: 2, provenance: "compiler", locked: true, shape: { fill: "FF0000" } },
        ],
      },
    });
    const doc = await createDocument(scenes);
    const r = await doc.apply(envAt(scenes[0].id, { type: "element.move", id: "s1:g:kid", x: 1, y: 1 }, 0));
    assert.equal(r.ok, true, "group children addressable by id");
    const moved = doc.snapshot().scenes[0].elements.find((e) => e.id === "s1:g");
    assert.equal(moved.group.children.find((c) => c.id === "s1:g:kid").x, 1);
    const locked = await doc.apply(envAt(scenes[0].id, { type: "element.move", id: "s1:g:lock", x: 1, y: 1 }, 1));
    assert.equal(locked.code, "locked", "locked descendants reject");
  });

  it("invalid resulting scenes roll back wholesale", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const broken = structuredClone(scenes[0]);
    broken.id = "evil";
    broken.elements = [{ id: "evil:e", kind: "text" }];
    const r = await doc.apply(envAt(null, { type: "slide.insert", scene: broken }, 0));
    assert.equal(r.code, "invalid-result", `got ${r.code}: ${r.message}`);
    assert.equal(doc.snapshot().scenes.length, 2, "deck unchanged");
    assert.equal(doc.snapshot().revision, 0);
  });

  it("caller payloads are cloned on entry, never aliased", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const paras = [{ runs: [{ text: "Live", size: 13, color: "111111" }] }];
    const id = firstTextId(scenes[0]);
    await doc.apply(envAt(scenes[0].id, { type: "element.updateText", id, paragraphs: paras }, 0));
    paras[0].runs[0].text = "Mutated after apply";
    assert.match(
      doc.snapshot().scenes[0].elements.find((e) => e.id === id).paragraphs[0].runs[0].text,
      /Live/,
      "later caller mutation cannot reach the document",
    );
  });
});

describe("v2-5b undo and redo", () => {
  it("undo restores, redo reapplies, revision advances throughout", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const x0 = scenes[0].elements.find((e) => e.id === id).x;
    await doc.apply(envAt(sid, { type: "element.move", id, x: x0 + 3, y: 1 }, 0));
    assert.equal(doc.snapshot().revision, 1);
    await doc.undo();
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, x0, "undo restores");
    assert.equal(doc.snapshot().revision, 2, "undo advances revision");
    await doc.redo();
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, x0 + 3, "redo reapplies");
    assert.equal(doc.snapshot().revision, 3, "redo advances revision");
  });

  it("a new command clears redo and stale agents stay rejected after undo", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const x0 = scenes[0].elements.find((e) => e.id === id).x;
    await doc.apply(envAt(sid, { type: "element.move", id, x: x0 + 1, y: 1 }, 0));
    await doc.undo();
    const redo = await doc.redo();
    assert.equal(redo.ok, true);
    await doc.undo();
    await doc.apply(envAt(sid, { type: "element.move", id, x: x0 + 9, y: 1 }, 4));
    assert.equal((await doc.redo()).code, "empty-history", "new command clears redo");
    const stale = await doc.apply({ id: "agent-old", slideId: sid, op: { type: "element.move", id, x: 0, y: 0 }, baseRevision: 1, actor: "agent", agentId: "a1" });
    assert.equal(stale.code, "stale-revision", "undone-then-moved history still rejects stale agents");
    assert.equal(stale.expectedRevision, 5);
  });

  it("empty undo and redo fail explicitly with history intact", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    assert.equal((await doc.undo()).code, "empty-history");
    assert.equal((await doc.redo()).code, "empty-history");
    assert.equal(doc.snapshot().revision, 0);
  });

  it("undo stays correct across slide reorder and duplication", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const x0 = scenes[0].elements.find((e) => e.id === id).x;
    await doc.apply(envAt(sid, { type: "element.move", id, x: x0 + 5, y: 1 }, 0));
    await doc.apply(envAt(null, { type: "slide.reorder", id: sid, toIndex: 1 }, 1));
    await doc.undo();
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), scenes.map((s) => s.id), "reorder undone");
    await doc.undo();
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, x0, "move undone after reorder undo");
  });

  it("delete undoes to the exact index with content intact", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const order = scenes[0].elements.map((e) => e.id);
    const victim = order[1];
    await doc.apply(envAt(sid, { type: "element.delete", id: victim }, 0));
    assert.ok(!doc.snapshot().scenes[0].elements.some((e) => e.id === victim));
    await doc.undo();
    assert.deepEqual(doc.snapshot().scenes[0].elements.map((e) => e.id), order, "exact index restored");
  });

  it("actor attribution lands in history", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    await doc.apply(envAt(sid, { type: "element.move", id, x: 1, y: 1 }, 0, { actor: "agent", agentId: "a7" }));
    const [entry] = doc.log();
    assert.equal(entry.actor, "agent");
    assert.equal(entry.baseRevision, 0);
    assert.equal(entry.resultingRevision, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(doc.log())), doc.log(), "log serializes cleanly");
  });
});

describe("v2-5b slide operations", () => {
  it("insert validates, dedupes ids, and inverts to delete", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const extra = { ...structuredClone(scenes[0]), id: "s-extra" };
    const r = await doc.apply(envAt(null, { type: "slide.insert", scene: extra, index: 1 }, 0));
    assert.equal(r.ok, true);
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), [scenes[0].id, "s-extra", scenes[1].id]);
    await doc.undo();
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), scenes.map((s) => s.id));
    const dup = await doc.apply(envAt(null, { type: "slide.insert", scene: extra }, 2));
    assert.equal(dup.ok, true);
    const clash = await doc.apply(envAt(null, { type: "slide.insert", scene: extra }, 3));
    assert.equal(clash.code, "op-rejected", "duplicate slide ids refused");
  });

  it("delete refuses the final slide and undoes to its index", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes.slice(0, 1));
    const lone = await doc.apply(envAt(null, { type: "slide.delete", id: scenes[0].id }, 0));
    assert.equal(lone.code, "op-rejected", "deck keeps at least one slide");
    const doc2 = await createDocument(scenes);
    await doc2.apply(envAt(null, { type: "slide.delete", id: scenes[1].id }, 0));
    assert.deepEqual(doc2.snapshot().scenes.map((s) => s.id), [scenes[0].id]);
    await doc2.undo();
    assert.deepEqual(doc2.snapshot().scenes.map((s) => s.id), [scenes[0].id, scenes[1].id], "index restored");
  });

  it("duplicate re-ids the copy and undoes cleanly", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const r = await doc.apply(envAt(null, { type: "slide.duplicate", id: scenes[0].id }, 0));
    assert.equal(r.ok, true);
    const ids = doc.snapshot().scenes.map((s) => s.id);
    assert.deepEqual(ids, [scenes[0].id, `${scenes[0].id}-copy`, scenes[1].id]);
    const copyEls = doc.snapshot().scenes[1].elements.map((e) => e.id);
    assert.ok(copyEls.every((id) => id.endsWith("-copy")), "element ids rewritten");
    assert.ok(copyEls.every((id) => !scenes[0].elements.some((e) => e.id === id)), "no id collisions");
    await doc.undo();
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), scenes.map((s) => s.id));
  });

  it("reorder clamps by documented policy and inverts", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    await doc.apply(envAt(null, { type: "slide.reorder", id: scenes[0].id, toIndex: 99 }, 0));
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), [scenes[1].id, scenes[0].id], "clamped to the end");
    await doc.undo();
    assert.deepEqual(doc.snapshot().scenes.map((s) => s.id), scenes.map((s) => s.id), "inverse restores order");
  });
});

describe("v2-5b atomic batches", () => {
  async function threeMoveBatch(doc, scenes, dx) {
    const units = [];
    for (const s of scenes) {
      for (const e of s.elements) {
        if (!e.locked && e.kind === "text" && units.length < 3) units.push({ slideId: s.id, id: e.id });
      }
    }
    assert.equal(units.length, 3, "three text units available");
    return { units, result: await doc.applyBatch({ id: `batch-${dx}`, baseRevision: 0, actor: "human", ops: units.map((u) => ({ slideId: u.slideId, op: { type: "element.move", id: u.id, x: dx, y: 1 } })) }) };
  }

  function unitX(snap, slideId, id) {
    return snap.scenes.find((s) => s.id === slideId).elements.find((e) => e.id === id).x;
  }

  it("three valid moves commit as one history entry", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const { units, result } = await threeMoveBatch(doc, scenes, 4);
    assert.equal(result.ok, true);
    assert.equal(doc.snapshot().revision, 1, "one revision for the batch");
    assert.equal(doc.status().historyLength, 1, "one history entry");
    for (const u of units) {
      assert.equal(unitX(doc.snapshot(), u.slideId, u.id), 4);
    }
    await doc.undo();
    for (const u of units) {
      const before = scenes.find((s) => s.id === u.slideId).elements.find((e) => e.id === u.id).x;
      assert.equal(unitX(doc.snapshot(), u.slideId, u.id), before, "batch undoes atomically");
    }
    await doc.redo();
    for (const u of units) {
      assert.equal(unitX(doc.snapshot(), u.slideId, u.id), 4, "batch redoes atomically");
    }
  });

  it("a locked middle entry aborts the whole batch", async () => {
    const scenes = await deck2();
    scenes[0].elements.push({
      id: "s1:lock", kind: "shape", x: 1, y: 1, w: 2, h: 2, z: 60,
      provenance: "compiler", locked: true, shape: { fill: "000000" } },
    );
    const doc = await createDocument(scenes);
    const ids = scenes[0].elements.filter((e) => !e.locked && e.kind === "text").slice(0, 2).map((e) => e.id);
    const frozen = JSON.stringify(doc.snapshot().scenes);
    const r = await doc.applyBatch({
      id: "batch-lock", baseRevision: 0, actor: "human",
      ops: [
        { slideId: scenes[0].id, op: { type: "element.move", id: ids[0], x: 9, y: 9 } },
        { slideId: scenes[0].id, op: { type: "element.move", id: "s1:lock", x: 9, y: 9 } },
        { slideId: scenes[0].id, op: { type: "element.move", id: ids[1], x: 9, y: 9 } },
      ],
    });
    assert.equal(r.code, "locked");
    assert.equal(JSON.stringify(doc.snapshot().scenes), frozen, "first entry rolled back with the batch");
    assert.equal(doc.snapshot().revision, 0);
    assert.equal(doc.status().historyLength, 0);
  });

  it("unknown ids, repeats, empties, and mixed ops behave explicitly", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const x0 = scenes[0].elements.find((e) => e.id === id).x;
    const unknown = await doc.applyBatch({
      id: "batch-unknown", baseRevision: 0, actor: "human",
      ops: [{ slideId: sid, op: { type: "element.move", id, x: 7, y: 1 } }, { slideId: sid, op: { type: "element.move", id: "nope", x: 7, y: 1 } }],
    });
    assert.equal(unknown.code, "unknown-element");
    assert.equal(doc.snapshot().scenes[0].elements.find((e) => e.id === id).x, x0, "partial batch never lands");
    const repeat = await doc.applyBatch({
      id: "batch-repeat", baseRevision: 0, actor: "human",
      ops: [
        { slideId: sid, op: { type: "element.move", id, x: 3, y: 1 } },
        { slideId: sid, op: { type: "element.move", id, x: 8, y: 2 } },
      ],
    });
    assert.equal(repeat.ok, true, "repeated targets apply in order");
    assert.deepEqual(
      { x: doc.snapshot().scenes[0].elements.find((e) => e.id === id).x },
      { x: 8 },
      "last write wins, recorded deterministically",
    );
    const empty = await doc.applyBatch({ id: "batch-empty", baseRevision: 1, actor: "human", ops: [] });
    assert.equal(empty.ok, true);
    assert.equal(empty.noop, true);
    assert.equal(doc.snapshot().revision, 1, "empty batches advance nothing");
    const mixed = await doc.applyBatch({
      id: "batch-mixed", baseRevision: 1, actor: "agent", agentId: "a1",
      ops: [
        { slideId: sid, op: { type: "element.move", id, x: 2, y: 2 } },
        { slideId: null, op: { type: "slide.reorder", id: sid, toIndex: 1 } },
      ],
    });
    assert.equal(mixed.ok, true, "mixed slide and element ops commit together");
    assert.equal(doc.log().at(-1).actor, "agent", "batch attribution recorded");
  });

  it("duplicate envelope ids never apply twice", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    const first = await doc.apply({ id: "once", slideId: sid, op: { type: "element.move", id, x: 6, y: 6 }, baseRevision: 0, actor: "human" });
    assert.equal(first.ok, true);
    const replay = await doc.apply({ id: "once", slideId: sid, op: { type: "element.move", id, x: 6, y: 6 }, baseRevision: 1, actor: "human" });
    assert.equal(replay.code, "duplicate-id", "replay rejected even at the fresh revision");
    assert.equal(doc.snapshot().revision, 1, "applied exactly once");
    const staleReplay = await doc.apply({ id: "once", slideId: sid, op: { type: "element.move", id, x: 6, y: 6 }, baseRevision: 0, actor: "human" });
    assert.equal(staleReplay.code, "duplicate-id", "duplicate check precedes revision check");
  });
});

describe("v2-5b ownership, export, and immutability", () => {
  it("engine edits track human ownership for regeneration", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    await doc.apply(envAt(sid, { type: "element.move", id, x: 2, y: 2 }, 0));
    const moved = doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(moved.provenance, "human");
    assert.equal(moved.customized, true);
    assert.equal(doc.snapshot().scenes[0].layoutState, "customized");
    await doc.apply(envAt(sid, {
      type: "element.updateText", id,
      paragraphs: [{ runs: [{ text: "Wording", size: 13, color: "111111" }] }],
    }, 1));
    const reworded = doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(reworded.contentCustomized, true);
  });

  it("snapshots are frozen and immune to later commands", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const before = doc.snapshot();
    assert.ok(Object.isFrozen(before.scenes), "snapshot frozen");
    const id = firstTextId(scenes[0]);
    await doc.apply(envAt(scenes[0].id, { type: "element.move", id, x: 9, y: 9 }, 0));
    assert.notEqual(before.revision, doc.snapshot().revision);
    assert.equal(before.scenes[0].elements.find((e) => e.id === id).x, scenes[0].elements.find((e) => e.id === id).x, "earlier snapshot unchanged");
  });

  it("edited scenes stay export-compatible; unsafe additions fail at export", async () => {
    const scenes = await deck2();
    const doc = await createDocument(scenes);
    const sid = scenes[0].id;
    const id = firstTextId(scenes[0]);
    await doc.apply(envAt(sid, { type: "element.move", id, x: 2, y: 2 }, 0));
    await renderPptx(doc.snapshot().scenes.slice(0, 1));
    const added = await doc.apply(envAt(sid, {
      type: "element.add",
      element: {
        kind: "chart", x: 1, y: 1, w: 6, h: 3,
        chart: { chartKind: "pie", categories: ["A", "B"], series: [{ name: "S1", values: [1, 2] }, { name: "S2", values: [3, 4] }], labels: { family: "Inter", size: 10, color: "5C5C59" } },
      },
    }, 1));
    assert.equal(added.ok, true, "scene-valid additions apply");
    await assert.rejects(renderPptx(doc.snapshot().scenes.slice(0, 1)), /only the first/, "export boundary catches engine-introduced unsafety");
  });
});
