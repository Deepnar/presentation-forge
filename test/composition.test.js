import { test } from "node:test";
import assert from "node:assert/strict";
import { listThemes, loadTheme } from "../src/theme.js";
import { resolveLayout, layoutOf, frameBox } from "../src/composition.js";

/**
 * The composition vocabulary. Its whole safety property is that an axis a
 * theme does not mention behaves exactly as it did before the axis existed,
 * and that an axis it gets wrong fails loudly rather than reverting to that
 * default — a theme silently losing its design is the failure mode this
 * replaces.
 */

test("an empty layout block is the pre-existing behaviour", () => {
  const l = resolveLayout(undefined);
  assert.equal(l.title.composition, "flush-bottom");
  assert.equal(l.section.composition, "flush");
  assert.equal(l.heading.opening, "pill");
  assert.equal(l.heading.align, "left");
  assert.equal(l.heading.rule, "none");
  assert.equal(l.content.frame, "full");
  assert.equal(l.list.marker, "dot");
  assert.equal(l.list.columns, 1);
  assert.equal(l.text.dropcap, false);
  assert.deepEqual(resolveLayout({}), l);
});

test("a declared axis overrides only itself", () => {
  const l = resolveLayout({ content: { frame: "sidebar" } });
  assert.equal(l.content.frame, "sidebar");
  assert.equal(l.heading.opening, "pill", "sibling axes keep their defaults");
});

test("an unknown group, key or value throws by name", () => {
  assert.throws(() => resolveLayout({ nope: { a: 1 } }, "t"), /unknown layout group "nope"/);
  assert.throws(() => resolveLayout({ heading: { nope: 1 } }, "t"), /unknown layout key "heading.nope"/);
  assert.throws(() => resolveLayout({ heading: { opening: "chip" } }, "t"), /layout.heading.opening/);
});

test("every theme declares a layout the renderer understands", async () => {
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    assert.doesNotThrow(() => layoutOf(theme), `${name}: layout block`);
  }
});

test("no theme still carries the flags the layout block replaced", async () => {
  for (const name of await listThemes()) {
    const theme = await loadTheme(name);
    assert.equal(theme.tokens.editorial, undefined, `${name}: tokens.editorial is now layout.list/layout.text`);
    assert.equal(theme.tokens.bauhaus, undefined, `${name}: tokens.bauhaus is now layout.section.composition`);
  }
});

test("every frame leaves a usable body column and clears the crest", async () => {
  const theme = await loadTheme("swiss-international");
  const m = theme.grid.margin;
  const base = {
    x: m.left, y: m.top,
    w: 13.333 - m.left - m.right,
    right: 13.333 - m.right,
    bottom: 7.5 - m.bottom,
    titleW: 13.333 - m.left - m.right - 1.6, // a crest's worth of reservation
  };

  for (const frame of ["full", "inset", "offset", "sidebar"]) {
    const box = frameBox(theme, base, frame);
    assert.ok(box.w > 5, `${frame}: body column ${box.w.toFixed(2)}in is too narrow to set text in`);
    assert.ok(box.x + box.w <= base.right + 0.001, `${frame}: body column runs past the right margin`);
    assert.ok(box.titleW <= box.w, `${frame}: the crest reservation must narrow the heading, not widen it`);
    assert.ok(box.head.w > 2.5, `${frame}: heading column ${box.head.w.toFixed(2)}in is too narrow`);
    assert.ok(box.mark.x >= base.x - 0.001, `${frame}: the opening mark sits outside the left margin`);
  }

  // The sidebar is the only frame whose body starts beside the heading rather
  // than under it, and it must clear the crest's 1.08in footprint.
  const side = frameBox(theme, base, "sidebar");
  assert.ok(side.bodyY >= 1.1, "sidebar body column would run under the crest");
  assert.ok(side.bodyY < theme.grid.band.body_y, "sidebar should buy height, not spend it");
});
