import { test } from "node:test";
import assert from "node:assert/strict";
import { measure, fitScale, lineCount } from "../src/fit.js";

test("wide geometric sans are measured wider than plain sans", () => {
  const plain = measure("Ray Tracing", { family: "Inter", size: 15 });
  for (const fam of ["Manrope", "Poppins", "Outfit", "Space Grotesk", "DM Sans", "IBM Plex Sans"]) {
    const wide = measure("Ray Tracing", { family: fam, size: 15 });
    assert.ok(wide > plain, `${fam} should estimate wider than Inter`);
  }
});

test("mono and condensed families are bounded sanely", () => {
  const mono = measure("iiiiiiiiii", { family: "IBM Plex Mono", size: 15 });
  const condensed = measure("iiiiiiiiii", { family: "Oswald", size: 15 });
  assert.ok(mono > condensed, "mono wider than condensed");
});

test("fitScale shrinks a long headline rather than returning 1", () => {
  const style = { family: "Poppins", size: 30, line: 1.1 };
  const scale = fitScale("Rasterisation vs Ray Tracing: A Fundamental Divide", 4.0, 1.0, style);
  assert.ok(scale < 1, `expected shrink, got ${scale}`);
  assert.ok(scale >= 0.55, "never below the fitter floor");
});

test("lineCount wraps long text and keeps short text on one line", () => {
  const style = { family: "Inter", size: 15 };
  assert.equal(lineCount("Short", 6, style), 1);
  assert.ok(lineCount("A very long sentence that should definitely wrap", 2, style) > 1);
});
