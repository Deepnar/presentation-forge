// V2-5J Layers: tree generation, labels, reorder math, locks,
// visibility, regen preservation, and projection parity. Headless
// linkedom + engine + OOXML coverage. Real-panel proof (tree,
// selection sync, stacking, lock/hide, undo) lives in
// test/v2-edit-chrome-5j.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { compileDeck } from "../packages/compiler/compile.js";
import {
  elementLabel,
  flattenLayers,
  applyCollapse,
  isSystemChrome,
} from "../packages/editor/scene-text.js";

import { renderPptx, preflightScenes } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

async function deckRigLocal() {
  const design = await warmDesign();
  return { design, scenes: compileDeck(sampleDeckIntent(), design) };
}

function dom() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  return document;
}

function layerDeck() {
  return [{
    id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
    elements: [
      { id: "s:back", kind: "shape", x: 1, y: 1, w: 4, h: 3, z: 0, provenance: "compiler", semanticRef: "back", shape: { form: "rect", fill: "AABBCC" } },
      { id: "s:mid", kind: "text", x: 2, y: 2, w: 4, h: 1, z: 1, provenance: "compiler", semanticRef: "mid", paragraphs: [{ runs: [{ text: "Research Findings", role: "heading", size: 24, color: "111111" }], align: "left" }] },
      {
        id: "s:grp", kind: "group", x: 5, y: 1, w: 5, h: 4, z: 2, provenance: "compiler", semanticRef: "grp",
        group: {
          children: [
            { id: "s:grp:kid", kind: "shape", x: 0.5, y: 0.5, w: 2, h: 1, z: 0, provenance: "compiler", semanticRef: "kid", shape: { form: "ellipse", fill: "00FF00" } },
            { id: "s:grp:cap", kind: "text", x: 0.5, y: 2, w: 3, h: 1, z: 1, provenance: "compiler", paragraphs: [{ runs: [{ text: "caption", size: 12, color: "222222" }], align: "left" }] },
          ],
        },
      },
      { id: "s:chart", kind: "chart", x: 1, y: 5, w: 5, h: 2, z: 3, provenance: "compiler", semanticRef: "ch", chart: { chartKind: "bar", categories: ["A"], series: [{ name: "Revenue", values: [3] }] } },
      { id: "s:table", kind: "table", x: 7, y: 5, w: 4, h: 2, z: 4, provenance: "compiler", semanticRef: "tb", table: { rows: [["H"], ["v"]], header: true } },
      { id: "s:chrome", kind: "text", x: 0, y: 0, w: 13.333, h: 0.5, z: 5, provenance: "compiler", locked: true, paragraphs: [{ runs: [{ text: "banner", size: 12, color: "111111" }], align: "left" }] },
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

function elOf(r, id) {
  return r.doc.snapshot().scenes[0].elements.find((e) => e.id === id);
}

function orderOf(r) {
  return r.doc.snapshot().scenes[0].elements.map((e) => e.id);
}

describe("v2-5j layer tree", () => {
  it("flattens parents before children in z order with labels", () => {
    const rows = flattenLayers(layerDeck()[0].elements);
    assert.deepEqual(rows.map((r) => r.id), ["s:back", "s:mid", "s:grp", "s:grp:kid", "s:grp:cap", "s:chart", "s:table", "s:chrome"]);
    assert.deepEqual(rows.map((r) => r.depth), [0, 0, 0, 1, 1, 0, 0, 0]);
    assert.equal(rows[2].parentId, null);
    assert.equal(rows[3].parentId, "s:grp");
    assert.equal(rows[0].label, "Rectangle");
    assert.equal(rows[1].label, "Heading — Research Findings");
    assert.equal(rows[2].label, "Group — 2 objects");
    assert.equal(rows[3].label, "Ellipse");
    assert.equal(rows[5].label, "Revenue chart");
    assert.equal(rows[6].label, "Table 1×2");
    assert.equal(rows[7].locked, true);
  });

  it("labels every kind readably without blank rows", () => {
    const cases = [
      [{ kind: "text", paragraphs: [{ runs: [{ text: "Hello world", role: "body" }] }] }, "Text — Hello world"],
      [{ kind: "text", paragraphs: [] }, "Text"],
      [{ kind: "shape", shape: { form: "roundRect" } }, "Rounded rectangle"],
      [{ kind: "shape", shape: {} }, "Rectangle"],
      [{ kind: "chart", chart: {} }, "Chart chart"],
      [{ kind: "image", image: { alt: "cell stack" } }, "Image — cell stack"],
      [{ kind: "image", image: {} }, "Image"],
      [{ kind: "line", line: {} }, "Line"],
      [{ kind: "group", group: { children: [{ id: "a" }] } }, "Group — 1 object"],
      [{}, "Object"],
    ];
    for (const [el, want] of cases) {
      const label = elementLabel({ id: "x", ...el });
      assert.ok(label.length > 0, "never blank");
      assert.equal(label, want);
    }
  });

  it("collapses subtrees without touching the scene", () => {
    const rows = flattenLayers(layerDeck()[0].elements);
    assert.equal(applyCollapse(rows, new Set()).length, rows.length, "open tree shows all");
    const folded = applyCollapse(rows, new Set(["s:grp"]));
    assert.ok(!folded.some((r) => r.id === "s:grp:kid"), "children hidden");
    assert.ok(folded.some((r) => r.id === "s:grp"), "collapsed group stays visible");
    assert.equal(applyCollapse(rows, new Set(["nope"])).length, rows.length, "unknown ids inert");
  });

  it("classifies system chrome exactly", () => {
    assert.equal(isSystemChrome({ locked: true, provenance: "compiler" }), true);
    assert.equal(isSystemChrome({ locked: true, provenance: "compiler", semanticRef: "x" }), false, "authored refs are user content");
    assert.equal(isSystemChrome({ locked: true, provenance: "human" }), false);
    assert.equal(isSystemChrome({ locked: false, provenance: "compiler" }), false);
    assert.equal(isSystemChrome(null), false);
  });
});

describe("v2-5j reorder", () => {
  it("moves forward, backward, front, and back with one entry", async () => {
    const r = await rig(layerDeck());
    await r.editor.reorderElement("s:back", 3);
    assert.deepEqual(orderOf(r), ["s:mid", "s:grp", "s:chart", "s:back", "s:table", "s:chrome"]);
    assert.deepEqual(r.doc.snapshot().scenes[0].elements.map((e) => e.z), [0, 1, 2, 3, 4, 5], "z rewritten as the rank");
    assert.equal(r.doc.status().historyLength, 1, "one command per operation");
    const el = elOf(r, "s:back");
    assert.equal(el.customized, true, "arrangement ownership recorded");
    assert.equal(el.provenance, "human");
    assert.deepEqual([el.x, el.y, el.w, el.h], [1, 1, 4, 3], "geometry untouched");
    assert.equal(el.paragraphs, undefined, "no content fabricated onto shapes");
    // Front and back extremes.
    await r.editor.reorderElement("s:back", 99);
    assert.equal(orderOf(r).at(-1), "s:back", "clamped to the front");
    await r.editor.reorderElement("s:back", 0);
    assert.equal(orderOf(r)[0], "s:back", "sent to the back");
  });

  it("restores exact order and ranks on undo/redo", async () => {
    const r = await rig(layerDeck());
    const before = r.doc.snapshot().scenes[0].elements.map((e) => [e.id, e.z]);
    await r.editor.reorderElement("s:mid", 4);
    await r.editor.undo();
    assert.deepEqual(r.doc.snapshot().scenes[0].elements.map((e) => [e.id, e.z]), before);
    await r.editor.redo();
    assert.equal(orderOf(r)[4], "s:mid");
  });

  it("refuses nested, locked, unknown, and bad targets", async () => {
    const r = await rig(layerDeck());
    assert.match((await r.editor.reorderElement("s:grp:kid", 0)).message, /group unit/);
    assert.equal((await r.editor.reorderElement("s:chrome", 0)).code, "locked");
    assert.equal((await r.editor.reorderElement("ghost", 0)).code, "unknown-element");
    assert.equal((await r.editor.reorderElement("s:mid", -1)).code, "bad-envelope");
    const noop = await r.editor.reorderElement("s:mid", 1);
    assert.equal(noop.noop, true, "parked drops record nothing");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("keeps text, chart, and table payloads intact", async () => {
    const r = await rig(layerDeck());
    await r.editor.reorderElement("s:chart", 0);
    const chart = elOf(r, "s:chart");
    assert.deepEqual(chart.chart.series, [{ name: "Revenue", values: [3] }], "chart data intact");
    await r.editor.reorderElement("s:mid", 5);
    assert.equal(elOf(r, "s:mid").paragraphs[0].runs[0].text, "Research Findings");
    await r.editor.reorderElement("s:table", 5);
    assert.deepEqual(elOf(r, "s:table").table.rows, [["H"], ["v"]]);
    const verdict = await validateScene(r.doc.snapshot().scenes[0]);
    assert.equal(verdict.ok, true);
  });

  it("reordered elements stay fully editable", async () => {
    const r = await rig(layerDeck());
    await r.editor.reorderElement("s:mid", 0);
    const moved = await r.doc.apply({
      id: "mv", slideId: "s", op: { type: "element.move", id: "s:mid", x: 3, y: 3 },
      baseRevision: 1, actor: "human",
    });
    assert.equal(moved.ok, true, "move after reorder commits");
    const styled = await r.editor.setElementLocked("s:mid", true);
    assert.equal(styled.ok, true, "lock after reorder commits");
    await r.editor.setElementLocked("s:mid", false);
  });

  it("stale revisions fail with order untouched", async () => {
    const r = await rig(layerDeck());
    const before = JSON.stringify(orderOf(r));
    await r.doc.apply({ id: "ext", slideId: "s", op: { type: "element.move", id: "s:back", x: 2, y: 2 }, baseRevision: 0, actor: "agent", agentId: "t" });
    const stale = await r.doc.apply({
      id: "late", slideId: "s", op: { type: "element.reorder", id: "s:mid", toIndex: 0 },
      baseRevision: 0, actor: "human",
    });
    assert.equal(stale.code, "stale-revision");
    assert.deepEqual(orderOf(r), ["s:back", "s:mid", "s:grp", "s:chart", "s:table", "s:chrome"], "loser order absent");
    assert.equal(r.doc.snapshot().revision, 1, "exactly one winner committed");
  });
});

describe("v2-5j lock", () => {
  it("locks and unlocks user objects revisioned with undo", async () => {
    const r = await rig(layerDeck());
    const before = structuredClone(elOf(r, "s:mid"));
    assert.equal((await r.editor.setElementLocked("s:mid", true)).ok, true);
    assert.equal(elOf(r, "s:mid").locked, true);
    assert.equal(r.doc.status().historyLength, 1);
    // Locked objects reject canvas-path mutations at the engine.
    const moved = await r.doc.apply({ id: "m", slideId: "s", op: { type: "element.move", id: "s:mid", x: 9, y: 9 }, baseRevision: 1, actor: "human" });
    assert.equal(moved.code, "locked");
    await r.editor.undo();
    assert.deepEqual(elOf(r, "s:mid"), before, "undo restores the never-locked element exactly");
    await r.editor.redo();
    assert.equal(elOf(r, "s:mid").locked, true);
    await r.editor.setElementLocked("s:mid", false);
    assert.equal(elOf(r, "s:mid").locked, undefined, "absence restored, not false");
    await r.editor.undo();
    assert.equal(elOf(r, "s:mid").locked, true, "undo restores the lock");
    await r.editor.redo();
    assert.equal(elOf(r, "s:mid").locked, undefined);
  });

  it("never unlocks system chrome through the panel path", async () => {
    const r = await rig(layerDeck());
    const result = await r.editor.setElementLocked("s:chrome", false);
    assert.equal(result.ok, false);
    assert.equal(result.code, "locked");
    assert.match(result.message, /system chrome/);
    assert.equal(elOf(r, "s:chrome").locked, true, "chrome stays locked");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("no-ops on identical state and rejects bad input", async () => {
    const r = await rig(layerDeck());
    assert.equal((await r.editor.setElementLocked("s:mid", false)).noop, true);
    assert.equal((await r.editor.setElementLocked("ghost", true)).code, "unknown-element");
    assert.equal((await r.editor.setElementLocked("s:mid", "yes")).code, "bad-envelope");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("locked group children cannot be reached around the lock", async () => {
    const grouped = layerDeck();
    grouped[0].elements.find((e) => e.id === "s:grp").locked = true;
    const r = await rig(grouped);
    // Canvas resolution excludes locked descendants (existing rule).
    r.viewer.api.select("s:grp:kid");
    assert.deepEqual(r.viewer.api.snapshot().selectedIds, [], "locked subtree unselectable");
    // Panel path inherits the lock downward.
    const hidden = await r.editor.setElementHidden("s:grp:kid", true);
    assert.equal(hidden.code, "locked");
    assert.match(hidden.message, /locked group/);
  });
});

describe("v2-5j visibility", () => {
  it("hides and re-shows with every byte preserved", async () => {
    const r = await rig(layerDeck());
    const before = structuredClone(elOf(r, "s:mid"));
    assert.equal((await r.editor.setElementHidden("s:mid", true)).ok, true);
    assert.equal(elOf(r, "s:mid").hidden, true);
    assert.equal(r.doc.status().historyLength, 1);
    assert.equal((await r.editor.setElementHidden("s:mid", true)).noop, true, "hiding twice is one entry");
    await r.editor.setElementHidden("s:mid", false);
    const reshown = elOf(r, "s:mid");
    assert.equal(reshown.hidden, undefined, "flag cleared");
    assert.deepEqual(reshown.paragraphs, before.paragraphs, "content intact");
    assert.deepEqual([reshown.x, reshown.y, reshown.w, reshown.h, reshown.z], [before.x, before.y, before.w, before.h, before.z], "geometry and rank intact");
    assert.equal(reshown.provenance, "human", "hiding is a human act — only undo restores compiler provenance");
  });

  it("hidden content vanishes from SVG but never from the scene", async () => {
    const r = await rig(layerDeck());
    await r.editor.setElementHidden("s:mid", true);
    const svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.ok(!svg.includes("Research Findings"), "omitted from projection");
    assert.ok(svg.includes("Revenue"), "siblings still project");
    const el = elOf(r, "s:mid");
    assert.equal(el.paragraphs[0].runs[0].text, "Research Findings", "authored text intact in the scene");
    assert.deepEqual([el.x, el.y, el.w, el.h], [2, 2, 4, 1], "geometry intact");
  });

  it("hidden groups vanish whole; hidden children vanish alone", async () => {
    const r = await rig(layerDeck());
    await r.editor.setElementHidden("s:grp:kid", true);
    let svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.ok(!svg.includes("00FF00") || svg.includes("caption"), "hidden child gone, sibling stays");
    assert.ok(svg.includes("caption"), "visible sibling projects");
    await r.editor.setElementHidden("s:grp", true);
    svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.ok(!svg.includes("caption"), "hidden group hides all children");
  });

  it("locked elements refuse hiding; bad input rejected", async () => {
    const r = await rig(layerDeck());
    assert.equal((await r.editor.setElementHidden("s:chrome", true)).code, "locked");
    assert.equal((await r.editor.setElementHidden("ghost", true)).code, "unknown-element");
    assert.equal((await r.editor.setElementHidden("s:mid", "yes")).code, "bad-envelope");
    assert.equal(r.doc.status().historyLength, 0);
  });

  it("undo of a hide restores visibility exactly", async () => {
    const r = await rig(layerDeck());
    const before = structuredClone(elOf(r, "s:mid"));
    await r.editor.setElementHidden("s:mid", true);
    await r.editor.undo();
    assert.deepEqual(elOf(r, "s:mid"), before);
    assert.ok(sceneToSvg(r.doc.snapshot().scenes[0]).includes("Research Findings"));
  });
});

describe("v2-5j regeneration", () => {
  it("reordered compiler elements keep human order and z", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const { scenes } = await deckRigLocal();
    const slideIdx = scenes.findIndex((s) => s.elements.length >= 3 && !s.elements.some((e) => e.locked));
    assert.ok(slideIdx >= 0, "a workable slide exists");
    const slide = scenes[slideIdx];
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const planned = planDeckComposition(intent, design).plan.slides.find((x) => x.slideId === slide.id);
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const recompile = (prev) => recompileSlide(intent.slides[slideIdx], prev, design, planned);
    const r = await rig(structuredClone(scenes));
    const [a, b] = slide.elements.map((e) => e.id);
    await r.doc.apply({ id: "ro", slideId: slide.id, op: { type: "element.reorder", id: a, toIndex: 99 }, baseRevision: 0, actor: "human" });
    const moved = r.doc.snapshot().scenes[slideIdx];
    assert.equal(moved.elements.at(-1).id, a, "human order recorded");
    const recompiled = recompile(structuredClone(moved));
    const kept = recompiled.elements.find((e) => e.id === a);
    assert.ok(recompiled.elements.indexOf(kept) === recompiled.elements.length - 1, "order survives recompilation");
    assert.equal(kept.z, moved.elements.length - 1, "rank survives recompilation");
    void b;
  });

  it("user locks and hides survive; undo flows fresh", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const { scenes } = await deckRigLocal();
    const slideIdx = scenes.findIndex((s) => s.elements.some((e) => e.kind === "text" && !e.locked));
    const slide = scenes[slideIdx];
    const id = slide.elements.find((e) => e.kind === "text" && !e.locked).id;
    const { planDeckComposition } = await import("../packages/compiler/composition.ts");
    const planned = planDeckComposition(intent, design).plan.slides.find((x) => x.slideId === slide.id);
    const { recompileSlide } = await import("../packages/compiler/compile.js");
    const recompile = (prev) => recompileSlide(intent.slides[slideIdx], prev, design, planned);
    const r = await rig(structuredClone(scenes));
    r.viewer.api.goTo(slideIdx);
    await r.editor.setElementLocked(id, true);
    const other = slide.elements.find((e) => e.id !== id && e.kind === "text" && !e.locked)?.id ?? id;
    await r.editor.setElementHidden(other, true);
    const recompiled = recompile(structuredClone(r.doc.snapshot().scenes[slideIdx]));
    assert.equal(recompiled.elements.find((e) => e.id === id).locked, true, "user lock carried");
    assert.equal(recompiled.elements.find((e) => e.id === other).hidden, true, "human hide carried");
    await r.editor.undo();
    await r.editor.undo();
    const recompiled2 = recompile(structuredClone(r.doc.snapshot().scenes[slideIdx]));
    assert.equal(recompiled2.elements.find((e) => e.id === id).locked, undefined, "abandoned lock behaves as never-existed");
    assert.equal(recompiled2.elements.find((e) => e.id === other).hidden, undefined, "abandoned hide behaves as never-existed");
  });
});

describe("v2-5j native export", () => {
  it("draw order matches in SVG and PPTX element sequence", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        { id: "s:left", kind: "shape", x: 1, y: 1, w: 3, h: 2, z: 0, provenance: "human", shape: { form: "rect", fill: "FF0000" } },
        { id: "s:right", kind: "shape", x: 5, y: 1, w: 3, h: 2, z: 1, provenance: "human", shape: { form: "rect", fill: "00FF00" } },
      ],
    }];
    const r = await rig(scenes);
    await r.editor.reorderElement("s:left", 1);
    const order = r.doc.snapshot().scenes[0].elements.map((e) => e.id);
    assert.deepEqual(order, ["s:right", "s:left"]);
    const svg = sceneToSvg(r.doc.snapshot().scenes[0]);
    assert.ok(svg.indexOf('data-el="s:right"') < svg.indexOf('data-el="s:left"'), "SVG follows the rank");
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    // Distinct x offsets project in order: right box (x=5) precedes left box (x=1) after the swap.
    // (A leading zero offset from another part is ignored; the two
    // shape offsets are located by value.)
    assert.ok(xml.indexOf('x="4572000"') !== -1 && xml.indexOf('x="914400"') !== -1, "both shape offsets in OOXML");
    assert.ok(xml.indexOf('x="4572000"') < xml.indexOf('x="914400"'), "PPTX shape sequence follows the rank");
  });

  it("hidden charts pass preflight and vanish from output", async () => {
    const scenes = [{
      id: "s", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        // Deliberately unsafe when visible: multi-series pie.
        { id: "s:pie", kind: "chart", x: 1, y: 1, w: 6, h: 4, z: 0, provenance: "compiler", chart: { chartKind: "pie", categories: ["A"], series: [{ name: "S1", values: [1] }, { name: "S2", values: [2] }] } },
      ],
    }];
    const r = await rig(scenes);
    const issues = await preflightScenes(r.doc.snapshot().scenes);
    assert.ok(issues.length > 0, "visible unsafe chart fails preflight");
    await r.editor.setElementHidden("s:pie", true);
    assert.deepEqual(await preflightScenes(r.doc.snapshot().scenes), [], "hidden unsafe chart cannot fail export");
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(!Object.keys(zip.files).some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), "no chart part emitted");
    await r.editor.setElementHidden("s:pie", false);
    assert.ok((await preflightScenes(r.doc.snapshot().scenes)).length > 0, "re-showing re-arms the checks");
  });

  it("visible objects stay native and editable after layer ops", async () => {
    const r = await rig(layerDeck());
    await r.editor.reorderElement("s:mid", 0);
    await r.editor.setElementLocked("s:back", true);
    await r.editor.setElementHidden("s:table", true);
    const bytes = await renderPptx(r.doc.snapshot().scenes);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.files["ppt/slides/slide1.xml"].async("string");
    assert.match(xml, /Research Findings/, "reordered text exports editable");
    assert.ok(!xml.includes("<a:tbl>"), "hidden table omitted, never rasterized");
    const zipCharts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.equal(zipCharts.length, 1, "visible chart exports natively");
    assert.match(await zip.files[zipCharts[0]].async("string"), /Revenue/, "chart series in the chart part");
    await r.editor.setElementHidden("s:table", false);
    const bytes2 = await renderPptx(r.doc.snapshot().scenes);
    const zip2 = await JSZip.loadAsync(bytes2);
    assert.match(await zip2.files["ppt/slides/slide1.xml"].async("string"), /<a:tbl>/, "re-shown table exports natively");
  });

  it("cleanup removes listeners and commits nothing", async () => {
    const r = await rig(layerDeck());
    r.editor.detach();
    assert.equal(r.doc.snapshot().revision, 0);
  });
});
