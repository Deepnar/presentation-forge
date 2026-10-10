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

  it("compiler output matches the checked-in V2-3D byte baseline", async () => {
    // V2-3E-1 legitimately extends every text element with resolved
    // typography (role/family/weight/tracking/line/transform),
    // fitted sizes, and compiler fit policy. V2-3F-3 legitimately
    // recenters sparse frameless text inside its allocated region
    // (y/h only). V2-3F-7 legitimately resizes comparison cards to
    // measured demand (frames keep x/y/w, height follows content)
    // and lets support boxes hug their demand below the sides. The
    // historical file stays byte-identical; this compares the V2-3D
    // shape with the sanctioned additions stripped or scoped,
    // proving nothing else moved: element IDs, order, kinds, text,
    // and fitted sizes must match exactly, and any geometry delta
    // must be a text box strictly contained in its historical box
    // (centering), a comparison frame resizing in place with its
    // carrier contained, or a support box following the sides
    // inside the content region — never an expansion or move of
    // anything else.
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const sortKeys = (value) => {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((k) => {
          if (["role", "family", "weight", "tracking", "transform", "fitPolicy"].includes(k)) return [k, undefined];
          if ((k === "line" || k === "size") && typeof value[k] === "number") return [k, undefined];
          return [k, sortKeys(value[k])];
        }).filter(([, v]) => v !== undefined));
      }
      return value;
    };
    const expected = await readJson("compiler-v2-3d-baseline.json");
    const actual = sortKeys(scenes);
    const want = sortKeys(expected);
    assert.equal(actual.length, want.length, "same slide count");
    const intent = sampleDeckIntent();
    const supportRefs = new Set(
      intent.slides.flatMap((s) => s.blocks.filter((b) => b.kind !== "text").map((b) => b.id)),
    );
    actual.forEach((scene, i) => {
      assert.equal(scene.id, want[i].id, "same slide");
      assert.deepEqual(
        scene.elements.map((e) => e.id),
        want[i].elements.map((e) => e.id),
        `${scene.id}: same element IDs in the same order`,
      );
      const title = scene.elements.find((e) => /:title:heading$/.test(e.id));
      const regionTop = title ? title.y + title.h + 0.15 : -Infinity;
      const byId = new Map(want[i].elements.map((e) => [e.id, e]));
      const inside = (inner, outer) =>
        inner.x >= outer.x - 1e-9 && inner.y >= outer.y - 1e-9 &&
        inner.x + inner.w <= outer.x + outer.w + 1e-9 &&
        inner.y + inner.h <= outer.y + outer.h + 1e-9;
      for (const el of scene.elements) {
        const prev = byId.get(el.id);
        if (JSON.stringify(el) === JSON.stringify(prev)) continue;
        if (el.kind === "chart") {
          // V2-3F-8 resolves chart label typography once in Layer C:
          // the element may gain exactly the labels contract.
          // Family/size ride this test's stripped typography channel
          // like all resolved type, so the allowance pins the color
          // (the full contract is pinned in test/v2-internal-3f8).
          // Data, geometry, and everything else stay identical.
          const { labels, ...elRest } = el.chart;
          const { labels: prevLabels, ...prevRest } = prev.chart ?? {};
          assert.equal(prevLabels, undefined, `${scene.id}/${el.id}: historical charts carry no labels`);
          assert.deepEqual(elRest, prevRest, `${scene.id}/${el.id}: only the labels contract is added`);
          assert.deepEqual(labels, {
            color: design.palette.inkMuted.hex,
          }, `${scene.id}/${el.id}: labels resolve muted ink`);
          continue;
        }
        if (scene.recipeId === "comparison" && el.kind === "shape" && /:frame$/.test(el.id)) {
          // Capacity-sized card: same position and width, height
          // follows measured demand, carrier contained inside.
          assert.equal(el.x, prev.x, `${scene.id}/${el.id}: frame never moves horizontally`);
          assert.equal(el.y, prev.y, `${scene.id}/${el.id}: frame never moves vertically`);
          assert.equal(el.w, prev.w, `${scene.id}/${el.id}: frame never changes width`);
          assert.ok(el.h > 0, `${scene.id}/${el.id}: frame keeps positive height`);
          const carrier = scene.elements.find((e) => e.id === el.id.replace(/:frame$/, ":content"));
          assert.ok(carrier && inside(carrier, el), `${scene.id}/${el.id}: carrier contained in frame`);
          continue;
        }
        if (scene.recipeId === "comparison" && el.semanticRef !== undefined && supportRefs.has(el.semanticRef)) {
          // Support follows the sides: same x and width, inside the
          // content region below the title.
          assert.equal(el.x, prev.x, `${scene.id}/${el.id}: support never moves horizontally`);
          assert.equal(el.w, prev.w, `${scene.id}/${el.id}: support never changes width`);
          assert.ok(el.h > 0, `${scene.id}/${el.id}: support keeps positive height`);
          assert.ok(el.y >= regionTop - 1e-9, `${scene.id}/${el.id}: support stays below the title`);
          continue;
        }
        assert.equal(el.kind, "text", `${scene.id}/${el.id}: only text boxes may move`);
        const { x, y, w, h, ...rest } = el;
        const { x: px, y: py, w: pw, h: ph, ...prevRest } = prev;
        assert.deepEqual(rest, prevRest, `${scene.id}/${el.id}: only geometry may differ`);
        assert.ok(x === px && w === pw, `${scene.id}/${el.id}: centering never widens or shifts horizontally`);
        assert.ok(y >= py - 1e-9 && y + h <= py + ph + 1e-9 && h <= ph,
          `${scene.id}/${el.id}: centered box stays inside its historical box`);
      }
    });
  });

  it("quality analysis is deterministic", async () => {
    const design = await warmDesign();
    const a = await analyzeDeck(sampleDeckIntent(), design);
    const b = await analyzeDeck(sampleDeckIntent(), design);
    assert.equal(JSON.stringify(a.findings), JSON.stringify(b.findings));
  });
});

describe("v2 silent-loss detection", () => {
  it("stat, table, and quote blocks are all represented", async () => {
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
    const loss = findings.filter((f) => f.code === "unrepresented-block");
    assert.deepEqual(loss, []);
  });

  it("mixed comparison blocks all survive", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "compare", title: "Compare",
      blocks: [
        { id: "l", kind: "text", label: "L", text: "left" },
        { id: "r", kind: "text", label: "R", text: "right" },
        { id: "extra", kind: "list", items: ["kept", "visibly", "here", "now"] },
      ],
      layoutHint: { recipe: "comparison" },
    };
    const [scene] = compileDeck({ id: "d", title: "D", slides: [slide] }, design);
    const findings = checkBlockRepresentation(slide, scene);
    assert.deepEqual(findings, []);
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
  it("historical indifference record is preserved and transition explained", async () => {
    // counterfactual-baseline.json is the V2-3A record: the old compiler
    // ignored takeaways, so all pairs were indifferent. V2-3D renders
    // takeaways, so pairs differing ONLY in takeaway text now differ by
    // exactly the takeaway element — nothing else.
    const historical = await readJson("counterfactual-baseline.json");
    assert.ok(Object.values(historical).every((r) => r.sensitive === false));
    const design = await warmDesign();
    const { pairs } = await readJson("counterfactual-pairs.json");
    for (const pair of pairs) {
      const a = compileDeck(pair.a, design).map(semanticProjection);
      const b = compileDeck(pair.b, design).map(semanticProjection);
      const same = JSON.stringify(a) === JSON.stringify(b);
      const onlyTakeaway = (ea, eb) => {
        if (ea.length !== eb.length) return false;
        const diffs = ea.filter((e, i) => JSON.stringify(e) !== JSON.stringify(eb[i]));
        return diffs.length > 0 && diffs.every((e) => e.id.endsWith(":takeaway:annotation"));
      };
      if (pair.id === "strong-vs-misses-target" || pair.id === "primary-vs-minor") {
        assert.ok(!same && onlyTakeaway(a[0].elements, b[0].elements), `${pair.id}: only takeaway elements may differ`);
      } else {
        assert.ok(same, `${pair.id} must remain scene-indifferent`);
      }
    }
  });
});

describe("v2 structured counterfactual baseline", () => {
  it("records structured scene sensitivity explicitly", async () => {
    const design = await warmDesign();
    const { pairs } = await readJson("counterfactual-structured.json");
    const expected = await readJson("scene-composition-v2-3d-baseline.json");
    const { compositionSceneProjection } = await import("../packages/compiler/quality.ts");
    const { compileDeck: compile } = await import("../packages/compiler/compile.js");
    const results = {};
    for (const pair of pairs) {
      const sides = {};
      for (const side of ["a", "b"]) {
        sides[side] = compile(pair[side], design).map(compositionSceneProjection);
      }
      const changed = sides.a.length !== sides.b.length ||
        sides.a.some((sa, i) => JSON.stringify(sa) !== JSON.stringify(sides.b[i]));
      results[pair.id] = { sensitive: changed, slides: sides.a.length };
      assert.equal(changed, true, `${pair.id} must differ visibly in V2-3D`);
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
