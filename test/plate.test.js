import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSync } from "node:fs";
import {
  plateCacheKey,
  interpolateTemplate,
  plateHtmlFor,
  renderPlate,
  PLATE_W,
  PLATE_H,
  PLATE_SCALE,
  chromeBinary,
} from "../src/plate.js";

const theme = {
  tokens: { palette: { bg: "#FFFFFF", accent: "#123456" }, grid: { margin: 1 } },
  voice: { feel: "warm" },
  mode: "light",
};

test("cache key covers html and viewport, in a stable way", () => {
  const a = "<div/>";
  assert.equal(plateCacheKey(a), plateCacheKey(a));
  assert.notEqual(plateCacheKey(a), plateCacheKey(a + "x"));
  assert.notEqual(
    plateCacheKey(a, { w: 1280, h: 720, scale: 1.5 }),
    plateCacheKey(a, { w: 1920, h: 1080, scale: 1.5 }),
  );
  assert.notEqual(
    plateCacheKey(a, { w: 1280, h: 720, scale: 1.5 }),
    plateCacheKey(a, { w: 1280, h: 720, scale: 2 }),
  );
});

test("a version prefix means a primitive change invalidates every plate", () => {
  assert.match(plateCacheKey("<div/>"), /^[0-9a-f]{64}$/);
  // The hashed input embeds a version tag; bumping it changes all keys.
  const key = plateCacheKey("<div/>");
  assert.notEqual(plateCacheKey("<div/>"), `${key}`.replace(/./, "0"));
});

test("templates interpolate token paths and leave unknown paths literal", () => {
  assert.equal(
    interpolateTemplate("bg {{tokens.palette.bg}} acc {{tokens.palette.accent}} {{voice.feel}}", theme),
    "bg #FFFFFF acc #123456 warm",
  );
  assert.equal(interpolateTemplate("{{tokens.missing.deep}}", theme), "{{tokens.missing.deep}}");
});

test("plateHtmlFor: slide html overrides the theme, surfaces pick variants", () => {
  const t = {
    tokens: { palette: { bg: "#FFFFFF", accent: "#123456" } },
    plate: {
      html: "<style>.b{background:{{tokens.palette.bg}}}</style><div class=b></div>",
      surfaces: { title: "TITLE {{tokens.palette.accent}}" },
    },
  };
  assert.equal(
    plateHtmlFor({ theme: t, surface: "content", slide: {} }).html,
    "<style>.b{background:#FFFFFF}</style><div class=b></div>",
  );
  assert.equal(plateHtmlFor({ theme: t, surface: "title", slide: {} }).html, "TITLE #123456");
  const over = plateHtmlFor({ theme: t, surface: "content", slide: { html: "<b>free</b>" } });
  assert.equal(over.kind, "slide");
  assert.equal(over.html, "<b>free</b>");
  assert.equal(plateHtmlFor({ theme: {}, surface: "content", slide: {} }), null);
});

test("default plate geometry is 16:9", () => {
  assert.equal(PLATE_W / PLATE_H, 16 / 9);
  assert.ok(Number.isInteger(PLATE_W * PLATE_SCALE) && Number.isInteger(PLATE_H * PLATE_SCALE));
});

const haveChrome = (() => {
  try { accessSync(chromeBinary()); return true; } catch { return false; }
})();

test("renderPlate writes a real PNG and the second call is a cache hit", { skip: !haveChrome }, async (t) => {
  // An isolated cache dir makes the miss/hit assertions independent of any
  // previous run's warm cache.
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const cacheDir = await mkdtemp(join(process.cwd(), ".plate-test-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  const html = "<div style=\"position:absolute;inset:0;background:#123456\"></div>";
  const a = await renderPlate(html, { cacheDir });
  const b = await renderPlate(html, { cacheDir });
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.equal(a.path, b.path);
});
