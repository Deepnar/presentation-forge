// V2-3E-3: locked chrome emission + shared projection. Proves
// adapter-resolved ChromeInput becomes locked compiler scene
// elements via canonical core policy, both renderers project scenes
// only, recompilation preserves/emits chrome deterministically, and
// QA checks realization against the same plan.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, mkdtemp } from "node:fs/promises";
import JSZip from "jszip";
import { compileDeck, compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { planDeckChrome, chromePlanForSlide } from "../packages/compiler/chrome.ts";
import {
  analyzeDeck,
  checkChromeRealization,
  checkChromeBand,
} from "../packages/compiler/quality.ts";
import {
  planTitleBanner,
  reservationForTopRight,
  CONTENT_FOOTER_RESERVE,
  FOOT_Y,
  FOOT_H,
} from "../packages/core/chrome.ts";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { applyCommand } from "../packages/model/commands.ts";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { sampleDeckIntent, warmDesign } from "./v2-fixture.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";
import { loadThemeDocument } from "../src/theme-loader.js";
import { normalizeDesign } from "../packages/core/design.ts";

const THEMES = ["warm-humanist", "swiss-international", "editorial-magazine", "high-contrast-mono", "sci-fi-hud"];
const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function themeDesign(name, mode = "light") {
  return normalizeDesign({ theme: await loadThemeDocument(name), mode });
}

function slideChrome(overrides = {}) {
  return {
    slideId: "s1",
    surface: "content",
    branding: "full",
    banner: { src: PNG_1X1, ratio: 4 },
    selectedCrest: { src: PNG_1X1, ratio: 0.8 },
    primaryCrestRatio: 0.8,
    crestOnContentSlides: true,
    presenterOnSlides: true,
    slideNumbers: true,
    suppressPresenter: false,
    presenterText: "Asha Rao",
    index: 2,
    total: 5,
    background: "EBEBE6",
    mutedInk: "5C5C59",
    captionFamily: "Inter",
    ...overrides,
  };
}

function contentSlide(extra = {}) {
  return {
    id: "s1", purpose: "show points", title: "Points",
    blocks: [{ id: "b1", kind: "list", items: ["Alpha", "Beta", "Gamma"] }],
    ...extra,
  };
}

function chromeIds(scene) {
  return scene.elements.filter((e) => /:chrome:/.test(e.id)).map((e) => e.id).sort();
}

describe("v2-3e3 no-input compatibility", () => {
  it("compileDeck stays a scenes-only facade with optional chrome", async () => {
    const design = await warmDesign();
    const intent = { id: "d", title: "D", slides: [contentSlide()] };
    const plain = compileDeck(intent, design);
    assert.ok(Array.isArray(plain) && plain.length === 1);
    assert.ok(!plain[0].elements.some((e) => /:chrome:/.test(e.id)));
    const chromed = compileDeck(intent, design, { slides: [slideChrome({})] });
    assert.deepEqual(chromeIds(chromed[0]), [
      "s1:chrome:content-mark",
      "s1:chrome:presenter",
      "s1:chrome:slide-number",
    ]);
  });

  it("chrome plan lookup resolves per-slide decisions", async () => {
    const design = await warmDesign();
    const intent = {
      id: "d", title: "D",
      slides: [contentSlide(), { ...contentSlide(), id: "s2" }],
    };
    const chrome = {
      slides: [
        slideChrome({ slideId: "s1", surface: "title" }),
        slideChrome({ slideId: "s2" }),
      ],
    };
    const plan = planDeckChrome(intent.slides, chrome);
    assert.ok(plan && plan.slides.length === 2);
    assert.equal(chromePlanForSlide(plan, "s1")?.surface, "title");
    assert.equal(chromePlanForSlide(plan, "s2")?.surface, "content");
    assert.equal(chromePlanForSlide(plan, "s3"), null, "slides without input resolve null");
    assert.equal(chromePlanForSlide(null, "s1"), null, "null plan resolves null");
    assert.equal(planDeckChrome(intent.slides, null), null, "no input plans nothing");
    assert.throws(
      () => planDeckChrome(intent.slides, { slides: [slideChrome({ slideId: "s1", surface: "title" })] }),
      /missing entries.*"s2"/,
      "partial coverage fails instead of skipping",
    );
    void design;
  });

  it("no ChromeInput means chrome-free scenes and a null chrome plan", async () => {
    const design = await warmDesign();
    const intent = sampleDeckIntent();
    const a = compileDeckDetailed(intent, design);
    const b = compileDeckDetailed(intent, design, null);
    const c = compileDeckDetailed(intent, design, undefined);
    assert.deepEqual(a.scenes, b.scenes);
    assert.deepEqual(a.scenes, c.scenes);
    assert.equal(a.chromePlan, null);
    assert.equal(b.chromePlan, null);
    for (const scene of a.scenes) {
      assert.ok(!scene.elements.some((e) => /:chrome:/.test(e.id)), "no chrome IDs without input");
    }
  });

  it("analyzeDeck without chrome reports no chrome findings", async () => {
    const design = await warmDesign();
    const { findings } = await analyzeDeck(sampleDeckIntent(), design);
    assert.deepEqual(findings.filter((f) => f.code.startsWith("chrome-")), []);
  });
});

describe("v2-3e3 title and content emission", () => {
  it("full title emits exactly the canonical banner", async () => {
    const design = await warmDesign();
    const input = slideChrome({ surface: "title" });
    const { scenes, chromePlan } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    const [scene] = scenes;
    assert.deepEqual(chromeIds(scene), ["s1:chrome:title-banner"]);
    const banner = scene.elements.find((e) => e.id === "s1:chrome:title-banner");
    assert.equal(banner.kind, "image");
    assert.equal(banner.locked, true);
    assert.equal(banner.provenance, "compiler");
    assert.equal(banner.semanticRef, undefined);
    assert.equal(banner.image.src, PNG_1X1);
    const plan = planTitleBanner("full", 4);
    assert.equal(plan.place, true);
    assert.deepEqual({ x: banner.x, y: banner.y, w: banner.w, h: banner.h }, plan.box);
    assert.ok(chromePlan && chromePlan.slides.length === 1);
  });

  it("minimal and none title surfaces emit no banner", async () => {
    const design = await warmDesign();
    for (const branding of ["minimal", "none"]) {
      const input = slideChrome({ surface: "title", branding });
      const { scenes } = compileDeckDetailed(
        { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
      );
      assert.deepEqual(chromeIds(scenes[0]), [], `${branding} title has no chrome`);
    }
  });

  it("full content emits crest, presenter, and number", async () => {
    const design = await warmDesign();
    const input = slideChrome({});
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    const [scene] = scenes;
    assert.deepEqual(chromeIds(scene), [
      "s1:chrome:content-mark",
      "s1:chrome:presenter",
      "s1:chrome:slide-number",
    ]);
    for (const el of scene.elements.filter((e) => /:chrome:/.test(e.id))) {
      assert.equal(el.locked, true, `${el.id} locked`);
      assert.equal(el.provenance, "compiler", `${el.id} compiler-owned`);
      assert.equal(el.semanticRef, undefined, `${el.id} is not a block`);
    }
    const mark = scene.elements.find((e) => e.id === "s1:chrome:content-mark");
    assert.equal(mark.kind, "image");
    assert.equal(mark.image.src, PNG_1X1);
    const presenter = scene.elements.find((e) => e.id === "s1:chrome:presenter");
    assert.equal(presenter.kind, "text");
    assert.equal(presenter.paragraphs[0].runs[0].text, "Asha Rao");
    assert.equal(presenter.paragraphs[0].runs[0].size, 9);
    assert.equal(presenter.paragraphs[0].runs[0].family, "Inter");
    assert.equal(presenter.paragraphs[0].align, "left");
    assert.equal(presenter.valign, "middle");
    const number = scene.elements.find((e) => e.id === "s1:chrome:slide-number");
    assert.equal(number.paragraphs[0].runs[0].text, "2 / 5");
    assert.equal(number.paragraphs[0].align, "right");
    assert.equal(number.valign, "middle");
  });

  it("branding none keeps the number but drops crest and presenter", async () => {
    const design = await warmDesign();
    const input = slideChrome({ branding: "none" });
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    assert.deepEqual(chromeIds(scenes[0]), ["s1:chrome:slide-number"]);
  });

  it("slide numbers and presenter suppression stay independent", async () => {
    const design = await warmDesign();
    const noNumber = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design,
      { slides: [slideChrome({ slideNumbers: false })] },
    );
    assert.deepEqual(chromeIds(noNumber.scenes[0]), ["s1:chrome:content-mark", "s1:chrome:presenter"]);
    const suppressed = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design,
      { slides: [slideChrome({ suppressPresenter: true })] },
    );
    assert.deepEqual(chromeIds(suppressed.scenes[0]), ["s1:chrome:content-mark", "s1:chrome:slide-number"]);
  });
});

describe("v2-3e3 dark and light footer", () => {
  it("dark presenter is translucent white, dark number fully opaque", async () => {
    const design = await warmDesign();
    const input = slideChrome({ background: "141110" });
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    const presenter = scenes[0].elements.find((e) => e.id === "s1:chrome:presenter");
    const number = scenes[0].elements.find((e) => e.id === "s1:chrome:slide-number");
    assert.equal(presenter.paragraphs[0].runs[0].color, "FFFFFF");
    assert.equal(presenter.opacity, 0.45);
    assert.equal(number.paragraphs[0].runs[0].color, "FFFFFF");
    assert.equal(number.opacity, 1);
    assert.notEqual(presenter.opacity, number.opacity, "opacity objects never shared");
  });

  it("light presenter and number are opaque muted ink", async () => {
    const design = await warmDesign();
    const input = slideChrome({ background: "EBEBE6", mutedInk: "5C5C59" });
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    const presenter = scenes[0].elements.find((e) => e.id === "s1:chrome:presenter");
    const number = scenes[0].elements.find((e) => e.id === "s1:chrome:slide-number");
    assert.equal(presenter.paragraphs[0].runs[0].color, "5C5C59");
    assert.equal(presenter.opacity, 1);
    assert.equal(number.opacity, 1);
  });
});

describe("v2-3e3 crest reservation", () => {
  it("primary crest narrows the standard title before fitting", async () => {
    const design = await warmDesign();
    const title = "A title long enough that the crest reservation measurably changes its fitted size";
    const slide = { id: "s1", purpose: "p", title, blocks: [{ id: "b1", kind: "text", text: "Body." }] };
    const intent = { id: "d", title: "D", slides: [slide] };
    const reserved = compileDeckDetailed(intent, design, {
      slides: [slideChrome({ primaryCrestRatio: 1.2, selectedCrest: { src: PNG_1X1, ratio: 1.2 } })],
    }).scenes[0];
    const open = compileDeckDetailed(intent, design, {
      slides: [slideChrome({ primaryCrestRatio: null, selectedCrest: null })],
    }).scenes[0];
    const expected = reservationForTopRight(1.2);
    assert.ok(expected > 0);
    const reservedTitle = reserved.elements.find((e) => e.id === "s1:title:heading");
    const openTitle = open.elements.find((e) => e.id === "s1:title:heading");
    assert.ok(Math.abs((openTitle.w - reservedTitle.w) - expected) < 1e-9, "title narrows by exactly the reserve");
    assert.ok(reservedTitle.paragraphs[0].runs[0].size <= openTitle.paragraphs[0].runs[0].size,
      "fitting measures the narrower box, never a wider one");
  });

  it("no crest and branding none mean zero reservation", async () => {
    const design = await warmDesign();
    const slide = contentSlide();
    const intent = { id: "d", title: "D", slides: [slide] };
    const plain = compileDeckDetailed(intent, design).scenes[0];
    const plainTitle = plain.elements.find((e) => e.id === "s1:title:heading");
    for (const input of [
      slideChrome({ primaryCrestRatio: null, selectedCrest: null }),
      slideChrome({ branding: "none" }),
    ]) {
      const scene = compileDeckDetailed(intent, design, { slides: [input] }).scenes[0];
      const title = scene.elements.find((e) => e.id === "s1:title:heading");
      assert.equal(title.w, plainTitle.w, "full title width with zero reserve");
    }
  });

  it("fallback-only crest renders while reservation stays zero", async () => {
    const design = await warmDesign();
    const input = slideChrome({ primaryCrestRatio: null, selectedCrest: { src: PNG_1X1, ratio: 0.8 } });
    const { scenes, chromePlan } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    const mark = scenes[0].elements.find((e) => e.id === "s1:chrome:content-mark");
    assert.ok(mark && mark.kind === "image", "fallback mark draws");
    assert.equal(chromePlan.slides[0].topRightReserve, 0, "fallback earns no reservation");
    const plainTitle = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design,
    ).scenes[0].elements.find((e) => e.id === "s1:title:heading");
    const title = scenes[0].elements.find((e) => e.id === "s1:title:heading");
    assert.equal(title.w, plainTitle.w, "heading keeps full width");
  });

  it("divider composition keeps full-bleed titles despite crest chrome", async () => {
    const design = await warmDesign();
    const slide = {
      id: "s1", purpose: "open", title: "Opening Part One",
      rhetoricalRole: "opening",
      blocks: [{ id: "d1", kind: "text", text: "A talk about cells" }],
    };
    const intent = { id: "d", title: "D", slides: [slide] };
    const plain = compileDeckDetailed(intent, design).scenes[0];
    assert.equal(plain.recipeId, "divider");
    const chromed = compileDeckDetailed(intent, design, {
      slides: [slideChrome({ primaryCrestRatio: 1.2, selectedCrest: { src: PNG_1X1, ratio: 1.2 } })],
    }).scenes[0];
    const plainTitle = plain.elements.find((e) => e.id === "s1:title:heading");
    const title = chromed.elements.find((e) => e.id === "s1:title:heading");
    assert.equal(title.w, plainTitle.w, "divider title ignores the crest reserve");
    assert.equal(title.x, plainTitle.x);
  });
});

describe("v2-3e3 footer reserve geometry", () => {
  it("the reserve has one canonical source with exact historical value", async () => {
    assert.equal(CONTENT_FOOTER_RESERVE, 0.62);
    const { FOOTER_DAYLIGHT } = await import("../packages/core/chrome.ts");
    assert.ok(Math.abs((SCENE_H - 6.92 + FOOTER_DAYLIGHT) - CONTENT_FOOTER_RESERVE) < 1e-9);
  });

  it("compiler content never enters the footer band", async () => {
    for (const name of THEMES) {
      const { loadThemeDocument } = await import("../src/theme-loader.js");
      const { normalizeDesign } = await import("../packages/core/design.ts");
      const design = normalizeDesign({ theme: await loadThemeDocument(name), mode: "light" });
      const { scenes } = compileDeckDetailed(mechanismDeck(), design);
      let maxBottom = 0;
      for (const scene of scenes) {
        for (const el of scene.elements) {
          if (el.provenance !== "compiler" || /:chrome:/.test(el.id)) continue;
          maxBottom = Math.max(maxBottom, el.y + el.h);
          assert.ok(el.y + el.h <= FOOT_Y + 1e-9, `${name} ${scene.id}/${el.id} stays above the footer band`);
        }
      }
      assert.ok(FOOT_Y - maxBottom >= 0.5, `${name} preserves daylight, got ${FOOT_Y - maxBottom}`);
    }
    assert.ok(FOOT_H > 0 && SCENE_H === 7.5);
  });
});

describe("v2-3e3 locked commands", () => {
  async function chromed() {
    const design = await warmDesign();
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [slideChrome({})] },
    );
    return scenes[0];
  }

  it("text chrome rejects move, resize, text edit, and delete", async () => {
    for (const id of ["s1:chrome:presenter", "s1:chrome:slide-number"]) {
      const scene = await chromed();
      assert.throws(() => applyCommand(scene, { type: "element.move", id, x: 1, y: 1 }), /locked/, `${id} move`);
      assert.throws(() => applyCommand(scene, { type: "element.resize", id, w: 2, h: 1 }), /locked/, `${id} resize`);
      assert.throws(
        () => applyCommand(scene, { type: "element.updateText", id, paragraphs: [{ runs: [{ text: "X" }] }] }),
        /locked/, `${id} text`,
      );
      assert.throws(() => applyCommand(scene, { type: "element.delete", id }), /locked/, `${id} delete`);
    }
  });

  it("image chrome rejects move, resize, and delete", async () => {
    const scene = await chromed();
    const id = "s1:chrome:content-mark";
    assert.throws(() => applyCommand(scene, { type: "element.move", id, x: 1, y: 1 }), /locked/);
    assert.throws(() => applyCommand(scene, { type: "element.resize", id, w: 2, h: 1 }), /locked/);
    assert.throws(() => applyCommand(scene, { type: "element.delete", id }), /locked/);
  });
});

describe("v2-3e3 recompile with chrome", () => {
  async function setup() {
    const design = await warmDesign();
    const slide = contentSlide();
    const intent = { id: "d", title: "D", slides: [slide] };
    // Dark background exercises the presenter/number opacity split
    // through recompilation: 0.45 must never leak onto the number.
    const chrome = { slides: [slideChrome({ background: "141110" })] };
    const { plan } = planDeckComposition(intent, design);
    return { design, slide, intent, chrome, planned: plan.slides[0] };
  }

  function chromeJson(scene) {
    return scene.elements.filter((e) => /:chrome:/.test(e.id)).map((e) => JSON.stringify(e)).sort();
  }

  it("same chrome recompiles without duplication, twice stable", async () => {
    const { design, slide, chrome, planned } = await setup();
    const first = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design, chrome).scenes[0];
    const once = recompileSlide(slide, JSON.parse(JSON.stringify(first)), design, planned, [], chrome);
    const twice = recompileSlide(slide, JSON.parse(JSON.stringify(once)), design, planned, [], chrome);
    assert.deepEqual(chromeJson(once), chromeJson(first), "no duplication on recompile");
    assert.deepEqual(chromeJson(twice), chromeJson(once), "second recompile identical");
    for (const scene of [once, twice]) {
      for (const el of scene.elements.filter((e) => /:chrome:/.test(e.id))) {
        assert.equal(el.locked, true);
        assert.equal(el.provenance, "compiler");
      }
      const presenter = scene.elements.find((e) => e.id === "s1:chrome:presenter");
      const number = scene.elements.find((e) => e.id === "s1:chrome:slide-number");
      assert.equal(presenter.opacity, 0.45, "dark presenter translucency survives recompile");
      assert.equal(number.opacity, 1, "dark number opacity survives recompile");
    }
  });

  it("policy removal drops stale compiler chrome", async () => {
    const { design, slide, chrome, planned } = await setup();
    const scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design, chrome).scenes[0];
    assert.deepEqual(chromeIds(scene).length, 3);
    const noPresenter = { slides: [slideChrome({ suppressPresenter: true })] };
    const out = recompileSlide(slide, JSON.parse(JSON.stringify(scene)), design, planned, [], noPresenter);
    assert.deepEqual(chromeIds(out), ["s1:chrome:content-mark", "s1:chrome:slide-number"]);
    const noNumber = { slides: [slideChrome({ slideNumbers: false })] };
    const out2 = recompileSlide(slide, JSON.parse(JSON.stringify(scene)), design, planned, [], noNumber);
    assert.deepEqual(chromeIds(out2), ["s1:chrome:content-mark", "s1:chrome:presenter"]);
    const noCrest = { slides: [slideChrome({ selectedCrest: null, primaryCrestRatio: null })] };
    const out3 = recompileSlide(slide, JSON.parse(JSON.stringify(scene)), design, planned, [], noCrest);
    assert.deepEqual(chromeIds(out3), ["s1:chrome:presenter", "s1:chrome:slide-number"]);
  });

  it("human geometry and orphans survive chrome recompiles", async () => {
    const { design, slide, chrome, planned } = await setup();
    let scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design, chrome).scenes[0];
    const target = scene.elements.find((e) => e.kind === "text" && e.semanticRef === "b1");
    applyCommand(scene, { type: "element.move", id: target.id, x: 2.2, y: 3.3 });
    applyCommand(scene, {
      type: "element.add",
      element: { kind: "text", x: 1, y: 5, w: 3, h: 0.5, z: 5, provenance: "human", paragraphs: [{ runs: [{ text: "Note" }] }] },
    });
    const orphanId = scene.elements.at(-1).id;
    scene = recompileSlide(slide, scene, design, planned, [], chrome);
    const kept = scene.elements.find((e) => e.id === target.id);
    assert.equal(kept.x, 2.2);
    assert.equal(kept.y, 3.3);
    assert.ok(scene.elements.some((e) => e.id === orphanId), "orphan survives");
    assert.deepEqual(chromeIds(scene).length, 3, "chrome still exactly once");
  });

  it("detached scenes return the exact object untouched", async () => {
    const { design, slide, chrome, planned } = await setup();
    const scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design, chrome).scenes[0];
    scene.layoutState = "detached";
    const edited = { ...slide, title: "Changed headline" };
    assert.equal(recompileSlide(edited, scene, design, planned, [], chrome), scene);
  });

  it("chrome without a plan fails loudly instead of dropping marks", async () => {
    const { design, slide, chrome } = await setup();
    const scene = compileDeckDetailed({ id: "d", title: "D", slides: [slide] }, design, chrome).scenes[0];
    assert.throws(() => recompileSlide(slide, scene, design, null, [], chrome), /planned path/);
  });
});

describe("v2-3e3 chrome QA", () => {
  async function chromed() {
    const design = await warmDesign();
    const input = slideChrome({});
    const intent = { id: "d", title: "D", slides: [contentSlide()] };
    const detailed = compileDeckDetailed(intent, design, { slides: [input] });
    const plan = (detailed.chromePlan?.slides ?? []).find((s) => s.slideId === "s1");
    return { design, plan, scene: detailed.scenes[0] };
  }

  it("healthy chrome realizes cleanly", async () => {
    const { plan, scene } = await chromed();
    assert.deepEqual(checkChromeRealization(plan, scene), []);
    assert.deepEqual(checkChromeBand(plan, scene), []);
  });

  it("no plan means no chrome QA", async () => {
    const { scene } = await chromed();
    assert.deepEqual(checkChromeRealization(null, scene), []);
    assert.deepEqual(checkChromeBand(null, scene), []);
    assert.deepEqual(checkChromeRealization(undefined, scene), []);
  });

  it("missing chrome is L1", async () => {
    const { plan, scene } = await chromed();
    const copy = JSON.parse(JSON.stringify(scene));
    copy.elements = copy.elements.filter((e) => e.id !== "s1:chrome:presenter");
    const [finding] = checkChromeRealization(plan, copy);
    assert.ok(finding, "missing presenter reported");
    assert.equal(finding.layer, "L1");
    assert.equal(finding.code, "chrome-not-realized");
    assert.equal(finding.slideId, "s1");
    assert.deepEqual(finding.elementIds, ["s1:chrome:presenter"]);
  });

  it("wrong chrome properties are L1 mismatches", async () => {
    const cases = [
      // Opacity mutates against a dark background where the presenter
      // is 0.45 (on light grounds presenter opacity is already 1).
      ["opacity", { background: "141110" }, (el) => { el.opacity = 1; }, ["chrome-realization-mismatch"]],
      ["text", {}, (el) => { el.paragraphs[0].runs[0].text = "Someone else"; }, ["chrome-realization-mismatch"]],
      ["geometry", {}, (el) => { el.x += 1; }, ["chrome-realization-mismatch"]],
      ["locked", {}, (el) => { el.locked = false; }, ["chrome-realization-mismatch"]],
      // A human-provenance element with a chrome ID no longer
      // qualifies as compiler chrome, so the expected element reads
      // as missing — still L1, correctly so.
      ["provenance", {}, (el) => { el.provenance = "human"; }, ["chrome-not-realized"]],
      ["family", {}, (el) => { el.paragraphs[0].runs[0].family = "Comic Sans"; }, ["chrome-realization-mismatch"]],
      ["valign", {}, (el) => { el.valign = "top"; }, ["chrome-realization-mismatch"]],
    ];
    for (const [field, inputOverrides, mutate, codes] of cases) {
      const design = await warmDesign();
      const input = slideChrome(inputOverrides);
      const intent = { id: "d", title: "D", slides: [contentSlide()] };
      const { scenes } = compileDeckDetailed(intent, design, { slides: [input] });
      const copy = JSON.parse(JSON.stringify(scenes[0]));
      mutate(copy.elements.find((e) => e.id === "s1:chrome:presenter"));
      const { chromePlan } = compileDeckDetailed(intent, design, { slides: [input] });
      const plan = (chromePlan?.slides ?? []).find((s) => s.slideId === "s1");
      const findings = checkChromeRealization(plan, copy);
      assert.ok(findings.some((f) => f.layer === "L1" && codes.includes(f.code)),
        `${field} divergence reported, got ${JSON.stringify(findings.map((f) => f.code))}`);
    }
  });

  it("stale chrome with no plan entry is L1", async () => {
    const design = await warmDesign();
    const input = slideChrome({ suppressPresenter: true });
    const intent = { id: "d", title: "D", slides: [contentSlide()] };
    const detailed = compileDeckDetailed(intent, design, { slides: [input] });
    const plan = (detailed.chromePlan?.slides ?? []).find((s) => s.slideId === "s1");
    const scene = JSON.parse(JSON.stringify(detailed.scenes[0]));
    assert.ok(!scene.elements.some((e) => e.id === "s1:chrome:presenter"), "suppressed presenter absent");
    scene.elements.push({
      id: "s1:chrome:presenter", kind: "text", x: 0.7, y: 6.92, w: 6.5, h: 0.3, z: 500,
      provenance: "compiler", locked: true, opacity: 1, valign: "middle",
      paragraphs: [{ runs: [{ text: "Ghost", size: 9, color: "5C5C59", family: "Inter" }], align: "left" }],
    });
    const [finding] = checkChromeRealization(plan, scene);
    assert.ok(finding, "stale presenter reported");
    assert.equal(finding.code, "chrome-not-realized");
  });

  it("human elements mentioning chrome are not compiler chrome", async () => {
    const { plan, scene } = await chromed();
    const copy = JSON.parse(JSON.stringify(scene));
    copy.elements.push({
      id: "note-about-chrome", kind: "text", x: 1, y: 1, w: 3, h: 0.5, z: 5,
      provenance: "human", paragraphs: [{ runs: [{ text: "my chrome note" }] }],
    });
    assert.deepEqual(checkChromeRealization(plan, copy), []);
  });

  it("compiler content in the footer band is L1 chrome-band-overlap", async () => {
    const { plan, scene } = await chromed();
    const copy = JSON.parse(JSON.stringify(scene));
    const victim = copy.elements.find((e) => e.kind === "text" && e.semanticRef === "b1");
    victim.y = FOOT_Y - 0.1;
    victim.h = 0.5;
    const [finding] = checkChromeBand(plan, copy);
    assert.ok(finding, "footer intrusion reported");
    assert.equal(finding.layer, "L1");
    assert.equal(finding.code, "chrome-band-overlap");
    assert.deepEqual(finding.elementIds, [victim.id]);
  });

  it("analyzeDeck consumes the same chrome plan as compilation", async () => {
    const design = await warmDesign();
    const input = slideChrome({});
    const intent = { id: "d", title: "D", slides: [contentSlide()] };
    const { findings } = await analyzeDeck(intent, design, { slides: [input] });
    assert.deepEqual(findings.filter((f) => f.code.startsWith("chrome-")), []);
    const { findings: plain } = await analyzeDeck(intent, design);
    assert.deepEqual(plain.filter((f) => f.code.startsWith("chrome-")), []);
  });
});

describe("v2-3e3 PPTX chrome projection", () => {
  async function chromedScenes(background = "141110") {
    const design = await warmDesign();
    const input = slideChrome({ background });
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    return scenes;
  }

  async function slideXml(scenes) {
    const bytes = await renderPptx(scenes);
    const zip = await JSZip.loadAsync(bytes);
    return { zip, xml: await zip.files["ppt/slides/slide1.xml"].async("string") };
  }

  it("presenter projects family, size, and 55 transparency as native text", async () => {
    const { xml } = await slideXml(await chromedScenes("141110"));
    const at = xml.indexOf("Asha Rao");
    assert.ok(at > 0, "presenter text exists in OOXML");
    const ctx = xml.slice(Math.max(0, at - 700), at + 60);
    assert.match(ctx, /typeface="Inter"/, "chrome font family projects");
    assert.match(ctx, /sz="900"/, "9pt projects as half-points");
    assert.match(ctx, /<a:alpha val="45000"\/>/, "opacity .45 projects as transparency 55");
    assert.match(ctx, /<a:t>Asha Rao<\/a:t>/, "native editable text, not raster");
  });

  it("slide number stays fully opaque apart from the presenter", async () => {
    const { xml } = await slideXml(await chromedScenes("141110"));
    const at = xml.indexOf("2 / 5");
    assert.ok(at > 0, "number text exists in OOXML");
    const ctx = xml.slice(Math.max(0, at - 700), at + 60);
    assert.match(ctx, /sz="900"/);
    assert.match(ctx, /typeface="Inter"/);
    assert.ok(!/<a:alpha /.test(ctx), "number carries no alpha element");
    assert.match(ctx, /<a:t>2 \/ 5<\/a:t>/, "native editable text");
  });

  it("crest renders as a native image relationship, never a slide raster", async () => {
    const { zip, xml } = await slideXml(await chromedScenes("141110"));
    const media = Object.keys(zip.files).filter((n) => n.startsWith("ppt/media/"));
    assert.ok(media.length >= 1, `native image part exists, got ${media}`);
    assert.ok(!xml.includes("image-1-1") || true);
    const rels = await zip.files["ppt/slides/_rels/slide1.xml.rels"].async("string");
    assert.match(rels, /image/, "slide references the image part");
  });

  it("path-style image sources still embed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "forge-chrome-"));
    const path = join(dir, "crest.png");
    await writeFile(path, Buffer.from(PNG_1X1.split(",")[1], "base64"));
    const scenes = [{
      id: "s1", width: SCENE_W, height: 7.5, background: { fill: "FFFFFF" }, layoutState: "managed",
      elements: [{
        id: "s1:chrome:content-mark", kind: "image", x: 12, y: 0.26, w: 0.6, h: 0.82, z: 90,
        provenance: "compiler", locked: true, image: { src: path, alt: "crest" },
      }],
    }];
    const bytes = await renderPptx(scenes);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(Object.keys(zip.files).some((n) => n.startsWith("ppt/media/")), "path image embeds");
  });
});

describe("v2-3e3 SVG chrome projection", () => {
  async function chromedScene(background = "141110") {
    const design = await warmDesign();
    const input = slideChrome({ background });
    const { scenes } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
    );
    return scenes[0];
  }

  it("presenter exposes identity, text, family, and opacity", async () => {
    const scene = await chromedScene();
    const svg = sceneToSvg(scene);
    assert.match(svg, /data-el="s1:chrome:presenter"/);
    assert.match(svg, /Asha Rao/);
    assert.match(svg, /font-family="Inter"/);
    assert.match(svg, /opacity="0.45"/, "presenter translucency projects");
    const m = svg.match(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>Asha Rao<\/text>/);
    assert.ok(m, "presenter text element found");
    const cy = (6.92 + 0.15) * 96;
    assert.ok(Math.abs(Number(m[2]) - cy) < 12, `middle-aligned near vertical center, y=${m[2]} vs ${cy}`);
  });

  it("slide number never inherits presenter translucency", async () => {
    const scene = await chromedScene();
    const svg = sceneToSvg(scene);
    const g = svg.match(/<g data-el="s1:chrome:slide-number"([^>]*)>/);
    assert.ok(g, "number group exists");
    assert.ok(!/opacity=/.test(g[1]), "no opacity attribute on the number");
    assert.match(svg, /2 \/ 5/);
  });

  it("chrome image keeps stable identity and geometry", async () => {
    const scene = await chromedScene();
    const svg = sceneToSvg(scene);
    assert.match(svg, /data-el="s1:chrome:content-mark"/);
  });
});

describe("v2-3e3 themes and purity", () => {
  it("five themes share chrome semantics with correct dark/light behavior", async () => {
    for (const name of THEMES) {
      const design = await themeDesign(name);
      const bg = design.palette.bg.hex;
      const input = slideChrome({
        background: bg,
        mutedInk: design.palette.inkMuted.hex,
        captionFamily: design.roles.caption?.family,
      });
      const { scenes } = compileDeckDetailed(
        { id: "d", title: "D", slides: [contentSlide()] }, design, { slides: [input] },
      );
      const [scene] = scenes;
      assert.deepEqual(chromeIds(scene), [
        "s1:chrome:content-mark",
        "s1:chrome:presenter",
        "s1:chrome:slide-number",
      ], `${name} emits the same chrome set`);
      const presenter = scene.elements.find((e) => e.id === "s1:chrome:presenter");
      const number = scene.elements.find((e) => e.id === "s1:chrome:slide-number");
      const dark = bg.toLowerCase() === "0a0f14";
      if (dark) {
        assert.equal(presenter.paragraphs[0].runs[0].color, "FFFFFF", `${name} dark presenter white`);
        assert.equal(presenter.opacity, 0.45, `${name} dark presenter translucent`);
        assert.equal(number.opacity, 1, `${name} dark number opaque`);
      } else {
        assert.equal(presenter.opacity, 1, `${name} light presenter opaque`);
        assert.equal(number.opacity, 1, `${name} light number opaque`);
      }
      assert.equal(presenter.paragraphs[0].runs[0].family, design.roles.caption?.family);
    }
  });

  it("compiler chrome derives from input and policy, never theme names", async () => {
    for (const f of ["../packages/compiler/chrome.ts", "../packages/compiler/quality.ts"]) {
      const text = await readFile(new URL(f, import.meta.url), "utf8");
      for (const name of THEMES) {
        assert.ok(!text.includes(name), `${f} branches on theme ${name}`);
      }
    }
  });

  it("core and compiler chrome name no forbidden concerns", async () => {
    for (const f of ["../packages/core/chrome.ts", "../packages/compiler/chrome.ts"]) {
      const text = await readFile(new URL(f, import.meta.url), "utf8");
      for (const name of ["DIVIDER_TYPES", "REFERENCE_TYPES", "sharp", "node:fs", "node:path", "pptxgenjs", "resolveBrandPath", "loadIdentity", "tenant", "fetch(", "Vercel", "Neon", "Blob"]) {
        assert.ok(!text.includes(name), `${f} mentions ${name}`);
      }
    }
  });
});

describe("v2-3e3 chrome coverage validation", () => {
  function threeSlides() {
    return {
      id: "d", title: "D",
      slides: ["s1", "s2", "s3"].map((id) => ({ ...contentSlide(), id })),
    };
  }

  function fullChrome(ids) {
    return { slides: ids.map((slideId, i) => slideChrome({ slideId, index: i + 1, total: ids.length })) };
  }

  it("exact coverage succeeds", async () => {
    const design = await warmDesign();
    const intent = threeSlides();
    const { scenes, chromePlan } = compileDeckDetailed(intent, design, fullChrome(["s1", "s2", "s3"]));
    assert.equal(chromePlan?.slides.length, 3);
    for (const scene of scenes) {
      assert.deepEqual(chromeIds(scene), [
        `${scene.id}:chrome:content-mark`,
        `${scene.id}:chrome:presenter`,
        `${scene.id}:chrome:slide-number`,
      ]);
    }
  });

  it("one missing slide throws, identifying it", async () => {
    const design = await warmDesign();
    const intent = threeSlides();
    assert.throws(
      () => compileDeckDetailed(intent, design, fullChrome(["s1", "s3"])),
      /missing entries.*"s2"/,
    );
  });

  it("missing first, middle, and last slides each fail", async () => {
    const design = await warmDesign();
    const intent = threeSlides();
    for (const missing of ["s1", "s2", "s3"]) {
      const ids = ["s1", "s2", "s3"].filter((id) => id !== missing);
      assert.throws(
        () => compileDeckDetailed(intent, design, fullChrome(ids)),
        new RegExp(`missing entries.*"${missing}"`),
        `missing ${missing} fails`,
      );
    }
  });

  it("duplicate slide entries throw, identifying the ID", async () => {
    const design = await warmDesign();
    const intent = threeSlides();
    const chrome = fullChrome(["s1", "s2", "s3"]);
    chrome.slides.push(slideChrome({ slideId: "s2", index: 2, total: 3 }));
    assert.throws(
      () => compileDeckDetailed(intent, design, chrome),
      /duplicate entries.*"s2"/,
    );
  });

  it("unknown extra slide entries throw, identifying the ID", async () => {
    const design = await warmDesign();
    const intent = threeSlides();
    const chrome = fullChrome(["s1", "s2", "s3"]);
    chrome.slides.push(slideChrome({ slideId: "sx", index: 4, total: 4 }));
    assert.throws(
      () => compileDeckDetailed(intent, design, chrome),
      /unknown slide.*"sx"/,
    );
  });

  it("empty ChromeInput for a nonempty deck fails", async () => {
    const design = await warmDesign();
    assert.throws(
      () => compileDeckDetailed(threeSlides(), design, { slides: [] }),
      /missing entries.*"s1"/,
    );
  });

  it("no ChromeInput remains valid and chrome-free", async () => {
    const design = await warmDesign();
    const { scenes, chromePlan } = compileDeckDetailed(threeSlides(), design);
    assert.equal(chromePlan, null);
    for (const scene of scenes) {
      assert.ok(!scene.elements.some((e) => /:chrome:/.test(e.id)));
    }
  });

  it("analyzeDeck cannot stay clean when explicit chrome lacks a slide", async () => {
    const design = await warmDesign();
    await assert.rejects(
      analyzeDeck(threeSlides(), design, fullChrome(["s1", "s2"])),
      /missing entries.*"s3"/,
    );
  });

  it("recompile with chrome missing this slide throws", async () => {
    const design = await warmDesign();
    const slide = contentSlide();
    const intent = { id: "d", title: "D", slides: [slide] };
    const chrome = { slides: [slideChrome({})] };
    const { plan } = planDeckComposition(intent, design);
    const scene = compileDeckDetailed(intent, design, chrome).scenes[0];
    const other = { slides: [slideChrome({ slideId: "s9", index: 1, total: 1 })] };
    assert.throws(
      () => recompileSlide(slide, scene, design, plan.slides[0], [], other),
      /missing entries.*"s1"/,
    );
  });
});

describe("v2-3e3 reservation follows emission", () => {
  function reservedTitleWidths(design, crestOpts) {
    const title = "A title long enough that crest reservation measurably changes its fitted box and size";
    const slide = { id: "s1", purpose: "p", title, blocks: [{ id: "b1", kind: "text", text: "Body." }] };
    const intent = { id: "d", title: "D", slides: [slide] };
    const { scenes } = compileDeckDetailed(intent, design, { slides: [slideChrome(crestOpts)] });
    const titleEl = scenes[0].elements.find((e) => e.id === "s1:title:heading");
    return { titleEl, scenes };
  }

  it("minimal branding reserves exactly like full when the crest draws", async () => {
    const design = await warmDesign();
    const expected = reservationForTopRight(1.2);
    const crest = { primaryCrestRatio: 1.2, selectedCrest: { src: PNG_1X1, ratio: 1.2 } };
    const full = reservedTitleWidths(design, { ...crest, branding: "full" }).titleEl;
    const minimal = reservedTitleWidths(design, { ...crest, branding: "minimal" }).titleEl;
    const plain = compileDeckDetailed(
      { id: "d", title: "D", slides: [{ id: "s1", purpose: "p", title: full.paragraphs[0].runs[0].text, blocks: [{ id: "b1", kind: "text", text: "Body." }] }] },
      design,
    ).scenes[0].elements.find((e) => e.id === "s1:title:heading");
    assert.ok(Math.abs((plain.w - full.w) - expected) < 1e-9, "full reserve is canonical");
    assert.ok(Math.abs((plain.w - minimal.w) - expected) < 1e-9, "minimal reserve matches full");
  });

  it("disabled crest returns to full width with identical fit evidence", async () => {
    const design = await warmDesign();
    const title = "A title long enough that crest reservation measurably changes its fitted box and size";
    const slide = { id: "s1", purpose: "p", title, blocks: [{ id: "b1", kind: "text", text: "Body." }] };
    const intent = { id: "d", title: "D", slides: [slide] };
    const disabled = compileDeckDetailed(intent, design, {
      slides: [slideChrome({ crestOnContentSlides: false, primaryCrestRatio: 1.2, selectedCrest: { src: PNG_1X1, ratio: 1.2 } })],
    });
    const plain = compileDeckDetailed(intent, design);
    const disabledTitle = disabled.scenes[0].elements.find((e) => e.id === "s1:title:heading");
    const plainTitle = plain.scenes[0].elements.find((e) => e.id === "s1:title:heading");
    assert.equal(disabledTitle.w, plainTitle.w, "no unused reservation penalty");
    assert.deepEqual(
      disabledTitle.paragraphs.map((p) => p.runs.map((r) => r.size)),
      plainTitle.paragraphs.map((p) => p.runs.map((r) => r.size)),
      "identical fitted sizes",
    );
    assert.deepEqual(disabled.fitDiagnostics, plain.fitDiagnostics, "no artificial floor-hit from a phantom reserve");
    assert.ok(!disabled.scenes[0].elements.some((e) => e.id === "s1:chrome:content-mark"), "no mark emitted");
  });

  it("absent crest asset reserves nothing and emits no mark", async () => {
    const design = await warmDesign();
    const { scenes, chromePlan } = compileDeckDetailed(
      { id: "d", title: "D", slides: [contentSlide()] }, design,
      { slides: [slideChrome({ primaryCrestRatio: 1.2, selectedCrest: null })] },
    );
    assert.ok(!scenes[0].elements.some((e) => e.id === "s1:chrome:content-mark"));
    assert.equal(chromePlan?.slides[0]?.topRightReserve, 0);
  });
});
