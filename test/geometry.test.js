import { test } from "node:test";
import assert from "node:assert/strict";
import { watchGeometry } from "../src/geometry.js";

/**
 * The contract of the box watcher.
 *
 * `test/themematrix.test.js` already gates the product against it — a layout
 * that emits a bad box shows up there as a problem on a theme. This pins what
 * the watcher itself counts as bad, because the two exemptions are judgement
 * calls that a later reader would otherwise be free to "fix": a decorative
 * shape may bleed off the canvas, and a rotated box is judged on the footprint
 * it renders rather than the one it declares.
 */

/** A stand-in for the pptxgenjs slide — the watcher only forwards to it. */
function fakeSlide() {
  const calls = [];
  return {
    calls,
    addText: (...a) => calls.push(["text", a]),
    addShape: (...a) => calls.push(["shape", a]),
    addImage: (...a) => calls.push(["image", a]),
    background: null,
  };
}

test("a negative extent is reported — pptxgenjs writes it without a word", () => {
  const w = watchGeometry(fakeSlide());
  w.slide.addText("caption", { x: 1, y: 1, w: 3, h: -0.4 });
  w.slide.addShape("line", { x: 1, y: 1, w: -1.99, h: 0.03 });
  const found = w.problems();
  assert.equal(found.length, 2);
  assert.match(found[0], /height of -0\.4in/);
  assert.match(found[1], /width of -1\.99in/);
});

test("the draw still reaches the real slide — the watcher observes, never filters", () => {
  const real = fakeSlide();
  const w = watchGeometry(real);
  w.slide.addText("body", { x: 1, y: 1, w: -3, h: 0.4 });
  assert.equal(real.calls.length, 1, "the bad box is still written");
  assert.equal(real.calls[0][0], "text");
});

test("text off the canvas is reported; a decorative shape may bleed", () => {
  const w = watchGeometry(fakeSlide());
  w.slide.addShape("rect", { x: -0.6, y: -0.6, w: 4, h: 4 });
  assert.deepEqual(w.problems(), [], "a slab hung past the corner is the design");

  const t = watchGeometry(fakeSlide());
  t.slide.addText("label", { x: -0.6, y: 1, w: 2, h: 0.4 });
  assert.match(t.problems()[0], /0\.6in off the left edge/);
});

test("a quarter-turned box is judged on the footprint it renders", () => {
  // The matrix axis labels: 1.2 x 0.3 with a logical left edge 0.05in off the
  // canvas, whose rendered footprint is well inside it.
  const w = watchGeometry(fakeSlide());
  w.slide.addText("IMPACT", { x: -0.05, y: 2, w: 1.2, h: 0.3, rotate: 270 });
  assert.deepEqual(w.problems(), []);

  // The same box unrotated is off the page, and still says so.
  const flat = watchGeometry(fakeSlide());
  flat.slide.addText("IMPACT", { x: -0.05, y: 2, w: 1.2, h: 0.3 });
  assert.equal(flat.problems().length, 1);
});

test("a box positioned by anything but a number is left alone", () => {
  const w = watchGeometry(fakeSlide());
  w.slide.addText("x", { x: "50%", y: 1, w: 2, h: 0.4 });
  w.slide.addImage({ path: "a.png" });
  assert.deepEqual(w.problems(), []);
});
