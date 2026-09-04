import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { validateDeck } from "../src/validate.js";
import { imageSeat, seatImage } from "../src/ai/images.js";
import { render } from "../src/render.js";

/**
 * The seat auto image supply never had.
 *
 * Of the 73 types before this one, exactly ONE (`testimonial`) declared an
 * optional `image` field — the only shape `imageSeat` can fill in place.
 * Everything else either requires an image, which the writer is told to avoid
 * because it has no file to name, or has no image field at all. So a model that
 * wanted a picture wrote an `[image]` note onto whatever type it had already
 * chosen; on a real generated deck the single note in 22 slides landed on the
 * TITLE slide, and nothing could seat it.
 *
 * This type renders two ways and the sweeps can only see one. `src/specimens.js`
 * carries the filled state, where the risk is; both are rendered here.
 */

const scratch = await mkdtemp(path.join(tmpdir(), "forge-illus-"));

const slide = (extra = {}) => ({
  type: "illustrated-points",
  section: 0,
  headline: "Points that can take a picture",
  points: [
    "The image field is optional, so the slide is finished without one.",
    "A supply can fill it in place later without touching the points.",
    "With a picture the points move to a column; nothing is dropped.",
    "Five points is one more than image-text could ever have carried.",
    "And the same slide reads correctly either way.",
  ],
  ...extra,
});

async function drawnText(deckFile) {
  const r = await render({ deckFile, themeName: "warm-humanist" });
  const zip = await JSZip.loadAsync(await readFile(r.outFile));
  const names = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const parts = await Promise.all(names.map((f) => zip.files[f].async("string")));
  return { xml: parts, text: parts.map((x) => x.replace(/<[^>]+>/g, " ")) };
}

async function deckAt(name, slides) {
  const dir = path.join(scratch, name);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  const file = path.join(dir, "deck.yaml");
  await writeFile(
    file,
    JSON.stringify({ title: "illustrated", theme: "warm-humanist", sections: ["S"], slides }),
  );
  return { dir, file };
}

test("the image is optional — a slide with no picture is valid and complete", async () => {
  const { ok, errors } = await validateDeck({ title: "t", slides: [slide()] });
  assert.ok(ok, `an empty seat validates: ${JSON.stringify(errors)}`);
});

test("a supply can fill the seat in place, keeping every point", async () => {
  assert.equal(await imageSeat("illustrated-points"), "image", "the field is optional, so it is a seat");
  const seated = await seatImage(slide(), "assets/auto/pic.png");
  assert.equal(seated.type, "illustrated-points", "no promotion to another type");
  assert.equal(seated.image, "assets/auto/pic.png");
  assert.equal(seated.points.length, 5, "five points survive — image-text caps body at four");
});

test("without a picture it draws its points and nothing else", async () => {
  const { file } = await deckAt("empty-seat", [slide()]);
  const { xml, text } = await drawnText(file);
  assert.match(text[0], /Five points is one more than image-text/, "every point is drawn");

  // Every content slide already carries one picture — the institutional crest —
  // so "contains no image" is never true. The control is an ordinary bullets
  // slide, which is exactly what this type should render as when its seat is
  // empty: no placeholder panel standing in for a picture nobody asked for.
  const control = await deckAt("empty-seat-control", [
    { type: "bullets", section: 0, headline: "Control", bullets: slide().points.slice(0, 4) },
  ]);
  const { xml: controlXml } = await drawnText(control.file);
  const blips = (x) => (x.match(/<a:blip/g) ?? []).length;
  assert.equal(blips(xml[0]), blips(controlXml[0]), "the same picture count as a plain list slide");
});

test("a declared image the renderer cannot resolve still draws its caption", async () => {
  // Branching on whether the asset RESOLVED rather than on whether one was
  // asked for dropped the caption silently — a credit vanishing along with the
  // picture it credits. drawcheck caught it as "the layout never draws caption".
  const { file } = await deckAt("missing-asset", [
    slide({ image: "assets/not-here.png", caption: "Where the picture came from." }),
  ]);
  const { text } = await drawnText(file);
  assert.match(text[0], /Where the picture came from/, "the caption is drawn beside the panel");
});

test("with a picture the points keep their column and none is dropped", async () => {
  const { dir, file } = await deckAt("filled-seat", [
    slide({ image: "assets/pic.png", caption: "A stand-in image." }),
  ]);
  // A 1x1 PNG is enough: this asserts the layout's text, not the picture.
  await writeFile(
    path.join(dir, "assets", "pic.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const { xml, text } = await drawnText(file);
  assert.match(xml[0], /<a:blip/, "the picture is drawn");
  assert.match(text[0], /A stand-in image/, "and its caption");
  for (const p of slide().points) {
    assert.ok(text[0].includes(p.slice(0, 30)), `point kept: ${p.slice(0, 30)}`);
  }
});

test.after(async () => {
  await rm(scratch, { recursive: true, force: true });
});
