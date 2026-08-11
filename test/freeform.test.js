import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSync } from "node:fs";
import { validateDeck } from "../src/validate.js";
import { slideCatalog, deckSchema } from "../src/ai/catalog.js";
import { buildOpsSchema } from "../src/ai/ops.js";
import { renderPlate, chromeBinary } from "../src/plate.js";
import sharp from "sharp";

const base = { title: "T", slides: [{ type: "title" }, { type: "bullets", headline: "h", bullets: ["a", "b"] }] };

test("a freeform slide requires non-empty html", async () => {
  const ok = await validateDeck({ ...base, slides: [...base.slides, { type: "freeform", html: "<div>hero</div>" }] });
  assert.equal(ok.ok, true);

  const missing = await validateDeck({ ...base, slides: [...base.slides, { type: "freeform" }] });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes("missing required field \"html\"")));

  const empty = await validateDeck({ ...base, slides: [...base.slides, { type: "freeform", html: "" }] });
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((e) => e.includes("too short")));
});

test("html is forbidden on non-freeform slides", async () => {
  const r = await validateDeck({
    ...base,
    slides: [...base.slides, { type: "bullets", headline: "h", bullets: ["a", "b"], html: "<div>x</div>" }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("only allowed on type freeform")));
});

test("a deck mixing native and freeform slides validates", async () => {
  const r = await validateDeck({
    title: "T",
    slides: [
      { type: "title" },
      { type: "freeform", html: "<section><h1>Hero</h1></section>" },
      { type: "cards", headline: "c", cards: [{ title: "a", body: "b" }, { title: "c", body: "d" }] },
    ],
  });
  assert.equal(r.ok, true);
});

test("oversized html fails with a clear cap message", async () => {
  const r = await validateDeck({ ...base, slides: [...base.slides, { type: "freeform", html: "x".repeat(30000) }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("24000 chars max")));
});

test("the catalog and ops schema expose freeform's html field", async () => {
  const cat = await slideCatalog();
  assert.ok(cat.includes("- freeform: html"));
  const schema = await deckSchema();
  const ops = buildOpsSchema(schema, { slideCount: 2, onlyTypes: ["freeform"] });
  const slide = ops.properties.ops.items.properties.slide;
  assert.deepEqual(slide.required.sort(), ["html", "type"]);
  assert.equal(slide.properties.html.maxLength, 24000);
});

const haveChrome = (() => {
  try { accessSync(chromeBinary()); return true; } catch { return false; }
})();

test("a script tag in freeform html never executes (sandbox)", { skip: !haveChrome }, async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const cacheDir = await mkdtemp(join(process.cwd(), ".plate-sandbox-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));

  // CSS paints a solid blue slide; the script tries to turn it red. If the
  // script ran, the plate would be red — the sandbox must keep it blue.
  const evil = `<style>html,body{margin:0;height:100%;background:#0000ff}</style>
<script>document.body.style.background = '#ff0000';</script>`;
  const { path } = await renderPlate(evil, { cacheDir });
  const { data } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const c = 4;
  const px = (x, y) => [data[(y * 1920 + x) * 3], data[(y * 1920 + x) * 3 + 1], data[(y * 1920 + x) * 3 + 2]];
  for (const [x, y] of [[c, c], [1916, 1076], [960, 540]]) {
    const [r, g, b] = px(x, y);
    assert.ok(b > 200 && r < 60 && g < 60, `pixel (${x},${y}) is [${r},${g},${b}] — script ran`);
  }
});
