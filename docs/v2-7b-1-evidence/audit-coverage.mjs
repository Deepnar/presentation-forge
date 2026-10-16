import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

const scratch = await mkdtemp(path.join(tmpdir(), 'forge-7b-coverage-'));
Object.assign(process.env, {
  FORGE_CONFIG_DIR: path.join(scratch, 'config'), FORGE_DB_PATH: path.join(scratch, 'forge.db'),
  FORGE_DECKS_DIR: path.join(scratch, 'decks'), FORGE_PROJECTS_BACKEND: 'sqlite', FORGE_HOSTED: '0',
});
const { specimenDeck } = await import('../../src/specimens.js');
const { importCoverage, convertGeneratedDeck } = await import('../../src/projects/legacy-conversion.js');
const { importGeneratedProject } = await import('../../src/projects/import-generated.js');
const store = await import('../../src/projects/store.js');
const { getDb } = await import('../../src/db.js');
const coverage = await importCoverage(), specimen = await specimenDeck();
const observations = [];
try {
  for (const type of Object.keys(coverage)) {
    const slide = specimen.slides.find(s => s.type === type);
    if (!slide) throw new Error(`missing specimen for ${type}`);
    const deck = { title: `Imported ${type}`, theme: 'warm-humanist', slides: [slide], ...(slide.section === undefined ? {} : { sections: specimen.sections }) };
    const slug = `audit-${type}`, dir = path.join(process.env.FORGE_DECKS_DIR, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'deck.yaml'), YAML.stringify(deck));
    await writeFile(path.join(dir, 'meta.yaml'), 'status: ready\n');
    let intent;
    const record = { type };
    const counts = () => ['v2_projects', 'v2_project_revisions', 'v2_project_imports'].map(table => {
      const exists = getDb().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      return exists ? getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n : 0;
    });
    const before = counts();
    try {
      intent = (await convertGeneratedDeck(deck)).intent;
      record.semantic = 'converted'; record.blocks = intent.slides[0].blocks.length;
    } catch (error) { record.semantic = 'refused'; record.semanticCode = error.code; }
    try {
      const result = await importGeneratedProject({ slug, requestId: 'audit-one', localOperator: true });
      record.creation = 'created'; record.elements = result.project.scenes[0].elements.length;
      record.timings = result.timings;
      await store.deleteProject({ id: result.project.id });
    } catch (error) {
      record.creation = 'refused'; record.code = error.code; record.details = error.details;
      if (!['unsupported-content', 'invalid-source'].includes(error.code)) throw error;
      if (JSON.stringify(counts()) !== JSON.stringify(before)) throw new Error(`refusal persisted state for ${type}`);
      record.atomicRefusal = true;
    }
    observations.push(record);
  }
  const result = {
    implementationSha: process.env.FORGE_AUDIT_SHA ?? '662f7d6a08647d431eded1ea17c5d13e7ca1c591',
    method: 'One untouched canonical specimen slide per each of 74 types; original section labels retained; real bounded source reader, shared conversion/compiler and atomic SQLite store. Refused specimens do not imply the whole family is refused.',
    coverage, observations,
    totals: {
      types: observations.length, fieldGatedFamilies: Object.values(coverage).filter(v => v.status === 'supported-with-field-gates').length,
      semanticConverted: observations.filter(v => v.semantic === 'converted').length,
      created: observations.filter(v => v.creation === 'created').length,
      refused: observations.filter(v => v.creation === 'refused').length,
    },
  };
  const output = process.argv[2] ?? 'out/v2-7b-1-validation/coverage-final.json';
  await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result.totals));
} finally { store.closeProjectStore(); await rm(scratch, { recursive: true, force: true }); }
