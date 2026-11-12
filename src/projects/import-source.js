import { constants } from "node:fs";
import { open, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { DECKS } from "../paths.js";
import { isHosted } from "../cloud.js";
import { loadIdentity, deepMerge } from "../ai/identity.js";
import { DIVIDER_TYPES, REFERENCE_TYPES } from "../ai/team.js";
import { effectiveBranding } from "../../packages/core/chrome.ts";
import { surfaceForPlan } from "../../packages/compiler/background.ts";
import { contrastBackground } from "../v2-plates.js";
import { importError } from "./legacy-conversion.js";
import { loadBrand } from "../chrome.js";
import { prepareAsset, assetRef } from "./assets.js";

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 15 * 1024 * 1024;

function chromeProfile(identity) {
  const cfg = identity.chrome ?? {};
  const keys = ["branding", "slide_numbers", "presenter_on_slides", "crest_on_content_slides"];
  if (typeof cfg !== "object" || Array.isArray(cfg) || Object.keys(cfg).some(key => !keys.includes(key)) || keys.slice(1).some(key => cfg[key] !== undefined && typeof cfg[key] !== "boolean") || (cfg.branding !== undefined && !["full", "minimal", "none"].includes(cfg.branding))) {
    throw importError("unsupported-content", "source chrome policy has unsupported fields or values", [{ path: "identity.chrome", reason: "only the canonical branding and boolean footer/crest policy is audited" }]);
  }
  return { branding: effectiveBranding(cfg.branding), slideNumbers: cfg.slide_numbers !== false, presenterOnSlides: cfg.presenter_on_slides !== false, crestOnContentSlides: cfg.crest_on_content_slides !== false };
}

// The footer names whoever presents a slide: the slide's own presenter, else
// the presenting members, else the team label — the legacy renderer's rule.
function presenterFallback(identity) {
  const presenting = (identity.team?.members ?? []).filter(m => m?.presenting && String(m.name ?? "").trim());
  return presenting.length ? presenting.map(m => String(m.name).trim()).join(" · ") : String(identity.team?.label ?? "").trim();
}

// Brand marks become project assets so every slide can reference one stored
// copy. `crest` is preferred and its ratio alone earns heading clearance; a
// light/dark variant stands in when it is the only mark, as before.
export async function importBrand(identity, readFile) {
  const brand = await loadBrand(identity);
  const assets = [];
  const asset = async mark => {
    if (!mark) return null;
    const prepared = await prepareAsset(new Uint8Array(await readFile(mark.path)));
    assets.push(prepared);
    return { src: assetRef(prepared.hash), ratio: prepared.width / prepared.height };
  };
  const banner = await asset(brand.banner);
  const selectedCrest = await asset(brand.crest ?? brand.crestLight ?? brand.crestDark);
  return { banner, selectedCrest, primaryCrestRatio: brand.crest ? selectedCrest?.ratio ?? null : null, assets };
}

export function importChrome(profile, source, identity, brand = {}) {
  return chromeFromRecipe(chromeRecipe(profile, source, identity, brand));
}

// Everything an imported deck's chrome depends on that is not the theme —
// the identity profile, the brand marks, and per slide its surface and
// presenter — as plain data, so a project can rebuild its chrome later in
// another theme without the source deck. Slide ids follow the converter's
// positional ids, which is what the intent carries.
export function chromeRecipe(profile, source, identity, brand = {}) {
  const fallback = presenterFallback(identity);
  return {
    profile: structuredClone(profile ?? {}),
    banner: brand.banner ?? null, selectedCrest: brand.selectedCrest ?? null, primaryCrestRatio: brand.primaryCrestRatio ?? null,
    fallback,
    slides: source.slides.map((slide) => ({
      surface: slide.type === "title" ? "title" : "content",
      suppressPresenter: DIVIDER_TYPES.has(slide.type) || REFERENCE_TYPES.has(slide.type),
      presenterText: String(slide.presenter ?? "").trim() || fallback,
    })),
  };
}

// Chrome for a compile, from a recipe: the theme-dependent parts (contrast
// against the slide's ground, muted ink, caption family) come from the
// design being compiled. A slide the recipe does not know is content with
// the fallback presenter.
export function chromeFromRecipe(recipe) {
  return (intent, design, { backgrounds, plan }) => ({ slides: intent.slides.map((slide, index) => {
    const known = recipe.slides[index] ?? { surface: "content", suppressPresenter: false, presenterText: recipe.fallback };
    return {
      slideId: slide.id, surface: known.surface, ...recipe.profile,
      banner: recipe.banner, selectedCrest: recipe.selectedCrest, primaryCrestRatio: recipe.primaryCrestRatio,
      suppressPresenter: known.suppressPresenter,
      presenterText: known.presenterText,
      index: index + 1, total: intent.slides.length,
      background: contrastBackground(backgrounds, surfaceForPlan(plan.slides[index]), design),
      mutedInk: design.palette.inkMuted.hex, captionFamily: design.roles.caption?.family,
    };
  }) });
}

async function boundedText(file, optional = false) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) throw importError("invalid-source", "source file is not regular or exceeds the import bound");
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65536, MAX_SOURCE_BYTES + 1 - total));
      const { bytesRead } = await handle.read(buffer);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_SOURCE_BYTES) throw importError("invalid-source", "source changed beyond the import bound");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    if (error.code === "ELOOP") throw importError("invalid-source", "source files must not be symbolic links");
    if (error.code === "ENOENT") throw importError("not-found", "no such source deck");
    throw error;
  } finally { await handle?.close(); }
}

// An image a deck references, read only from inside that deck's own folder:
// no absolute paths, no parent traversal, no symbolic links.
async function readDeckAsset(dir, rel) {
  if (typeof rel !== "string" || !rel || /^[a-z][a-z0-9+.-]*:/i.test(rel) || path.isAbsolute(rel)) {
    throw importError("unsupported-content", "image must be a file inside the deck folder", [{ path: String(rel).slice(0, 200), reason: "remote or absolute image reference" }]);
  }
  const file = path.resolve(dir, rel);
  if (!file.startsWith(dir + path.sep)) {
    throw importError("unsupported-content", "image must be a file inside the deck folder", [{ path: rel.slice(0, 200), reason: "image path leaves the deck folder" }]);
  }
  let handle;
  try {
    // A symlinked parent directory would pass the lexical check above.
    if (!(await realpath(file)).startsWith(dir + path.sep)) throw Object.assign(new Error(), { code: "ELOOP" });
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) throw importError("unsupported-content", "image is not a regular file or is too large", [{ path: rel.slice(0, 200), reason: "unreadable or oversized image" }]);
    return new Uint8Array(await handle.readFile());
  } catch (error) {
    if (error.code === "unsupported-content") throw error;
    throw importError("unsupported-content", "a referenced image is missing", [{ path: rel.slice(0, 200), reason: error.code === "ELOOP" ? "image is a symbolic link" : "image file is missing" }]);
  } finally { await handle?.close(); }
}

export async function readImportSource({ slug, requestId, principal = null, localOperator = false, mode = "light" }) {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(slug)) throw importError("not-found", "no such source deck");
  if (typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(requestId)) throw importError("bad-import-request", "requestId must contain 8..64 letters, numbers, underscores or hyphens");
  if (!["light", "dark"].includes(mode)) throw importError("bad-import-request", "mode must be light or dark");
  if (!principal && (isHosted() || !localOperator)) throw importError("unauthorized", "log in to import a source deck");
  const owner = principal?.email ?? null;
  if (owner !== null && (typeof owner !== "string" || !owner)) throw importError("unauthorized", "invalid principal");
  let dir;
  try {
    const root = await realpath(DECKS);
    const candidate = path.join(root, slug);
    if ((await lstat(candidate)).isSymbolicLink()) throw importError("not-found", "no such source deck");
    dir = await realpath(candidate);
    if (path.dirname(dir) !== root) throw importError("not-found", "no such source deck");
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) throw importError("not-found", "no such source deck");
    throw error;
  }
  const parse = text => YAML.parse(text, { maxAliasCount: 0 });
  const authorizedMetaText = await boundedText(path.join(dir, "meta.yaml"));
  let meta;
  try { meta = parse(authorizedMetaText); } catch { throw importError("not-found", "no such source deck"); }
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || (meta.owner ?? null) !== owner) throw importError("not-found", "no such source deck");
  const read = async () => ({
    metaText: await boundedText(path.join(dir, "meta.yaml")),
    deckText: await boundedText(path.join(dir, "deck.yaml")),
    planText: await boundedText(path.join(dir, "plan.yaml"), true),
    runText: await boundedText(path.join(dir, ".run.json"), true),
  });
  const bytes = await read();
  let deck, plan;
  try {
    deck = parse(bytes.deckText); plan = bytes.planText === null ? null : parse(bytes.planText);
  } catch { throw importError("invalid-source", "source YAML is invalid or contains aliases"); }
  if (!deck || typeof deck !== "object" || Array.isArray(deck) || !Array.isArray(deck.slides) || deck.slides.some(slide => !slide || typeof slide !== "object" || Array.isArray(slide))) {
    throw importError("invalid-source", "source must be a deck object containing slide objects");
  }
  // Source ownership and target ownership are independent. Even an administrator
  // must not turn somebody else's or an ownerless legacy deck into their project.
  if (bytes.metaText !== authorizedMetaText) throw importError("source-changed", "source ownership changed during import");
  if (meta.status !== "ready" || bytes.runText !== null || (plan !== null && (!Array.isArray(plan.slides) || !plan.slides.length || (deck?.slides?.length ?? 0) < plan.slides.length))) {
    throw importError("source-incomplete", "source generation is not complete and finalized");
  }
  const effectiveIdentity = async () => deepMerge(await loadIdentity(null, { owner }), meta);
  const identity = await effectiveIdentity();
  const profile = chromeProfile(identity);
  const unchanged = async () => {
    if (JSON.stringify(await read()) !== JSON.stringify(bytes)) throw importError("source-changed", "source changed during import; retry after generation finishes");
    if (JSON.stringify(await effectiveIdentity()) !== JSON.stringify(identity)) throw importError("source-changed", "effective identity changed during import; retry after configuration settles");
  };
  await unchanged();
  // The theme the user last chose for the deck (meta) wins over the one the
  // generator wrote, as it does when the deck page re-renders.
  const theme = meta.theme ?? deck?.theme ?? "warm-humanist";
  const digest = createHash("sha256").update(JSON.stringify({ slug, deck: bytes.deckText, plan: bytes.planText, theme, style: deck?.style ?? null, mode, chrome: profile, identity: { academic: identity.academic, guide: identity.guide, team: identity.team, brand: identity.brand } })).digest("hex");
  return { deck, owner, theme, style: deck?.style ?? null, mode, profile, digest, importRequest: { key: `${slug}:${requestId}`, digest }, unchanged, identity, readAsset: rel => readDeckAsset(dir, rel) };
}
