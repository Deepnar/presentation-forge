// V2-3E-1: resolved typography truth + canonical fit/budgets.
// Proves Layer C carries the typography the fitter measures and the
// renderers draw; fitting is shrink-only with deterministic
// diagnostics; no authored text is lost; preservation holds.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { compileDeck, compileDeckDetailed, compileSlide, recompileSlide } from "../packages/compiler/compile.js";
import { fittedTextEl, refitTextEl } from "../packages/compiler/text-fit.ts";
import { fitScale, fitOneLine, fitScaleStack, fitLineHeight } from "../packages/core/fit.ts";
import { resolveRunStyle } from "../packages/compiler/typography.ts";
import { validateScene } from "../packages/model/scene.ts";
import { semanticProjection } from "../packages/core/scene-quality.ts";
import { compositionSceneProjection } from "../packages/compiler/quality.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { applyCommand } from "../packages/model/commands.ts";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];

async function themeDesign(name, mode = "light") {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode });
}

function textRuns(scene) {
  return scene.elements.filter((e) => e.kind === "text");
}

function runTexts(scene) {
  return textRuns(scene).flatMap((e) => (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => r.text)));
}

describe("v2-3e1 schema and resolution", () => {
  it("extended typography fields validate", async () => {
    const design = await warmDesign();
    const [scene] = compileDeck(sampleDeckIntent(), design);
    const v = await validateScene(scene);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("pre-3E-1 scenes without typography still validate", async () => {
    const v = await validateScene({
      id: "old", width: 13.333, height: 7.5,
      background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "e1", kind: "text", x: 1, y: 1, w: 4, h: 1, z: 10,
        provenance: "compiler",
        paragraphs: [{ runs: [{ text: "legacy", size: 13, color: "111111" }] }],
      }],
    });
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("compiler runs carry resolved typography", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    let count = 0;
    for (const scene of scenes) {
    for (const el of textRuns(scene)) {
      for (const p of el.paragraphs ?? []) {
        for (const r of p.runs) {
          count++;
          assert.ok(r.role && r.role.length > 0, `${el.id}: run needs a role`);
          assert.equal(typeof r.family, "string", `${el.id}: family`);
          assert.equal(typeof r.weight, "number", `${el.id}: weight`);
          assert.equal(typeof r.size, "number", `${el.id}: size`);
          assert.equal(typeof r.tracking, "number", `${el.id}: tracking`);
          assert.equal(typeof r.line, "number", `${el.id}: line`);
          assert.ok(r.size > 0);
        }
      }
    }
    }
    assert.ok(count > 10, "fixture exercises many runs");
  });

  it("fitter and scene derive from the same resolved style", async () => {
    const design = await warmDesign();
    const { run, fit } = resolveRunStyle(design, "heading", { size: 28 });
    assert.equal(fit.size, run.size);
    assert.equal(fit.family, run.family);
    assert.equal(fit.weight, run.weight);
    assert.equal(fit.tracking, run.tracking);
    assert.equal(fit.line, run.line);
    assert.equal(fit._role, run.role);
  });

  it("no theme-name branching in compiler text paths", async () => {
    const names = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
    for (const f of [
      "../packages/compiler/mechanisms.ts",
      "../packages/compiler/compile.js",
      "../packages/compiler/text-fit.ts",
      "../packages/compiler/typography.ts",
    ]) {
      const text = await readFile(new URL(f, import.meta.url), "utf8");
      for (const n of names) assert.ok(!text.includes(n), `${f} branches on theme ${n}`);
    }
  });

  it("mechanisms own geometry, never heightOf/lineCount", async () => {
    const text = await readFile(new URL("../packages/compiler/mechanisms.ts", import.meta.url), "utf8");
    assert.ok(!text.includes("heightOf"), "no height arithmetic for layout");
    assert.ok(!text.includes("lineCount"), "no line-count arithmetic for layout");
  });
});

describe("v2-3e1 fit-aware coverage", () => {
  it("all 12 families route every text run through resolved typography", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(mechanismDeck(), design);
    assert.equal(scenes.length, 12);
    for (const scene of scenes) {
      for (const el of textRuns(scene)) {
        assert.ok((el.paragraphs ?? []).length > 0, `${scene.id}/${el.id}: text element keeps paragraphs`);
        for (const p of el.paragraphs ?? []) {
          for (const r of p.runs) {
            assert.ok(r.role, `${scene.id}/${el.id}: every run carries a role`);
            assert.ok(r.size > 0, `${scene.id}/${el.id}: positive fitted size`);
          }
        }
      }
    }
  });

  it("legacy six-recipe path also resolves typography", async () => {
    const design = await warmDesign();
    for (const slide of sampleDeckIntent().slides) {
      const scene = compileSlide(slide, design);
      for (const el of textRuns(scene)) {
        for (const p of el.paragraphs ?? []) {
          for (const r of p.runs) assert.ok(r.role, `${slide.id}/${el.id}: legacy run carries a role`);
        }
      }
    }
  });
});

describe("v2-3e1 fit behaviors", () => {
  it("nominal fit keeps scale 1 with no diagnostic", async () => {
    const design = await warmDesign();
    const sink = [];
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 10, h: 4 },
      paragraphs: [{ runs: [{ text: "Short headline", role: "heading" }] }],
      z: 10, sink,
    });
    assert.equal(el.paragraphs[0].runs[0].size, design.roles.heading.size);
    assert.deepEqual(sink, []);
  });

  it("shrink above the floor emits no floor diagnostic", async () => {
    const design = await warmDesign();
    const sink = [];
    const nominal = design.roles.heading.size;
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 5, h: 1.1 },
      paragraphs: [{ runs: [{ text: "A heading long enough to need shrinking but not that long", role: "heading" }] }],
      z: 10, sink,
    });
    const size = el.paragraphs[0].runs[0].size;
    assert.ok(size < nominal, `shrinks: ${size} < ${nominal}`);
    assert.ok(size > 22, `stays above the heading floor: ${size}`);
    assert.deepEqual(sink, []);
  });

  it("floor failures clamp, diagnose, and keep every word", async () => {
    const design = await warmDesign();
    const sink = [];
    const words = ["These", "words", "must", "all", "survive", "the", "floor", "clamp", "intact", "together"];
    const text = `${words.join(" ")} ${words.join(" ")} ${words.join(" ")}`;
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1", semanticRef: "b1",
      box: { x: 1, y: 1, w: 4, h: 0.6 },
      paragraphs: [{ runs: [{ text, role: "heading" }] }],
      z: 10, sink,
    });
    const size = el.paragraphs[0].runs[0].size;
    assert.ok(size >= 22, `emitted size must not cross the 22pt floor, got ${size}`);
    assert.equal(size, 22, `floor clamp is exact, got ${size}`);
    assert.ok(sink.some((d) => d.kind === "floor-hit" && d.elementId === "e1" && d.slideId === "s1" && d.semanticRef === "b1" && d.role === "heading"));
    const kept = el.paragraphs[0].runs[0].text.split(/\s+/).filter(Boolean);
    for (const w of words) assert.ok(kept.includes(w), `keeps word ${w}`);
  });

  it("theme nominal below the role floor never grows", async () => {
    const design = await warmDesign();
    const sink = [];
    // Warm body nominal (13) sits below the body floor (14): shrink stop, not grow target.
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 10, h: 4 },
      paragraphs: [{ runs: [{ text: "Comfortable body copy", role: "body" }] }],
      z: 10, sink,
    });
    assert.equal(el.paragraphs[0].runs[0].size, 13);
  });

  it("longest-word overflow diagnoses without mid-word truncation", async () => {
    const design = await warmDesign();
    const sink = [];
    const word = "Antidisestablishmentarianism";
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 1.2, h: 3 },
      paragraphs: [{ runs: [{ text: `Prefix ${word} suffix`, role: "heading" }] }],
      z: 10, sink,
    });
    assert.ok(sink.some((d) => d.kind === "word-floor-hit" && d.elementId === "e1"));
    assert.ok(el.paragraphs[0].runs[0].text.includes(word), "word survives intact");
  });

  it("tracked uppercase typography fits at drawn size with tracking", async () => {
    const design = await warmDesign();
    const { run, fit } = resolveRunStyle(design, "eyebrow", {});
    assert.equal(run.transform, "upper");
    assert.ok((run.tracking ?? 0) > 0, "eyebrow carries tracking");
    assert.equal(fit.transform, "upper");
    assert.equal(fit.tracking, run.tracking);
    const sink = [];
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 3, h: 0.5 },
      paragraphs: [{ runs: [{ text: "Key Results And Implications", role: "eyebrow" }] }],
      z: 10, sink,
    });
    assert.equal(el.paragraphs[0].runs[0].transform, "upper");
    assert.ok(el.paragraphs[0].runs[0].size <= design.roles.eyebrow.size);
  });

  it("peer list items share one scale", async () => {
    const design = await warmDesign();
    const sink = [];
    // Heading role: nominal above its floor, so the shared shrink is observable.
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 6, h: 1.2 },
      paragraphs: [
        { runs: [{ text: "Short", role: "heading" }], bullet: true },
        { runs: [{ text: "A much longer bullet that forces the shared scale down for every peer item alike", role: "heading" }], bullet: true },
        { runs: [{ text: "Tiny", role: "heading" }], bullet: true },
      ],
      z: 10, sink,
    });
    const sizes = el.paragraphs.map((p) => p.runs[0].size);
    assert.ok(sizes.every((s) => s === sizes[0]), `shared scale, got ${sizes}`);
    assert.ok(sizes[0] < design.roles.heading.size, "long bullet constrains peers");
  });

  it("stat value keeps hierarchy above a long label", async () => {
    const design = await warmDesign();
    const sink = [];
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 4, h: 1.6 },
      paragraphs: [
        { runs: [{ text: "12.5", role: "stat", bold: true }] },
        { runs: [{ text: "millisiemens per centimetre at room temperature", role: "body" }] },
      ],
      z: 10, sink, policy: "stat",
    });
    const [value, label] = el.paragraphs.map((p) => p.runs[0]);
    assert.equal(value.role, "stat");
    assert.ok(value.size >= (label.size ?? 0), `value ${value.size} keeps hierarchy over label ${label.size}`);
    assert.ok(label.text.includes("millisiemens"), "label text complete");
  });

  it("long titles fit their actual box without truncation", async () => {
    const design = await warmDesign();
    const { scenes, fitDiagnostics } = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p",
        title: "An unusually long slide title that must still fit inside its allocated heading box",
        blocks: [{ id: "b1", kind: "text", text: "Body." }],
      }],
    }, design);
    const title = scenes[0].elements.find((e) => e.id === "s1:title:heading");
    assert.ok(title && title.kind === "text");
    const size = title.paragraphs[0].runs[0].size;
    assert.ok(size <= design.roles.display.size, `fitted at or below nominal, got ${size}`);
    assert.ok(size < design.roles.display.size, `long title actually shrinks, got ${size}`);
    assert.ok(title.paragraphs[0].runs[0].text.includes("unusually long slide title"), "title text complete");
    void fitDiagnostics;
  });

  it("refit skips runs without a stored role", async () => {
    const design = await warmDesign();
    const el = {
      id: "e1", kind: "text", x: 1, y: 1, w: 4, h: 1, z: 10,
      provenance: "compiler",
      paragraphs: [{ runs: [{ text: "old", size: 13, color: "111111" }] }],
    };
    const before = JSON.stringify(el);
    refitTextEl(design, el, "s1", []);
    assert.equal(JSON.stringify(el), before);
  });
});

describe("v2-3e1 exact floors", () => {
  it("fitScale never emits below the effective floor: heading 30/22", () => {
    const style = { family: "Merriweather", size: 30, line: 1.18, _role: "heading" };
    const events = [];
    const scale = fitScale("A heading far too long for the tiny box it was given to live in", 2, 0.4, style, { events });
    assert.equal(scale, 22 / 30, `exact floor ratio, got ${scale}`);
    assert.equal(30 * scale >= 22, true);
    assert.ok(events.length >= 1, "floor crossing is reported");
  });

  it("fitScale never emits below the effective floor: subhead 15/14", () => {
    const style = { family: "Inter", size: 15, line: 1.45, _role: "subhead" };
    const scale = fitScale("An over-long subhead that cannot fit on one line inside the chip it lives in", 2.2, 0.4, style, { events: [] });
    assert.equal(scale, 14 / 15, `exact floor ratio, got ${scale}`);
    assert.ok(15 * scale >= 14);
  });

  it("theme nominal below the role floor stays put: body 13/14", () => {
    const style = { family: "Inter", size: 13, line: 1.55, _role: "body" };
    const events = [];
    const scale = fitScale("A body that is far too long for the box it has been given and cannot fit at a readable size", 2.5, 0.4, style, { events });
    assert.equal(scale, 1, "floor never grows the theme");
    assert.ok(events.length >= 1, "still reported");
  });

  it("fitOneLine never emits below the effective floor", () => {
    const events = [];
    const scale = fitOneLine("99.9%", 0.5, { family: "Merriweather", size: 54, line: 1.0, _role: "stat" }, { events });
    assert.ok(54 * scale >= 24, `stat floor holds, got ${54 * scale}`);
    assert.ok(events.length >= 1, "floor crossing is reported");
    const heading = fitOneLine(
      "Antidisestablishmentarianism", 1.0,
      { family: "Merriweather", size: 30, line: 1.18, _role: "heading" }, { events: [] },
    );
    assert.ok(30 * heading >= 22, `heading floor holds, got ${30 * heading}`);
  });

  it("fitScaleStack agrees with fitScale on a single paragraph", () => {
    const style = { family: "Inter", size: 30, line: 1.18, _role: "heading" };
    const text = "A heading long enough to need shrinking but not that long";
    assert.equal(
      fitScaleStack([text], 5, 1.1, style, {}),
      fitScale(text, 5, 1.1, style, {}),
    );
  });

  it("fitScaleStack sums paragraph heights", () => {
    const style = { family: "Inter", size: 13, line: 1.55 };
    const one = fitScaleStack(["Short", "Tiny"], 6, 10, style, {});
    assert.equal(one, 1);
    const tight = fitScaleStack(["Short", "A much longer bullet that needs several wrapped lines to be fully expressed", "Tiny"], 6, 0.5, style, {});
    assert.ok(tight < 1, `stacked paragraphs constrain the scale, got ${tight}`);
  });

  it("fitLineHeight holds the floor for short boxes", () => {
    const events = [];
    const scale = fitLineHeight({ family: "Inter", size: 15, line: 1.45, _role: "subhead" }, 0.1, { events });
    assert.ok(15 * scale >= 14, `subhead floor holds vertically, got ${15 * scale}`);
    assert.ok(events.length >= 1, "vertical floor crossing is reported");
    assert.equal(fitLineHeight({ family: "Inter", size: 15, line: 1.45, _role: "subhead" }, 10, {}), 1);
  });
});

describe("v2-3e1 vertical floor constraints", () => {
  it("tiny one-line box holds the floor and diagnoses", async () => {
    const design = await warmDesign();
    const sink = [];
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 4, h: 0.1 },
      paragraphs: [{ runs: [{ text: "Badge", role: "subhead", bold: true }] }],
      z: 10, sink, policy: "one-line",
    });
    const size = el.paragraphs[0].runs[0].size;
    assert.ok(size >= 14, `subhead floor holds vertically, got ${size}`);
    assert.ok(sink.some((d) => d.kind === "floor-hit" && d.elementId === "e1"));
    assert.equal(el.paragraphs[0].runs[0].text, "Badge");
  });

  it("sequence badges carry the one-line policy", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "p", title: "Steps", relationship: "sequence",
        blocks: [
          { id: "q1", kind: "text", label: "One", text: "First" },
          { id: "q2", kind: "text", label: "Two", text: "Second" },
        ],
      }],
    }, design);
    const badge = scenes[0].elements.find((e) => e.id === "s1:q1:badge");
    assert.ok(badge && badge.kind === "text");
    assert.equal(badge.fitPolicy, "one-line");
    assert.ok(badge.paragraphs[0].runs[0].size >= 14, "badge at or above the subhead floor");
  });

  it("tiny-height stat holds the value floor and diagnoses", async () => {
    const design = await warmDesign();
    const sink = [];
    const el = fittedTextEl(design, {
      id: "e1", slideId: "s1",
      box: { x: 1, y: 1, w: 4, h: 0.4 },
      paragraphs: [
        { runs: [{ text: "12.5", role: "stat", bold: true }] },
        { runs: [{ text: "millisiemens per centimetre", role: "body" }] },
      ],
      z: 10, sink, policy: "stat",
    });
    const [value, label] = el.paragraphs.map((p) => p.runs[0]);
    assert.ok(value.size >= 24, `stat value floor holds, got ${value.size}`);
    assert.ok(sink.some((d) => d.kind === "floor-hit" && d.elementId === "e1"));
    assert.equal(value.text, "12.5");
    assert.ok(label.text.includes("millisiemens"), "label text complete");
  });

  it("emitted compiler text always carries its fit policy", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(mechanismDeck(), design);
    for (const scene of scenes) {
      for (const el of scene.elements.filter((e) => e.kind === "text")) {
        assert.ok(["wrap", "one-line", "stat"].includes(el.fitPolicy), `${scene.id}/${el.id} stores a fit policy`);
      }
    }
  });
});

describe("v2-3e1 renderer projection", () => {
  async function ooxmlFor(scene) {
    const bytes = await renderPptx([scene]);
    const zip = await JSZip.loadAsync(bytes);
    return zip.files["ppt/slides/slide1.xml"].async("string");
  }

  it("PPTX exports family, size, weight, tracking, line, and uppercase", async () => {
    const xml = await ooxmlFor({
      id: "s1", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s1:t", kind: "text", x: 1, y: 1, w: 6, h: 1.5, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Hello World", role: "eyebrow", family: "Inter", weight: 700, size: 10, tracking: 1.2, line: 1.2, transform: "upper", color: "111111", bold: true }], align: "left" }],
      }],
    });
    assert.match(xml, /typeface="Inter"/);
    assert.match(xml, /sz="1000"/);
    assert.match(xml, /b="1"/);
    assert.match(xml, /spc="120"/);
    assert.match(xml, /spcPts val="1200"/);
    assert.match(xml, /HELLO WORLD/);
  });

  it("PPTX derives bold from weight when explicit bold is absent", async () => {
    const xml = await ooxmlFor({
      id: "s1", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s1:t", kind: "text", x: 1, y: 1, w: 6, h: 1.5, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "Heavy", role: "display", family: "Merriweather", weight: 900, size: 40, tracking: 0, line: 1.1, color: "111111" }] }],
      }],
    });
    assert.match(xml, /b="1"/);
  });

  it("PPTX never relies on client autofit", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(sampleDeckIntent(), design);
    const bytes = await renderPptx(scenes);
    const zip = await JSZip.loadAsync(bytes);
    for (const name of Object.keys(zip.files).filter((n) => n.startsWith("ppt/slides/slide"))) {
      const xml = await zip.files[name].async("string");
      assert.ok(!/autofit/i.test(xml), `${name} must not use autofit`);
    }
  });

  it("drawn size is the fitted size end to end", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p", title: "Takeaway sizing",
        rhetoricalRole: "decision",
        blocks: [{ id: "b1", kind: "text", label: "A", text: "B" }],
        takeaway: "A verdict takeaway long enough that it must shrink inside its reserved band to remain honest",
      }],
    }, design);
    const verdict = scenes[0].elements.find((e) => e.id === "s1:takeaway:verdict");
    assert.ok(verdict && verdict.kind === "text");
    const size = verdict.paragraphs[0].runs[0].size;
    assert.ok(size <= design.roles.body.size, `takeaway fitted at drawn size, got ${size}`);
    const xml = await ooxmlFor(scenes[0]);
    assert.match(xml, new RegExp(`sz="${Math.round(size * 100)}"`));
  });

  it("SVG projects resolved typography", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "t", title: "T",
      slides: [{
        id: "s1", purpose: "p", title: "Svg",
        blocks: [{ id: "b1", kind: "quote", text: "a quiet line" }],
      }],
    }, design);
    const svg = sceneToSvg(scenes[0]);
    assert.match(svg, /font-family="/);
    assert.match(svg, /font-size="/);
    assert.match(svg, /fill="/);
  });

  it("SVG renders uppercase transform, weight, tracking, and italic", () => {
    const svg = sceneToSvg({
      id: "s1", width: 13.333, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s1:t", kind: "text", x: 1, y: 1, w: 6, h: 1, z: 10, provenance: "compiler",
        paragraphs: [{ runs: [{ text: "quiet line", role: "eyebrow", family: "Inter", weight: 700, size: 10, tracking: 1.2, line: 1.2, transform: "upper", italic: true, color: "111111" }] }],
      }],
    });
    assert.match(svg, /QUIET LINE/);
    assert.match(svg, /font-weight="bold"/);
    assert.match(svg, /letter-spacing="/);
    assert.match(svg, /font-style="italic"/);
  });
});

describe("v2-3e1 preservation under fit", () => {
  async function planned(slide, design) {
    const { plan } = planDeckComposition({ id: "d", title: "D", slides: [slide] }, design);
    return plan.slides[0];
  }

  it("customized geometry is preserved and refit against the preserved box", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "T",
      blocks: [{ id: "b1", kind: "list", items: ["alpha", "beta", "gamma", "delta"] }],
    };
    let scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design).scenes[0];
    const target = scene.elements.find((e) => e.semanticRef === "b1");
    applyCommand(scene, { type: "element.resize", id: target.id, w: 3, h: 0.8 });
    assert.equal(scene.layoutState, "customized");

    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].items = [
      "alpha with considerably more words than before",
      "beta with considerably more words than before",
      "gamma with considerably more words than before",
      "delta with considerably more words than before",
    ];
    const sink = [];
    scene = recompileSlide(edited, scene, design, await planned(edited, design), sink);
    const kept = scene.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, target.x);
    assert.equal(kept.y, target.y);
    assert.equal(kept.w, 3);
    assert.equal(kept.h, 0.8);
    for (const item of edited.blocks[0].items) {
      assert.ok(runTexts(scene).join("\n").includes(item), `keeps edited item: ${item}`);
    }
    assert.ok(sink.length > 0, "preserved-box overflow surfaces a fit diagnostic");
  });

  it("a larger human box keeps fitted sizes instead of regrowing", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "T",
      blocks: [{ id: "b1", kind: "text", label: "L", text: "Some words here" }],
    };
    const plan = await planned(slide, design);
    const fresh = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design).scenes[0];
    const target = fresh.elements.find((e) => e.semanticRef === "b1");
    const freshSizes = target.paragraphs.flatMap((p) => p.runs.map((r) => r.size));
    applyCommand(fresh, { type: "element.resize", id: target.id, w: target.w + 2, h: target.h + 1 });
    const out = recompileSlide(slide, fresh, design, plan, []);
    const kept = out.elements.find((e) => e.id === target.id);
    assert.deepEqual(
      kept.paragraphs.flatMap((p) => p.runs.map((r) => r.size)),
      freshSizes,
    );
  });

  it("detached scenes stay untouched", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[1];
    const scene = compileSlide(slide, design);
    scene.layoutState = "detached";
    const edited = JSON.parse(JSON.stringify(slide));
    edited.title = "A completely different headline";
    const out = recompileSlide(edited, scene, design);
    assert.equal(out, scene);
  });

  it("human orphans survive fitting recompiles", async () => {
    const design = await warmDesign();
    const slide = sampleDeckIntent().slides[0];
    let scene = compileSlide(slide, design);
    applyCommand(scene, {
      type: "element.add",
      element: { kind: "text", x: 1, y: 6, w: 4, h: 0.6, z: 20, provenance: "human", paragraphs: [{ runs: [{ text: "Marginalia" }] }] },
    });
    const addedId = scene.elements.at(-1).id;
    scene = recompileSlide(slide, scene, design);
    assert.ok(scene.elements.some((e) => e.id === addedId));
  });

  it("customized stat keeps stat policy, floor, and full text", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "Figure", rhetoricalRole: "evidence",
      blocks: [{ id: "st", kind: "stat", value: "12.5", label: "mS/cm", emphasis: "primary" }],
    };
    let scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design).scenes[0];
    const target = scene.elements.find((e) => e.kind === "text" && e.semanticRef === "st");
    assert.equal(target.fitPolicy, "stat");
    // Human shrinks the tile; the label then grows substantially.
    applyCommand(scene, { type: "element.resize", id: target.id, w: 3, h: 0.9 });
    const edited = JSON.parse(JSON.stringify(slide));
    edited.blocks[0].label = "millisiemens per centimetre measured at room temperature across every sample in the study";
    const sink = [];
    scene = recompileSlide(edited, scene, design, await planned(edited, design), sink);
    const kept = scene.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, target.x);
    assert.equal(kept.y, target.y);
    assert.equal(kept.w, 3);
    assert.equal(kept.h, 0.9);
    assert.equal(kept.fitPolicy, "stat", "stat policy survives stable-ID preservation");
    const [value, label] = kept.paragraphs.map((p) => p.runs[0]);
    assert.equal(value.role, "stat");
    assert.ok(value.size >= 24, `label cannot force the value through its floor, got ${value.size}`);
    assert.ok(value.text.includes("12.5"), "value survives");
    assert.ok(label.text.includes("millisiemens"), "long label survives complete");
    assert.ok(sink.length > 0, "insufficient preserved geometry diagnoses");
  });

  it("customized one-line badge keeps one-line policy, never degrading to wrap", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "p", title: "Steps", relationship: "sequence",
      blocks: [
        { id: "q1", kind: "text", label: "One", text: "First" },
        { id: "q2", kind: "text", label: "Two", text: "Second" },
      ],
    };
    let scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design).scenes[0];
    const badge = scene.elements.find((e) => e.id === "s1:q1:badge");
    assert.equal(badge.fitPolicy, "one-line");
    // Human flattens the badge; a wrap refit would treat the digit as
    // flowing text, while one-line fitting holds the subhead floor.
    applyCommand(scene, { type: "element.resize", id: badge.id, w: badge.w, h: 0.15 });
    const sink = [];
    scene = recompileSlide(slide, scene, design, await planned(slide, design), sink);
    const kept = scene.elements.find((e) => e.id === badge.id);
    assert.equal(kept.w, badge.w);
    assert.equal(kept.h, 0.15);
    assert.equal(kept.fitPolicy, "one-line", "one-line policy survives stable-ID preservation");
    assert.ok(kept.paragraphs[0].runs[0].size >= 14, `badge floor holds, got ${kept.paragraphs[0].runs[0].size}`);
    assert.equal(kept.paragraphs[0].runs[0].text, "1");
    assert.ok(sink.length > 0, "insufficient preserved geometry diagnoses");
  });
});

describe("v2-3e1 semantics and themes", () => {
  it("fit fixture keeps every authored block represented", async () => {
    const design = await warmDesign();
    const { scenes, findings } = compileDeckDetailed(fitDeck(), design);
    assert.deepEqual(findings.filter((f) => f.code === "unrepresented-block"), []);
    void scenes;
  });

  it("structured counterfactuals stay scene-sensitive", async () => {
    const design = await warmDesign();
    const { pairs } = JSON.parse(await readFile(new URL("./fixtures/v2-quality/counterfactual-structured.json", import.meta.url), "utf8"));
    for (const pair of pairs) {
      const a = compileDeck(pair.a, design).map(compositionSceneProjection);
      const b = compileDeck(pair.b, design).map(compositionSceneProjection);
      assert.notEqual(JSON.stringify(a), JSON.stringify(b), `${pair.id} must differ visibly`);
    }
  });

  it("free-text planning fields never change scenes", async () => {
    const design = await warmDesign();
    const base = {
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "argue", title: "Claim",
        rhetoricalRole: "evidence",
        blocks: [{ id: "b1", kind: "list", items: ["one", "two", "three"] }],
      }],
    };
    const variant = JSON.parse(JSON.stringify(base));
    variant.audience = "different audience";
    variant.objective = "different objective";
    variant.slides[0].narrative = "different narrative";
    const a = compileDeckDetailed(base, design).scenes;
    const b = compileDeckDetailed(variant, design).scenes;
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("five themes agree on semantics with potentially different sizes", async () => {
    const deck = fitDeck();
    let firstSemantics = null;
    let firstRefs = null;
    const sizes = new Set();
    for (const name of THEMES) {
      const design = await themeDesign(name);
      const { scenes } = compileDeckDetailed(deck, design);
      const semantics = scenes.map(semanticProjection);
      const refs = scenes.map((s) => s.elements.map((e) => e.semanticRef ?? null));
      if (!firstSemantics) {
        firstSemantics = JSON.stringify(semantics);
        firstRefs = JSON.stringify(refs);
      } else {
        assert.equal(JSON.stringify(semantics), firstSemantics, `theme ${name} changes semantics`);
        assert.equal(JSON.stringify(refs), firstRefs, `theme ${name} changes refs`);
      }
      for (const scene of scenes) {
        for (const el of textRuns(scene)) {
          for (const p of el.paragraphs ?? []) {
            for (const r of p.runs) sizes.add(r.size);
          }
        }
      }
    }
    assert.ok(firstSemantics);
    void sizes;
  });

  it("compileDeck stays scenes-only while detailed exposes diagnostics", async () => {
    const design = await warmDesign();
    const scenes = compileDeck(fitDeck(), design);
    assert.ok(Array.isArray(scenes));
    const detailed = compileDeckDetailed(fitDeck(), design);
    assert.ok(Array.isArray(detailed.scenes));
    assert.ok(detailed.plan);
    assert.ok(Array.isArray(detailed.findings));
    assert.ok(Array.isArray(detailed.fitDiagnostics));
    assert.ok(detailed.fitDiagnostics.length > 0, "stress deck surfaces fit diagnostics");
    const d = detailed.fitDiagnostics[0];
    assert.ok(d.slideId && d.elementId && d.role && d.message);
    assert.ok(["floor-hit", "word-floor-hit"].includes(d.kind));
  });

  it("table cells stay native with data intact (cell fitting out of scope)", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{ id: "s1", purpose: "p", title: "Grid", blocks: [{ id: "t1", kind: "table", rows: [["a", "b"], ["c", "d"]], header: true }] }],
    }, design);
    const table = scenes[0].elements.find((e) => e.kind === "table");
    assert.ok(table, "table stays a native table element");
    assert.deepEqual(table.table.rows, [["a", "b"], ["c", "d"]]);
  });

  it("chart captions are fitted text while chart internals are untouched", async () => {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed({
      id: "d", title: "D",
      slides: [{
        id: "s1", purpose: "p", title: "Data",
        blocks: [{ id: "ch", kind: "chart", chartKind: "bar", categories: ["A"], series: [{ name: "v", values: [1] }], caption: "A caption", unit: "ms" }],
      }],
    }, design);
    const chart = scenes[0].elements.find((e) => e.kind === "chart");
    assert.ok(chart, "chart stays native");
    assert.ok(!("paragraphs" in chart), "chart internals carry no fitted text");
    const caption = scenes[0].elements.find((e) => e.id === "s1:ch:caption");
    assert.ok(caption && caption.kind === "text");
    assert.equal(caption.paragraphs[0].runs[0].role, "caption");
  });
});

describe("v2-3e1 baseline", () => {
  async function e1Projection() {
    const design = await warmDesign();
    const deck = sampleDeckIntent();
    deck.slides.push({ id: "s7", purpose: "stress title and floor", title: `A title far too long for one line: ${"word ".repeat(60).trim()}`, blocks: [{ id: "s7b1", kind: "list", items: [`A very long bullet that cannot fit at nominal size: ${"word ".repeat(80).trim()}`, "short"] }] });
    const { scenes, fitDiagnostics } = compileDeckDetailed(deck, design);
    const r2 = (n) => Math.round(n * 100) / 100;
    return {
      slides: scenes.map((s) => ({
        id: s.id, recipeId: s.recipeId,
        elements: s.elements.map((e) => {
          const o = { id: e.id, kind: e.kind, geom: [r2(e.x), r2(e.y), r2(e.w), r2(e.h)] };
          if (e.semanticRef !== undefined) o.semanticRef = e.semanticRef;
          if (e.kind === "text") {
            if (e.fitPolicy !== undefined) o.fitPolicy = e.fitPolicy;
            o.runs = (e.paragraphs ?? []).flatMap((p) => p.runs.map((r) => {
              const q = { role: r.role, family: r.family, weight: r.weight, size: r.size, tracking: r.tracking, line: r.line };
              if (r.transform !== undefined) q.transform = r.transform;
              if (r.bold !== undefined) q.bold = r.bold;
              if (r.italic !== undefined) q.italic = r.italic;
              return q;
            }));
          }
          return o;
        }),
      })),
      fitDiagnostics,
    };
  }

  it("3E-1 projection is deterministic", async () => {
    assert.equal(JSON.stringify(await e1Projection()), JSON.stringify(await e1Projection()));
  });

  it("3E-1 projection matches the checked-in baseline", async () => {
    const expected = JSON.parse(await readFile(new URL("./fixtures/v2-quality/compiler-v2-3e1-baseline.json", import.meta.url), "utf8"));
    assert.deepEqual(await e1Projection(), expected);
  });

  it("historical baselines are untouched by 3E-1", async () => {
    // Presence + shape check: these files remain the V2-3D record.
    for (const name of [
      "compiler-v2-3d-baseline.json",
      "counterfactual-baseline.json",
      "scene-composition-v2-3d-baseline.json",
    ]) {
      const raw = await readFile(new URL(`./fixtures/v2-quality/${name}`, import.meta.url), "utf8");
      assert.ok(JSON.parse(raw), `${name} parses`);
    }
  });
});

function fitDeck() {
  const long = "word ".repeat(120).trim();
  const items = [
    "A short item",
    `A very long item that forces the shared peer scale down: ${long}`,
    "Another short item",
    "Final item",
  ];
  return {
    id: "fit", title: "Fit stress",
    slides: [
      {
        id: "f-title", purpose: "stress the title box", title: `A title far too long for one line: ${long}`,
        blocks: [{ id: "fb1", kind: "text", text: "Body." }],
      },
      {
        id: "f-list", purpose: "stress shared list scale", title: "List stress",
        blocks: [{ id: "fb2", kind: "list", items }],
      },
      {
        id: "f-stat", purpose: "stress stat hierarchy", title: "Stat stress",
        rhetoricalRole: "evidence",
        blocks: [{ id: "fb3", kind: "stat", value: "12.5", label: `millisiemens per centimetre measured at room temperature across ${long}`, emphasis: "primary" }],
      },
      {
        id: "f-word", purpose: "stress longest word", title: "Word stress",
        blocks: [{ id: "fb4", kind: "text", label: "Token", text: "Supercalifragilisticexpialidociousness and pneumonoultramicroscopicsilicovolcanoconiosis" }],
      },
      {
        id: "f-take", purpose: "stress takeaway", title: "Takeaway stress", rhetoricalRole: "decision",
        blocks: [{ id: "fb5", kind: "text", label: "Side", text: "Content." }],
        takeaway: `The evidence supports adoption across every measured dimension: ${long}`,
      },
      {
        id: "f-cave", purpose: "stress caveat", title: "Caveat stress",
        blocks: [{ id: "fb6", kind: "text", label: "Finding", text: "An effect was observed.", uncertainty: "inconclusive" }],
      },
      {
        id: "f-col", purpose: "stress narrow columns", title: "Columns", relationship: "comparison",
        blocks: [
          { id: "fb7", kind: "text", label: "LeftSideLabel", text: "Antidisestablishmentarianism content" },
          { id: "fb8", kind: "text", label: "RightSideLabel", text: "Pneumonoultramicroscopicsilicovolcanoconiosis content" },
        ],
      },
    ],
  };
}
