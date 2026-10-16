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

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const META_CONTENT = ["academic", "guide", "team", "institution", "brand", "identity"];
const present = value => typeof value === "object" && value !== null ? Object.values(value).some(present) : value !== undefined && value !== null && value !== "" && value !== false;

function chromeProfile(identity, deck) {
  const forbidden = META_CONTENT.filter(key => present(identity[key]));
  if (forbidden.length) throw importError("unsupported-content", "effective source identity needs an audited institutional chrome adapter", forbidden.map(key => ({ path: `identity.${key}`, reason: "inherited or source identity cannot be silently dropped or made editable" })));
  const cfg = identity.chrome ?? {};
  const keys = ["branding", "slide_numbers", "presenter_on_slides", "crest_on_content_slides"];
  if (typeof cfg !== "object" || Array.isArray(cfg) || Object.keys(cfg).some(key => !keys.includes(key)) || keys.slice(1).some(key => cfg[key] !== undefined && typeof cfg[key] !== "boolean") || (cfg.branding !== undefined && !["full", "minimal", "none"].includes(cfg.branding))) {
    throw importError("unsupported-content", "source chrome policy has unsupported fields or values", [{ path: "identity.chrome", reason: "only the canonical branding and boolean footer/crest policy is audited" }]);
  }
  const profile = { branding: effectiveBranding(cfg.branding), slideNumbers: cfg.slide_numbers !== false, presenterOnSlides: cfg.presenter_on_slides !== false, crestOnContentSlides: cfg.crest_on_content_slides !== false };
  const suppressed = deck?.slides?.flatMap((slide, index) => slide.presenter && (DIVIDER_TYPES.has(slide.type) || REFERENCE_TYPES.has(slide.type) || profile.branding === "none" || !profile.presenterOnSlides)
    ? [{ path: `slides[${index}].presenter`, reason: "authored presenter would be suppressed by legacy chrome and has no scene metadata carrier" }] : []) ?? [];
  if (suppressed.length) throw importError("unsupported-content", "source presenter cannot be preserved under its chrome policy", suppressed);
  return profile;
}

export function importChrome(profile, source, presenters) {
  return (intent, design, { backgrounds, plan }) => ({ slides: intent.slides.map((slide, index) => ({
    slideId: slide.id, surface: source.slides[index].type === "title" ? "title" : "content", ...profile,
    presenterText: presenters[index], index: index + 1, total: intent.slides.length,
    background: contrastBackground(backgrounds, surfaceForPlan(plan.slides[index]), design),
    mutedInk: design.palette.inkMuted.hex, captionFamily: design.roles.caption?.family,
  })) });
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
  const profile = chromeProfile(identity, deck);
  const unchanged = async () => {
    if (JSON.stringify(await read()) !== JSON.stringify(bytes)) throw importError("source-changed", "source changed during import; retry after generation finishes");
    if (JSON.stringify(await effectiveIdentity()) !== JSON.stringify(identity)) throw importError("source-changed", "effective identity changed during import; retry after configuration settles");
  };
  await unchanged();
  const theme = deck?.theme ?? meta.theme ?? "warm-humanist";
  if (deck?.theme && meta.theme && deck.theme !== meta.theme) throw importError("unsupported-content", "source theme overrides disagree", [{ path: "theme", reason: "select one source theme before importing" }]);
  const digest = createHash("sha256").update(JSON.stringify({ slug, deck: bytes.deckText, plan: bytes.planText, theme, style: deck?.style ?? null, mode, chrome: profile })).digest("hex");
  return { deck, owner, theme, style: deck?.style ?? null, mode, profile, digest, importRequest: { key: `${slug}:${requestId}`, digest }, unchanged };
}
