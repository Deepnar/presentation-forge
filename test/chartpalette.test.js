import { test } from "node:test";
import assert from "node:assert/strict";
import { listThemes, loadTheme } from "../src/theme.js";
import { chartSeries, contrast, ensureContrast, isMonochrome, rgbToHsl, hslToHex } from "../src/chartpalette.js";

/**
 * The chart palette contract.
 *
 * A chart is the one place in the deck where colour carries data rather than
 * decoration, so "looks a bit flat" and "one series is missing" are the same
 * bug seen from different distances. These check the properties that make a
 * multi-series chart readable, across every theme, in both modes.
 */

const MIN_VS_BG = 3;        // WCAG non-text threshold; a bar is a large solid area
const MIN_BETWEEN = 1.35;   // adjacent series must not read as one

test("colour maths round-trips and ranks contrast the way WCAG does", () => {
  assert.equal(contrast("#000000", "#FFFFFF").toFixed(0), "21");
  assert.equal(contrast("#FFFFFF", "#FFFFFF").toFixed(0), "1");
  // Contrast is symmetric — the order of arguments must not matter.
  assert.equal(contrast("#123456", "#EEEEEE"), contrast("#EEEEEE", "#123456"));
  const hsl = rgbToHsl("#C05D4E");
  assert.equal(hslToHex(hsl), "#C05D4E");
});

test("ensureContrast moves a colour off the background, keeping its hue", () => {
  // White on white is the exact failure that made a series vanish.
  const fixed = ensureContrast("#FFFFFF", "#FFFFFF");
  assert.ok(contrast(fixed, "#FFFFFF") >= MIN_VS_BG, `got ${contrast(fixed, "#FFFFFF")}`);

  const onDark = ensureContrast("#111111", "#0B0E14");
  assert.ok(contrast(onDark, "#0B0E14") >= MIN_VS_BG);

  // A colour that already clears the floor is returned untouched.
  assert.equal(ensureContrast("#C05D4E", "#EBEBE6"), "#C05D4E");

  // Hue survives the lightness adjustment.
  const shifted = ensureContrast("#8FD4FF", "#FFFFFF");
  assert.ok(Math.abs(rgbToHsl(shifted).h - rgbToHsl("#8FD4FF").h) < 6);
});

test("a theme's declared series palette is used verbatim when it is legible", async () => {
  const theme = await loadTheme("warm-humanist");
  const declared = ["#123456", "#AA3311"];
  const withTokens = { ...theme, tokens: { ...theme.tokens, chart: { series: declared } } };
  const out = chartSeries(withTokens, 4);
  assert.equal(out[0], declared[0]);
  assert.equal(out[1], declared[1]);
  // It cycles rather than running out.
  assert.equal(out[2], declared[0]);
});

test("every theme yields visible, distinguishable series in both modes", async () => {
  const names = await listThemes();
  assert.ok(names.length >= 30, `expected the full gallery, got ${names.length}`);

  const problems = [];
  for (const name of names) {
    for (const mode of ["light", "dark"]) {
      const theme = await loadTheme(name, { mode });
      const series = chartSeries(theme, 6);

      assert.equal(new Set(series).size, series.length, `${name}/${mode}: duplicate series colours`);

      for (const [i, c] of series.entries()) {
        const vsBg = contrast(c, theme.palette.bg);
        if (vsBg < MIN_VS_BG) {
          problems.push(`${name}/${mode}: series ${i + 1} ${c} is ${vsBg.toFixed(2)}:1 on ${theme.palette.bg}`);
        }
      }
      for (let i = 1; i < series.length; i++) {
        const between = contrast(series[i], series[i - 1]);
        // Hue-separated colours can share a lightness and still read apart, so
        // the neighbour rule only binds where hue does not do the work.
        const a = rgbToHsl(series[i - 1]);
        const b = rgbToHsl(series[i]);
        const hueGap = Math.abs(((b.h - a.h) % 360 + 360) % 360);
        const hueSeparated = Math.min(hueGap, 360 - hueGap) > 25 && a.s > 0.15 && b.s > 0.15;
        if (!hueSeparated && between < MIN_BETWEEN) {
          problems.push(`${name}/${mode}: series ${i} and ${i + 1} (${series[i - 1]}, ${series[i]}) differ by only ${between.toFixed(2)}:1`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], `chart palette problems:\n  ${problems.join("\n  ")}`);
});

test("a monochrome theme is given a value ramp, not invented hues", () => {
  // Derivation must not colourise a deliberately colourless design. A theme
  // that wants colour on its charts asks for it explicitly — high-contrast-mono
  // does exactly that, because greys cannot carry four series at a readable
  // contrast and its fourth was vanishing into the page.
  const mono = { palette: { bg: "#FFFFFF", accent: "#000000", accent_alt: "#FFFFFF", ink: "#000000" }, tokens: {} };
  assert.ok(isMonochrome(mono.palette));
  for (const c of chartSeries(mono, 4)) {
    assert.ok(rgbToHsl(c).s < 0.05, `${c} carries hue in a monochrome theme`);
  }
});

test("high-contrast-mono declares real chart colours, and keeps ink in front", async () => {
  const theme = await loadTheme("high-contrast-mono");
  const series = chartSeries(theme, 4);
  // The reported bug: three identical blacks and an invisible white.
  assert.equal(new Set(series).size, 4);
  for (const c of series) assert.ok(contrast(c, theme.palette.bg) >= MIN_VS_BG);
  // Ink leads, so a one-series chart still reads as this theme.
  assert.ok(contrast(series[0], "#000000") < 2);
});
