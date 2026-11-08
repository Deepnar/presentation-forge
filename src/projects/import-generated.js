import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { readImportSource, importChrome, importBrand } from "./import-source.js";
import { convertGeneratedDeck, importError } from "./legacy-conversion.js";
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { analyzeDeck } from "../../packages/compiler/quality.ts";
import { preflightScenes } from "../../packages/renderer-pptx/render.ts";
import { prepareAsset, assetRef } from "./assets.js";
import { createHash } from "node:crypto";
import { mintProjectId } from "../../packages/projects/document.js";
import { webSourceId } from "../../packages/model/source-identity.ts";
import { observed } from "./citation-observations.js";
import { CITATION_LIMITS } from "../../packages/model/citations.ts";

// A cite's URL as the source registry accepts it: http(s), no credentials,
// no fragment. Anything else cannot be a retained web source.
function citeUrl(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href.length <= 2000 ? url.href : null;
  } catch { return null; }
}

// The deck's claim citations become the project's retained sources and
// slide-level citations, anchored to the compiled slide content so a later
// edit to that slide reads as "changed" rather than silently still current.
async function citeSources(projectId, cites, scenes) {
  const sources = new Map(), citations = new Map(), details = [];
  for (const cite of cites) {
    const url = citeUrl(cite.url);
    if (!url) { details.push({ path: `slides[${cite.slide}].cites`, reason: "citation URL is not a plain http(s) address" }); continue; }
    const title = (cite.title || new URL(url).hostname).slice(0, 500);
    const id = webSourceId({ projectId, url, title, excerpt: "" });
    const retrievedAt = cite.accessed && Number.isFinite(Date.parse(cite.accessed)) ? new Date(cite.accessed).toISOString() : new Date().toISOString();
    if (!sources.has(id)) sources.set(id, { id, projectId, kind: "web", title, url, excerpt: "", searchProvider: "deck-import", retrievedAt });
    const slideId = scenes[cite.slide].id;
    const key = `${slideId}\n${id}`;
    if (!citations.has(key)) citations.set(key, { slideId, sourceId: id });
  }
  if (details.length) throw importError("unsupported-content", "deck citations cannot be retained", details);
  const rows = [...citations.values()];
  const perScene = new Map();
  for (const row of rows) perScene.set(row.slideId, (perScene.get(row.slideId) ?? 0) + 1);
  if (rows.length > CITATION_LIMITS.perProject || [...perScene.values()].some(n => n > CITATION_LIMITS.perScene)) {
    throw importError("unsupported-content", "deck has more citations than a project can retain", [{ path: "cites", reason: `at most ${CITATION_LIMITS.perScene} per slide and ${CITATION_LIMITS.perProject} per deck` }]);
  }
  const { digests } = await observed(scenes, rows.map(r => ({ kind: "slide", slideId: r.slideId })));
  for (const [i, row] of rows.entries()) {
    const scene = scenes.find(sc => sc.id === row.slideId);
    const id = "cit_" + createHash("sha256").update(`${projectId}\n${row.slideId}\n${row.sourceId}`).digest("hex").slice(0, 32);
    (scene.citations ??= []).push({ version: 1, id, target: { kind: "slide", slideId: row.slideId },
      source: { projectId, id: row.sourceId, generation: 0 }, anchor: { kind: "content-sha256-v1", digest: digests[i] } });
  }
  return [...sources.values()];
}

// Swap each image block's deck-relative path for a stored asset reference,
// returning the assets to store with the project.
async function resolveImages(intent, source) {
  const assets = new Map(), details = [];
  for (const slide of intent.slides) for (const block of slide.blocks) {
    if (block.kind !== "image" || !block.src) continue;
    try {
      const asset = await prepareAsset(await source.readAsset(block.src));
      assets.set(asset.hash, asset);
      block.src = assetRef(asset.hash);
    } catch (error) {
      details.push(...(error.details ?? [{ path: `${slide.id}.${block.id}`, reason: error.message }]));
    }
  }
  if (details.length) throw importError("unsupported-content", "deck images cannot be imported", details);
  return [...assets.values()];
}

function assertContent(intent, scenes) {
  const details = [];
  for (let i = 0; i < intent.slides.length; i++) {
    const source = intent.slides[i], scene = scenes[i];
    if (!scene || scene.id !== source.id) { details.push({ path: `slides[${i}]`, reason: "compiler changed slide identity/order" }); continue; }
    if (source.title && !scene.elements.some(e => (e.paragraphs ?? []).some(p => p.runs.map(r => r.text).join("").includes(source.title)))) {
      details.push({ path: `${source.id}.title`, reason: "compiler omitted or changed the slide title" });
    }
    for (const block of source.blocks) {
      const elements = scene.elements.filter(e => e.semanticRef === block.id);
      const text = elements.flatMap(e => e.paragraphs?.map(p => p.runs.map(r => r.text).join("")) ?? []).join("\n");
      const missing = reason => details.push({ path: `${source.id}.${block.id}`, reason });
      if (!elements.length) { missing("compiler omitted the semantic carrier"); continue; }
      if (block.icon && !scene.elements.some(e => e.semanticRef === block.id && e.id.endsWith(":icon") && (e.paragraphs ?? []).some(p => p.runs.map(r => r.text).join("") === block.icon))) {
        missing("compiler omitted the block's icon");
      }
      if (block.kind === "chart") {
        const actual = elements.find(e => e.kind === "chart")?.chart;
        if (!actual || JSON.stringify(actual.categories) !== JSON.stringify(block.categories) || JSON.stringify(actual.series) !== JSON.stringify(block.series)) missing("native chart data cannot be preserved exactly");
        if (block.unit && !scene.elements.some(e => JSON.stringify(e.paragraphs ?? []).includes(block.unit))) missing("chart unit is not represented");
      } else if (block.kind === "table") {
        const actual = elements.find(e => e.kind === "table")?.table;
        if (!actual || JSON.stringify(actual.rows) !== JSON.stringify(block.rows) || actual.header !== block.header) missing("native table data cannot be preserved exactly");
      } else if (block.kind === "image") {
        if (!elements.some(e => e.kind === "image" && e.image?.src === block.src)) missing("compiler omitted the image");
        if (block.caption && !block.caption.split("\n").every(line => text.includes(line))) missing("compiler omitted the image caption");
      } else {
        for (const value of [block.text, block.label, block.value, ...(block.items ?? [])]) if (value && !text.includes(value)) missing("compiler omitted or changed authored text");
      }
    }
  }
  if (details.length) throw importError("unsupported-content", "compiled scene does not preserve source content", details);
}

export async function importGeneratedProject(args) {
  const start = performance.now();
  const source = await readImportSource(args);
  const store = await projectStore();
  const replay = await store.lookupImportedProject({ owner: source.owner, importRequest: source.importRequest });
  if (replay) return { project: replay.doc, reused: true, sourceDigest: source.digest, timings: { totalMs: performance.now() - start }, diagnostics: [] };
  const { intent, dropped, cites } = await convertGeneratedDeck(source.deck, { identity: source.identity });
  const brand = await importBrand(source.identity, readFile);
  const assets = [...await resolveImages(intent, source), ...brand.assets];
  const compileStart = performance.now();
  const compiled = await compileSceneDeck({ intent, theme: source.theme, style: source.style, mode: source.mode, chromeForDeck: importChrome(source.profile, source.deck, source.identity, brand) });
  assertContent(intent, compiled.scenes);
  const analysis = await analyzeDeck(intent, compiled.design, compiled.chrome);
  const blocked = analysis.findings.filter(f => f.layer === "L1");
  const preflight = await preflightScenes(compiled.scenes);
  if (blocked.length || compiled.fitDiagnostics.length || preflight.length) throw importError("unsupported-content", "source cannot fit or export safely with accepted compiler primitives", [...blocked, ...compiled.fitDiagnostics, ...preflight].map(f => ({ path: f.slideId ?? "scene", reason: f.message ?? f.reason ?? f.code ?? f.kind })));
  const compileMs = performance.now() - compileStart;
  const projectId = mintProjectId();
  const sources = cites.length ? await citeSources(projectId, cites, compiled.scenes) : null;
  await source.unchanged();
  const persistStart = performance.now();
  const result = await store.createProject({
    owner: source.owner, title: source.deck.title, scenes: compiled.scenes,
    theme: { name: source.theme, variant: source.mode },
    origin: { kind: "import", sourceDeck: args.slug, intentId: source.digest },
    importRequest: source.importRequest,
    assets, id: projectId, sources,
  });
  return { project: result.doc, reused: result.reused, sourceDigest: source.digest, diagnostics: analysis.findings, dropped, timings: { compileMs, persistMs: performance.now() - persistStart, totalMs: performance.now() - start } };
}
