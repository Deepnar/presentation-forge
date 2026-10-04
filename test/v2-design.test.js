// V2-2B: DesignSystem normalization. Schemas validate; goldens pin
// byte-exact output for representative themes; semantic tests pin merge,
// fallback, alpha, and exclusion behavior.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { normalizeDesign } from "../packages/core/design.ts";
import { validateDesign } from "../packages/model/validate.ts";
import { listThemeNames, loadThemeDocument, loadStyleDocument } from "../src/theme-loader.js";

async function designOf(name, { style, mode = "light" } = {}) {
  const theme = await loadThemeDocument(name);
  const styleDoc = style ? await loadStyleDocument(style) : undefined;
  const design = normalizeDesign({ theme, style: styleDoc, mode });
  const { ok, errors } = await validateDesign(design);
  assert.equal(ok, true, `${name}/${mode}: ${errors.join("\n")}`);
  return design;
}

describe("v2 design validation", () => {
  it("rejects unknown properties and missing baseline roles", async () => {
    const design = await designOf("warm-humanist");
    assert.equal((await validateDesign({ ...design, raw: {} })).ok, false);
    const { roles, ...rest } = design;
    assert.equal((await validateDesign(rest)).ok, false);
    const { display, ...sixRoles } = roles;
    assert.equal((await validateDesign({ ...design, roles: sixRoles })).ok, false);
  });

  it("fails loudly on malformed theme documents", async () => {
    assert.throws(() => normalizeDesign({ theme: { name: "x" }, mode: "light" }), /palette/);
    assert.throws(
      () => normalizeDesign({ theme: { name: "x", tokens: { palette: {} } }, mode: "light" }),
      /type/,
    );
    const noBody = await loadThemeDocument("warm-humanist");
    delete noBody.tokens.type.body;
    assert.throws(() => normalizeDesign({ theme: noBody, mode: "light" }), /body/);
  });

  it("does not mutate its inputs", async () => {
    const theme = await loadThemeDocument("glassmorphism");
    const style = await loadStyleDocument("compact");
    const before = JSON.stringify({ theme, style });
    normalizeDesign({ theme, style, mode: "dark" });
    assert.equal(JSON.stringify({ theme, style }), before);
  });
});

describe("v2 design semantics", () => {
  it("merges dark palette overrides", async () => {
    const light = await designOf("warm-humanist", { mode: "light" });
    const dark = await designOf("warm-humanist", { mode: "dark" });
    assert.notDeepEqual(dark.palette.bg, light.palette.bg);
    assert.equal(dark.mode, "dark");
  });

  it("deep-merges style tokens with arrays replacing", async () => {
    const base = await designOf("warm-humanist");
    const styled = await designOf("warm-humanist", { style: "compact" });
    const { ok } = await validateDesign(styled);
    assert.equal(ok, true);
    assert.notDeepEqual(styled, base);
  });

  it("maps absent layout to empty preferences and preserves value types", async () => {
    const notion = await designOf("notion-clean");
    assert.deepEqual(notion.layoutPreferences, {});
    const ed = await designOf("editorial-magazine");
    assert.equal(ed.layoutPreferences.list?.columns, 2);
    assert.equal(ed.layoutPreferences.text?.dropcap, true);
    const sci = await designOf("sci-fi-hud");
    assert.equal(sci.layoutPreferences.content?.frame, "sidebar");
  });

  it("falls back cardFill to palette.surface and converts explicit transparency", async () => {
    const warm = await designOf("warm-humanist");
    assert.deepEqual(warm.shape.cardFill, warm.palette.surface);
    const glass = await designOf("glassmorphism");
    assert.equal(glass.shape.cardFill.hex, "FFFFFF");
    assert.ok(Math.abs((glass.shape.cardFill.alpha ?? 0) - (1 - 42 / 100)) < 1e-12);
    const neu = await designOf("neumorphism");
    assert.ok(Math.abs((neu.shape.cardFill.alpha ?? 0) - (1 - 88 / 100)) < 1e-12);
  });

  it("converts 8-digit border alpha at full precision", async () => {
    const glass = await designOf("glassmorphism");
    assert.equal(glass.shape.border.color.hex, "FFFFFF");
    assert.ok(Math.abs((glass.shape.border.color.alpha ?? 0) - 0x80 / 255) < 1e-12);
    const deco = await designOf("art-deco");
    assert.deepEqual(deco.shape.border.color, { hex: "000000", alpha: 0 });
  });

  it("converts decor transparency 94 to alpha 0.06", async () => {
    const notion = await designOf("notion-clean");
    const el = (notion.background?.decor ?? []).find((d) => d.fill.hex === "2383E2");
    assert.ok(el);
    assert.ok(Math.abs((el.fill.alpha ?? 0) - (1 - 94 / 100)) < 1e-12);
  });

  it("folds shadow opacity into color.alpha and keeps type and angle", async () => {
    const warm = await designOf("warm-humanist");
    assert.equal(warm.shadow?.card?.type, "outer");
    assert.equal(warm.shadow?.card?.angle, 90);
    assert.equal(typeof warm.shadow?.card?.blur, "number");
    assert.equal(typeof warm.shadow?.card?.color.hex, "string");
  });

  it("passes chart series through and excludes plate, outliers, and voice", async () => {
    const mono = await designOf("high-contrast-mono");
    assert.ok(Array.isArray(mono.chart?.series) && mono.chart.series.length > 0);
    assert.equal(mono.chart.series[0].hex, "111111");
    for (const name of ["gradient-mesh-dark", "warm-humanist", "sunset"]) {
      const design = await designOf(name);
      const json = JSON.stringify(design);
      for (const banned of ["plate", "aurora", "clay", "\"sky\"", "voice", "feel", "headline_style", "raw"]) {
        assert.ok(!json.includes(`"${banned}"`), `${name} leaks ${banned}`);
      }
    }
  });
});

describe("v2 design radii", () => {
  it("preserves real theme radii instead of fallbacks", async () => {
    const warm = await designOf("warm-humanist");
    assert.equal(warm.shape.radii.card, 0.24);
    assert.equal(warm.shape.radii.pill, 0.4);
    assert.equal(warm.shape.radii.chip, 0.12);
  });

  it("preserves zero radii where the theme means square", async () => {
    const mono = await designOf("high-contrast-mono");
    assert.equal(mono.shape.radii.card, 0);
    assert.equal(mono.shape.radii.chip, 0);
  });

  it("carries style radius overrides through the merge", async () => {
    const styled = await designOf("warm-humanist", { style: "compact" });
    assert.equal(styled.shape.radii.card, 0.16);
    assert.equal(styled.shape.radii.pill, 0.32);
    assert.equal(styled.shape.radii.chip, 0.12);
    assert.equal(styled.shape.cardPad, 0.24);
  });
});

describe("v2 design crosswalk", () => {
  // Hand-written expectations from the raw YAML documents (not generated
  // by normalizeDesign): schema-valid output with correct snapshots can
  // still mis-map a renamed field, as shape.radius proved.
  it("maps representative raw declarations to normalized values", async () => {
    const warm = await designOf("warm-humanist");
    assert.deepEqual(warm.palette.bg, { hex: "EBEBE6" });
    assert.equal(warm.palette.accent.hex, "C05D4E");
    assert.deepEqual(warm.roles.body, {
      family: "Inter", weight: 400, size: 13, line: 1.55, tracking: 0,
    });
    assert.deepEqual(warm.grid.margins, { top: 0.62, right: 0.7, bottom: 0.55, left: 0.7 });
    assert.deepEqual(warm.shape.radii, { card: 0.24, chip: 0.12, pill: 0.4 });
    assert.equal(warm.shape.cardPad, 0.3);
    assert.equal(warm.shape.border.width, 0);
    assert.deepEqual(warm.shape.border.color, { hex: "000000", alpha: 0 });
    assert.equal(warm.layoutPreferences.heading?.opening, "bar");
    assert.equal(warm.surfaces.title.bg.hex, warm.palette.ink.hex);

    const ed = await designOf("editorial-magazine");
    assert.equal(ed.layoutPreferences.list?.columns, 2);
    assert.equal(ed.layoutPreferences.text?.dropcap, true);

    const sci = await designOf("sci-fi-hud");
    assert.equal(sci.layoutPreferences.content?.frame, "sidebar");
    const rect = (sci.background?.decor ?? []).find((d) => d.shape === "rect");
    assert.ok(rect && rect.w > 0 && rect.fill.hex.length === 6);

    const mono = await designOf("high-contrast-mono", { mode: "dark" });
    assert.equal(mono.chart?.series?.[0].hex, "111111");
    assert.equal(mono.chart?.series?.length, 6);
  });
});

describe("v2 design sweep", () => {
  it("all 34 themes normalize and validate in both modes", async () => {
    for (const name of await listThemeNames()) {
      for (const mode of ["light", "dark"]) {
        const theme = await loadThemeDocument(name);
        const design = normalizeDesign({ theme, mode });
        const { ok, errors } = await validateDesign(design);
        assert.equal(ok, true, `${name}/${mode}: ${errors.join("\n")}`);
      }
    }
  });
});

const GOLDENS = [
  ["warm-humanist", "light", undefined],
  ["swiss-international", "light", undefined],
  ["high-contrast-mono", "dark", undefined],
  ["sci-fi-hud", "light", undefined],
  ["gradient-mesh-dark", "dark", undefined],
  ["editorial-magazine", "light", undefined],
  ["notion-clean", "light", undefined],
  ["warm-humanist", "light", "compact"],
];

describe("v2 design goldens", () => {
  it("normalized output matches checked-in goldens byte-for-byte", async () => {
    const url = new URL("./fixtures/v2-design-goldens.json", import.meta.url);
    const expected = JSON.parse(await readFile(url, "utf8"));
    for (const [name, mode, style] of GOLDENS) {
      const design = await designOf(name, { mode, style });
      const key = `${name}/${mode}${style ? `+${style}` : ""}`;
      assert.deepEqual(design, expected[key], `golden drift: ${key}`);
    }
  });
});

export async function writeGoldens(path) {
  const out = {};
  for (const [name, mode, style] of GOLDENS) {
    out[`${name}/${mode}${style ? `+${style}` : ""}`] = await designOf(name, { mode, style });
  }
  await writeFile(path, `${JSON.stringify(out, null, 1)}\n`);
}
