// V2-3D correction: semantic treatments must never obscure carriers,
// caveats own reserved space, and fallback/callout paths keep full semantics.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { validateScene } from "../packages/model/scene.ts";
import { checkSceneGeometry } from "../packages/core/scene-quality.ts";
import { warmDesign } from "./v2-fixture.js";

const deck = (slides) => ({ id: "d", title: "D", slides });
const slide = (blocks, extra = {}) => ({ id: "s1", purpose: "p", title: "T", blocks, ...extra });

async function compile(slides) {
  const design = await warmDesign();
  return { design, scenes: compileDeckDetailed(deck(slides), design).scenes };
}

function primaryOf(scene, blockId) {
  return scene.elements.find((e) => e.id === `s1:${blockId}:content`);
}

describe("v2 tone non-occlusion", () => {
  it("cautionary rail occupies only a narrow edge band", async () => {
    const { scenes } = await compile([slide([
      { id: "b1", kind: "text", label: "F", text: "Bad news", emphasis: "primary", outcome: "unfavorable" },
    ])]);
    const [scene] = scenes;
    const primary = primaryOf(scene, "b1");
    const rail = scene.elements.find((e) => e.id === "s1:b1:tone");
    assert.ok(primary && rail, "both carrier and treatment exist");
    assert.ok(rail.w <= 0.15, `rail is narrow: ${rail.w}`);
    assert.ok(rail.x <= primary.x + 0.001, "rail sits at the content edge");
    assert.ok(rail.w < primary.w, "rail cannot cover the carrier");
    const v = await validateScene(scene);
    assert.equal(v.ok, true, v.errors.join("; "));
    assert.deepEqual(checkSceneGeometry(scene), []);
  });

  it("no full-area overlay can silently return", async () => {
    const decks = [
      [slide([{ id: "b1", kind: "text", label: "F", text: "Bad news", emphasis: "primary", outcome: "unfavorable" }])],
      [{
        ...slide([
          { id: "b1", kind: "text", label: "F", text: "Bad news", emphasis: "primary", outcome: "unfavorable" },
          { id: "b2", kind: "text", label: "G", text: "More news", emphasis: "primary", outcome: "unfavorable" },
        ]),
        relationship: "comparison",
      }],
    ];
    for (const slides of decks) {
      const { scenes } = await compile(slides);
      for (const scene of scenes) {
        for (const el of scene.elements) {
          if (!el.id.endsWith(":tone")) continue;
          const carrier = scene.elements.find((e) => e.id === el.id.replace(/:tone$/, ":content"));
          assert.ok(carrier, "every tone marker has a carrier");
          assert.ok(el.w < carrier.w && el.h <= carrier.h + 0.001, "marker is strictly smaller than its carrier");
        }
      }
    }
  });
});

describe("v2 cross-kind treatment matrix", () => {
  const unfavorable = (id, block) => ({ ...block, id, emphasis: "primary", outcome: "unfavorable" });
  const inconclusive = (id, block) => ({ ...block, id, uncertainty: "inconclusive" });
  const CASES = [
    ["text", { kind: "text", label: "T", text: "words" }],
    ["stat", { kind: "stat", value: "9", label: "nine" }],
    ["chart", { kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }],
    ["table", { kind: "table", rows: [["a"]], header: false }],
    ["image", { kind: "image", src: "", alt: "alt" }],
    ["callout", { kind: "callout", text: "note" }],
  ];

  it("unfavorable blocks keep carriers and gain visible treatment", async () => {
    for (const [name, shape] of CASES) {
      const { scenes } = await compile([slide([unfavorable("b1", shape)])]);
      const [scene] = scenes;
      assert.ok(primaryOf(scene, "b1"), `${name}: carrier survives`);
      assert.ok(scene.elements.some((e) => e.id === "s1:b1:tone"), `${name}: tone visible`);
      assert.deepEqual(checkSceneGeometry(scene), [], `${name}: geometry valid`);
    }
  });

  it("chart fallback keeps outcome, uncertainty, values, and unit", async () => {
    const { scenes } = await compile([slide([{
      id: "ch", kind: "chart", categories: ["A", "B"], series: [{ name: "n", values: [12.5, 3.25] }],
      measure: "distribution", emphasis: "primary", outcome: "unfavorable",
      uncertainty: "inconclusive", unit: "ms",
    }])]);
    const [scene] = scenes;
    assert.ok(!scene.elements.some((e) => e.kind === "chart"), "no fake chart");
    const table = primaryOf(scene, "ch");
    assert.equal(table.kind, "table");
    assert.deepEqual(table.table.rows, [["", "n"], ["A", "12.5"], ["B", "3.25"]]);
    assert.ok(scene.elements.some((e) => e.id === "s1:ch:tone"), "cautionary treatment");
    const caveat = scene.elements.find((e) => e.id === "s1:ch:caveat");
    assert.ok(caveat && JSON.stringify(caveat).includes("INCONCLUSIVE"));
    assert.ok(JSON.stringify(scene.elements).includes("Unit: ms"));
  });

  it("inconclusive blocks are caveated across kinds", async () => {
    const kinds = [
      ["text", { kind: "text", label: "T", text: "words" }],
      ["chart", { kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }],
      ["table", { kind: "table", rows: [["a"]], header: false }],
      ["image", { kind: "image", src: "", alt: "alt" }],
    ];
    for (const [name, shape] of kinds) {
      const { scenes } = await compile([slide([inconclusive("b1", shape)])]);
      const [scene] = scenes;
      assert.ok(primaryOf(scene, "b1"), `${name}: carrier survives`);
      const caveat = scene.elements.find((e) => e.id === "s1:b1:caveat");
      assert.ok(caveat, `${name}: caveat visible`);
      assert.ok(JSON.stringify(caveat).includes("INCONCLUSIVE"));
    }
  });

  it("comparison callout keeps verdict styling plus outcome and uncertainty", async () => {
    const { scenes } = await compile([{
      ...slide([
        { id: "l", kind: "text", label: "L", text: "left" },
        { id: "r", kind: "text", label: "R", text: "right" },
        { id: "v", kind: "callout", text: "Watch out", outcome: "unfavorable", uncertainty: "inconclusive" },
      ]),
      relationship: "comparison",
    }]);
    const [scene] = scenes;
    assert.ok(primaryOf(scene, "v"), "callout carrier survives");
    assert.ok(scene.elements.some((e) => e.id === "s1:v:rule"), "verdict rule kept");
    assert.ok(scene.elements.some((e) => e.id === "s1:v:tone"), "cautionary treatment kept");
    const caveat = scene.elements.find((e) => e.id === "s1:v:caveat");
    assert.ok(caveat && JSON.stringify(caveat).includes("INCONCLUSIVE"));
  });
});

describe("v2 caveat allocation", () => {
  it("a caveat owns space the next block does not reuse", async () => {
    const { scenes } = await compile([slide([
      { id: "b1", kind: "text", label: "First", text: "words here", uncertainty: "inconclusive" },
      { id: "b2", kind: "list", items: ["more", "words", "here", "now"] },
    ])]);
    const [scene] = scenes;
    assert.equal(scene.recipeId, "prose-list");
    const caveat = scene.elements.find((e) => e.id === "s1:b1:caveat");
    const next = primaryOf(scene, "b2");
    assert.ok(caveat && next);
    assert.ok(next.y >= caveat.y + caveat.h - 0.001, "next block starts outside the caveat region");
    assert.deepEqual(checkSceneGeometry(scene), []);
    assert.ok(primaryOf(scene, "b1") && primaryOf(scene, "b2"), "both semanticRefs survive");
  });
});

describe("v2 treatment PPTX regression", () => {
  it("cautionary scenes export native carriers with non-covering treatment", async () => {
    const { scenes } = await compile([slide([
      { id: "b1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], emphasis: "primary", outcome: "unfavorable", uncertainty: "inconclusive" },
    ])]);
    const bytes = await renderPptx(scenes);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    assert.ok(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), "chart part present");
    let xml = "";
    for (const n of names.filter((s) => /^ppt\/slides\/slide\d+\.xml$/.test(s))) {
      xml += await zip.files[n].async("string");
    }
    assert.match(xml, /INCONCLUSIVE/);
    assert.ok(!names.some((n) => /^ppt\/media\/image/.test(n)), "no rasterized fallback images");
  });
});
