// Project images: validated on the way in, stored once per project, owned like
// the project, resolved by the browser renderer and embedded in native export.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import YAML from "yaml";

const scratch = await mkdtemp(path.join(tmpdir(), "forge-assets-"));
process.env.FORGE_DB_PATH = path.join(scratch, "forge.db");
process.env.FORGE_CONFIG_DIR = path.join(scratch, "config");
process.env.FORGE_DECKS_DIR = path.join(scratch, "decks");
process.env.FORGE_PROJECTS_BACKEND = "sqlite";
process.env.FORGE_HOSTED = "0";

const { prepareAsset, assetRef, assetHash, sceneAssetHashes, inlineSceneAssets, scenesForExport } = await import("../src/projects/assets.js");
const store = await import("../src/projects/store.js");
const { closeDb } = await import("../src/db.js");
const { importGeneratedProject } = await import("../src/projects/import-generated.js");
const { convertGeneratedDeck } = await import("../src/projects/legacy-conversion.js");
const { sceneToSvg } = await import("../packages/editor/scene-svg.js");
const { renderPptx } = await import("../packages/renderer-pptx/render.ts");
const { dataUriPixelSize } = await import("../packages/renderer-pptx/image-size.ts");
const { blankSlide } = await import("../packages/editor/scene-text.js");

const png = (width, height, colour = "#c0392b") => sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();
const owner = "owner@example.test";

before(async () => mkdir(process.env.FORGE_DECKS_DIR, { recursive: true }));
after(async () => { closeDb(); await rm(scratch, { recursive: true, force: true }); });

function imageScene(src, extra = {}) {
  const scene = blankSlide();
  scene.elements.push({ id: "img", kind: "image", x: 1, y: 1, w: 4, h: 2, z: 1, provenance: "human", image: { src, alt: "chart", ...extra } });
  return scene;
}

test("only decodable rasters become assets, hashed by content", async () => {
  const bytes = await png(40, 20);
  const asset = await prepareAsset(new Uint8Array(bytes));
  assert.equal(asset.mime, "image/png");
  assert.deepEqual([asset.width, asset.height], [40, 20]);
  assert.equal(asset.hash, (await prepareAsset(new Uint8Array(bytes))).hash);
  assert.equal(assetHash(assetRef(asset.hash)), asset.hash);
  assert.equal(assetHash("data:image/png;base64,AAAA"), null);

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await assert.rejects(prepareAsset(svg), e => ["asset-unsupported", "asset-invalid"].includes(e.code));
  await assert.rejects(prepareAsset(new TextEncoder().encode("<html>")), e => e.code === "asset-invalid");
  await assert.rejects(prepareAsset(new Uint8Array()), e => e.code === "asset-invalid");
});

test("assets belong to their project's owner and are stored once", async () => {
  const { doc } = await store.createProject({ owner, title: "Assets", scenes: [blankSlide()] });
  const asset = await prepareAsset(new Uint8Array(await png(30, 30)));
  assert.equal((await store.putProjectAsset({ owner, id: doc.id, asset })).stored, true);
  assert.equal((await store.putProjectAsset({ owner, id: doc.id, asset })).stored, true, "a repeat is a no-op, not an error");
  assert.equal((await store.putProjectAsset({ owner: "else@example.test", id: doc.id, asset })).stored, false);

  assert.ok(await store.getAccessibleAsset({ owner, hash: asset.hash }));
  assert.equal(await store.getAccessibleAsset({ owner: "else@example.test", hash: asset.hash }), null);
  assert.equal(await store.getAccessibleAsset({ owner: null, hash: asset.hash }), null);
  assert.ok(await store.getAccessibleAsset({ owner: "admin@example.test", admin: true, hash: asset.hash }));

  const got = await store.getProjectAssets({ owner, id: doc.id, hashes: [asset.hash, "f".repeat(64)] });
  assert.deepEqual([...got.keys()], [asset.hash]);
  assert.equal((await store.getProjectAssets({ owner: "else@example.test", id: doc.id, hashes: [asset.hash] })).size, 0);

  await store.deleteProject({ owner, id: doc.id });
  assert.equal(await store.getAccessibleAsset({ owner, hash: asset.hash }), null, "deleting the project deletes its images");
});

test("the browser renderer points asset references at the asset route", () => {
  const hash = "a".repeat(64);
  const svg = sceneToSvg(imageScene(assetRef(hash), { fit: "contain" }));
  assert.match(svg, new RegExp(`href="/api/v2/assets/${hash}"`));
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(sceneToSvg(imageScene(assetRef(hash)), { assetUrl: h => `blob:${h}` }), new RegExp(`href="blob:${hash}"`));
  assert.match(sceneToSvg(imageScene(assetRef(hash))), /preserveAspectRatio="xMidYMid slice"/);
});

test("export inlines assets and crops from the image's own aspect", async () => {
  const bytes = await png(400, 100);
  const asset = await prepareAsset(new Uint8Array(bytes));
  const scenes = [imageScene(assetRef(asset.hash))];
  assert.deepEqual(sceneAssetHashes(scenes), [asset.hash]);
  const inlined = inlineSceneAssets(scenes, new Map([[asset.hash, asset]]));
  assert.match(inlined[0].elements.at(-1).image.src, /^data:image\/png;base64,/);
  assert.equal(scenes[0].elements.at(-1).image.src, assetRef(asset.hash), "the stored scenes are not mutated");
  assert.deepEqual(dataUriPixelSize(inlined[0].elements.at(-1).image.src), { w: 400, h: 100 });
  assert.equal(inlineSceneAssets(scenes, new Map())[0].elements.at(-1).image.src, "", "a missing asset draws as a placeholder");

  const zip = await JSZip.loadAsync(await renderPptx(inlined));
  const slide = await zip.file("ppt/slides/slide1.xml").async("string");
  // A 4:1 image in a 2:1 box is cropped left and right, not stretched.
  const crop = slide.match(/<a:srcRect l="(-?\d+)" r="(-?\d+)" t="(-?\d+)" b="(-?\d+)"/);
  assert.ok(crop, "cover crop is written");
  assert.ok(Number(crop[1]) > 0 && Number(crop[3]) === 0);
  assert.ok(Object.keys(zip.files).some(n => n.startsWith("ppt/media/")));

  const { doc } = await store.createProject({ owner, title: "Export", scenes, assets: [asset] });
  const ready = await scenesForExport(store, { owner, id: doc.id }, doc.scenes);
  assert.match(ready[0].elements.at(-1).image.src, /^data:image\/png/);
});

test("image slide types convert to image blocks with their captions", async () => {
  const { intent } = await convertGeneratedDeck({
    title: "Pictures",
    slides: [
      { type: "image", headline: "Site", image: "assets/a.png", caption: "The site at dawn", fit: "contain" },
      { type: "image-text", headline: "Plant", image: "assets/a.png", side: "left", body: ["Point one", "Point two"] },
      { type: "image-grid", headline: "Gallery", images: [{ src: "assets/a.png", caption: "One" }, { src: "assets/b.png" }] },
      { type: "side-by-side", headline: "Two panels", left: { image: "assets/a.png", title: "Left", body: "Left body" }, right: { image: "assets/b.png", title: "Right" } },
      { type: "testimonial", headline: "Voices", quote: "It worked.", name: "A. Person", role: "Engineer", image: "assets/a.png" },
    ],
  });
  const [image, text, grid, panels, voice] = intent.slides;
  assert.deepEqual(image.blocks.find(b => b.kind === "image"), { id: image.blocks.find(b => b.kind === "image").id, kind: "image", src: "assets/a.png", alt: "The site at dawn", emphasis: "primary", caption: "The site at dawn", fit: "contain" });
  assert.equal(text.layoutHint.mediaSide, "left");
  assert.deepEqual(text.blocks.find(b => b.kind === "list").items, ["Point one", "Point two"]);
  assert.equal(grid.blocks.filter(b => b.kind === "image").length, 2);
  assert.equal(panels.blocks.find(b => b.kind === "image").caption, "Left\nLeft body");
  assert.equal(voice.blocks.find(b => b.kind === "quote").text, "It worked.");
});

test("importing a deck stores its images once and compiles them with captions", async () => {
  const slug = "pictures";
  const dir = path.join(process.env.FORGE_DECKS_DIR, slug);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "assets", "a.png"), await png(300, 200));
  await writeFile(path.join(dir, "assets", "b.png"), await png(200, 300, "#2980b9"));
  const deck = {
    title: "Pictures", theme: "warm-humanist",
    slides: [
      { type: "title", headline: "Pictures" },
      { type: "image-grid", headline: "Gallery", images: [{ src: "assets/a.png", caption: "Morning" }, { src: "assets/b.png", caption: "Evening" }, { src: "assets/a.png" }] },
      { type: "image-text", headline: "Plant", image: "assets/b.png", body: ["Point one", "Point two"], caption: "Inside the plant" },
    ],
  };
  await writeFile(path.join(dir, "deck.yaml"), YAML.stringify(deck));
  await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
  const { project } = await importGeneratedProject({ slug, requestId: "request-pictures", principal: { email: owner } });

  const images = project.scenes.flatMap(s => s.elements.filter(e => e.kind === "image"));
  assert.equal(images.length, 4);
  assert.ok(images.every(e => assetHash(e.image.src)));
  const hashes = sceneAssetHashes(project.scenes);
  assert.equal(hashes.length, 2, "a repeated image is stored once");
  assert.equal((await store.getProjectAssets({ owner, id: project.id, hashes })).size, 2);
  const text = JSON.stringify(project.scenes);
  for (const caption of ["Morning", "Evening", "Inside the plant"]) assert.ok(text.includes(caption), caption);
});

test("deck images must be plain files inside the deck folder", async () => {
  const outside = path.join(scratch, "outside.png");
  await writeFile(outside, await png(10, 10));
  for (const [slug, image, prepare] of [
    ["escape", "../outside.png", null],
    ["absolute", outside, null],
    ["remote", "https://example.test/a.png", null],
    ["missing", "assets/none.png", null],
    ["linked", "assets/link.png", dir => symlink(outside, path.join(dir, "assets", "link.png"))],
    ["linked-dir", "linked/outside.png", dir => symlink(scratch, path.join(dir, "linked"))],
  ]) {
    const dir = path.join(process.env.FORGE_DECKS_DIR, slug);
    await mkdir(path.join(dir, "assets"), { recursive: true });
    if (prepare) await prepare(dir);
    await writeFile(path.join(dir, "deck.yaml"), YAML.stringify({ title: "Bad", slides: [{ type: "image", headline: "Bad", image }] }));
    await writeFile(path.join(dir, "meta.yaml"), YAML.stringify({ owner, status: "ready" }));
    await assert.rejects(importGeneratedProject({ slug, requestId: `request-${slug}`, principal: { email: owner } }),
      e => e.code === "unsupported-content", slug);
  }
});
