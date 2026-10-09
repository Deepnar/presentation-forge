// V2-3F-3: content-aware vertical rhythm. Sparse frameless text
// recenters inside its allocated region BEFORE fitting; dense
// regions, frames, titles, takeaways, caveats, badges, captions,
// stats, images, charts, and tables keep byte-identical geometry.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeckDetailed } from "../packages/compiler/compile.js";
import { compilePlannedSlide } from "../packages/compiler/mechanisms.ts";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { checkSceneGeometry, checkElementIds } from "../packages/core/scene-quality.ts";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { warmDesign } from "./v2-fixture.js";
import { benchmarkIntents } from "./v2-benchmark-intents.js";
import { benchmarkChrome } from "../tools/v2-benchmark.mjs";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { floorOf } from "../packages/core/fit.ts";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name) {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
}

function textOf(el) {
  return (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
}

describe("v2-3f-3 sparse distribution", () => {
  it("research-defense sparse list recenters with text intact and no new diagnostics", async () => {
    const design = await warmDesign();
    const intent = benchmarkIntents()["research-defense"];
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const list = scenes.find((s) => s.id === "rd-problem")
      .elements.find((e) => e.semanticRef === "rd-problem-b1");
    // Before: y=1.77 h=4.41 (full region, 19% fill). After: centered.
    assert.ok(Math.abs(list.y - 1.77) > 0.5, `list moved down from top anchor, y=${list.y}`);
    assert.ok(list.h < 4.41, `list box shrank to content, h=${list.h}`);
    assert.ok(Math.abs(list.y - 3.43) < 0.05 && Math.abs(list.h - 1.09) < 0.05, `centered geometry pinned, y=${list.y} h=${list.h}`);
    assert.ok(textOf(list).includes("Flammable organic solvents"), "text exact");
    assert.ok(list.paragraphs.every((p) => p.runs.every((r) => r.size === 13)), "nominal sizes, no shrink");
    assert.deepEqual(fitDiagnostics, [], "no artificial diagnostics from centering");
  });

  it("divider subtitle and standard framed prose center; framed cards do not", async () => {
    const design = await warmDesign();
    const intent = benchmarkIntents()["research-defense"];
    const { scenes } = compileDeckDetailed(intent, design);
    const sub = scenes.find((s) => s.id === "rd-open")
      .elements.find((e) => e.semanticRef === "rd-open-b1");
    assert.ok(Math.abs(sub.y - 4.81) < 0.05 && Math.abs(sub.h - 0.53) < 0.05, `subtitle centered, y=${sub.y} h=${sub.h}`);
    const framed = scenes.find((s) => s.id === "rd-limit")
      .elements.find((e) => e.kind === "text" && e.semanticRef === "rd-limit-b1");
    assert.ok(Math.abs(framed.y - 1.97) < 0.01 && Math.abs(framed.h - 3.56) < 0.01, "bordered card keeps full-region geometry");
    const caveat = scenes.find((s) => s.id === "rd-limit")
      .elements.find((e) => e.id === "rd-limit:rd-limit-b1:caveat");
    assert.ok(Math.abs(caveat.y - 5.58) < 0.01 && Math.abs(caveat.h - 0.35) < 0.01, "caveat stays at region bottom");
    const takeaway = scenes.find((s) => s.id === "rd-close")
      .elements.find((e) => e.id === "rd-close:takeaway:headline");
    assert.ok(Math.abs(takeaway.y - 1.77) < 0.01 && Math.abs(takeaway.h - 0.70) < 0.01, "takeaway reservation honored");
  });

  it("framed-prose standard text centers while verdict card geometry holds", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "voice", title: "Voice", rhetoricalRole: "evidence",
        blocks: [{ id: "q1", kind: "quote", text: "Someone said this briefly." }],
        takeaway: "Voices carry weight",
      }],
    };
    const { scenes, plan } = compileDeckDetailed(intent, design);
    assert.equal(plan.slides[0].family, "framed-prose");
    const body = scenes[0].elements.find((e) => e.semanticRef === "q1");
    assert.ok(Math.abs(body.y - 3.39) < 0.05 && Math.abs(body.h - 0.53) < 0.05, `standard prose centered, y=${body.y} h=${body.h}`);
    const note = scenes[0].elements.find((e) => e.id === "s1:takeaway:annotation");
    assert.ok(Math.abs(note.y - 5.83) < 0.01, "annotation reservation honored");
  });

  it("stats keep tile geometry under the sparse flag", async () => {
    const design = await warmDesign();
    const { compilePlannedSlide: cps } = await import("../packages/compiler/mechanisms.ts");
    const scene = cps(
      { id: "x1", purpose: "carry", title: "Carry", blocks: [{ id: "e1", kind: "stat", value: "7", label: "seven" }] },
      {
        slideId: "x1", family: "escape", variantKey: "escape/standard", densityClass: "standard",
        emphasisTargets: [], mediaTreatment: "none", outcomeTreatments: [], caveatTargets: [],
        takeawayTreatment: "none", breaks: { sectionOpen: false }, selectionBasis: "fallback",
      },
      design,
    );
    const stat = scene.elements.find((e) => e.semanticRef === "e1");
    assert.ok(Math.abs(stat.y - 1.77) < 0.01 && Math.abs(stat.h - 4.46) < 0.01, "stat tile keeps full region");
  });

  it("dense content keeps byte-identical full-region geometry", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "dense list", title: "Dense",
        blocks: [{ id: "b1", kind: "list", items: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"] }],
      }],
    };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const el = scenes[0].elements.find((e) => e.semanticRef === "b1");
    assert.ok(Math.abs(el.y - 1.77) < 0.01 && Math.abs(el.h - 4.41) < 0.01, `dense box unmoved, y=${el.y} h=${el.h}`);
    assert.ok(el.paragraphs.every((p) => p.runs.every((r) => r.size === 13)), "nominal sizes");
    assert.deepEqual(fitDiagnostics, [], "no diagnostics on dense content");
    const again = compileDeckDetailed(intent, design).scenes;
    assert.equal(JSON.stringify(again), JSON.stringify(scenes), "deterministic");
  });
});

describe("v2-3f-3 invariants under redistribution", () => {
  it("no duplicate IDs, no footer intrusion, geometry in canvas", async () => {
    const intents = benchmarkIntents();
    const design = await warmDesign();
    for (const benchId of Object.keys(intents)) {
      const intent = intents[benchId];
      for (const chrome of [null, benchmarkChrome(intent, design)]) {
        const { scenes, findings } = await analyzeDeck(intent, design, chrome);
        assert.deepEqual(findings.filter((f) => f.code === "duplicate-element-id"), [], `${benchId}: unique IDs`);
        assert.deepEqual(findings.filter((f) => f.code === "chrome-band-overlap"), [], `${benchId}: footer band clear`);
        for (const scene of scenes) {
          assert.deepEqual(checkSceneGeometry(scene), [], `${benchId}/${scene.id}: in canvas`);
          assert.deepEqual(checkElementIds(scene), [], `${benchId}/${scene.id}: unique IDs`);
        }
      }
    }
  });

  it("authored blocks all represented, theme semantics invariant", async () => {
    const intents = benchmarkIntents();
    for (const benchId of Object.keys(intents)) {
      let first = null;
      for (const themeName of THEMES) {
        const design = await themeDesign(themeName);
        const { scenes } = compileDeckDetailed(intents[benchId], design);
        const byId = new Map(scenes.map((s) => [s.id, s]));
        for (const slide of intents[benchId].slides) {
          const refs = new Set();
          const walk = (els) => {
            for (const el of els ?? []) {
              if (el.semanticRef) refs.add(el.semanticRef);
              walk(el.group?.children ?? []);
            }
          };
          walk(byId.get(slide.id)?.elements);
          for (const b of slide.blocks) {
            assert.ok(refs.has(b.id), `${benchId}/${themeName}: block ${slide.id}/${b.id} represented`);
          }
        }
        const proj = JSON.stringify(scenes.map(semanticProjection));
        if (first === null) first = proj;
        else assert.equal(proj, first, `${benchId}: theme ${themeName} changed semantics`);
      }
    }
  });

  it("no run crosses its effective floor on redistributed decks", async () => {
    const intents = benchmarkIntents();
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed(intents["research-defense"], design);
    assert.deepEqual(fitDiagnostics, [], "research-defense stays diagnostic-free");
    for (const scene of scenes) {
      for (const el of scene.elements) {
        if (el.kind !== "text") continue;
        for (const p of el.paragraphs ?? []) {
          for (const r of p.runs) {
            if (!r.role) continue;
            const nominal = design.roles[r.role]?.size ?? r.size;
            const roleFloor = floorOf({ size: nominal, _role: r.role });
            const eff = roleFloor == null ? Infinity : Math.min(roleFloor, nominal);
            assert.ok((r.size ?? 0) >= eff - 1e-9, `${scene.id}/${el.id}: floor holds`);
          }
        }
      }
    }
  });
});
