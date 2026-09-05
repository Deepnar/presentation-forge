import { test } from "node:test";
import assert from "node:assert/strict";
import {
  measure, fitScale, fitScaleAll, fitOneLine, lineCount,
  resetFloorEvents, drainFloorEvents,
} from "../src/fit.js";

test("wide geometric sans are measured wider than plain sans", () => {
  // Inter itself is a wide geometric sans (the most common body family), so it
  // must be in the wide set rather than the narrow baseline it used to be.
  const plain = measure("Ray Tracing", { family: "Source Sans 3", size: 15 });
  for (const fam of ["Inter", "Manrope", "Poppins", "Outfit", "Space Grotesk", "DM Sans", "IBM Plex Sans"]) {
    const wide = measure("Ray Tracing", { family: fam, size: 15 });
    assert.ok(wide > plain, `${fam} should estimate wider than plain sans`);
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

test("measure is em-aware: the same text measures wider at a larger size", () => {
  // The fitter's old measure forgot the em factor, so a 146-char body "measured"
  // ~81 inches at 13pt no matter the size — the source of "the font is usually
  // small". Width must scale with size/72.
  const t = "Ray tracing works";
  const a = measure(t, { family: "Inter", size: 13 });
  const b = measure(t, { family: "Inter", size: 26 });
  assert.ok(b > a * 1.9, "doubling the size must roughly double the measured width");
  assert.ok(a < 3, "an 18-char line must not 'measure' as ~9in (the old bug)");
});

test("ordinary body content fits a bullets slide at scale 1", () => {
  // Regression for the small-font complaint: three ~60-char bullets in a 4.2in
  // box must render at nominal size, not shrink toward the old 0.62 floor.
  const body = { family: "Inter", size: 13, line: 1.55 };
  const bullets = [
    "Interpolation and the rendering equation form the mathematical core of ray tracing",
    "Monte Carlo sampling estimates the incoming radiance integral for each pixel",
    "Acceleration structures prune the scene so billions of rays stay tractable",
  ];
  const avail = 4.2;
  const scale = fitScaleAll(bullets, 11.9, avail / bullets.length, body);
  assert.equal(scale, 1);
});

test("fitScale clamps at the role floor and reports instead of shrinking", () => {
  resetFloorEvents();
  const body = { family: "Inter", size: 13, line: 1.55, _role: "body" };
  // The text genuinely needs ~6pt to fit this tiny box; the floor holds it at
  // the theme nominal (13pt — the floor never grows past the theme design).
  const scale = fitScale(
    "A body that is far too long for the box it has been given and cannot fit at a readable size",
    2.5, 0.4, body,
  );
  assert.equal(scale, 1, "must not shrink below the floor");
  const events = drainFloorEvents();
  assert.ok(events.length >= 1, "must report a floor hit");
  assert.match(events[0], /body would need .*pt — floor/);
});

test("a bigger nominal with a floor still lets the fitter shrink down to the floor", () => {
  resetFloorEvents();
  const subhead = { family: "Inter", size: 15, line: 1.45, _role: "subhead" };
  const scale = fitScale(
    "An over-long subhead that cannot fit on one line inside the chip it lives in",
    2.2, 0.4, subhead,
  );
  // Floor is 14pt, so min scale is 14/15 ≈ 0.93 — clamped, not 0.65.
  assert.ok(scale >= 0.9, `expected a near-floor clamp, got ${scale}`);
  assert.ok(drainFloorEvents().length >= 1, "must flag a below-floor need");
});

test("no role and no explicit floor keeps the old shrink behaviour", () => {
  resetFloorEvents();
  const style = { family: "Poppins", size: 30, line: 1.1 };
  const scale = fitScale("Rasterisation vs Ray Tracing: A Fundamental Divide", 4.0, 1.0, style);
  assert.ok(scale < 1);
  assert.ok(scale >= 0.5, "never below the old fitter floor");
  assert.equal(drainFloorEvents().length, 0, "no role means no floor event");
});

test("fitOneLine respects the stat floor", () => {
  resetFloorEvents();
  const stat = { family: "Merriweather", size: 54, line: 1.0, _role: "stat" };
  // A wide value in a narrow box: raw need ≈ 0.27, but the 24pt floor holds
  // the stat at min(0.5, 24/54≈0.44) → clamped to 0.5 and flagged.
  const scale = fitOneLine("99.9%", 0.5, stat);
  assert.ok(scale >= 0.44, `stat must not shrink below its floor, got ${scale}`);
  assert.ok(drainFloorEvents().length >= 1, "must flag the below-floor need");
});

/* ------------------------------------------- the floor a report actually names */

test("a floor report names the size the text was really clamped at", () => {
  // The fitter has always handled a theme whose own size is below the role
  // floor correctly — minScale caps at 1, so a compact theme keeps its design
  // size and is never grown. Only the MESSAGE was wrong: minimal-muji sets
  // body at 13pt and every one of its reports read "floor 14pt", describing a
  // rule that was not the one applied and making the gap look a point wider
  // than it is.
  resetFloorEvents();
  const compact = { family: "Inter", size: 13, weight: 400, line: 1.5, _role: "body" };
  fitScale("A sentence long enough that it cannot possibly fit.".repeat(6), 3, 0.4, compact);
  const [msg] = drainFloorEvents();
  assert.ok(msg, "a clamped fit must report something");
  assert.match(msg, /floor 13pt/, msg);
  assert.ok(!/floor 14pt/.test(msg), "the role floor is not the applied floor here");
});

test("a theme at or above the role floor still reports the role floor", () => {
  resetFloorEvents();
  const roomy = { family: "Inter", size: 18, weight: 400, line: 1.5, _role: "body" };
  fitScale("A sentence long enough that it cannot possibly fit.".repeat(6), 3, 0.4, roomy);
  const [msg] = drainFloorEvents();
  assert.match(msg, /floor 14pt/, msg);
});
