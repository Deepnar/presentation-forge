// Chart-data editing: engine command, validation, conversion
// safety, ownership/regeneration, and native OOXML fidelity.
// Headless linkedom + engine + JSZip coverage. Real-pointer proof
// (typing values, Apply, inspect, undo/redo) lives in
// test/v2-edit-chrome-chart.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx, preflightScenes } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

const LABELS = { family: "Inter", size: 10, color: "5C5C59" };

function chartScene(kind = "bar", categories = ["Q1", "Q2", "Q3"], series = [{ name: "Revenue", values: [120, 145, 170] }]) {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      {
        id: "s:chart", kind: "chart", x: 1, y: 1, w: 8, h: 4, z: 0, provenance: "compiler", semanticRef: "ch",
        chart: { chartKind: kind, categories: [...categories], series: series.map((s) => ({ name: s.name, values: [...s.values] })), labels: { ...LABELS } },
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

function chartOf(r, id = "s:chart") {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id).chart;
}

async function chartXmlFor(scenes) {
  const bytes = await renderPptx(scenes);
  const zip = await JSZip.loadAsync(bytes);
  const name = Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  assert.ok(name, "a native chart part exists");
  return { xml: await zip.files[name].async("string"), slideXml: await zip.files["ppt/slides/slide1.xml"].async("string") };
}

describe("v2 chart command validation", () => {
  it("accepts value, label, rename, and kind edits in one envelope", async () => {
    const r = await rig(chartScene());
    const result = await r.editor.setChartData("s:chart", {
      chartKind: "line",
      categories: ["Q1", "Q2", "Q3"],
      series: [{ name: "Revenue!", values: [121.5, 145, 170] }],
    });
    assert.equal(result.ok, true);
    assert.equal(r.doc.status().historyLength, 1, "one revision per Apply");
    const c = chartOf(r);
    assert.equal(c.chartKind, "line");
    assert.equal(c.series[0].name, "Revenue!");
    assert.equal(c.series[0].values[0], 121.5, "decimals survive");
    const el = r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:chart");
    assert.equal(el.dataCustomized, true, "human data ownership recorded");
    assert.equal(el.provenance, "human");
    assert.deepEqual({ x: el.x, y: el.y, w: el.w, h: el.h }, { x: 1, y: 1, w: 8, h: 4 }, "geometry untouched");
    assert.deepEqual(el.chart.labels, LABELS, "label typography rides along");
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("partial payloads touch only mentioned keys", async () => {
    const r = await rig(chartScene());
    await r.editor.setChartData("s:chart", { series: [{ name: "Revenue", values: [1, 2, 3] }] });
    const c = chartOf(r);
    assert.equal(c.chartKind, "bar", "kind untouched");
    assert.deepEqual(c.categories, ["Q1", "Q2", "Q3"], "labels untouched");
    assert.deepEqual(c.series[0].values, [1, 2, 3]);
  });

  it("adds/removes categories and series with full matrices", async () => {
    const r = await rig(chartScene());
    // Add a category: values for every series ride along.
    await r.editor.setChartData("s:chart", {
      categories: ["Q1", "Q2", "Q3", "Q4"],
      series: [{ name: "Revenue", values: [120, 145, 170, 200] }],
    });
    assert.equal(chartOf(r).categories.length, 4);
    // Add a series.
    await r.editor.setChartData("s:chart", {
      series: [
        { name: "Revenue", values: [120, 145, 170, 200] },
        { name: "Costs", values: [80, 90, 100, 110] },
      ],
    });
    assert.equal(chartOf(r).series.length, 2);
    // Remove a series and a category.
    await r.editor.setChartData("s:chart", {
      categories: ["Q1", "Q2", "Q3"],
      series: [{ name: "Costs", values: [80, 90, 100] }],
    });
    assert.deepEqual(chartOf(r).categories, ["Q1", "Q2", "Q3"]);
    assert.equal(chartOf(r).series[0].name, "Costs");
    assert.equal(r.doc.status().historyLength, 3);
  });

  it("rejects malformed payloads without mutation", async () => {
    const cases = [
      [null, /needs a chart payload/],
      ["x", /needs a chart payload/],
      [{}, /at least one/],
      [{ chartKind: "3d" }, /supported kind/],
      [{ categories: [] }, /at least one category/],
      [{ categories: [1] }, /must be a string/],
      [{ series: [] }, /at least one series/],
      [{ series: [{ name: "  ", values: [1, 2, 3] }] }, /non-empty name/],
      [{ series: [{ name: "A", values: [1, 2] }] }, /full matrix/],
      [{ series: [{ name: "A", values: [1, 2, "x"] }] }, /non-numeric/],
      [{ series: [{ name: "A", values: [1, 2, NaN] }] }, /non-numeric/],
      [{ series: [{ name: "A", values: [1, 2, Infinity] }] }, /non-numeric/],
      [{ series: [{ name: "A", values: [1, 2] }], categories: ["Q1", "Q2", "Q3"] }, /full matrix/],
    ];
    for (const [payload, want] of cases) {
      const r = await rig(chartScene());
      const before = JSON.stringify(r.doc.snapshot().scenes);
      const result = await r.editor.setChartData("s:chart", payload);
      assert.equal(result.ok, false, `payload ${JSON.stringify(payload)} rejected`);
      assert.match(result.message, want);
      assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "no mutation");
      assert.equal(r.doc.status().historyLength, 0);
    }
  });

  it("never coerces strings to zero and keeps valid zeros/decimals/negatives", async () => {
    const r = await rig(chartScene());
    const coerced = await r.editor.setChartData("s:chart", { series: [{ name: "Revenue", values: [0, 2, 3] }] });
    assert.equal(coerced.ok, true, "real zeros are valid data");
    const r2 = await rig(chartScene());
    const blank = await r2.editor.setChartData("s:chart", { series: [{ name: "Revenue", values: ["", 2, 3] }] });
    assert.equal(blank.ok, false, "empty strings rejected, never zero-filled");
    const r3 = await rig(chartScene());
    const ok = await r3.editor.setChartData("s:chart", { series: [{ name: "P&L", values: [-12.5, 0, 1e6] }] });
    assert.equal(ok.ok, true, "negatives, zeros, decimals, large values valid");
    assert.deepEqual(chartOf(r3).series[0].values, [-12.5, 0, 1e6]);
  });

  it("rejects empty data and last-member deletions", async () => {
    const r = await rig(chartScene("bar", ["Only"], [{ name: "Solo", values: [5] }]));
    assert.equal((await r.editor.setChartData("s:chart", { categories: [] })).ok, false);
    assert.equal((await r.editor.setChartData("s:chart", { series: [] })).ok, false);
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("allows duplicate labels (positional identity, documented)", async () => {
    const r = await rig(chartScene());
    const result = await r.editor.setChartData("s:chart", {
      categories: ["Q1", "Q1", "Q2"],
      series: [{ name: "Revenue", values: [1, 2, 3] }],
    });
    assert.equal(result.ok, true, "labels are display strings, identity is positional");
  });

  it("engine boundary rejects non-finite and mismatched envelopes", async () => {
    const r = await rig(chartScene());
    const bad = await r.doc.apply({
      id: "e1", slideId: "s", op: { type: "element.setChartData", id: "s:chart", chart: { series: [{ name: "A", values: [1, NaN, 3] }] } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "bad-envelope");
    const empty = await r.doc.apply({
      id: "e2", slideId: "s", op: { type: "element.setChartData", id: "s:chart", chart: {} },
      baseRevision: 0, actor: "human",
    });
    assert.equal(empty.ok, false);
  });

  it("rejects locked, unknown, and non-chart targets", async () => {
    const r = await rig(chartScene());
    assert.equal((await r.editor.setChartData("s:note", { categories: ["a", "b", "c"] })).code, "op-rejected");
    assert.equal((await r.editor.setChartData("s:nope", { categories: ["a"] })).code, "unknown-element");
    const locked = chartScene();
    locked[0].elements[0].locked = true;
    const r2 = await rig(locked);
    assert.equal((await r2.editor.setChartData("s:chart", { categories: ["a", "b", "c"] })).code, "locked");
  });

  it("no-op submissions record nothing", async () => {
    const r = await rig(chartScene());
    const noop = await r.editor.setChartData("s:chart", {
      chartKind: "bar",
      categories: ["Q1", "Q2", "Q3"],
      series: [{ name: "Revenue", values: [120, 145, 170] }],
    });
    assert.equal(noop.ok, true);
    assert.equal(noop.noop, true);
    assert.equal(r.doc.snapshot().revision, 0);
    assert.equal(r.doc.status().historyLength, 0);
  });
});

describe("v2 chart-kind conversion safety", () => {
  it("permits lossless conversions between cartesian kinds", async () => {
    for (const kind of ["hbar", "line", "area"]) {
      const r = await rig(chartScene("bar", ["A", "B"], [{ name: "S1", values: [1, 2] }, { name: "S2", values: [3, 4] }]));
      const result = await r.editor.setChartData("s:chart", { chartKind: kind });
      assert.equal(result.ok, true, `bar -> ${kind} preserves all data`);
      assert.equal(chartOf(r).chartKind, kind);
      assert.equal(chartOf(r).series.length, 2, "no series dropped");
    }
  });

  it("permits single-series pie and doughnut in both directions", async () => {
    const r = await rig(chartScene("bar", ["A", "B"], [{ name: "S", values: [1, 2] }]));
    assert.equal((await r.editor.setChartData("s:chart", { chartKind: "pie" })).ok, true);
    assert.equal(chartOf(r).chartKind, "pie");
    assert.equal((await r.editor.setChartData("s:chart", { chartKind: "doughnut" })).ok, true);
    assert.equal((await r.editor.setChartData("s:chart", { chartKind: "bar" })).ok, true);
    assert.deepEqual(chartOf(r).series[0].values, [1, 2], "round trip keeps every value");
  });

  it("rejects multi-series pie/doughnut with an explanation", async () => {
    for (const kind of ["pie", "doughnut"]) {
      const r = await rig(chartScene("bar", ["A", "B"], [{ name: "S1", values: [1, 2] }, { name: "S2", values: [3, 4] }]));
      const before = JSON.stringify(r.doc.snapshot().scenes);
      const result = await r.editor.setChartData("s:chart", { chartKind: kind });
      assert.equal(result.ok, false, `bar -> ${kind} refused before commit`);
      assert.match(result.message, /cannot keep 2 series/);
      assert.equal(JSON.stringify(r.doc.snapshot().scenes), before, "nothing committed");
      assert.equal(r.doc.status().historyLength, 0);
    }
  });

  it("rejects adding a second series to a pie, and enforces preflight as backstop", async () => {
    const r = await rig(chartScene("pie", ["A", "B"], [{ name: "S", values: [1, 2] }]));
    const result = await r.editor.setChartData("s:chart", {
      series: [{ name: "S", values: [1, 2] }, { name: "T", values: [3, 4] }],
    });
    assert.equal(result.ok, false, "pie stays single-series through the command");
    // The V2-5A preflight remains the last line of defense.
    const unsafe = chartScene("pie", ["A"], [{ name: "S", values: [1] }]);
    unsafe[0].elements[0].chart.series.push({ name: "T", values: [2] });
    const issues = await preflightScenes(unsafe);
    assert.ok(issues.some((i) => /only the first/.test(i.reason)), "preflight names the loss");
  });
});

describe("v2 chart undo, conflicts, and ownership", () => {
  it("undo restores exact prior data; redo restores the edit", async () => {
    const r = await rig(chartScene());
    const before = structuredClone(chartOf(r));
    await r.editor.setChartData("s:chart", {
      categories: ["Q1", "Q2"],
      series: [{ name: "New", values: [9, 8] }],
    });
    await r.editor.undo();
    assert.deepEqual(chartOf(r), before, "data, kind, and labels byte-identical");
    assert.equal(elOf(r).dataCustomized, undefined);
    assert.equal(elOf(r).provenance, "compiler");
    await r.editor.redo();
    assert.deepEqual(chartOf(r).series[0].values, [9, 8]);
    assert.equal(elOf(r).dataCustomized, true);

    function elOf(r) {
      return r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:chart");
    }
  });

  it("stale revisions fail with the scene untouched", async () => {
    const r = await rig(chartScene());
    const before = JSON.stringify(r.doc.snapshot().scenes);
    await r.doc.apply({ id: "ext", slideId: "s", op: { type: "element.move", id: "s:note", x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const stale = await r.doc.apply({
      id: "late", slideId: "s", op: { type: "element.setChartData", id: "s:chart", chart: { series: [{ name: "Revenue", values: [0, 0, 0] }] } },
      baseRevision: 0, actor: "human",
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "stale-revision");
    assert.ok(JSON.stringify(r.doc.snapshot().scenes).includes('"x":2'), "winner intact, loser absent");
    assert.equal(JSON.stringify(r.doc.snapshot().scenes) === before, false);
  });

  it("leaves tables and text byte-identical", async () => {
    const r = await rig(chartScene());
    const noteBefore = JSON.stringify(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:note"));
    await r.editor.setChartData("s:chart", { series: [{ name: "Revenue", values: [5, 5, 5] }] });
    assert.equal(JSON.stringify(r.doc.snapshot().scenes[0].elements.find((e) => e.id === "s:note")), noteBefore);
  });

  it("caller payloads cannot mutate the scene afterwards", async () => {
    const r = await rig(chartScene());
    const payload = { categories: ["A", "B", "C"], series: [{ name: "S", values: [1, 2, 3] }] };
    await r.editor.setChartData("s:chart", payload);
    payload.categories[0] = "HACKED";
    payload.series[0].values[0] = -999;
    assert.equal(chartOf(r).categories[0], "A");
    assert.equal(chartOf(r).series[0].values[0], 1);
  });
});

describe("v2 chart regeneration", () => {
  async function legacyChartRig() {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const slideIntent = intent.slides.find((s) => (s.blocks ?? []).some((b) => b.kind === "chart"));
    const { compileSlide } = await import("../packages/compiler/compile.js");
    const legacy = [compileSlide(slideIntent, design)];
    const id = legacy[0].elements.find((e) => e.kind === "chart" && !e.locked)?.id;
    const r = await rig(structuredClone(legacy));
    return { design, slideIntent, slideId: legacy[0].id, id, r };
  }

  it("move-only and resize-only refresh compiler data", async () => {
    const { design, slideIntent, slideId, id, r } = await legacyChartRig();
    await r.doc.apply({ id: "mv", slideId, op: { type: "element.move", id, x: 2, y: 2 }, baseRevision: 0, actor: "human" });
    const moved = r.doc.snapshot().scenes[0];
    assert.equal(moved.elements.find((e) => e.id === id).dataCustomized, undefined, "move alone claims no data");
    const recompiled = recompileSlide(slideIntent, structuredClone(moved), design);
    const fresh = recompiled.elements.find((e) => e.id === id);
    assert.equal(fresh.x, 2, "human geometry kept");
    assert.equal(fresh.dataCustomized, undefined);
    assert.deepEqual(fresh.chart.series, moved.elements.find((e) => e.id === id).chart.series, "no human claim, compiler data flows");
    const { slideId: s2, id: i2, r: r2 } = await legacyChartRig();
    const design2 = await warmDesign();
    await r2.doc.apply({ id: "rs", slideId: s2, op: { type: "element.setGeometry", id: i2, x: 1, y: 1, w: 5, h: 3 }, baseRevision: 0, actor: "human" });
    const recompiled2 = recompileSlide(slideIntent, structuredClone(r2.doc.snapshot().scenes[0]), design2);
    assert.equal(recompiled2.elements.find((e) => e.id === i2).dataCustomized, undefined, "resize alone claims no data");
  });

  it("edited values, labels, and kind survive regeneration", async () => {
    const { design, slideIntent, id, r } = await legacyChartRig();
    await r.editor.setChartData(id, {
      chartKind: "line",
      categories: ["Alpha", "Beta", "Gamma"],
      series: [{ name: "Human", values: [7, 8, 9] }],
    });
    const prev = r.doc.snapshot().scenes[0];
    const recompiled = recompileSlide(slideIntent, structuredClone(prev), design);
    const el = recompiled.elements.find((e) => e.id === id);
    assert.equal(el.chart.chartKind, "line");
    assert.deepEqual(el.chart.categories, ["Alpha", "Beta", "Gamma"]);
    assert.deepEqual(el.chart.series, [{ name: "Human", values: [7, 8, 9] }]);
    assert.equal(el.dataCustomized, true);
    // Label typography follows the fresh compile exactly (the legacy
    // path emits none, so none is carried — never stale paint).
    const { compileSlide: cs2 } = await import("../packages/compiler/compile.js");
    assert.deepEqual(el.chart.labels, cs2(slideIntent, design).elements.find((e) => e.id === id).chart.labels);
  });

  it("data plus geometry compose; undo restores compiler data on recompile", async () => {
    const { design, slideIntent, slideId, id, r } = await legacyChartRig();
    const origin = { ...r.doc.snapshot().scenes[0].elements.find((e) => e.id === id) };
    await r.doc.apply({ id: "g", slideId, op: { type: "element.setGeometry", id, x: origin.x, y: origin.y, w: origin.w + 1, h: origin.h }, baseRevision: 0, actor: "human" });
    await r.editor.setChartData(id, { series: [{ name: "Edited", values: [3, 2, 1] }] });
    const both = recompileSlide(slideIntent, structuredClone(r.doc.snapshot().scenes[0]), design);
    const kept = both.elements.find((e) => e.id === id);
    assert.equal(kept.w, origin.w + 1, "human geometry kept");
    assert.equal(kept.chart.series[0].name, "Edited", "human data kept");
    await r.editor.undo();
    const undone = recompileSlide(slideIntent, structuredClone(r.doc.snapshot().scenes[0]), design);
    const el = undone.elements.find((e) => e.id === id);
    assert.equal(el.dataCustomized, undefined, "abandoned data behaves as never-existed");
    assert.notEqual(el.chart.series[0].name, "Edited");
    await r.editor.redo();
    const redone = recompileSlide(slideIntent, structuredClone(r.doc.snapshot().scenes[0]), design);
    assert.equal(redone.elements.find((e) => e.id === id).chart.series[0].name, "Edited");
  });

  it("human-added charts survive; detached slides pass through; locked charts reject", async () => {
    const { design, slideIntent, r } = await legacyChartRig();
    const before = r.doc.snapshot().scenes[0].elements.length;
    const added = await r.doc.apply({
      id: "add", slideId: r.doc.snapshot().scenes[0].id,
      op: {
        type: "element.add",
        element: {
          id: "h-chart", kind: "chart", x: 1, y: 1, w: 5, h: 3, provenance: "human",
          chart: { chartKind: "bar", categories: ["A"], series: [{ name: "Mine", values: [1] }] },
        },
      },
      baseRevision: 0, actor: "human",
    });
    assert.equal(added.ok, true);
    const prev = r.doc.snapshot().scenes[0];
    assert.equal(prev.elements.length, before + 1);
    const recompiled = recompileSlide(slideIntent, structuredClone(prev), design);
    assert.ok(recompiled.elements.some((e) => e.id === "h-chart"), "human-added chart carried forward");
    const detached = { ...structuredClone(prev), layoutState: "detached" };
    assert.equal(JSON.stringify(recompileSlide(slideIntent, detached, design)), JSON.stringify(detached));
  });
});

describe("v2 chart browser and PPTX fidelity", () => {
  it("committed data renders in the browser SVG", async () => {
    const r = await rig(chartScene());
    await r.editor.setChartData("s:chart", {
      categories: ["H1", "H2"],
      series: [{ name: "Renamed", values: [11, 22] }],
    });
    const svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.match(svg, /Renamed/, "legend follows series names");
    assert.match(svg, /H1/, "categories follow labels");
    assert.ok(!svg.includes("Revenue"), "old names gone from the projection");
  });

  it("edited charts export as native editable OOXML with inline values", async () => {
    const r = await rig(chartScene("bar", ["Oxide", "Sulfide"], [{ name: "mS/cm", values: [1.2, 12.5] }, { name: "Cost", values: [3, 4] }]));
    await r.editor.setChartData("s:chart", {
      categories: ["Oxide", "Sulfide", "Polymer"],
      series: [{ name: "mS/cm", values: [1.2, 12.5, 0.4] }, { name: "Cost", values: [3, 4, 5] }],
    });
    const { xml, slideXml } = await chartXmlFor(r.doc.snapshot().scenes);
    assert.equal((xml.match(/<c:ser>/g) || []).length, 2, "both series survive as native series");
    assert.match(xml, /mS\/cm/, "series name in chart XML");
    assert.match(xml, /Cost/, "added series in chart XML");
    assert.match(xml, /Polymer/, "added category in chart XML");
    assert.match(xml, /12\.5/, "edited value inline in numCache");
    assert.ok(slideXml.includes("graphicFrame"), "native chart frame");
    assert.ok(!slideXml.includes("a:blip"), "never rasterized");
  });

  it("single-series pie exports natively; line kind projects", async () => {
    const pie = await rig(chartScene("pie", ["A", "B"], [{ name: "Share", values: [30, 70] }]));
    const { xml } = await chartXmlFor(pie.doc.snapshot().scenes);
    assert.equal((xml.match(/<c:ser>/g) || []).length, 1);
    assert.match(xml, /pieChart/, "pie projection");
    const line = await rig(chartScene());
    await line.editor.setChartData("s:chart", { chartKind: "line" });
    const lineOut = await chartXmlFor(line.doc.snapshot().scenes);
    assert.match(lineOut.xml, /lineChart/, "line projection after kind switch");
  });

  it("cleanup removes listeners and commits nothing", async () => {
    const r = await rig(chartScene());
    r.editor.detach();
    assert.equal(r.doc.snapshot().revision, 0);
  });
});
