import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { EDITOR_IMPORT_REQUEST_ID } from "../../packages/projects/editor-import.js";
import { readImportSource, importChrome, importBrand } from "./import-source.js";
import { convertGeneratedDeck, importError } from "./legacy-conversion.js";
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { carryEdits } from "../../packages/compiler/compile.js";
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
  const sources = new Map(), citations = new Map();
  for (const cite of cites) {
    const url = citeUrl(cite.url);
    // A reference that is not a web address (a DOI, a file name) cannot be a
    // retained web source; the presenter still gets it in the notes.
    if (!url) {
      const scene = scenes[cite.slide], line = `Source: ${[cite.title, cite.url].filter(Boolean).join(" — ")}`;
      scene.notes = scene.notes ? `${scene.notes}\n\n${line}` : line;
      continue;
    }
    const title = (cite.title || new URL(url).hostname).slice(0, 500);
    const id = webSourceId({ projectId, url, title, excerpt: "" });
    const retrievedAt = cite.accessed && Number.isFinite(Date.parse(cite.accessed)) ? new Date(cite.accessed).toISOString() : new Date().toISOString();
    if (!sources.has(id)) sources.set(id, { id, projectId, kind: "web", title, url, excerpt: "", searchProvider: "deck-import", retrievedAt });
    const slideId = scenes[cite.slide].id;
    const key = `${slideId}\n${id}`;
    if (!citations.has(key)) citations.set(key, { slideId, sourceId: id });
  }
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

// Theme plates arrive as one data URI per slide; stored once as an asset and
// referenced, a 24-slide plated deck stays well inside the document limit.
async function storePlates(scenes) {
  const assets = new Map();
  for (const scene of scenes) {
    const src = scene.background?.image?.src;
    const match = typeof src === "string" ? /^data:image\/[a-z+.-]+;base64,(.*)$/is.exec(src) : null;
    if (!match) continue;
    const asset = await prepareAsset(new Uint8Array(Buffer.from(match[1], "base64")));
    assets.set(asset.hash, asset);
    scene.background.image.src = assetRef(asset.hash);
  }
  return [...assets.values()];
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
    // Slide-level carriers — axes, lane names, link labels — must each reach
    // the page as text, like any block's content.
    const sceneText = scene.elements.map(e => (e.paragraphs ?? []).map(p => p.runs.map(r => r.text).join("")).join("\n")).join("\n");
    const slideValues = [
      ...Object.values(source.axes ?? {}).flatMap(a => [a.label, a.low, a.high, ...(a.ticks ?? [])]),
      ...source.blocks.map(b => b.group),
      ...(source.connections ?? []).map(l => l.label),
    ].filter(Boolean);
    for (const value of slideValues) if (!sceneText.includes(value)) details.push({ path: source.id, reason: `compiler omitted "${value.slice(0, 40)}"` });
    for (const block of source.blocks) {
      const elements = scene.elements.filter(e => e.semanticRef === block.id);
      const text = elements.flatMap(e => e.paragraphs?.map(p => p.runs.map(r => r.text).join("")) ?? []).join("\n");
      const missing = reason => details.push({ path: `${source.id}.${block.id}`, reason });
      if (!elements.length) { missing("compiler omitted the semantic carrier"); continue; }
      if (block.icon && !text.includes(block.icon)) {
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
        // Text the layout moved to the speaker notes (a crowded graph's node
        // bodies) is preserved there, still the slide's own.
        for (const value of [block.text, block.label, block.value, ...(block.items ?? [])]) if (value && !text.includes(value) && !(scene.notes ?? "").includes(value)) missing("compiler omitted or changed authored text");
      }
    }
  }
  if (details.length) throw importError("unsupported-content", "compiled scene does not preserve source content", details);
}

export async function importGeneratedProject(args) {
  const start = performance.now();
  const source = await readImportSource(args);
  const store = await projectStore();
  // A deck regenerated since its project was made updates that project,
  // keeping what the person did there, instead of refusing as changed.
  let replay = null, updating = null;
  try {
    replay = await store.lookupImportedProject({ owner: source.owner, importRequest: source.importRequest });
  } catch (error) {
    if (error.code !== "import-source-changed" || !error.projectId) throw error;
    updating = error.projectId;
  }
  if (replay) return { project: replay.doc, reused: true, sourceDigest: source.digest, timings: { totalMs: performance.now() - start }, diagnostics: [] };
  const { intent, dropped, cites } = await convertGeneratedDeck(source.deck, { identity: source.identity });
  const brand = await importBrand(source.identity, readFile);
  const assets = [...await resolveImages(intent, source), ...brand.assets];
  const compileStart = performance.now();
  const compiled = await compileSceneDeck({ intent, theme: source.theme, style: source.style, mode: source.mode, chromeForDeck: importChrome(source.profile, source.deck, source.identity, brand) });
  assertContent(intent, compiled.scenes);
  const analysis = await analyzeDeck(intent, compiled.design, compiled.chrome);
  // Fit findings restate the compiler's fit diagnostics, which become
  // warnings below; every other must-fix finding still refuses.
  const FIT = new Set(["text-fit-floor-hit", "text-word-floor-hit", "table-cell-overflow", "chart-label-overflow", "chart-fallback-table"]);
  const blocked = analysis.findings.filter(f => f.layer === "L1" && !FIT.has(f.code));
  const preflight = await preflightScenes(compiled.scenes);
  // Text that will not fit at the readable floor is the deck's own length,
  // which the legacy renderer flagged and still drew; the project opens with
  // those slides reported for the owner to trim. Broken structure and
  // anything native export cannot carry still refuse.
  if (blocked.length || preflight.length) throw importError("unsupported-content", "source cannot export safely with accepted compiler primitives", [...blocked, ...preflight].map(f => ({ path: f.slideId ?? "scene", reason: f.message ?? f.reason ?? f.code ?? f.kind })));
  const compileMs = performance.now() - compileStart;
  assets.push(...await storePlates(compiled.scenes));
  if (updating) return updateImportedProject({ store, source, compiled, assets, projectId: updating, analysis, dropped, start, compileMs });
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
  const fitWarnings = compiled.fitDiagnostics.map(f => ({ slideId: f.slideId, elementId: f.elementId, message: f.message }));
  return { project: result.doc, reused: result.reused, sourceDigest: source.digest, diagnostics: analysis.findings, dropped, fitWarnings, timings: { compileMs, persistMs: performance.now() - persistStart, totalMs: performance.now() - start } };
}

// A slide a person has touched: a layout they changed, anything they added,
// or notes they wrote. Kept when a regeneration no longer has it.
const touched = (scene) => scene.layoutState !== "managed" || scene.notesEdited === true || scene.elements.some((e) => e.provenance === "human");

// Carry a person's work onto a regenerated deck. Each slide the new deck
// still has is recompiled with their edits carried across (carryEdits —
// the same rules as any recompile); a detached slide is theirs outright and
// kept as it is; a slide the new deck dropped stays if they touched it, in
// its old place; new slides arrive as compiled. Saved as one new revision,
// so History can take it back, and the import request is pointed at the
// new deck so the next open replays instead of updating again.
// Not yet: claim citations a regenerated deck adds are not added as
// project sources; the slides it keeps keep their existing citations.
async function updateImportedProject({ store, source, compiled, assets, projectId, analysis, dropped, start, compileMs }) {
  const { doc: current } = await store.getProject({ owner: source.owner, id: projectId });
  if (!current) throw importError("import-target-deleted", "the imported project was deleted; use an explicit new import request");
  // A different theme or appearance is not a regenerated deck: re-theming a
  // project stays an explicit act, not a side effect of opening it again.
  if (current.theme?.name !== source.theme || current.theme?.variant !== source.mode) {
    throw Object.assign(importError("import-source-changed", "source changed; use an explicit new import request"), { projectId });
  }
  const prevById = new Map(current.scenes.map((s) => [s.id, s]));
  const scenes = compiled.scenes.map((fresh) => {
    const prev = prevById.get(fresh.id);
    if (!prev) return fresh;
    if (prev.layoutState === "detached") return prev;
    return carryEdits(fresh, structuredClone(prev), compiled.design, fresh.id, []);
  });
  const freshIds = new Set(compiled.scenes.map((s) => s.id));
  current.scenes.forEach((prev, i) => {
    if (freshIds.has(prev.id) || !touched(prev)) return;
    const before = current.scenes.slice(0, i).reverse().find((s) => scenes.some((m) => m.id === s.id));
    scenes.splice(before ? scenes.findIndex((m) => m.id === before.id) + 1 : 0, 0, prev);
  });
  for (const asset of assets) await store.putProjectAsset({ owner: source.owner, id: projectId, asset });
  await source.unchanged();
  const persistStart = performance.now();
  const saved = await store.saveProject({
    owner: source.owner, id: projectId, baseRevision: current.revision, title: current.title, scenes,
    theme: current.theme, origin: current.origin,
    provenance: { actor: "agent", summary: "Updated from the regenerated deck, keeping your edits" },
  });
  if (saved.status === "stale") throw importError("import-busy", "the project changed while it was being updated; try again");
  await store.relinkImport({ owner: source.owner, importRequest: source.importRequest, projectId });
  const fitWarnings = compiled.fitDiagnostics.map(f => ({ slideId: f.slideId, elementId: f.elementId, message: f.message }));
  return { project: saved.doc, reused: false, updated: true, sourceDigest: source.digest, diagnostics: analysis.findings, dropped, fitWarnings, timings: { compileMs, persistMs: performance.now() - persistStart, totalMs: performance.now() - start } };
}

// Open a just-finished generated deck in the editor: the same import the
// Open in editor button makes, so either path reaches one project. Never
// throws — a deck that cannot become a project is still a finished deck, and
// the reason travels with the result for the UI to show.
export async function importForEditor({ slug, owner = null, mode = "light" }) {
  if (process.env.FORGE_V2_PROJECTS === "0") return { error: "project storage is disabled on this host", code: "projects-disabled" };
  try {
    const result = await importGeneratedProject({
      slug, requestId: EDITOR_IMPORT_REQUEST_ID, mode: mode === "dark" ? "dark" : "light",
      principal: owner ? { email: owner, verified: true } : null, localOperator: !owner,
    });
    return { projectId: result.project.id, reused: result.reused, updated: result.updated === true, fitWarnings: result.fitWarnings ?? [], dropped: result.dropped ?? [] };
  } catch (error) {
    return { error: error.message, code: error.code ?? "import-failed", details: (error.details ?? []).slice(0, 20) };
  }
}
