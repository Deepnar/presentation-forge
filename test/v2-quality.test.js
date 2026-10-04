// V2-3A: deterministic quality measurement. These tests prove the
// harness detects weakness; they do NOT fix the compiler. Indifference
// baselines are recorded evidence, never requirements.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  analyzeDeck,
  compareSensitivity,
  checkBlockRepresentation,
} from "../packages/compiler/quality.ts";
import { compileDeck } from "../packages/compiler/compile.js";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { listThemeNames, loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

const QUALITY = new URL("./fixtures/v2-quality/", import.meta.url);
const readJson = (name) => readFile(new URL(name, QUALITY), "utf8").then(JSON.parse);

describe("v2 quality baseline", () => {
  it("the six-recipe fixture passes all L1 checks", async () => {
    const design = await warmDesign();
    const { findings } = await analyzeDeck(sampleDeckIntent(), design);
    assert.deepEqual(findings, []);
  });

  it("compiler output matches the checked-in byte baseline", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const expected = await readJson("compiler-baseline.json");
    assert.equal(JSON.stringify(scenes), JSON.stringify(expected));
  });

  it("quality analysis is deterministic", async () => {
    const design = await warmDesign();
    const a = await analyzeDeck(sampleDeckIntent(), design);
    const b = await analyzeDeck(sampleDeckIntent(), design);
    assert.equal(JSON.stringify(a.findings), JSON.stringify(b.findings));
  });
});

describe("v2 silent-loss detection", () => {
  it("unsupported stat, table, and quote blocks are reported, not fixed", async () => {
    const design = await warmDesign();
    const { findings } = await analyzeDeck({
      id: "loss", title: "Loss",
      slides: [
        {
          id: "s1", purpose: "show a figure", title: "Figure",
          blocks: [{ id: "st1", kind: "stat", value: "12.5", label: "mS/cm" }],
        },
        {
          id: "s2", purpose: "show a grid", title: "Grid",
          blocks: [{ id: "tb1", kind: "table", rows: [["a", "b"]], header: true }],
        },
        {
          id: "s3", purpose: "voice a claim", title: "Voice",
          blocks: [{ id: "q1", kind: "quote", text: "Someone said this." }],
        },
      ],
    }, design);
    const loss = findings.filter((f) => f.code === "unrepresented-block").map((f) => f.blockIds[0]).sort();
    assert.deepEqual(loss, ["q1", "st1", "tb1"]);
  });

  it("recipe/block combinations that ignore blocks are reported", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "compare", title: "Compare",
      blocks: [
        { id: "l", kind: "text", label: "L", text: "left" },
        { id: "r", kind: "text", label: "R", text: "right" },
        { id: "extra", kind: "list", items: ["dropped", "silently", "here", "now"] },
      ],
      layoutHint: { recipe: "comparison" },
    };
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    const findings = checkBlockRepresentation(slide, scene);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].blockIds[0], "extra");
  });
});

describe("v2 geometry and identity checks", () => {
  it("off-canvas elements are reported, edge-seated elements pass", async () => {
    const { checkSceneGeometry } = await import("../packages/core/scene-quality.ts");
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "T",
      blocks: [{ id: "b1", kind: "list", items: ["a", "b", "c", "d"] }],
    };
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    assert.ok(!checkSceneGeometry(scene).some((f) => f.code === "off-canvas"));
    const moved = JSON.parse(JSON.stringify(scene));
    moved.elements[1].x = 99;
    assert.ok(checkSceneGeometry(moved).some((f) => f.code === "off-canvas"));
  });

  it("duplicate scene ids are reported", async () => {
    const { checkElementIds } = await import("../packages/core/scene-quality.ts");
    const design = await warmDesign();
    const [scene] = compileDeck(sampleDeckIntent(), design);
    const duped = JSON.parse(JSON.stringify(scene));
    duped.elements.push({ ...duped.elements[0] });
    assert.equal(checkElementIds(scene).length, 0);
    assert.equal(checkElementIds(duped).length, 1);
    assert.equal(checkElementIds(duped)[0].code, "duplicate-element-id");
  });

  it("matching charts pass, mutated data is reported", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "T",
      blocks: [{ id: "c1", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }] }],
    };
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    const { checkChartFidelity } = await import("../packages/compiler/quality.ts");
    assert.equal(checkChartFidelity(slide, scene).length, 0);
    const mutated = JSON.parse(JSON.stringify(slide));
    mutated.blocks[0].series[0].values = [2];
    assert.equal(checkChartFidelity(mutated, scene).length, 1);
    assert.equal(checkChartFidelity(mutated, scene)[0].code, "chart-data-divergence");
  });
});

describe("v2 counterfactual baseline", () => {
  it("records current compiler indifference explicitly", async () => {
    const design = await warmDesign();
    const { pairs } = await readJson("counterfactual-pairs.json");
    const expected = await readJson("counterfactual-baseline.json");
    const results = {};
    for (const pair of pairs) {
      const r = compareSensitivity(pair.id, pair.a, pair.b, design);
      results[pair.id] = r;
    }
    assert.deepEqual(results, expected);
  });
});

describe("v2 structured counterfactual baseline", () => {
  it("records structured-semantic indifference explicitly", async () => {
    const design = await warmDesign();
    const { pairs } = await readJson("counterfactual-structured.json");
    const expected = await readJson("baseline-structured.json");
    const results = {};
    const { compareSensitivity } = await import("../packages/compiler/quality.ts");
    const { validateDeckIntent } = await import("../packages/model/intent.ts");
    for (const pair of pairs) {
      for (const side of [pair.a, pair.b]) {
        const v = await validateDeckIntent(side);
        assert.equal(v.ok, true, `${pair.id}: ${v.errors.join("\n")}`);
      }
      results[pair.id] = compareSensitivity(pair.id, pair.a, pair.b, design);
    }
    assert.deepEqual(results, expected);
  });
});

describe("v2 theme invariance", () => {
  it("semantic projection is preserved across representative themes", async () => {
    const intent = sampleDeckIntent();
    const required = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
    const available = new Set(await listThemeNames());
    for (const name of required) {
      assert.ok(available.has(name), `representative theme missing: ${name}`);
    }
    let first = null;
    for (const name of required) {
      const theme = await loadThemeDocument(name);
      const design = normalizeDesign({ theme, mode: "light" });
      const projection = compileDeck(intent, design).map(semanticProjection);
      if (!first) first = projection;
      else assert.equal(JSON.stringify(projection), JSON.stringify(first), `theme ${name} changed semantics`);
    }
    assert.ok(first);
  });
});
