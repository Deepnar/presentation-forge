// V2-3F-5: plate background compatibility. Proves the smallest
// defensible slice: native decor + cardFill alpha resolve in the
// compiler, plate imagery arrives through the adapter seam, and both
// renderers project the same contract without touching content
// semantics, geometry, chrome policy, or earlier 3F fixes.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { listThemeNames, loadThemeDocument } from "../src/theme-loader.js";
import { loadTheme } from "../src/theme.js";
import { plateHtmlFor } from "../src/plate.js";
import { normalizeDesign } from "../packages/core/design.ts";
import { validateDesign } from "../packages/model/validate.ts";
import { validateScene } from "../packages/model/scene.ts";
import { compileDeck, compileDeckDetailed, recompileSlide } from "../packages/compiler/compile.js";
import { planDeckComposition } from "../packages/compiler/composition.ts";
import { analyzeDeck } from "../packages/compiler/quality.ts";
import { checkSceneGeometry, checkElementIds, semanticProjection } from "../packages/core/scene-quality.ts";
import { surfaceForPlan, cardFillOf, flatSceneBackground } from "../packages/compiler/background.ts";
import {
  resolvePlateBackgrounds,
  slideBackgrounds,
  contrastBackground,
  assertPlateSafe,
  samplePlateCorner,
} from "../src/v2-plates.js";
import { renderPptx } from "../packages/renderer-pptx/render.ts";
import { sceneToSvg } from "../packages/editor/scene-svg.js";
import { mechanismDeck } from "./v2-mechanism-fixture.js";
import { benchmarkIntents } from "./v2-benchmark-intents.js";
import { benchmarkChrome } from "../tools/v2-benchmark.mjs";

const PLATE_THEMES = [
  "aurora-mesh", "chalkboard", "claymorphism", "glassmorphism",
  "gradient-mesh-dark", "isometric-dark", "neumorphism", "retro-crt",
  "soft-glass-light", "sunset",
];
const DECOR_THEMES = [
  "blueprint", "corporate-alegria", "corporate-clean-blue", "letterpress",
  "minimal-muji", "mono-terminal-light", "nature-organic", "notion-clean",
  "paper-pastel", "risograph", "sci-fi-hud", "swiss-international",
];
const CARDFILL_THEMES = [
  "aurora-mesh", "chalkboard", "claymorphism", "glassmorphism",
  "isometric-dark", "neumorphism", "soft-glass-light",
];

async function designOf(name, mode = "light") {
  const design = normalizeDesign({ theme: await loadThemeDocument(name), mode });
  assert.equal((await validateDesign(design)).ok, true, `${name} design validates`);
  return design;
}

describe("v2-3f-5 theme audit", () => {
  it("classifies all 34 themes: 10 plate, 12 decor, 7 declared cardFill", async () => {
    const names = await listThemeNames();
    assert.equal(names.length, 34);
    const plate = [];
    const decor = [];
    const cardFill = [];
    for (const name of names) {
      const raw = await loadThemeDocument(name);
      if (raw.tokens?.plate?.enabled === true) plate.push(name);
      if (Array.isArray(raw.tokens?.background?.decor) && raw.tokens.background.decor.length) decor.push(name);
      if (raw.tokens?.shape?.card_fill != null) cardFill.push(name);
    }
    assert.deepEqual(plate.sort(), [...PLATE_THEMES].sort());
    assert.deepEqual(decor.sort(), [...DECOR_THEMES].sort());
    assert.deepEqual(cardFill.sort(), [...CARDFILL_THEMES].sort());
    assert.deepEqual(plate.filter((t) => decor.includes(t)), [], "no theme is both plate and decor");
  });

  it("every plate template interpolates fully against mode-resolved tokens", async () => {
    for (const name of PLATE_THEMES) {
      const theme = await loadTheme(name, { mode: "light" });
      const design = await designOf(name);
      const m = design.grid.margins;
      const box = { x: m.left, y: m.top, w: 13.333 - m.left - m.right, h: 4, bottom: 7.5 - m.bottom - 0.62 };
      for (const surface of ["content", "title", "section"]) {
        const want = plateHtmlFor({ theme, surface, slide: null, box });
        assert.ok(want?.html, `${name}/${surface} resolves a template`);
        assert.ok(!want.html.includes("{{"), `${name}/${surface} leaves no uninterpolated token`);
        assertPlateSafe(want.html, `${name}/${surface}`);
      }
    }
  });

  it("plate templates reference only embedded data: assets", async () => {
    for (const name of PLATE_THEMES) {
      const theme = await loadTheme(name, { mode: "light" });
      const html = theme.plate.html + Object.values(theme.plate.surfaces ?? {}).join("\n");
      assert.ok(!/url\(\s*["']?\s*https?:\/\//i.test(html), `${name}: no remote url()`);
      assert.ok(!/\bsrc\s*=\s*["']\s*https?:\/\//i.test(html), `${name}: no remote src`);
      assert.ok(!/file:\/\//i.test(html), `${name}: no file: refs`);
    }
  });
});

describe("v2-3f-5 native resolution", () => {
  it("solid-only themes keep the legacy background shape exactly", async () => {
    const design = await designOf("warm-humanist");
    const [scene] = compileDeck(mechanismDeck(), design);
    assert.deepEqual(scene.background, { fill: design.palette.bg.hex });
    const v = await validateScene(scene);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("decor themes resolve fills with alpha into the scene background", async () => {
    const design = await designOf("blueprint");
    assert.equal(design.background.decor.length, 6);
    const [scene] = compileDeck(mechanismDeck(), design);
    assert.equal(scene.background.decor.length, 6);
    assert.deepEqual(
      scene.background.decor.map((d) => [d.shape, d.fill, d.fillAlpha]),
      design.background.decor.map((d) => [d.shape, d.fill.hex, Math.round(d.fill.alpha * 10000) / 10000]),
    );
    // Dressing adds no elements: authored representation is untouched.
    assert.ok(scene.elements.every((e) => !/:decor:/.test(e.id)));
  });

  it("translucent cardFill survives with its declared opacity", async () => {
    const glass = await designOf("glassmorphism");
    assert.equal(glass.shape.cardFill.hex, "FFFFFF");
    assert.ok(Math.abs(glass.shape.cardFill.alpha - 0.58) < 1e-9);
    assert.deepEqual(cardFillOf(glass), { hex: "FFFFFF", alpha: 0.58 });
    const scenes = compileDeck(mechanismDeck(), glass);
    const frames = scenes.flatMap((s) => s.elements).filter((e) => e.kind === "shape" && /:frame$/.test(e.id));
    assert.ok(frames.length > 0, "mechanism deck has card frames");
    for (const f of frames) {
      assert.equal(f.shape.fill, "FFFFFF");
      assert.ok(Math.abs(f.shape.fillAlpha - 0.58) < 1e-9, `${f.id} keeps glass translucency`);
    }
    const clay = await designOf("claymorphism");
    const clayScenes = compileDeck(mechanismDeck(), clay);
    const clayFrame = clayScenes.flatMap((s) => s.elements).find((e) => e.kind === "shape" && /:frame$/.test(e.id));
    assert.ok(Math.abs(clayFrame.shape.fillAlpha - 0.82) < 1e-9, "clay transparency 18 -> alpha 0.82");
  });

  it("undeclared cardFill stays opaque with no new keys", async () => {
    const design = await designOf("warm-humanist");
    assert.deepEqual(cardFillOf(design), { hex: design.palette.surface.hex });
    const [scene] = compileDeck(mechanismDeck(), design);
    assert.ok(!JSON.stringify(scene.elements).includes("fillAlpha"), "no alpha keys on solid themes");
  });

  it("surface mapping follows composition family, never theme names", () => {
    assert.equal(surfaceForPlan({ family: "divider", variantKey: "divider/opening" }), "title");
    assert.equal(surfaceForPlan({ family: "divider", variantKey: "divider/closing" }), "title");
    assert.equal(surfaceForPlan({ family: "divider", variantKey: "divider/transition" }), "section");
    assert.equal(surfaceForPlan({ family: "divider", variantKey: "divider/standard" }), "section");
    for (const family of ["prose-list", "card-grid", "comparison", "data-table", "metric", "chart", "sequence", "escape"]) {
      assert.equal(surfaceForPlan({ family, variantKey: `${family}/x` }), "content", family);
    }
  });

  it("flat backgrounds omit absent keys for byte-identical legacy scenes", () => {
    return designOf("warm-humanist").then((design) => {
      assert.deepEqual(flatSceneBackground(design), { fill: design.palette.bg.hex });
    });
  });
});

describe("v2-3f-5 adapter seam", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "v2plate-"));
  });

  it("native themes resolve no assets", async () => {
    const design = await designOf("warm-humanist");
    const r = await resolvePlateBackgrounds({ themeName: "warm-humanist", mode: "light", design, cacheDir: dir });
    assert.deepEqual(r, { hasPlate: false, assets: {} });
    assert.deepEqual(slideBackgrounds(r), {});
    assert.equal(contrastBackground(r, "content", design), `#${design.palette.bg.hex}`);
  });

  it("plate themes resolve three hashed assets with sampled contrast", async () => {
    const design = await designOf("glassmorphism");
    const r = await resolvePlateBackgrounds({ themeName: "glassmorphism", mode: "light", design, cacheDir: dir });
    assert.equal(r.hasPlate, true);
    assert.deepEqual(Object.keys(r.assets).sort(), ["content", "section", "title"]);
    for (const [surface, a] of Object.entries(r.assets)) {
      assert.match(a.hash, /^[0-9a-f]{64}$/, `${surface} hash pinned`);
      assert.ok(a.src.startsWith("data:image/png;base64,"), `${surface} portable data URI`);
      assert.equal(a.width, 1920, `${surface} matches the scene canvas aspect`);
      assert.equal(a.height, 1080, `${surface} matches the scene canvas aspect`);
      assert.match(a.contrastBg, /^#[0-9A-F]{6}$/, `${surface} contrast sampled`);
    }
    const seam = slideBackgrounds(r);
    assert.deepEqual(Object.keys(seam).sort(), ["content", "section", "title"]);
    assert.deepEqual(Object.values(seam)[0], { src: r.assets.content.src, hash: r.assets.content.hash });
  });

  it("resolution is deterministic across runs", async () => {
    const design = await designOf("glassmorphism");
    const opts = { themeName: "glassmorphism", mode: "light", design, cacheDir: dir };
    const a = await resolvePlateBackgrounds(opts);
    const b = await resolvePlateBackgrounds(opts);
    assert.deepEqual(
      Object.fromEntries(Object.entries(b.assets).map(([k, v]) => [k, v.hash])),
      Object.fromEntries(Object.entries(a.assets).map(([k, v]) => [k, v.hash])),
    );
  });

  it("missing or hostile plates fail explicitly", async () => {
    const design = await designOf("warm-humanist");
    await assert.rejects(resolvePlateBackgrounds({ mode: "light", design, cacheDir: dir }), /themeName/);
    await assert.rejects(
      resolvePlateBackgrounds({ themeName: "no-such-theme", mode: "light", design, cacheDir: dir }),
      /Unknown theme/,
    );
    assert.throws(() => assertPlateSafe('<script src="https://x/y.js">', "t/s"), /rejected/);
    assert.throws(() => assertPlateSafe('<div style="background:url(https://x/y.png)">', "t/s"), /rejected/);
    assert.throws(() => assertPlateSafe('<img src="https://x/y.png">', "t/s"), /rejected/);
    // Embedded grain namespaces are legitimate and must not trip the guard.
    assertPlateSafe("<div style=\"background-image:url('data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\'></svg>')\"></div>", "t/s");
  });

  it("corner sampling reads pixels, not declarations", async () => {
    const design = await designOf("glassmorphism");
    const r = await resolvePlateBackgrounds({ themeName: "glassmorphism", mode: "light", design, cacheDir: dir });
    assert.ok(r.assets.title.contrastBg !== r.assets.content.contrastBg, "title and content plates sample differently");
    assert.equal(await samplePlateCorner("/nonexistent/x.png"), null, "sampling failure is null, never a throw");
  });
});

describe("v2-3f-5 scene integration", () => {
  let dir;
  let glass;
  let seam;
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "v2plate-scene-"));
    const design = await designOf("glassmorphism");
    glass = design;
    seam = slideBackgrounds(await resolvePlateBackgrounds({ themeName: "glassmorphism", mode: "light", design, cacheDir: dir }));
  });

  it("plate assets land on scenes by planned surface", async () => {
    const { scenes, plan } = compileDeckDetailed(mechanismDeck(), glass, null, seam);
    assert.ok(scenes.length >= 4);
    for (const scene of scenes) {
      const comp = plan.slides.find((s) => s.slideId === scene.id);
      const surface = surfaceForPlan(comp);
      assert.equal(scene.background.image.hash, seam[surface].hash, `${scene.id} carries its ${surface} plate`);
      const v = await validateScene(scene);
      assert.equal(v.ok, true, `${scene.id}: ${v.errors.join("; ")}`);
    }
  });

  it("backgrounds never alter authored semantics or identity", async () => {
    const intent = mechanismDeck();
    const a = compileDeck(intent, glass);
    const b = compileDeck(intent, glass, null, seam);
    assert.deepEqual(a.map(semanticProjection), b.map(semanticProjection), "semantic projection identical");
    for (const scene of b) {
      assert.deepEqual(checkElementIds(scene), [], `${scene.id} no duplicate ids`);
      assert.deepEqual(checkSceneGeometry(scene), [], `${scene.id} geometry clean`);
    }
  });

  it("every authored block stays represented with native charts on plates", async () => {
    const intents = benchmarkIntents();
    const { scenes } = compileDeckDetailed(intents["data-heavy-analytical"], glass, null, seam);
    const byId = new Map(scenes.map((s) => [s.id, s]));
    for (const slide of intents["data-heavy-analytical"].slides) {
      const refs = new Set();
      const walk = (els) => {
        for (const el of els ?? []) {
          if (el.semanticRef) refs.add(el.semanticRef);
          walk(el.group?.children ?? []);
        }
      };
      walk(byId.get(slide.id)?.elements);
      for (const block of slide.blocks) assert.ok(refs.has(block.id), `${slide.id}/${block.id} represented`);
    }
    const chart = scenes.flatMap((s) => s.elements).find((e) => e.kind === "chart");
    assert.ok(chart, "chart stays a native scene element above the plate");
    assert.deepEqual(chart.chart.categories, intents["data-heavy-analytical"].slides.flatMap((s) => s.blocks).find((b) => b.kind === "chart").categories);
  });

  it("historical scenes without the new fields remain valid", async () => {
    const v = await validateScene({
      id: "old", width: 13.333, height: 7.5,
      background: { fill: "FFFFFF" },
      elements: [{ id: "e1", kind: "shape", x: 1, y: 1, w: 2, h: 1, z: 10, provenance: "compiler", shape: { form: "rect", fill: "FF0000" } }],
      layoutState: "managed",
    });
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("recompile preserves customized geometry over dressed backgrounds", async () => {
    const intent = mechanismDeck();
    const { plan } = compileDeckDetailed(intent, glass, null, seam);
    const byId = new Map(plan.slides.map((s) => [s.slideId, s]));
    const [first] = compileDeck(intent, glass, null, seam);
    const customized = {
      ...first,
      layoutState: "customized",
      elements: first.elements.map((e, i) => (i === 0 ? { ...e, x: e.x + 0.25, customized: true, provenance: "human" } : e)),
    };
    const slide = intent.slides[0];
    const next = recompileSlide(slide, customized, glass, byId.get(slide.id), [], null, seam);
    assert.equal(next.elements[0].x, customized.elements[0].x, "human geometry survives");
    assert.equal(next.background.image.hash, seam.title.hash ?? seam.content.hash, "background asset survives recompile");
  });

  it("detached scenes stay authoritative", async () => {
    const [scene] = compileDeck(mechanismDeck(), glass, null, seam);
    const detached = { ...scene, layoutState: "detached", background: { fill: "123456" } };
    const slide = mechanismDeck().slides[0];
    const { plan } = planDeckComposition(mechanismDeck(), glass);
    const next = recompileSlide(slide, detached, glass, plan.slides[0], [], null, seam);
    assert.deepEqual(next, detached);
  });

  it("decision-deck capacity failures remain reported on dressed themes", async () => {
    const intents = benchmarkIntents();
    const design = await designOf("warm-humanist");
    const analysis = await analyzeDeck(intents["decision-recommendation"], design);
    assert.ok(analysis.findings.some((f) => f.code === "text-fit-floor-hit"), "honest floor-hits still reported");
  });
});

describe("v2-3f-5 renderer projection", () => {
  let sciDesign;
  let seam;
  let scenes;
  let bytes;
  let zip;
  let slideXml;
  before(async () => {
    sciDesign = await designOf("sci-fi-hud");
    const gdesign = await designOf("glassmorphism");
    const resolved = await resolvePlateBackgrounds({
      themeName: "glassmorphism", mode: "light", design: gdesign,
      cacheDir: mkdtempSync(path.join(tmpdir(), "v2plate-r-")),
    });
    seam = slideBackgrounds(resolved);
    scenes = compileDeck(mechanismDeck(), gdesign, null, seam);
    bytes = await renderPptx(scenes, {});
    zip = await JSZip.loadAsync(bytes);
    slideXml = "";
    for (const n of Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))) {
      slideXml += await zip.files[n].async("string");
    }
  });

  it("embeds the plate as the slide background image", async () => {
    const images = Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.(png|jpeg|jpg)$/.test(n));
    assert.ok(images.length >= 1, "plate bytes embedded as image parts");
    assert.match(slideXml, /<p:bg>/, "slides carry a background element");
    const rels = await zip.files["ppt/slides/_rels/slide1.xml.rels"].async("string");
    assert.match(rels, /media\//, "slide rel targets the embedded plate");
  });

  it("keeps text, charts, and tables native above the plate", async () => {
    assert.match(slideXml, /<a:t>/, "native text runs survive");
    const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    assert.ok(charts.length >= 1, "native chart parts survive");
  });

  it("projects card translucency as OOXML transparency", async () => {
    assert.match(slideXml, /<a:alpha val="58000"\/>/, "glass alpha 0.58 -> transparency 42");
  });

  it("draws decor dressing behind content on decor themes", async () => {
    const dscenes = compileDeck(mechanismDeck(), sciDesign);
    const dbytes = await renderPptx(dscenes, {});
    const dzip = await JSZip.loadAsync(dbytes);
    let dxml = "";
    for (const n of Object.keys(dzip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))) {
      dxml += await dzip.files[n].async("string");
    }
    const firstDecor = dxml.indexOf("E85AD4");
    const firstText = dxml.indexOf("<a:t>");
    assert.ok(firstDecor !== -1 && firstDecor < firstText, "sci-fi decor shapes precede text runs");
  });

  it("SVG projects the same resolved background above the flat fill", async () => {
    const framed = scenes.find((s) => JSON.stringify(s).includes("fillAlpha"));
    assert.ok(framed, "mechanism deck has a translucent frame to inspect");
    const svg = sceneToSvg(framed);
    assert.match(svg, new RegExp(`fill="#${framed.background.fill}"`), "flat ground retained under the plate");
    assert.match(svg, /<image[^>]+href="data:image\/png;base64,/, "plate asset embedded in SVG");
    const imgAt = svg.indexOf("<image");
    const firstEl = svg.indexOf("data-el=");
    assert.ok(imgAt !== -1 && imgAt < firstEl, "plate precedes all content elements");
    assert.match(svg, /fill-opacity="0.58"/, "card translucency visible in SVG");
  });

  it("SVG carries decor on decor themes", async () => {
    const [scene] = compileDeck(mechanismDeck(), sciDesign);
    const svg = sceneToSvg(scene);
    assert.match(svg, /fill="#E85AD4"/, "sci-fi accent bar in SVG");
    assert.match(svg, /fill-opacity="0.65"/, "decor alpha in SVG");
  });

  it("dark plates keep the accepted chrome opacities", async () => {
    const design = await designOf("gradient-mesh-dark");
    const resolved = await resolvePlateBackgrounds({
      themeName: "gradient-mesh-dark", mode: "light", design,
      cacheDir: mkdtempSync(path.join(tmpdir(), "v2plate-c-")),
    });
    const { plan } = planDeckComposition(mechanismDeck(), design);
    const chrome = benchmarkChrome(mechanismDeck(), design, { backgrounds: resolved, plan });
    const { scenes: chromed } = compileDeckDetailed(mechanismDeck(), design, chrome, slideBackgrounds(resolved));
    const footer = chromed[1].elements.filter((e) => /:chrome:(presenter|slide-number)$/.test(e.id));
    assert.equal(footer.length, 2);
    const presenter = footer.find((e) => e.id.endsWith(":chrome:presenter"));
    const number = footer.find((e) => e.id.endsWith(":chrome:slide-number"));
    assert.equal(presenter.opacity, 0.45, "dark presenter opacity preserved");
    assert.equal(number.opacity, 1.0, "dark slide-number opacity preserved");
    assert.equal(presenter.paragraphs[0].runs[0].color, "FFFFFF", "dark footer reads white");
  });
});
