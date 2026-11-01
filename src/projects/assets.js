import { createHash } from "node:crypto";
import sharp from "sharp";

export const ASSET_LIMITS = Object.freeze({
  bytes: 15 * 1024 * 1024,
  projectBytes: 300 * 1024 * 1024,
  pixels: 8192,
  perRequest: 256,
});

const FORMATS = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const REF = /^asset:([0-9a-f]{64})$/;

export const assetRef = hash => `asset:${hash}`;
export function assetHash(src) {
  const match = typeof src === "string" ? REF.exec(src) : null;
  return match ? match[1] : null;
}

function assetError(code, message) {
  return Object.assign(new Error(message), { code });
}

// The bytes are decoded, not trusted by extension or declared type: only a
// raster sharp can read is stored, so nothing scriptable (SVG, HTML) is ever
// served back from the asset route.
export async function prepareAsset(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw assetError("asset-invalid", "image is empty");
  if (bytes.length > ASSET_LIMITS.bytes) throw assetError("asset-too-large", `image exceeds ${ASSET_LIMITS.bytes / 1024 / 1024} MB`);
  let meta;
  try {
    meta = await sharp(bytes, { failOn: "error" }).metadata();
  } catch {
    throw assetError("asset-invalid", "file is not a readable image");
  }
  const mime = FORMATS[meta.format];
  if (!mime) throw assetError("asset-unsupported", "use a PNG, JPEG, WebP or GIF image");
  const width = meta.width ?? 0, height = meta.pageHeight ?? meta.height ?? 0;
  if (!width || !height) throw assetError("asset-invalid", "image has no dimensions");
  if (width > ASSET_LIMITS.pixels || height > ASSET_LIMITS.pixels) {
    throw assetError("asset-too-large", `image exceeds ${ASSET_LIMITS.pixels} pixels on a side`);
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { hash, mime, width, height, size: bytes.length, bytes: Buffer.from(bytes) };
}

// Every asset a set of scenes points at, nested groups and plate backgrounds
// included.
export function sceneAssetHashes(scenes) {
  const hashes = new Set();
  const walk = elements => {
    for (const el of elements ?? []) {
      const hash = assetHash(el.image?.src);
      if (hash) hashes.add(hash);
      walk(el.group?.children);
    }
  };
  for (const scene of scenes ?? []) {
    const bg = assetHash(scene.background?.image?.src);
    if (bg) hashes.add(bg);
    walk(scene.elements);
  }
  return [...hashes];
}

// A copy of the scenes with asset references replaced by data URIs, for
// consumers that must embed (native PPTX). A missing asset becomes an empty
// source, which every renderer draws as a visible image placeholder.
export function inlineSceneAssets(scenes, assets) {
  const resolve = src => {
    const hash = assetHash(src);
    if (!hash) return src;
    const asset = assets.get(hash);
    return asset ? `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}` : "";
  };
  const walk = elements => elements.map(el => {
    const out = { ...el };
    if (el.image) out.image = { ...el.image, src: resolve(el.image.src) };
    if (el.group?.children) out.group = { ...el.group, children: walk(el.group.children) };
    return out;
  });
  return scenes.map(scene => {
    const out = { ...scene, elements: walk(scene.elements) };
    if (scene.background?.image) {
      const src = resolve(scene.background.image.src);
      out.background = src ? { ...scene.background, image: { ...scene.background.image, src } } : { ...scene.background, image: undefined };
      if (!src) delete out.background.image;
    }
    return out;
  });
}

// Load what `scenes` reference from the project store and inline it.
export async function scenesForExport(store, { owner = null, admin = false, id }, scenes) {
  const hashes = sceneAssetHashes(scenes);
  if (!hashes.length) return scenes;
  const assets = await store.getProjectAssets({ owner, admin, id, hashes });
  return inlineSceneAssets(scenes, assets);
}
