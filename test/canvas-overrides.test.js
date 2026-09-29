import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overrideGeom, overridePaint, resolvePaintValue, inLockedZone, drawFreeforms,
} from "../src/overrides.js";
import { layouts } from "../src/layouts/core.js";
import { loadTheme } from "../src/theme.js";
import { content } from "../src/layouts/helpers.js";
import { render } from "../src/render.js";

/**
 * Slice 2 of the canvas: the renderer applies the human `overrides` block.
 * pptxgenjs shapes are immutable once added, so placed elements resolve
 * inside the layout (`overrideGeom` / `overridePaint` — `bullets` first,
 * headline/standfirst through the shared `drawHeading`), while free
 * textboxes and images draw after the layout. Chrome bands are locked:
 * a free element intersecting them is refused with a visible problem.
 */

const ctxWith = (overrides) => ({ overrides });
const GEOM = { x: 1, y: 2, w: 5, h: 3 };

/* ------------------------------------------------------- unit: resolution */

test("overrideGeom merges per key and ignores the rest", () => {
  assert.deepEqual(
    overrideGeom(ctxWith({ elements: [{ target: "body", x: 2, h: 4 }] }), "body", GEOM),
    { x: 2, y: 2, w: 5, h: 4 },
    "partial override merges over the default",
  );
  assert.deepEqual(overrideGeom(ctxWith({}), "body", GEOM), GEOM, "no block passes through");
  assert.deepEqual(overrideGeom({}, "body", GEOM), GEOM, "no ctx passes through");
  assert.deepEqual(
    overrideGeom(ctxWith({ elements: [{ target: "headline", x: 9 }] }), "body", GEOM),
    GEOM,
    "another target's entry is ignored",
  );
});

test("resolvePaintValue takes hex and token paths, never guesses", async () => {
  const theme = await loadTheme("warm-humanist");
  assert.equal(resolvePaintValue(theme, "#FF0000"), "FF0000");
  assert.equal(resolvePaintValue(theme, "palette.accent"), theme.palette.accent.replace(/^#/, ""));
  assert.equal(resolvePaintValue(theme, "nope.nowhere"), undefined, "unknown token is ignored");
  assert.equal(resolvePaintValue(theme, ""), undefined);
});

test("overridePaint recolours text and shape fills", async () => {
  const theme = await loadTheme("warm-humanist");
  const ctx = ctxWith({ paint: [{ target: "body", color: "#FF0000", fill: "palette.accent" }] });
  const text = overridePaint(ctx, theme, "body", { color: "000000", fontSize: 18 });
  assert.equal(text.color, "FF0000", "text takes the hex");
  assert.equal(text.fill.color, theme.palette.accent.replace(/^#/, ""), "fill takes the token path");
  assert.equal(text.fontSize, 18, "untouched opts survive");
  const shaped = overridePaint(ctx, theme, "body", { fill: { color: "FFFFFF", transparency: 10 } });
  assert.deepEqual(shaped.fill, { color: theme.palette.accent.replace(/^#/, ""), transparency: 10 });
  assert.deepEqual(overridePaint({}, theme, "body", { color: "000000" }), { color: "000000" });
});

test("the crest corner and the footer band are locked", () => {
  assert.ok(inLockedZone({ x: 12, y: 0.5, w: 1, h: 0.5 }), "crest corner locked");
  assert.ok(inLockedZone({ x: 1, y: 7, w: 5, h: 0.4 }), "footer band locked");
  assert.ok(!inLockedZone({ x: 1, y: 2, w: 5, h: 3 }), "the body is free");
});

/* ------------------------------------------------------- unit: freeforms */

const captureSlide = () => {
  const calls = [];
  return {
    calls,
    slide: {
      addText: (...a) => calls.push(["text", ...a]),
      addShape: (...a) => calls.push(["shape", ...a]),
      addImage: (...a) => calls.push(["image", ...a]),
    },
  };
};

test("drawFreeforms draws text and images, and refuses chrome + missing files", async () => {
  const theme = await loadTheme("warm-humanist");
  const { calls, slide } = captureSlide();
  const ctx = {
    theme,
    resolveAsset: (rel) => (rel === "assets/real.png" ? "/abs/assets/real.png" : null),
    overrides: {
      textboxes: [
        { text: "aside", x: 10, y: 5, w: 2, h: 1 },
        { text: "footer graffiti", x: 1, y: 7, w: 5, h: 0.4 },
      ],
      images: [
        { asset: "assets/real.png", x: 8, y: 1, w: 2, h: 2 },
        { asset: "assets/gone.png", x: 10, y: 3.5, w: 2, h: 2 },
      ],
    },
  };
  const problems = drawFreeforms(slide, ctx);
  const texts = calls.filter((c) => c[0] === "text");
  assert.equal(texts.length, 1, "only the clear textbox draws");
  assert.equal(texts[0][1], "aside");
  assert.equal(texts[0][2].x, 10);
  const images = calls.filter((c) => c[0] === "image");
  assert.equal(images.length, 1, "only the resolvable image draws");
  assert.deepEqual(problems, [
    "free textbox 2 overlaps the locked chrome (crest/footer) — not drawn",
    'free image 2 ("assets/gone.png") does not resolve to a file — not drawn',
  ]);
});

test("drawFreeforms sizes textboxes from the theme unless told otherwise", async () => {
  const theme = await loadTheme("warm-humanist");
  const { calls, slide } = captureSlide();
  drawFreeforms(slide, {
    theme,
    overrides: { textboxes: [{ text: "big", x: 1, y: 1, w: 4, h: 1, size: theme.type.body.size * 2 }] },
  });
  assert.equal(calls[0][2].fontSize, Math.round(theme.type.body.size * 2 * 10) / 10);
});

/* ------------------------------------------------------- layout integration */

async function bulletsCtx(overrides) {
  const theme = await loadTheme("warm-humanist");
  const box = content(theme, {}, { identity: {} });
  return {
    theme,
    deck: { title: "T", sections: ["S"] },
    data: { type: "bullets", section: 0, headline: "Points", bullets: ["one", "two", "three", "four"] },
    identity: {},
    box,
    overrides,
  };
}

test("bullets honours body + headline geometry and body paint", async () => {
  const base = await bulletsCtx(undefined);
  const plain = captureSlide();
  layouts.bullets(plain.slide, base);
  const plainBody = plain.calls.filter((c) => c[0] === "text").at(-1)[2];

  const over = await bulletsCtx({
    elements: [{ target: "body", x: 2, w: 4 }, { target: "headline", y: plainBody.y }],
    paint: [{ target: "body", color: "#00FF00" }],
  });
  const moved = captureSlide();
  layouts.bullets(moved.slide, over);
  const texts = moved.calls.filter((c) => c[0] === "text");
  const body = texts.at(-1)[2];
  assert.equal(body.x, 2, "body x overridden");
  assert.equal(body.w, 4, "body w overridden");
  assert.equal(body.y, plainBody.y, "body y untouched");
  assert.equal(body.color, "00FF00", "body paint applied");
  const headline = texts.find((c) => c[1] === "Points")[2];
  assert.equal(headline.y, plainBody.y, "headline y overridden");
});

test("an untagged layout ignores the block entirely", async () => {
  const theme = await loadTheme("warm-humanist");
  const box = content(theme, {}, { identity: {} });
  const ctx = {
    theme,
    deck: { title: "T", sections: ["S"] },
    data: { type: "cards", section: 0, headline: "Facts", cards: [{ title: "A", body: "b" }, { title: "B", body: "c" }] },
    identity: {},
    box,
    overrides: { elements: [{ target: "body", x: 2 }] },
  };
  const { layouts: all } = await import("../src/layouts.js");
  const { calls, slide } = captureSlide();
  all.cards(slide, ctx); // no override plumbing yet: renders the default
  assert.ok(calls.length > 0, "the layout drew");
});

test("overrideGeom reports where the box drew, overridden or not", () => {
  const ctx = {};
  overrideGeom(ctx, "body", GEOM);
  assert.deepEqual(ctx.placed, { body: GEOM }, "defaults are reported too");
  const ctx2 = ctxWith({ elements: [{ target: "body", x: 2 }] });
  const resolved = overrideGeom(ctx2, "body", GEOM);
  assert.deepEqual(ctx2.placed, { body: resolved });
  assert.equal(resolved.x, 2);
});

/* ------------------------------------------------------- full render */

test("a rendered deck applies overrides and refuses chrome violations", async () => {
  const deck = {
    title: "T",
    theme: "warm-humanist",
    slides: [{
      type: "bullets",
      section: 0,
      headline: "Points",
      bullets: ["one", "two", "three", "four"],
      overrides: {
        elements: [{ target: "body", x: 2, w: 8 }],
        paint: [{ target: "headline", color: "palette.accent" }],
        textboxes: [
          { text: "aside", x: 10, y: 5, w: 2, h: 1 },
          { text: "graffiti", x: 1, y: 7, w: 5, h: 0.4 },
        ],
      },
    }],
  };
  const dir = "/home/deepnar/Programs/presentations/decks/perovskite-solar-cell-stability-challenges";
  const r = await render({ deck, deckDir: dir, write: false });
  assert.equal(r.slides, 1);
  assert.ok(
    r.problems.some((p) => p.includes("locked chrome")),
    `expected a chrome refusal, got: ${JSON.stringify(r.problems)}`,
  );
  assert.ok(
    !r.problems.some((p) => !p.includes("locked chrome")),
    `no other problems expected, got: ${JSON.stringify(r.problems)}`,
  );
});

test("a headless render reports per-slide placed geometry", async () => {
  const deck = {
    title: "T",
    theme: "warm-humanist",
    slides: [
      {
        type: "bullets",
        section: 0,
        headline: "Points",
        bullets: ["one", "two", "three", "four"],
        overrides: { elements: [{ target: "body", x: 2, w: 8 }] },
      },
      { type: "section", section: 0, headline: "Next" },
    ],
  };
  const dir = "/home/deepnar/Programs/presentations/decks/perovskite-solar-cell-stability-challenges";
  const r = await render({ deck, deckDir: dir, write: false });
  assert.equal(r.placed.length, 2, "one entry per slide, even untagged");
  assert.ok(r.placed[0].headline, "headline reported via the shared helper");
  assert.equal(r.placed[0].body.x, 2, "the reported box is the resolved one");
  assert.equal(r.placed[0].body.w, 8);
});
