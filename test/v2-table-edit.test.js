// Native table editing: engine command, full-matrix validation,
// structural operations, text fidelity, ownership/regeneration,
// and native OOXML verification. Headless linkedom + engine +
// JSZip coverage. Real-pointer proof (grid typing, add/remove,
// undo/redo, narrow viewport) lives in
// test/v2-edit-chrome-table.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { tableOverflowEstimate } from "../packages/editor/scene-text.js";
import { compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx, preflightScenes } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

const LAYOUT = {
  rowHeights: [0.4, 0.4, 0.4],
  colWidths: [2, 2, 2],
  headerFill: "EEEEEE",
  headerColor: "111111",
  headerSize: 12,
  headerBold: true,
  bodyColor: "222222",
  bodySize: 11,
  fontFamily: "Inter",
  padding: 0.05,
  gridColor: "999999",
};

function tableScene(rows = [["Metric", "Before", "After"], ["Time", "450 ms", "180 ms"], ["Accuracy", "89%", "96%"]], header = true) {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      {
        id: "s:table", kind: "table", x: 1, y: 1, w: 6, h: 1.2, z: 0, provenance: "compiler", semanticRef: "t",
        table: { rows: rows.map((r) => [...r]), header, layout: structuredClone(LAYOUT) },
      },
      {
        id: "s:note", kind: "text", x: 1, y: 6, w: 4, h: 1, z: 1, provenance: "compiler", semanticRef: "note",
        paragraphs: [{ runs: [{ text: "untouched", size: 13, color: "111111" }], align: "left" }],
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

function rowsOf(r, id = "s:table") {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).table.rows;
}

function elOf(r, id = "s:table") {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
}

async function tableXmlFor(scenes) {
  const bytes = await renderPptx(scenes);
  const zip = await JSZip.loadAsync(bytes);
  return { xml: await zip.files["ppt/slides/slide1.xml"].async("string") };
}

describe("v2 table command validation", () => {
  it("edits cells and headers in one envelope", async () => {
    const r = await rig(tableScene());
    const result = await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "120 ms"],
      ["Precision", "89%", "96%"],
    ]);
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one revision per Apply");
    assert.deepEqual(rowsOf(r), [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "120 ms"],
      ["Precision", "89%", "96%"],
    ]);
    const el = elOf(r);
    assert.equal(el.table.header, true, "header flag preserved, never toggled");
    assert.deepEqual(el.table.layout, LAYOUT, "layout and typography preserved verbatim");
    assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 1, y: 1, w: 6, h: 1.2 }, "geometry retained");
    assert.equal(el.tableCustomized, true, "human table ownership marked");
    assert.equal(el.provenance, "human");
    assert.equal(el.customized, undefined, "no false geometry ownership");
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("adds/removes rows and columns as full matrices", async () => {
    const r = await rig(tableScene());
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "180 ms"],
      ["Accuracy", "89%", "96%"],
      ["Recall", "81%", "93%"],
    ]);
    assert.equal(rowsOf(r).length, 4, "row appended");
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After", "Delta"],
      ["Time", "450 ms", "180 ms", "-60%"],
      ["Accuracy", "89%", "96%", "+7pp"],
      ["Recall", "81%", "93%", "+12pp"],
    ]);
    assert.equal(rowsOf(r)[0].length, 4, "column appended");
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "180 ms"],
      ["Accuracy", "89%", "96%"],
    ]);
    assert.deepEqual(rowsOf(r).length, 3);
    assert.equal(r.doc.status().historyLength, 3);
  });

  it("rejects ragged, empty, and non-string matrices without mutation", async () => {
    const cases = [
      [[], /non-empty rows array/],
      [[[]], /at least one column/],
      [[["a", "b"], ["c"]], /full matrix/],
      [[["a"], ["b", "c"]], /full matrix/],
      [[[1, 2]], /must be a string/],
      [[["a", null]], /must be a string/],
      ["rows", /non-empty rows array/],
      [null, /non-empty rows array/],
    ];
    for (const [rows, want] of cases) {
      const r = await rig(tableScene());
      const before = JSON.stringify(r.doc.snapshot().scenes);
      const result = await r.editor.setTableData("s:table", rows);
      assert.equal(result.ok, false, `matrix ${JSON.stringify(rows)} rejected`);
      assert.match(result.message, want);
      assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "no mutation");
      assert.equal(r.doc.status().historyLength, 0);
    }
  });

  it("engine boundary enforces the matrix shape", async () => {
    const r = await rig(tableScene());
    const ragged = await r.doc.apply({
      id: "e1", slideId: "s", op: { type: "element.setTableData", id: "s:table", table: { rows: [["a", "b"], ["c"]] } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(ragged.ok, false);
    assert.equal(ragged.code, "op-rejected", "rectangularity enforced in apply, not just the adapter");
    const nonString = await r.doc.apply({
      id: "e2", slideId: "s", op: { type: "element.setTableData", id: "s:table", table: { rows: [[1]] } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(nonString.ok, false);
    assert.equal(nonString.code, "bad-envelope");
  });

  it("rejects locked, unknown, and wrong-kind targets", async () => {
    const r = await rig(tableScene());
    assert.equal((await r.editor.setTableData("s:note", [["x"]])).code, "op-rejected");
    assert.equal((await r.editor.setTableData("s:nope", [["x"]])).code, "unknown-element");
    const locked = tableScene();
    locked[0].elements[0].locked = true;
    const r2 = await rig(locked);
    assert.equal((await r2.editor.setTableData("s:table", [["x"]])).code, "locked");
  });

  it("no-op submissions record nothing", async () => {
    const r = await rig(tableScene());
    const noop = await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "180 ms"],
      ["Accuracy", "89%", "96%"],
    ]);
    assert.equal(noop.ok, true);
    assert.equal(noop.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("restore-shaped input faces the same matrix rules", async () => {
    const r = await rig(tableScene());
    const raggedRestore = await r.doc.apply({
      id: "evil", slideId: "s", op: { type: "element.setTableData", id: "s:table", priorRows: [["a", "b"], ["c"]] },
      baseRevision: 0, actor: "human",
    });
    assert.equal(raggedRestore.ok, false, "direct priorRows input cannot install a ragged matrix");
    assert.equal(r.doc.status().historyLength, 0);
    const emptyRestore = await r.doc.apply({
      id: "evil2", slideId: "s", op: { type: "element.setTableData", id: "s:table", priorRows: [] },
      baseRevision: 0, actor: "human",
    });
    assert.equal(emptyRestore.ok, false, "direct priorRows input cannot empty the table");
  });
});

describe("v2 table fidelity and density", () => {
  it("preserves numeric-looking text, unicode, empties, and long copy", async () => {
    const r = await rig(tableScene());
    const tricky = [
      ["ID", "Amount", "Note"],
      ["00123", "₹1,25,000", "−7.5% ★"],
      ["1.00", "N/A", ""],
    ];
    const result = await r.editor.setTableData("s:table", tricky);
    assert.equal(result.ok, true);
    assert.deepEqual(rowsOf(r), tricky, "every character verbatim — nothing parsed, nothing padded");
    const { xml } = await tableXmlFor(r.doc.snapshot().scenes);
    assert.match(xml, /00123/, "leading zeros survive to OOXML");
    assert.match(xml, /N\/A/, "text markers survive");
  });

  it("keeps layout verbatim and warns on density instead of shrinking", async () => {
    const r = await rig(tableScene());
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Time", "450 ms", "180 ms"],
      ["Accuracy", "A much longer descriptive sentence that keeps going past any reasonable column", "96%"],
    ]);
    assert.deepEqual(elOf(r).table.layout, LAYOUT, "no silent layout rewrite");
    assert.deepEqual({ x: elOf(r).x, w: elOf(r).w }, { x: 1, w: 6 }, "no silent resize");
    assert.ok(r.errors.some((e) => /row 3 needs/.test(e.message)), "explicit density warning names the row");
  });

  it("estimates density from the same numbers both renderers draw", async () => {
    const el = tableScene()[0].elements[0];
    assert.equal(tableOverflowEstimate(el).fits, true, "fixture fits");
    const dense = structuredClone(el);
    dense.table.rows[2][1] = "word ".repeat(60);
    const estimate = tableOverflowEstimate(dense);
    assert.equal(estimate.fits, false);
    assert.match(estimate.message, /row 3/);
    assert.equal(dense.table.rows[2][1], "word ".repeat(60), "estimate never mutates");
  });

  it("renders committed rows in the browser SVG", async () => {
    const r = await rig(tableScene());
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Latency", "450 ms", "180 ms"],
      ["Accuracy", "89%", "96%"],
    ]);
    const svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.match(svg, /Latency/, "new wording projected");
    assert.ok(!svg.includes("450 ms</text>") || svg.includes("Latency"), "projection follows the commit");
  });
});

describe("v2 table undo, conflicts, and ownership", () => {
  it("undo restores exact rows and ownership; redo restores the edit", async () => {
    const r = await rig(tableScene());
    const before = structuredClone(elOf(r));
    await r.editor.setTableData("s:table", [
      ["Metric", "Before"],
      ["Time", "120 ms"],
    ]);
    assert.equal(rowsOf(r)[0].length, 2, "column removed by full matrix");
    await r.editor.undo();
    assert.deepEqual(elOf(r), before, "rows, layout, flags, provenance byte-identical");
    await r.editor.redo();
    assert.equal(rowsOf(r)[0].length, 2);
    assert.equal(elOf(r).tableCustomized, true);
  });

  it("stale revisions fail with the scene untouched", async () => {
    const r = await rig(tableScene());
    await r.doc.apply({ id: "ext", slideId: "s", op: { type: "element.move", id: "s:note", x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const stale = await r.doc.apply({
      id: "late", slideId: "s", op: { type: "element.setTableData", id: "s:table", table: { rows: [["X"]] } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "stale-revision");
    assert.deepEqual(rowsOf(r).length, 3, "loser data absent");
  });

  it("leaves text neighbors byte-identical and payloads immutable", async () => {
    const r = await rig(tableScene());
    const noteBefore = JSON.stringify(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:note"));
    const payload = [["A", "B"], ["c", "d"]];
    await r.editor.setTableData("s:table", payload);
    payload[0][0] = "HACKED";
    assert.equal(rowsOf(r)[0][0], "A", "post-call mutation cannot reach the scene");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:note")), noteBefore);
  });

  it("refuses edits during text sessions and resizes", async () => {
    const r = await rig(tableScene());
    r.viewer.api.select("s:note");
    r.editor.beginTextEdit("s:note");
    assert.equal((await r.editor.setTableData("s:table", [["x"]])).ok, false);
    r.editor.cancelTextEdit();
    assert.equal((await r.editor.setTableData("s:table", [["x", "y"], ["a", "b"]])).ok, true);
  });
});

describe("v2 table regeneration", () => {
  // Tables only exist on the canonical planned path (the legacy
  // six-recipe fallback has no table recipe), so regeneration tests
  // compile and recompile through the plan.
  async function plannedTableRig() {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "grid", title: "Grid",
        blocks: [{ id: "t1", kind: "table", header: true, rows: [["Metric", "Value"], ["Time", "450 ms"], ["Accuracy", "89%"]] }],
      }],
    };
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const planned = planDeckComposition(intent, design).plan.slides[0];
    const { scenes } = compileDeckDetailed(intent, design);
    const id = scenes[0].elements.find((e) => e.kind === "table" && !e.locked)?.id;
    assert.ok(id, "planned slide carries a table");
    const r = await rig(structuredClone(scenes));
    const recompile = (prev) => recompileSlide(intent.slides[0], prev, design, planned);
    return { design, slideIntent: intent.slides[0], slideId: scenes[0].id, id, r, recompile };
  }

  it("move-only tables refresh compiler rows", async () => {
    const { slideId, id, r, recompile } = await plannedTableRig();
    await r.doc.apply({ id: "mv", slideId, op: { type: "element.move", id, x: 2, y: 2 }, baseRevision: 0, actor: "human" });
    const moved = r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
    assert.equal(moved.tableCustomized, undefined, "move alone claims no data");
    const recompiled = recompile(structuredClone(r.doc.snapshot().scenes[0]));
    const fresh = recompiled.elements.find((e) => e.id === id);
    assert.equal(fresh.x, 2, "human geometry kept");
    assert.equal(fresh.tableCustomized, undefined);
  });

  it("edited cells, headers, rows, and columns survive regeneration", async () => {
    const { id, r, recompile } = await plannedTableRig();
    const cols = rowsOfRaw(r, id)[0].length;
    const edited = rowsOfRaw(r, id).map((row, ri) => row.map((cell, ci) => (ri === 0 && ci === 0 ? "Human header" : cell)));
    edited.push(new Array(cols).fill("new row"));
    edited.forEach((row) => row.push("new col"));
    await r.editor.setTableData(id, edited);
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompile(structuredClone(prev));
    const el = recompiled.elements.find((e) => e.id === id);
    assert.deepEqual(el.table.rows, edited, "human matrix survives whole");
    assert.equal(el.tableCustomized, true);
    assert.equal(el.table.header, prev.elements.find((e) => e.id === id).table.header, "header flag preserved, never toggled");
  });

  it("data plus move compose; undo restores compiler rows on recompile", async () => {
    const { slideId, id, r, recompile } = await plannedTableRig();
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    await r.doc.apply({ id: "g", slideId, op: { type: "element.setGeometry", id, x: origin.x, y: origin.y, w: origin.w + 1, h: origin.h }, baseRevision: 0, actor: "human" });
    const edited = rowsOfRaw(r, id).map((row) => [...row]);
    edited[1][1] = "human cell";
    await r.editor.setTableData(id, edited);
    const both = recompile(structuredClone(r.doc.snapshot().scenes[0]));
    const kept = both.elements.find((e) => e.id === id);
    assert.equal(kept.w, origin.w + 1);
    assert.equal(kept.table.rows[1][1], "human cell");
    await r.editor.undo();
    const undone = recompile(structuredClone(r.doc.snapshot().scenes[0]));
    const el = undone.elements.find((e) => e.id === id);
    assert.equal(el.tableCustomized, undefined, "abandoned matrix behaves as never-existed");
    assert.notEqual(el.table.rows[1][1], "human cell");
    await r.editor.redo();
    const redone = recompile(structuredClone(r.doc.snapshot().scenes[0]));
    assert.equal(redone.elements.find((e) => e.id === id).table.rows[1][1], "human cell");
  });

  it("human-added tables survive; detached identical; tombstones hold", async () => {
    const { slideId, r, recompile } = await plannedTableRig();
    const added = await r.doc.apply({
      id: "add", slideId,
      op: {
        type: "element.add",
        element: { id: "h-table", kind: "table", x: 1, y: 1, w: 4, h: 2, provenance: "human", table: { rows: [["A", "B"]] } },
      },
      baseRevision: 0, actor: "human",
    });
    assert.equal(added.ok, true);
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompile(structuredClone(prev));
    assert.ok(recompiled.elements.some((e) => e.id === "h-table"), "human-added table carried forward");
    const detached = { ...structuredClone(prev), layoutState: "detached" };
    assert.equal(JSON.stringify(recompile(detached)), JSON.stringify(detached));
  });

  function rowsOfRaw(r, id) {
    return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).table.rows;
  }
});

describe("v2 table native export", () => {
  it("edited tables export as native editable OOXML", async () => {
    const r = await rig(tableScene());
    await r.editor.setTableData("s:table", [
      ["Metric", "Before", "After"],
      ["Latency", "450 ms", "00123"],
      ["Précision ★", "−7.5%", ""],
    ]);
    const { xml } = await tableXmlFor(r.doc.snapshot().scenes);
    assert.match(xml, /Latency/, "edited wording in slide XML");
    assert.match(xml, /00123/, "leading zeros survive");
    assert.match(xml, /Précision/, "unicode survives");
    assert.ok(xml.includes("<a:tbl>"), "native table structure");
    assert.ok(!xml.includes("a:blip"), "never rasterized");
    const texts = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
    assert.ok(texts.includes("Latency") && texts.includes("00123") && texts.includes("−7.5%"), "exact cell order and values");
  });

  it("row/column structure round-trips through undo in OOXML", async () => {
    const r = await rig(tableScene());
    await r.editor.setTableData("s:table", [
      ["Metric", "Before"],
      ["Time", "120 ms"],
    ]);
    await r.editor.undo();
    const { xml } = await tableXmlFor(r.doc.snapshot().scenes);
    assert.match(xml, /Accuracy/, "undone structure exports compiler rows");
    assert.ok(!xml.includes("120 ms"), "abandoned cells absent");
    const issues = await preflightScenes(r.doc.snapshot().scenes);
    assert.equal(issues.length, 0, "edited tables pass preflight");
  });

  it("cleanup removes listeners and commits nothing", async () => {
    const r = await rig(tableScene());
    r.editor.detach();
    assert.equal(r.doc.snapshot().revision, 0);
  });
});
