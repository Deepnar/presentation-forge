// V2-3D scene behavior: sensitivity where meaning changed, invariance
// where only rationale changed; themes preserve meaning; PPTX stays native.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { compileDeck } from "../packages/compiler/compile.js";
import { compositionSceneProjection } from "../packages/compiler/quality.ts";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { warmDesign, sampleDeckIntent } from "./v2-fixture.js";
import { listThemeNames, loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { mechanismDeck } from "./v2-mechanism-fixture.js";

const QUALITY = new URL("./fixtures/v2-quality/", import.meta.url);
const readJson = (name) => readFile(new URL(name, QUALITY), "utf8").then(JSON.parse);

describe("v2 scene counterfactual sensitivity", () => {
  it("all six structured pairs are visibly scene-sensitive", async () => {
    const design = await warmDesign();
    const pairs = (await readJson("counterfactual-structured.json")).pairs;
    const expected = await readJson("scene-composition-v2-3d-baseline.json");
    const results = {};
    for (const pair of pairs) {
      const sides = {};
      for (const side of ["a", "b"]) {
        sides[side] = compileDeck(pair[side], design).map(compositionSceneProjection);
      }
      const changed = sides.a.length !== sides.b.length ||
        sides.a.some((sa, i) => JSON.stringify(sa) !== JSON.stringify(sides.b[i]));
      results[pair.id] = { sensitive: changed, slides: sides.a.length };
      assert.equal(changed, true, `${pair.id} must differ visibly`);
    }
    assert.deepEqual(results, expected);
  });

  it("historical indifference baselines remain untouched", async () => {
    const oldScene = await readJson("baseline-structured.json");
    assert.ok(Object.values(oldScene).every((r) => r.sensitive === false));
    const oldFree = await readJson("counterfactual-baseline.json");
    assert.ok(Object.values(oldFree).every((r) => r.sensitive === false));
    const oldCompiler = await readJson("compiler-baseline.json");
    assert.ok(Array.isArray(oldCompiler) && oldCompiler.length > 0);
  });
});

describe("v2 free-text scene invariance", () => {
  it("rationale-only deltas leave scene geometry unchanged", async () => {
    const design = await warmDesign();
    const base = sampleDeckIntent();
    const varied = JSON.parse(JSON.stringify(base));
    varied.audience = "Different room";
    varied.objective = "Different goal";
    varied.narrative = "Different story";
    varied.designDirection = "Different direction";
    for (const s of varied.slides) {
      s.purpose = "Different purpose";
      s.visualDirection = "Different direction";
      s.speakerNotes = "Different notes";
    }
    const a = compileDeck(base, design).map(compositionSceneProjection);
    const b = compileDeck(varied, design).map(compositionSceneProjection);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

describe("v2 theme scene invariance", () => {
  it("five themes preserve semantic meaning", async () => {
    const intent = sampleDeckIntent();
    const required = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
    const available = new Set(await listThemeNames());
    for (const name of required) assert.ok(available.has(name), `representative theme missing: ${name}`);
    let first = null;
    for (const name of required) {
      const design = normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
      const projection = compileDeck(intent, design).map(semanticProjection);
      if (!first) first = projection;
      else assert.equal(JSON.stringify(projection), JSON.stringify(first), `theme ${name} changed meaning`);
    }
    assert.ok(first);
  });
});

describe("v2 mechanism PPTX nativeness", () => {
  it("mechanism scenes export as native editable elements", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(mechanismDeck(), design);
    const bytes = await renderPptx(scenes);
    assert.ok(bytes instanceof Uint8Array && bytes.length > 0);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    assert.equal(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, scenes.length);
    let slideXml = "";
    for (const n of names.filter((s) => /^ppt\/slides\/slide\d+\.xml$/.test(s))) {
      slideXml += await zip.files[n].async("string");
    }
    assert.match(slideXml, /Liquid|Opening|Figure|12\.5/);
    const charts = names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(charts.length >= 1, "chart family exports a chart part");
    assert.ok(slideXml.includes("<a:tbl>"), "table family exports a native table");
  });
});
