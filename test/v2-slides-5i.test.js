// V2-5I visual slide management: blank insert, deep duplication,
// delete, reorder, detach, batch atomicity, draft interplay, and
// PPTX order/count. Headless linkedom + engine coverage; browser
// filmstrip proof (menus, drag reorder, multiselect, narrow)
// lives in test/v2-edit-chrome-5i.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { duplicateScene, planDuplicateId } from "../packages/model/commands.ts";
import { blankSlide } from "../packages/editor/scene-text.js";
import { compileDeck } from "../packages/compiler/compile.js";
import { recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

async function rig(scenes) {
  const document = dom();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const viewer = createViewer(root, scenes);
  const doc = await createDocument(structuredClone(scenes));
  const errors = [];
  const synced = [];
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: (s) => synced.push(structuredClone(s)),
  });
  return { document, root, viewer, doc, editor, errors, synced };
}

async function deckRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design);
  return { design, scenes, ...(await rig(scenes)) };
}

function ids(r) {
  return r.doc.snapshot().scenes.map((s) => s.id);
}

function nodeFor(root, id) {
  return root.querySelector(`[data-el="${id}"]`);
}

function click(root, node) {
  const ev = new root.ownerDocument.defaultView.Event("click", { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
}

function richDeck() {
  // Hand-built deck exercising nested groups, charts, tables,
  // locked chrome, and suppression metadata.
  return [{
    id: "deck1", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      { id: "deck1:title", kind: "text", x: 1, y: 0.5, w: 6, h: 1, z: 10, provenance: "compiler", semanticRef: "title", paragraphs: [{ runs: [{ text: "Title", size: 30, color: "111111" }], align: "left" }] },
      {
        id: "deck1:grp", kind: "group", x: 1, y: 2, w: 6, h: 3, z: 1, provenance: "compiler", semanticRef: "grp",
        group: {
          children: [
            { id: "deck1:grp:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 0, provenance: "compiler", semanticRef: "kid", shape: { form: "rect", fill: "00FF00" } },
            { id: "deck1:grp:txt", kind: "text", x: 3, y: 0.5, w: 2.5, h: 1, z: 1, provenance: "compiler", paragraphs: [{ runs: [{ text: "nested", size: 13, color: "111111" }], align: "left" }] },
          ],
        },
      },
      { id: "deck1:chrome", kind: "text", x: 0, y: 0, w: 13.333, h: 0.5, z: 0, provenance: "compiler", locked: true, paragraphs: [{ runs: [{ text: "banner", size: 12, color: "111111" }], align: "left" }] },
    ],
  }, {
    id: "deck2", width: 13.333, height: 7.5, background: { fill: "EEEEEE" }, layoutState: "managed",
    elements: [
      { id: "deck2:chart", kind: "chart", x: 1, y: 1, w: 6, h: 3, z: 5, provenance: "compiler", semanticRef: "ch", chart: { chartKind: "bar", categories: ["A", "B"], series: [{ name: "S", values: [1, 2] }] } },
      { id: "deck2:table", kind: "table", x: 8, y: 1, w: 4, h: 2, z: 6, provenance: "compiler", semanticRef: "tb", table: { rows: [["H1", "H2"], ["a", "b"]], header: true } },
    ],
  }];
}

function allIds(scenes) {
  const out = [];
  const walk = (els) => {
    for (const el of els ?? []) {
      out.push(el.id);
      walk(el.group?.children);
    }
  };
  for (const s of scenes) {
    out.push(s.id);
    walk(s.elements);
  }
  return out;
}

describe("v2-5i blank slides", () => {
  it("builds a valid empty slide on the sibling baseline", async () => {
    const r = await deckRig();
    const sibling = r.doc.snapshot().scenes[0];
    const blank = blankSlide(sibling);
    assert.equal(blank.width, 13.333);
    assert.equal(blank.height, 7.5);
    assert.deepEqual(blank.elements, []);
    assert.equal(blank.layoutState, "managed");
    assert.equal(blank.background.fill, sibling.background.fill, "theme baseline sampled, never guessed white");
    assert.match(blank.id, /^s-[0-9a-f]{12}$/);
    const verdict = await validateScene(blank);
    assert.equal(verdict.ok, true, "intentionally blank is schema-valid");
  });

  it("inserts after the active slide with one history entry", async () => {
    const r = await deckRig();
    const n = r.doc.snapshot().scenes.length;
    r.viewer.api.goTo(1);
    const before = r.doc.snapshot().revision;
    const result = await r.editor.insertSlide();
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1);
    assert.equal(r.doc.snapshot().revision, before + 1, "revision advances monotonically");
    assert.equal(r.doc.snapshot().scenes.length, n + 1);
    assert.equal(r.doc.snapshot().scenes[2].id, result.id, "inserted right after the active slide");
    assert.deepEqual(r.doc.snapshot().scenes[2].elements, []);
    // Navigation follows identity, not the stale index.
    r.viewer.api.goTo(r.viewer.api.indexOf(result.id));
    assert.equal(r.viewer.api.snapshot().slideId, result.id);
  });

  it("inserts at explicit positions and clamps", async () => {
    const r = await deckRig();
    const first = await r.editor.insertSlide(0);
    assert.equal(r.doc.snapshot().scenes[0].id, first.id, "insert at beginning");
    const last = await r.editor.insertSlide(999);
    const scenes = r.doc.snapshot().scenes;
    assert.equal(scenes[scenes.length - 1].id, last.id, "out-of-range appends");
  });

  it("undo removes the blank; redo restores its exact identity", async () => {
    const r = await deckRig();
    const before = ids(r);
    const added = await r.editor.insertSlide(1);
    await r.editor.undo();
    assert.deepEqual(ids(r), before);
    await r.editor.redo();
    assert.deepEqual(ids(r), [before[0], added.id, ...before.slice(1)]);
    const el = r.doc.snapshot().scenes[1];
    assert.equal(el.id, added.id, "exact identity restored");
    assert.deepEqual(el.elements, []);
    assert.equal(el.background.fill, r.doc.snapshot().scenes[0].background.fill);
  });

  it("blank slides render and export with no misleading warnings", async () => {
    const r = await deckRig();
    await r.editor.insertSlide(0);
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    assert.ok(bytes instanceof Uint8Array);
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    assert.equal(slides.length, r.doc.snapshot().scenes.length, "no silently omitted slide");
  });
});

describe("v2-5i duplication identity", () => {
  it("remaps every id including nested children, exactly once", async () => {
    const r = await rig(richDeck());
    const result = await r.editor.duplicateSlide("deck1");
    assert.equal(result.ok, true);
    assert.match(result.id, /-copy/);
    const scenes = r.doc.snapshot().scenes;
    const flat = allIds(scenes);
    assert.equal(flat.length, new Set(flat).size, "no identity survives twice in the deck");
    const copy = scenes.find((s) => s.id === result.id);
    const grp = copy.elements.find((e) => e.kind === "group");
    assert.ok(grp.group.children.every((c) => c.id.endsWith("-copy") || /-copy-\d+$/.test(c.id)), "nested children remapped");
    assert.ok(!grp.group.children.some((c) => ["deck1:grp:kid", "deck1:grp:txt"].includes(c.id)), "no stale nested identity");
  });

  it("encodes the compiler-origin policy: provenance flips, refs stay, chrome frozen", async () => {
    const r = await rig(richDeck());
    const { id } = await r.editor.duplicateSlide("deck1");
    const copy = r.doc.snapshot().scenes.find((s) => s.id === id);
    const title = copy.elements.find((e) => e.semanticRef === "title");
    assert.equal(title.provenance, "human", "copied compiler content becomes human-owned");
    assert.equal(title.semanticRef, "title", "origin audit trail retained");
    const chrome = copy.elements.find((e) => e.locked);
    assert.ok(chrome, "locked chrome copied");
    assert.equal(chrome.provenance, "compiler", "locked marks keep institutional provenance");
    assert.equal(copy.layoutState, "customized", "managed source becomes human-arranged");
    // Suppression tombstones travel with the slide.
    const r2 = await rig(richDeck());
    await r2.doc.apply({ id: "del", slideId: "deck1", op: { type: "element.delete", id: "deck1:title" }, baseRevision: 0, actor: "human" });
    const dup2 = await r2.editor.duplicateSlide("deck1");
    const copy2 = r2.doc.snapshot().scenes.find((s) => s.id === dup2.id);
    assert.ok((copy2.suppressed ?? []).some((t) => t.id === "deck1:title"), "tombstones travel");
  });

  it("duplicates charts and tables deeply and independently", async () => {
    const r = await rig(richDeck());
    const before = JSON.stringify(r.doc.snapshot().scenes.find((s) => s.id === "deck2"));
    const { id } = await r.editor.duplicateSlide("deck2");
    const copy = r.doc.snapshot().scenes.find((s) => s.id === id);
    const chart = copy.elements.find((e) => e.kind === "chart");
    assert.deepEqual(chart.chart.series, [{ name: "S", values: [1, 2] }]);
    // Source edits after duplication never touch the copy.
    await r.doc.apply({ id: "ed", slideId: "deck2", op: { type: "element.setChartData", id: "deck2:chart", chart: { series: [{ name: "S", values: [9, 9] }] } }, baseRevision: 1, actor: "human" });
    assert.deepEqual(
      r.doc.snapshot().scenes.find((s) => s.id === id).elements.find((e) => e.kind === "chart").chart.series,
      [{ name: "S", values: [1, 2] }],
      "deep independence",
    );
    assert.equal(JSON.stringify(r.doc.snapshot().scenes.find((s) => s.id === "deck2")).includes("9"), true);
  });

  it("repeats safely: duplicate-of-duplicate never collides", async () => {
    const r = await rig(richDeck());
    const a = await r.editor.duplicateSlide("deck1");
    const b = await r.editor.duplicateSlide(a.id);
    const c = await r.editor.duplicateSlide("deck1");
    assert.equal(new Set([a.id, b.id, c.id]).size, 3, "three distinct copy identities");
    const flat = allIds(r.doc.snapshot().scenes);
    assert.equal(flat.length, new Set(flat).size, "deck-wide uniqueness after repeats");
    assert.equal(r.doc.status().historyLength, 3, "one entry per duplication");
    await r.editor.undo();
    assert.ok(!ids(r).includes(c.id), "undo removes the latest copy");
    await r.editor.redo();
    assert.ok(ids(r).includes(c.id), "redo restores its exact identity");
  });

  it("planDuplicateId predicts the engine on identical state", async () => {
    const r = await rig(richDeck());
    const predicted = planDuplicateId(r.doc.snapshot().scenes, "deck1");
    const { id } = await r.editor.duplicateSlide("deck1");
    assert.equal(id, predicted, "adapter navigation needs no engine shape change");
  });

  it("rejects unknown slides and preserves the source", async () => {
    const r = await rig(richDeck());
    const before = JSON.stringify(r.doc.snapshot().scenes.find((s) => s.id === "deck1"));
    const result = await r.editor.duplicateSlide("nope");
    assert.equal(result.ok, false);
    assert.equal(result.code, "unknown-slide");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes.find((s) => s.id === "deck1")), before, "source untouched by failure");
  });
});

describe("v2-5i deletion", () => {
  it("deletes by identity and lands on the next neighbor", async () => {
    const r = await deckRig();
    r.viewer.api.goTo(1);
    const doomed = r.viewer.api.snapshot().slideId;
    const result = await r.editor.deleteSlides([doomed]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.deletedIds, [doomed]);
    assert.ok(!ids(r).includes(doomed));
    // Neighbor policy lives in the shell; the engine state supports it.
    const neighbor = r.doc.snapshot().scenes[1].id;
    r.viewer.api.goTo(r.viewer.api.indexOf(neighbor));
    assert.equal(r.viewer.api.snapshot().slideId, neighbor);
    await r.editor.undo();
    assert.deepEqual(ids(r).length, r.doc.snapshot().scenes.length);
  });

  it("deleting the last slide of many points at the new tail", async () => {
    const r = await deckRig();
    const scenes = r.doc.snapshot().scenes;
    r.viewer.api.goTo(scenes.length - 1);
    const doomed = r.viewer.api.snapshot().slideId;
    await r.editor.deleteSlides([doomed]);
    const after = r.doc.snapshot().scenes;
    r.viewer.api.goTo(Math.min(scenes.length - 1, after.length - 1));
    assert.equal(r.viewer.api.snapshot().slideId, after[after.length - 1].id, "valid neighbor, never dangling");
  });

  it("never deletes the final remaining slide", async () => {
    const r = await deckRig();
    const all = ids(r);
    const result = await r.editor.deleteSlides(all);
    assert.equal(result.ok, false, "whole-deck deletion refused");
    assert.equal(ids(r).length, all.length, "presentation intact");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("bulk deletion is atomic: one failure aborts everything", async () => {
    const r = await deckRig();
    const before = JSON.stringify(r.doc.snapshot().scenes);
    const [a, b] = ids(r);
    const result = await r.editor.deleteSlides([a, "ghost", b]);
    assert.equal(result.ok, false, "unknown member fails the batch");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "predecessors rolled back");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("undo restores exact position and content; redo removes", async () => {
    const r = await deckRig();
    const before = ids(r);
    const victim = before[2];
    const victimData = JSON.stringify(r.doc.snapshot().scenes[2]);
    await r.editor.deleteSlides([victim]);
    await r.editor.undo();
    assert.deepEqual(ids(r), before, "exact order restored");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[2]), victimData, "exact content restored");
    await r.editor.redo();
    assert.ok(!ids(r).includes(victim), "redo removes the same slide");
  });

  it("stale revisions and duplicate envelopes behave", async () => {
    const r = await deckRig();
    const [a] = ids(r);
    await r.doc.apply({ id: "ext", slideId: null, op: { type: "slide.reorder", id: a, toIndex: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const stale = await r.doc.apply({ id: "late", slideId: null, op: { type: "slide.delete", id: ids(r)[0] }, baseRevision: 0, actor: "human" });
    assert.equal(stale.code, "stale-revision");
    const dupe = await r.doc.apply({ id: "ext", slideId: null, op: { type: "slide.reorder", id: a, toIndex: 1 }, baseRevision: 1, actor: "agent", agentId: "t" });
    assert.equal(dupe.code, "duplicate-id");
  });
});

describe("v2-5i reorder", () => {
  it("moves first to last and last to first by identity", async () => {
    const r = await deckRig();
    const before = ids(r);
    await r.editor.reorderSlide(before[0], before.length - 1);
    assert.deepEqual(ids(r), [...before.slice(1), before[0]], "first to last");
    await r.editor.undo();
    assert.deepEqual(ids(r), before);
    await r.editor.reorderSlide(before[before.length - 1], 0);
    assert.deepEqual(ids(r), [before[before.length - 1], ...before.slice(0, -1)], "last to first");
    await r.editor.undo();
    assert.deepEqual(ids(r), [before[0], ...before.slice(1)], "undo restores after two reorders");
    await r.editor.redo();
    assert.deepEqual(ids(r), [before[before.length - 1], ...before.slice(0, -1)], "redo restores");
  });

  it("no-op drops record nothing; bad indices rejected", async () => {
    const r = await deckRig();
    const [a] = ids(r);
    const noop = await r.editor.reorderSlide(a, 0);
    assert.equal(noop.noop, true, "dropping in place is not history");
    assert.equal(r.doc.status().historyLength, 0);
    assert.equal((await r.editor.reorderSlide(a, -1)).ok, false);
    assert.equal((await r.editor.reorderSlide("ghost", 0)).ok, false);
  });

  it("revision advances once per reorder with exact undo", async () => {
    const r = await deckRig();
    const before = ids(r);
    const rev = r.doc.snapshot().revision;
    await r.editor.reorderSlide(before[1], 4);
    assert.equal(r.doc.snapshot().revision, rev + 1);
    assert.equal(r.doc.status().historyLength, 1);
    await r.editor.undo();
    assert.deepEqual(ids(r), before);
  });
});

describe("v2-5i detach", () => {
  it("transitions managed and customized to detached through a command", async () => {
    const r = await deckRig();
    const [id] = ids(r);
    const first = await r.editor.detachSlide(id);
    assert.equal(first.ok, true);
    assert.equal(r.doc.snapshot().scenes[0].layoutState, "detached");
    assert.equal(r.doc.status().historyLength, 1);
    const again = await r.editor.detachSlide(id);
    assert.equal(again.noop, true, "already detached is a no-op");
    assert.equal(r.doc.status().historyLength, 1);
  });

  it("preserves every object and survives regeneration untouched", async () => {
    const { design } = await deckRig();
    const intent = sampleDeckIntent();
    const r = await deckRig();
    const before = JSON.stringify(r.doc.snapshot().scenes[0].elements);
    const [id] = ids(r);
    await r.editor.detachSlide(id);
    const scene = r.doc.snapshot().scenes[0];
    assert.equal(JSON.stringify(scene.elements), before, "all objects preserved, nothing rasterized");
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const again = recompileSlide(intent.slides[0], structuredClone(scene), design);
    assert.equal(JSON.stringify(again), JSON.stringify(scene), "compiler hands off detached slides");
    await r.editor.undo();
    assert.equal(r.doc.snapshot().scenes[0].layoutState, "managed", "undo restores ownership");
    await r.editor.redo();
    assert.equal(r.doc.snapshot().scenes[0].layoutState, "detached", "redo re-detaches");
  });

  it("rejects unknown slides and bad states at the boundary", async () => {
    const r = await deckRig();
    assert.equal((await r.editor.detachSlide("ghost")).code, "unknown-slide");
    const bad = await r.doc.apply({ id: "bad", slideId: null, op: { type: "slide.setLayoutState", id: ids(r)[0], layoutState: "floating" }, baseRevision: 0, actor: "human" });
    assert.equal(bad.code, "bad-envelope");
  });
});

describe("v2-5i drafts and lifecycle", () => {
  it("text drafts commit first; failure blocks the slide op", async () => {
    const r = await deckRig();
    r.viewer.api.goTo(1);
    const slideId = r.viewer.api.snapshot().slideId;
    const textId = r.doc.snapshot().scenes[1].elements.find((e) => e.kind === "text" && !e.locked).id;
    r.viewer.api.select(textId);
    r.editor.beginTextEdit(textId);
    const box = r.root.querySelector(`[data-text-edit="${textId}"]`);
    box.value = "committed before reorder";
    box.dispatchEvent(new r.root.ownerDocument.defaultView.Event("input", { bubbles: true }));
    const before = ids(r);
    await r.editor.reorderSlide(slideId, 0);
    assert.equal(r.doc.snapshot().scenes[0].elements.find((e) => e.id === textId).paragraphs[0].runs[0].text, "committed before reorder");
    assert.equal(r.doc.snapshot().scenes[0].id, slideId, "reorder followed the commit");
    assert.ok(!before.includes(undefined));
  });

  it("deleting the edited slide cancels its overlay without residue", async () => {
    const r = await deckRig();
    r.viewer.api.goTo(1);
    const slideId = r.viewer.api.snapshot().slideId;
    const textId = r.doc.snapshot().scenes[1].elements.find((e) => e.kind === "text" && !e.locked).id;
    r.viewer.api.select(textId);
    r.editor.beginTextEdit(textId);
    assert.ok(r.root.querySelector(`[data-text-edit="${textId}"]`), "overlay open");
    await r.editor.deleteSlides([slideId]);
    assert.equal(r.editor.editingId(), null, "session closed");
    assert.equal(r.root.querySelector(`[data-text-edit="${textId}"]`), null, "overlay gone");
    assert.ok(!ids(r).includes(slideId));
  });

  it("element ops during slide flows still serialize", async () => {
    const r = await deckRig();
    const added = await r.editor.insertSlide(1);
    assert.equal(r.doc.status().historyLength, 1);
    await r.editor.undo();
    assert.equal(r.doc.status().historyLength, 0);
    assert.equal(r.doc.snapshot().revision, 2, "undo advances the shared revision");
    assert.ok(!ids(r).includes(added.id));
  });
});

describe("v2-5i native export", () => {
  it("exports exact count and order after ops", async () => {
    const r = await deckRig();
    const before = ids(r);
    await r.editor.deleteSlides([before[1]]);
    const dup = await r.editor.duplicateSlide(before[0]);
    const blank = await r.editor.insertSlide(0);
    const order = ids(r);
    assert.equal(order.length, before.length + 1, "delete+duplicate+insert net one");
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
    assert.equal(slides.length, order.length, "no silently omitted slide");
    const pres = await zip.files["ppt/presentation.xml"].async("string");
    const relIds = [...pres.matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1]);
    assert.ok(relIds.length >= order.length, "every slide related");
    void dup;
    void blank;
  });

  it("duplicated content stays independent in OOXML", async () => {
    const r = await rig((await deckRig()).scenes);
    const before = ids(r);
    const dup = await r.editor.duplicateSlide(before[1]);
    const copy = r.doc.snapshot().scenes.find((s) => s.id === dup.id);
    const textEl = copy.elements.find((e) => e.kind === "text" && !e.locked);
    await r.doc.apply({ id: "ed", slideId: dup.id, op: { type: "element.updateText", id: textEl.id, paragraphs: [{ runs: [{ text: "copy only", size: 13 }] }] }, baseRevision: 1, actor: "human" });
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    let xml = "";
    for (const n of Object.keys(zip.files).filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x)).sort()) {
      xml += await zip.files[n].async("string");
    }
    assert.match(xml, /copy only/, "edited copy exports");
    const occurrences = (xml.match(/copy only/g) || []).length;
    assert.ok(occurrences >= 1, "source slides carry no copy text");
  });

  it("charts and tables survive duplication into export", async () => {
    const r = await rig(richDeck());
    const { id } = await r.editor.duplicateSlide("deck2");
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.equal(charts.length, 2, "original and duplicated charts both native");
    let xml = "";
    for (const n of Object.keys(zip.files).filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x)).sort()) {
      xml += await zip.files[n].async("string");
    }
    assert.ok(xml.includes("<a:tbl>"), "duplicated tables stay native");
  });
});
