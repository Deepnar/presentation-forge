import { performance } from "node:perf_hooks";
import { readImportSource, importChrome } from "./import-source.js";
import { convertGeneratedDeck, importError } from "./legacy-conversion.js";
import { projectStore } from "./backend.js";
import { compileSceneDeck } from "../v2-compile.js";
import { analyzeDeck } from "../../packages/compiler/quality.ts";
import { preflightScenes } from "../../packages/renderer-pptx/render.ts";

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
      if (block.kind === "chart") {
        const actual = elements.find(e => e.kind === "chart")?.chart;
        if (!actual || JSON.stringify(actual.categories) !== JSON.stringify(block.categories) || JSON.stringify(actual.series) !== JSON.stringify(block.series)) missing("native chart data cannot be preserved exactly");
        if (block.unit && !scene.elements.some(e => JSON.stringify(e.paragraphs ?? []).includes(block.unit))) missing("chart unit is not represented");
      } else if (block.kind === "table") {
        const actual = elements.find(e => e.kind === "table")?.table;
        if (!actual || JSON.stringify(actual.rows) !== JSON.stringify(block.rows) || actual.header !== block.header) missing("native table data cannot be preserved exactly");
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
  const { intent, presenters } = await convertGeneratedDeck(source.deck);
  const compileStart = performance.now();
  const compiled = await compileSceneDeck({ intent, theme: source.theme, style: source.style, mode: source.mode, chromeForDeck: importChrome(source.profile, source.deck, presenters) });
  assertContent(intent, compiled.scenes);
  const analysis = await analyzeDeck(intent, compiled.design, compiled.chrome);
  const blocked = analysis.findings.filter(f => f.layer === "L1");
  const preflight = await preflightScenes(compiled.scenes);
  if (blocked.length || compiled.fitDiagnostics.length || preflight.length) throw importError("unsupported-content", "source cannot fit or export safely with accepted compiler primitives", [...blocked, ...compiled.fitDiagnostics, ...preflight].map(f => ({ path: f.slideId ?? "scene", reason: f.message ?? f.reason ?? f.code ?? f.kind })));
  const compileMs = performance.now() - compileStart;
  await source.unchanged();
  const persistStart = performance.now();
  const result = await store.createProject({
    owner: source.owner, title: source.deck.title, scenes: compiled.scenes,
    theme: { name: source.theme, variant: source.mode },
    origin: { kind: "import", sourceDeck: args.slug, intentId: source.digest },
    importRequest: source.importRequest,
  });
  return { project: result.doc, reused: result.reused, sourceDigest: source.digest, diagnostics: analysis.findings, timings: { compileMs, persistMs: performance.now() - persistStart, totalMs: performance.now() - start } };
}
