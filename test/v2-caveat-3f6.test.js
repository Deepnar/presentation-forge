// V2-3F-6: semantically attached caveats. An uncertainty caveat
// qualifies a specific authored block, so on a centered frameless
// carrier it follows the carrier (bottom + 0.1 gap) instead of
// stranding at the region bottom. Dense, framed, table, and custom
// carriers keep the historical region-bottom band by design.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { validateScene } from "../packages/model/scene.ts";
import { applyCommand } from "../packages/model/commands.ts";
import { planDeckComposition } from "../packages/compiler/composition.ts";
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

function carrierAndCaveat(scene, blockId) {
  const carrier = scene.elements.find((e) => e.kind === "text" && e.semanticRef === blockId);
  const caveat = scene.elements.find((e) => e.id.endsWith(`:${blockId}:caveat`));
  assert.ok(carrier, `carrier for ${blockId} exists`);
  assert.ok(caveat, `caveat for ${blockId} exists`);
  return { carrier, caveat };
}

function textOf(el) {
  return (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
}

describe("v2-3f-6 attached caveats", () => {
  it("sparse text + uncertainty: caveat follows the carrier", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "short evidence", title: "Finding",
        blocks: [{ id: "b1", kind: "text", label: "Result", text: "Short evidence text.", uncertainty: "qualified" }],
      }],
    };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
    assert.ok(carrier.y > 1.77, `carrier centered, y=${carrier.y}`);
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, `caveat attached, gap=${caveat.y - carrier.y - carrier.h}`);
    assert.equal(caveat.x, carrier.x, "caveat left-aligned with carrier");
    assert.equal(caveat.w, carrier.w, "caveat spans carrier width");
    assert.equal(textOf(caveat), "QUALIFIED", "exact authored label");
    assert.deepEqual(fitDiagnostics, [], "no new fit diagnostics");
    assert.deepEqual(checkElementIds(scenes[0]), []);
    assert.deepEqual(checkSceneGeometry(scenes[0]), []);
  });

  it("sparse list + uncertainty: caveat follows the carrier", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "short list", title: "Points",
        blocks: [{ id: "b1", kind: "list", items: ["Alpha", "Beta"], uncertainty: "inconclusive" }],
      }],
    };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "attached with exact gap");
    assert.equal(textOf(caveat), "INCONCLUSIVE");
    assert.deepEqual(fitDiagnostics, []);
    assert.deepEqual(checkElementIds(scenes[0]), []);
  });

  it("short quotation + uncertainty: caveat stays with its source", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "voice", title: "Voice", rhetoricalRole: "context",
        blocks: [{ id: "b1", kind: "quote", text: "A brief quoted line.", uncertainty: "contested" }],
      }],
    };
    const { scenes } = compileDeckDetailed(intent, design);
    const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "attached to the quote");
    assert.equal(textOf(caveat), "CONTESTED");
    assert.ok(textOf(carrier).includes("A brief quoted line."), "source text intact");
  });

  it("dense carrier + uncertainty: no new collision, placement preserved", async () => {
    const design = await warmDesign();
    // Genuinely overflowing text: the region stays full and the
    // honest floor-hit fires, exactly as without uncertainty.
    const text = `A long evidence paragraph that fills its region. ${"Supporting detail with enough words to wrap. ".repeat(30).trim()}`;
    const mkSlide = (uncertainty) => ({
      id: "s1", purpose: "long evidence", title: "Finding",
      blocks: [{ id: "b1", kind: "text", label: "Result", text, ...(uncertainty ? { uncertainty } : {}) }],
    });
    const mkIntent = (uncertainty) => ({ id: "d", title: "D", slides: [mkSlide(uncertainty)] });
    const withU = compileDeckDetailed(mkIntent("mixed"), design);
    const withoutU = compileDeckDetailed(mkIntent(undefined), design);
    const { carrier, caveat } = carrierAndCaveat(withU.scenes[0], "b1");
    assert.ok(Math.abs(carrier.y - 1.77) < 0.01, `dense carrier top-anchored, y=${carrier.y}`);
    // Region runs y=1.77 h=4.41 (bottom 6.18); the band sits at its foot.
    assert.ok(Math.abs(caveat.y - 5.83) < 0.01, `dense caveat keeps region-bottom band, y=${caveat.y}`);
    assert.ok(caveat.y >= carrier.y + carrier.h - 1e-9, "caveat never covers the carrier");
    assert.equal(textOf(caveat), "MIXED");
    assert.deepEqual(
      withU.fitDiagnostics.map((d) => d.kind).sort(),
      withoutU.fitDiagnostics.map((d) => d.kind).sort(),
      "uncertainty adds no new diagnostics on dense content",
    );
  });

  it("cautionary outcome + uncertainty: tone rail follows primary", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "bad news", title: "Warning",
        blocks: [{ id: "b1", kind: "text", label: "F", text: "Short bad news.", emphasis: "primary", outcome: "unfavorable", uncertainty: "qualified" }],
      }],
    };
    const { scenes } = compileDeckDetailed(intent, design);
    const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
    const tone = scenes[0].elements.find((e) => e.id === "s1:b1:tone");
    assert.ok(tone, "tone rail present");
    assert.equal(tone.y, carrier.y, "rail tracks carrier y");
    assert.equal(tone.h, carrier.h, "rail tracks carrier height");
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "caveat attached below");
    assert.deepEqual(checkElementIds(scenes[0]), []);
  });

  it("prose-list/evidence: accent rule remains aligned", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "show evidence", title: "Evidence", rhetoricalRole: "evidence",
        blocks: [{ id: "b1", kind: "list", items: ["Point one", "Point two"], uncertainty: "qualified" }],
      }],
    };
    const { scenes, plan } = compileDeckDetailed(intent, design);
    assert.ok(plan.slides[0].family === "prose-list", "prose family");
    const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
    const rule = scenes[0].elements.find((e) => e.id === "s1:b1:rule");
    assert.ok(rule, "evidence rule present");
    assert.equal(rule.y, carrier.y, "rule tracks carrier y");
    assert.equal(rule.h, carrier.h, "rule tracks carrier height");
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "caveat attached");
    assert.deepEqual(checkElementIds(scenes[0]), []);
  });

  it("framed content keeps region-bottom caveats and panel geometry", async () => {
    const design = await warmDesign();
    const intents = benchmarkIntents();
    const { scenes } = compileDeckDetailed(intents["research-defense"], design);
    const scene = scenes.find((s) => s.id === "rd-limit");
    const content = scene.elements.find((e) => e.kind === "text" && e.semanticRef === "rd-limit-b1");
    const caveat = scene.elements.find((e) => e.id === "rd-limit:rd-limit-b1:caveat");
    assert.ok(Math.abs(content.y - 1.97) < 0.01 && Math.abs(content.h - 3.56) < 0.01, "framed text unmoved");
    assert.ok(Math.abs(caveat.y - 5.58) < 0.01, "framed caveat stays at region bottom");
    assert.ok(scene.elements.some((e) => e.id === "rd-limit:rd-limit-b1:frame"), "panel frame intact");
  });

  it("table carrier + uncertainty: native table kept, region-bottom caveat documented", async () => {
    // Deliberate boundary (§8): tables keep region-bottom caveats.
    // Native table geometry plus unit-caption interplay make
    // attachment unsafe without per-cell measurement (V2-3F-8).
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "grid", title: "Grid",
        blocks: [{ id: "t1", kind: "table", rows: [["A", "B"], ["1", "2"]], header: true, uncertainty: "qualified" }],
      }],
    };
    const { scenes, fitDiagnostics } = compileDeckDetailed(intent, design);
    const [scene] = scenes;
    const table = scene.elements.find((e) => e.kind === "table");
    assert.ok(table, "native table element survives");
    assert.deepEqual(table.table.rows, [["A", "B"], ["1", "2"]], "rows byte-exact");
    assert.equal(table.table.header, true);
    assert.ok(table.table.layout, "layout contract intact");
    const caveat = scene.elements.find((e) => e.id === "s1:t1:caveat");
    assert.ok(caveat, "caveat emitted");
    assert.equal(textOf(caveat), "QUALIFIED");
    assert.ok(caveat.y >= table.y + table.h - 1e-9, "caveat never covers the table");
    const v = await validateScene(scene);
    assert.equal(v.ok, true, v.errors.join("; "));
    assert.deepEqual(checkElementIds(scene), []);
    assert.deepEqual(checkSceneGeometry(scene), []);
    void fitDiagnostics;
  });

  it("multiple blocks: each caveat stays inside its owner's region", async () => {
    const design = await warmDesign();
    // Two list blocks stack vertically in prose-list (two text
    // blocks would select side-by-side card-grid instead).
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "two findings", title: "Findings",
        blocks: [
          { id: "b1", kind: "list", items: ["First short claim."], uncertainty: "qualified" },
          { id: "b2", kind: "list", items: ["Second short claim."], uncertainty: "inconclusive" },
        ],
      }],
    };
    const { scenes } = compileDeckDetailed(intent, design);
    const [scene] = scenes;
    const c1 = carrierAndCaveat(scene, "b1");
    const c2 = carrierAndCaveat(scene, "b2");
    for (const { carrier, caveat } of [c1, c2]) {
      assert.ok(caveat.y >= carrier.y + carrier.h - 1e-9, "no cover");
      assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "attached");
    }
    assert.ok(c1.caveat.y + c1.caveat.h <= c2.carrier.y + 1e-9, "first caveat never enters the second block");
    assert.equal(textOf(c1.caveat), "QUALIFIED");
    assert.equal(textOf(c2.caveat), "INCONCLUSIVE");
    assert.deepEqual(checkElementIds(scene), []);
  });

  it("takeaway present: caveat respects its reserved space", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [
        {
          id: "s1", purpose: "close", title: "Closing",
          blocks: [{ id: "b1", kind: "text", text: "Short line.", uncertainty: "qualified" }],
          takeaway: "The line stands as written",
        },
        {
          id: "s2", purpose: "decide", title: "Choice", rhetoricalRole: "decision",
          blocks: [
            { id: "l", kind: "text", label: "Left", text: "Mature" },
            { id: "r", kind: "text", label: "Right", text: "Novel", uncertainty: "qualified" },
          ],
          takeaway: "Novel wins on balance",
        },
      ],
    };
    const { scenes } = compileDeckDetailed(intent, design);
    const disjoint = (a, b) =>
      a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 ||
      a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
    for (const scene of scenes) {
      const takeaways = scene.elements.filter((e) => /:takeaway:/.test(e.id));
      assert.ok(takeaways.length > 0, `${scene.id}: takeaway emitted`);
      for (const caveat of scene.elements.filter((e) => /:caveat$/.test(e.id))) {
        for (const takeaway of takeaways) {
          assert.ok(disjoint(caveat, takeaway), `${scene.id}: caveat and takeaway never overlap`);
        }
        assert.equal(
          sceneText(scene).includes("Short line.") || sceneText(scene).includes("Novel"),
          true, `${scene.id}: authored text intact`);
      }
    }
    const s1takeaway = scenes[0].elements.find((e) => /:takeaway:/.test(e.id));
    assert.equal(
      (s1takeaway.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n"),
      "The line stands as written");
  });

  function sceneText(scene) {
    return scene.elements.filter((e) => e.kind === "text")
      .flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text)))
      .join("\n");
  }

  it("chromed slide: attached caveat causes no footer-band intrusion", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [
        { id: "s1", purpose: "open", title: "Opening", blocks: [{ id: "t1", kind: "text", text: "Intro." }] },
        {
          id: "s2", purpose: "short evidence", title: "Finding",
          blocks: [{ id: "b1", kind: "text", label: "Result", text: "Short evidence text.", uncertainty: "qualified" }],
        },
      ],
    };
    const { scenes, findings } = await analyzeDeck(intent, design, benchmarkChrome(intent, design));
    assert.deepEqual(findings.filter((f) => f.code === "chrome-band-overlap"), []);
    const scene = scenes.find((s) => s.id === "s2");
    const { carrier, caveat } = carrierAndCaveat(scene, "b1");
    assert.ok(Math.abs(caveat.y - (carrier.y + carrier.h + 0.1)) < 1e-9, "attached under chrome too");
    assert.ok(scene.elements.some((e) => e.id === "s2:chrome:slide-number"), "chrome intact");
  });

  it("exact authored uncertainty labels survive", async () => {
    const design = await warmDesign();
    for (const [uncertainty, label] of [["qualified", "QUALIFIED"], ["contested", "CONTESTED"], ["inconclusive", "INCONCLUSIVE"], ["mixed", "MIXED"]]) {
      const { scenes } = compileDeckDetailed({
        id: "d", title: "D",
        slides: [{ id: "s1", purpose: "p", title: "T", blocks: [{ id: "b1", kind: "text", text: "Claim.", uncertainty }] }],
      }, design);
      const { caveat } = carrierAndCaveat(scenes[0], "b1");
      assert.equal(textOf(caveat), label, `${uncertainty} label exact`);
    }
  });

  it("same inputs produce byte-identical scenes", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "short evidence", title: "Finding",
        blocks: [{ id: "b1", kind: "text", label: "Result", text: "Short evidence text.", uncertainty: "qualified" }],
      }],
    };
    const a = compileDeckDetailed(intent, design);
    const b = compileDeckDetailed(intent, design);
    assert.equal(JSON.stringify(a.scenes), JSON.stringify(b.scenes));
  });

  it("slides without uncertainty carry no caveat elements", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{ id: "s1", purpose: "p", title: "T", blocks: [{ id: "b1", kind: "text", text: "Plain claim." }] }],
    }, design);
    assert.ok(!scenes[0].elements.some((e) => /:caveat$/.test(e.id)), "no caveat without uncertainty");
  });
});

describe("v2-3f-6 themes and preservation", () => {
  it("all five themes retain semantic invariance with caveats attached", async () => {
    const intent = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "short evidence", title: "Finding",
        blocks: [{ id: "b1", kind: "text", label: "Result", text: "Short evidence text.", uncertainty: "qualified" }],
      }],
    };
    let first = null;
    for (const name of THEMES) {
      const design = await themeDesign(name);
      const { scenes } = compileDeckDetailed(intent, design);
      const proj = JSON.stringify(scenes.map(semanticProjection));
      if (first === null) first = proj;
      else assert.equal(proj, first, `${name} changed caveat semantics`);
      const { carrier, caveat } = carrierAndCaveat(scenes[0], "b1");
      assert.ok(caveat.y >= carrier.y + carrier.h - 1e-9, `${name}: caveat never covers carrier`);
    }
  });

  it("customized and detached scenes still preserve correctly", async () => {
    const design = await warmDesign();
    const slide = { id: "s1", purpose: "p", title: "T", blocks: [{ id: "b1", kind: "text", text: "Short claim.", uncertainty: "qualified" }] };
    const { plan } = planDeckComposition({ id: "d", title: "D", slides: [slide] }, design);
    const planned = plan.slides[0];
    const { scenes } = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design);
    // Detached returns the exact object untouched.
    const detached = JSON.parse(JSON.stringify(scenes[0]));
    detached.layoutState = "detached";
    assert.equal(recompileSlide(slide, detached, design, planned), detached);
    // Customized primary geometry survives a recompile.
    const customized = JSON.parse(JSON.stringify(scenes[0]));
    const target = customized.elements.find((e) => e.semanticRef === "b1");
    applyCommand(customized, { type: "element.move", id: target.id, x: 2.5, y: 3.5 });
    const out = recompileSlide(slide, customized, design, planned);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, 2.5);
    assert.equal(kept.y, 3.5);
    assert.ok(out.elements.some((e) => e.id === "s1:b1:caveat"), "caveat survives recompile");
  });
});
