// V2-5K layout gallery: registry contracts, deterministic skeleton
// generation, theme fallback, engine insertion, ownership, Layers,
// regeneration boundaries, and native PPTX editability. Browser
// chooser/gallery proof lives in test/v2-edit-chrome-5k.test.js.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import { createViewer } from "../packages/editor/scene-dom.js";
import { createDocument } from "../packages/model/engine.ts";
import { validateScene } from "../packages/model/scene.ts";
import { isSystemChrome } from "../packages/model/scene-constants.ts";
import { attachEditor } from "../packages/editor/scene-edit.js";
import {
  LAYOUT_CATEGORIES,
  LAYOUT_TEMPLATES,
  getLayoutTemplate,
  listLayoutTemplates,
  layoutContextFromSibling,
  buildLayoutScene,
  collectSceneIds,
} from "../packages/editor/layout-templates.js";
import { blankSlide, overflowEstimate, tableOverflowEstimate, flattenLayers } from "../packages/editor/scene-text.js";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { compileDeck, recompileSlide } from "../packages/compiler/compile.js";
import { renderPptx, preflightScenes } from "../packages/renderer-pptx/render.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";

const EXPECTED_IDS = [
  "title", "section", "title-body", "two-column", "closing",
  "compare-2col", "pros-cons", "compare-3col",
  "process-3step", "timeline", "hierarchy",
  "metrics-3up", "chart-insight", "data-table", "key-findings",
];

function counter() {
  let n = 0;
  return () => `h-t${++n}`;
}

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
  const editor = attachEditor(viewer, doc, {
    root,
    onError: (r) => errors.push(r),
    onSync: () => {},
  });
  return { document, root, viewer, doc, editor, errors };
}

async function deckRig() {
  const design = await warmDesign();
  const scenes = compileDeck(sampleDeckIntent(), design);
  return { design, scenes, ...(await rig(scenes)) };
}

function deckIds(scenes) {
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

function placeholderWords(scene) {
  return scene.elements
    .filter((el) => el.kind === "text")
    .flatMap((el) => el.paragraphs.flatMap((p) => p.runs.map((r) => r.text)));
}

describe("v2-5k registry contracts", () => {
  it("template ids are unique, stable, and exactly the curated 15", () => {
    const ids = LAYOUT_TEMPLATES.map((t) => t.id);
    assert.deepEqual([...ids].sort(), [...EXPECTED_IDS].sort());
    assert.equal(new Set(ids).size, ids.length, "stable ids unique");
    const names = LAYOUT_TEMPLATES.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "names unique");
  });

  it("every template carries category metadata, copy, and support status", () => {
    const cats = new Set(LAYOUT_CATEGORIES.map((c) => c.id));
    assert.deepEqual([...cats].sort(), ["comparison", "data", "essentials", "process"]);
    for (const c of LAYOUT_CATEGORIES) {
      assert.ok(c.name.trim() && c.blurb.trim(), `category ${c.id} named`);
    }
    for (const t of LAYOUT_TEMPLATES) {
      assert.ok(cats.has(t.category), `${t.id} names a real category`);
      assert.ok(t.name.trim(), `${t.id} named`);
      assert.ok(t.description.trim(), `${t.id} described`);
      assert.ok(t.useCase.trim(), `${t.id} has a use case`);
      assert.equal(t.supported, true, `${t.id} supported`);
      assert.ok(Array.isArray(t.legacyAliases) && t.legacyAliases.length > 0, `${t.id} keeps legacy aliases`);
      assert.equal(getLayoutTemplate(t.id), t, "lookup returns the entry");
    }
    assert.equal(getLayoutTemplate("no-such-layout"), null, "unknown id is null, never throws");
    assert.equal(listLayoutTemplates().length, 15);
  });

  it("legacy aliases cover distinct names without collisions", () => {
    const seen = new Map();
    for (const t of LAYOUT_TEMPLATES) {
      for (const a of t.legacyAliases) {
        assert.ok(!seen.has(a), `alias ${a} claimed twice (${seen.get(a)} vs ${t.id})`);
        seen.set(a, t.id);
      }
    }
  });

  it("scene generation is deterministic under an injected id factory", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const a = buildLayoutScene(t.id, null, { slideId: "s-fixed", newId: counter() });
      const b = buildLayoutScene(t.id, null, { slideId: "s-fixed", newId: counter() });
      assert.deepEqual(a, b, `${t.id} byte-identical across builds`);
    }
  });

  it("unknown template ids throw before touching state", () => {
    assert.throws(() => buildLayoutScene("nope", null, {}), /unknown template/);
  });

  it("the registry imports nothing from the AI composition selector", () => {
    const src = readFileSync(new URL("../packages/editor/layout-templates.js", import.meta.url), "utf8");
    const imports = [...src.matchAll(/^\s*import\s[^;]+;/gm)].map((m) => m[0]);
    assert.ok(imports.every((line) => !line.includes("packages/compiler")), "no compiler import");
    assert.ok(!/\bpickFamily\b|\bselectRecipe\b|\bplanDeckComposition\b/.test(src), "no selector calls");
  });
});

describe("v2-5k skeleton validity and geometry", () => {
  const siblings = {
    empty: null,
    light: { id: "sib", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed", elements: [] },
    dark: { id: "sib", width: 13.333, height: 7.5, background: { fill: "14202E" }, layoutState: "managed", elements: [] },
  };

  for (const [label, sib] of Object.entries(siblings)) {
    it(`every skeleton validates against the Layer-C schema (${label} sibling)`, async () => {
      for (const t of LAYOUT_TEMPLATES) {
        const scene = buildLayoutScene(t.id, sib, { slideId: `s-${label}`, newId: counter() });
        const verdict = await validateScene(scene);
        assert.equal(verdict.ok, true, `${t.id}: ${verdict.errors?.join("; ")}`);
      }
    });
  }

  it("geometry is finite, positive, on-slide, with array-mirroring z ranks", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-geo", newId: counter() });
      assert.equal(scene.width, 13.333);
      assert.equal(scene.height, 7.5);
      scene.elements.forEach((el, i) => {
        for (const n of [el.x, el.y, el.w, el.h]) {
          assert.ok(Number.isFinite(n), `${t.id}/${el.id} finite`);
        }
        assert.ok(el.w > 0 && el.h > 0, `${t.id}/${el.id} positive extent`);
        assert.ok(el.x >= 0 && el.y >= 0, `${t.id}/${el.id} non-negative origin`);
        assert.ok(el.x + el.w <= 13.333 + 1e-9, `${t.id}/${el.id} inside width`);
        assert.ok(el.y + el.h <= 7.5 + 1e-9, `${t.id}/${el.id} inside height`);
        assert.equal(el.z, i, `${t.id}/${el.id} z mirrors array order`);
      });
    }
  });

  it("element ids are unique per scene and every placeholder fits its box", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-fit", newId: counter() });
      const ids = collectSceneIds(scene);
      assert.equal(new Set(ids).size, ids.length, `${t.id} ids unique`);
      for (const el of scene.elements) {
        if (el.kind === "text") {
          const est = overflowEstimate(el);
          assert.ok(!est || est.fits, `${t.id}/${el.id} placeholder fits: ${est?.message ?? ""}`);
        }
        if (el.kind === "table") {
          const est = tableOverflowEstimate(el);
          assert.ok(!est || est.fits, `${t.id}/${el.id} table fits: ${est?.message ?? ""}`);
        }
      }
    }
  });

  it("no skeleton ships locked elements or chrome-claiming identity", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-lock", newId: counter() });
      for (const el of scene.elements) {
        assert.notEqual(el.locked, true, `${t.id}/${el.id} unlocked`);
        assert.equal(isSystemChrome(el), false, `${t.id}/${el.id} never system chrome`);
        assert.equal(el.semanticRef, undefined, `${t.id}/${el.id} carries no authored ref`);
      }
    }
  });
});

describe("v2-5k theme fallback", () => {
  it("light grounds earn dark ink, dark grounds earn light ink", () => {
    const light = buildLayoutScene("title", { background: { fill: "FFFFFF" }, elements: [] }, { slideId: "s-l", newId: counter() });
    const dark = buildLayoutScene("title", { background: { fill: "101418" }, elements: [] }, { slideId: "s-d", newId: counter() });
    const inkOf = (scene) => scene.elements[0].paragraphs[0].runs[0].color;
    assert.equal(inkOf(light), "1A1A1A");
    assert.equal(inkOf(dark), "FFFFFF");
  });

  it("sibling background, typeface, and table/chart presentation carry over", async () => {
    const r = await deckRig();
    const sibling = r.doc.snapshot().scenes[1];
    const ctx = layoutContextFromSibling(sibling);
    assert.equal(ctx.background.fill, sibling.background.fill, "background sampled, never guessed");
    assert.ok(ctx.style.family, "compiler sibling lends a typeface");
    const scene = buildLayoutScene("data-table", sibling, { slideId: "s-carry", newId: counter() });
    const table = scene.elements.find((el) => el.kind === "table");
    assert.ok(table.table.layout.fontFamily, "table inherits sibling typography");
    const charted = buildLayoutScene("chart-insight", sibling, { slideId: "s-carry2", newId: counter() });
    const chart = charted.elements.find((el) => el.kind === "chart");
    assert.ok(chart.chart.labels.family, "chart inherits sibling label face");
  });

  it("translucent and ground-matching fills never become the accent", () => {
    const sibling = {
      id: "sib", width: 13.333, height: 7.5,
      background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [
        { id: "card", kind: "shape", x: 1, y: 1, w: 4, h: 3, z: 0, provenance: "compiler", shape: { form: "rect", fill: "FFFFFF" } },
        { id: "tint", kind: "shape", x: 1, y: 1, w: 4, h: 3, z: 1, provenance: "compiler", shape: { form: "rect", fill: "C05D4E", fillAlpha: 0.12 } },
        { id: "rail", kind: "shape", x: 1, y: 1, w: 0.2, h: 3, z: 2, provenance: "compiler", shape: { form: "rect", fill: "2F6F8F" } },
      ],
    };
    const ctx = layoutContextFromSibling(sibling);
    assert.equal(ctx.style.accent, "2F6F8F", "solid rail wins over tint and ground");
  });
});

describe("v2-5k ownership and lifecycle", () => {
  it("template slides are human-authored: customized, namespaced, ref-less", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-own", newId: counter() });
      assert.equal(scene.layoutState, "customized", `${t.id} born customized like element.add output`);
      assert.equal(scene.recipeId, `layout:${t.id}`, "namespaced recipe can never match a compiler family");
      assert.equal(scene.suppressed, undefined, "no tombstones at birth");
      for (const el of scene.elements) {
        assert.equal(el.provenance, "human", `${t.id}/${el.id} human-owned`);
      }
    }
  });

  it("blank slides keep their accepted behavior unchanged", async () => {
    const r = await deckRig();
    const sibling = r.doc.snapshot().scenes[0];
    const blank = blankSlide(sibling);
    assert.deepEqual(blank.elements, []);
    assert.equal(blank.layoutState, "managed");
    assert.equal(blank.recipeId, undefined, "blank carries no recipe claim");
    assert.equal(blank.background.fill, sibling.background.fill);
    assert.equal((await validateScene(blank)).ok, true);
  });
});

describe("v2-5k engine insertion", () => {
  it("unknown template ids refuse with state untouched", async () => {
    const r = await deckRig();
    const before = r.doc.snapshot();
    const res = await r.editor.insertLayoutSlide("nope");
    assert.equal(res.ok, false);
    assert.equal(r.doc.snapshot().revision, before.revision);
    assert.deepEqual(r.doc.snapshot().scenes, before.scenes);
  });

  it("insert lands after the active slide as one revision and one undo entry", async () => {
    const r = await deckRig();
    const n = r.doc.snapshot().scenes.length;
    const rev = r.doc.snapshot().revision;
    r.viewer.api.goTo(1);
    const res = await r.editor.insertLayoutSlide("title-body");
    assert.equal(res.ok, true);
    assert.equal(res.templateId, "title-body");
    const snap = r.doc.snapshot();
    assert.equal(snap.scenes.length, n + 1);
    assert.equal(snap.revision, rev + 1, "one insert is one revision");
    assert.equal(snap.scenes[2].id, res.id, "inserted directly after the active slide");
    assert.equal(snap.scenes[2].recipeId, "layout:title-body");
    await r.editor.undo();
    assert.deepEqual(r.doc.snapshot().scenes.map((s) => s.id), snap.scenes.filter((s) => s.id !== res.id).map((s) => s.id), "undo deletes the inserted slide");
    const undone = r.doc.snapshot();
    await r.editor.redo();
    const redone = r.doc.snapshot();
    assert.deepEqual(redone.scenes.find((s) => s.id === res.id), snap.scenes.find((s) => s.id === res.id), "redo restores the identical slide");
    assert.ok(redone.revision > undone.revision);
  });

  it("repeated insertion of one template never collides deck-wide", async () => {
    const r = await deckRig();
    const made = [];
    for (let i = 0; i < 3; i++) {
      const res = await r.editor.insertLayoutSlide("compare-2col");
      assert.equal(res.ok, true, `insert ${i} lands`);
      made.push(res.id);
    }
    assert.equal(new Set(made).size, 3, "distinct slide ids");
    const ids = deckIds(r.doc.snapshot().scenes);
    assert.equal(new Set(ids).size, ids.length, "deck-wide identity holds across repeats");
  });

  it("duplicate, delete, and reorder work on template slides afterward", async () => {
    const r = await deckRig();
    const res = await r.editor.insertLayoutSlide("timeline");
    assert.equal(res.ok, true);
    const dup = await r.editor.duplicateSlides([res.id]);
    assert.equal(dup.ok, true);
    assert.equal(dup.ids.length, 1);
    const scenes = r.doc.snapshot().scenes;
    const copy = scenes.find((s) => s.id === dup.ids[0]);
    assert.equal(copy.recipeId, "layout:timeline", "recipe survives duplication");
    assert.ok(copy.elements.every((el) => el.provenance === "human"), "human stays human");
    const order = r.doc.snapshot().scenes.map((s) => s.id);
    const moved = await r.editor.reorderSlide(res.id, 0);
    assert.equal(moved.ok, true);
    assert.equal(r.doc.snapshot().scenes[0].id, res.id, "reorder lands");
    const del = await r.editor.deleteSlides([dup.ids[0]]);
    assert.equal(del.ok, true);
    assert.ok(!r.doc.snapshot().scenes.some((s) => s.id === dup.ids[0]), "delete removes the copy");
    assert.deepEqual(r.doc.snapshot().scenes.map((s) => s.id).sort(), order.filter((id) => id !== dup.ids[0]).sort());
  });

  it("template ids cannot overlap AI-generated identity", async () => {
    const r = await deckRig();
    const before = new Set(deckIds(r.doc.snapshot().scenes));
    for (const t of LAYOUT_TEMPLATES) {
      const res = await r.editor.insertLayoutSlide(t.id);
      assert.equal(res.ok, true, `${t.id} inserts`);
      assert.ok(!before.has(res.id), "fresh slide id");
      before.add(res.id);
    }
    const ids = deckIds(r.doc.snapshot().scenes);
    assert.equal(new Set(ids).size, ids.length, "no identity overlaps after inserting the whole catalog");
  });
});

describe("v2-5k editability after insertion", () => {
  it("placeholder text edits through the existing text command", async () => {
    const r = await deckRig();
    const res = await r.editor.insertLayoutSlide("title");
    assert.equal(res.ok, true);
    // Snapshots are frozen; direct command proof runs on a clone
    // while the engine path itself is covered by the adapter tests.
    const slide = structuredClone(r.doc.snapshot().scenes.find((s) => s.id === res.id));
    const target = slide.elements[0];
    const before = structuredClone(target.paragraphs);
    const { applyCommand } = await import("../packages/model/commands.ts");
    const draft = structuredClone(target.paragraphs);
    draft[0].runs[0].text = "Our actual title";
    const inv = applyCommand(slide, { type: "element.updateText", id: target.id, paragraphs: draft });
    assert.equal(target.paragraphs[0].runs[0].text, "Our actual title");
    assert.ok(inv, "inverse returned for history");
    applyCommand(slide, inv);
    assert.deepEqual(target.paragraphs, before, "inverse restores wording");
  });

  it("shape fills restyle and chart/table starters edit natively", async () => {
    const r = await deckRig();
    let res = await r.editor.insertLayoutSlide("compare-2col");
    let slide = structuredClone(r.doc.snapshot().scenes.find((s) => s.id === res.id));
    const { applyCommand } = await import("../packages/model/commands.ts");
    const card = slide.elements.find((el) => el.kind === "shape");
    applyCommand(slide, { type: "element.setStyle", id: card.id, style: { fill: "123456" } });
    assert.equal(card.shape.fill, "123456");

    res = await r.editor.insertLayoutSlide("chart-insight");
    slide = structuredClone(r.doc.snapshot().scenes.find((s) => s.id === res.id));
    const chart = slide.elements.find((el) => el.kind === "chart");
    assert.equal(chart.chart.chartKind, "bar");
    assert.equal(chart.chart.series.length, 1, "single-series starter survives every boundary");
    assert.deepEqual(chart.chart.series[0].values.length, chart.chart.categories.length, "lengths agree");
    assert.ok(chart.chart.series[0].values.every(Number.isFinite), "finite starter values");
    applyCommand(slide, {
      type: "element.setChartData", id: chart.id,
      chart: { categories: ["Q1", "Q2"], series: [{ name: "Real", values: [3, 7] }] },
    });
    assert.deepEqual(chart.chart.categories, ["Q1", "Q2"]);

    res = await r.editor.insertLayoutSlide("data-table");
    slide = structuredClone(r.doc.snapshot().scenes.find((s) => s.id === res.id));
    const table = slide.elements.find((el) => el.kind === "table");
    const width = table.table.rows[0].length;
    assert.ok(table.table.rows.length >= 2 && width >= 2, "nontrivial starter matrix");
    assert.ok(table.table.rows.every((row) => row.length === width), "rectangular matrix");
    assert.equal(table.table.header, true);
    const rows = table.table.rows.map((row, i) => (i === 0 ? [...row] : [row[0], "99", row[2], row[3]]));
    applyCommand(slide, { type: "element.setTableData", id: table.id, table: { rows } });
    assert.equal(table.table.rows[1][1], "99");
  });

  it("Layers labels name every template element", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-layers", newId: counter() });
      const rows = flattenLayers(scene.elements);
      assert.equal(rows.length, scene.elements.length, `${t.id} flat catalog, no groups`);
      for (const row of rows) {
        assert.ok(row.label && row.label.trim().length > 0, `${t.id}/${row.id} labelled`);
        assert.equal(row.locked, false);
        assert.equal(row.hidden, false);
      }
    }
  });
});

describe("v2-5k previews and regeneration boundaries", () => {
  it("the preview is the authoritative scene: every text element renders by id", () => {
    for (const t of LAYOUT_TEMPLATES) {
      const scene = buildLayoutScene(t.id, null, { slideId: "s-prev", newId: counter() });
      const svg = sceneToSvg(scene);
      assert.ok(svg.includes("<svg"), `${t.id} projects`);
      for (const el of scene.elements.filter((el) => el.kind === "text")) {
        assert.ok(svg.includes(`data-el="${el.id}"`), `${t.id}/${el.id} in preview`);
        const first = el.paragraphs[0]?.runs[0]?.text ?? "";
        assert.ok(svg.includes(first.slice(0, 12)), `${t.id} preview shows authored wording`);
      }
    }
  });

  it("single-slide recompile carries human template elements as orphans", async () => {
    const design = await warmDesign();
    const unrelated = sampleDeckIntent().slides[1];
    for (const id of ["title-body", "chart-insight", "data-table"]) {
      const scene = buildLayoutScene(id, null, { slideId: "s-orphan", newId: counter() });
      const before = structuredClone(scene.elements);
      const out = recompileSlide(unrelated, structuredClone(scene), design);
      for (const el of before) {
        const kept = out.elements.find((e) => e.id === el.id);
        assert.ok(kept, `${id}/${el.id} survives recompile`);
        assert.deepEqual(
          { x: kept.x, y: kept.y, w: kept.w, h: kept.h },
          { x: el.x, y: el.y, w: el.w, h: el.h },
          `${id}/${el.id} geometry intact`,
        );
      }
    }
  });

  it("a template slide never vanishes by id overlap with generated content", async () => {
    const r = await deckRig();
    const res = await r.editor.insertLayoutSlide("key-findings");
    const slide = r.doc.snapshot().scenes.find((s) => s.id === res.id);
    assert.ok(slide.elements.length > 0);
    assert.ok(slide.elements.every((el) => el.provenance === "human" && !el.semanticRef),
      "no compiler key exists for a regen pass to join on");
  });
});

describe("v2-5k native PowerPoint fidelity", () => {
  it("a deck of template slides exports natively: count, order, charts, tables", async () => {
    const design = await warmDesign();
    const live = compileDeck(sampleDeckIntent(), design);
    let n = 0;
    const scenes = ["title", "compare-2col", "chart-insight", "data-table", "timeline"].map((id) =>
      buildLayoutScene(id, live[0], { slideId: `s-pptx-${id}`, newId: () => `h-pptx-${++n}` }));
    const issues = await preflightScenes(scenes);
    assert.deepEqual(issues, [], "safe export preflight");
    const bytes = await renderPptx(scenes, { title: "gallery" });
    const zip = await JSZip.loadAsync(bytes);
    const parts = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f)).sort();
    assert.equal(parts.length, 5, "exact slide count");
    const xml1 = await zip.files[parts[0]].async("string");
    assert.ok(xml1.includes("Presentation title"), "native title text in OOXML");
    const chartPart = Object.keys(zip.files).find((f) => f.startsWith("ppt/charts/chart"));
    assert.ok(chartPart, "native chart part emitted");
    const chartXml = await zip.files[chartPart].async("string");
    assert.ok(chartXml.includes("Example A") && chartXml.includes(">19<"), "starter categories and values in chart XML");
    const tableSlide = parts[3];
    const tableXml = await zip.files[tableSlide].async("string");
    assert.ok(tableXml.includes("<a:tbl>"), "native table preserved");
    assert.ok(tableXml.includes("Row 2"), "table starter data in OOXML");
    assert.ok(!xml1.includes("data:image"), "no flattened slide screenshots");
  });
});
