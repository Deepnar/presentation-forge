import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import JSZip from 'jszip';
import { importApiFixture } from '../../../../test/v2-import-fixture.js';
import { preview } from '../../../../src/preview.js';

const output = new URL('./', import.meta.url);
const pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
const database = `forge_cover_review_${process.pid}_${Date.now().toString(36)}`;
const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
let fixture, created = false;
try {
  await pool.query(`CREATE DATABASE "${database}"`); created = true;
  fixture = await importApiFixture({ FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href });
  const source = await fixture.source();
  const response = await fixture.create(source.slug); assert.equal(response.status, 200);
  const project = (await response.json()).project;
  const scenes = structuredClone(project.scenes);
  scenes[0].elements.find(element => element.kind === 'text').paragraphs[0].runs[0].text = 'Saved human cover';
  const save = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'PUT', body: JSON.stringify({ baseRevision: 0, scenes }) });
  assert.equal(save.status, 200);
  const revisionPath = `/api/v2/projects/${project.id}/revisions`;
  const before = await fixture.request(revisionPath, { token: fixture.token }).then(result => result.json());
  const cover = await fixture.request(`/api/v2/projects/${project.id}/cover?revision=1`, { token: fixture.token });
  assert.equal(cover.status, 200); assert.equal(cover.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await cover.json()).cover, { projectId: project.id, revision: 1, scene: scenes[0] });
  assert.deepEqual(await fixture.request(revisionPath, { token: fixture.token }).then(result => result.json()), before);
  const exported = await fixture.request(`/api/v2/projects/${project.id}/export.pptx`, { token: fixture.token });
  assert.equal(exported.status, 200);
  const bytes = Buffer.from(await exported.arrayBuffer()), zip = await JSZip.loadAsync(bytes);
  assert.ok((await zip.file('ppt/slides/slide1.xml').async('string')).includes('Saved human cover'));
  const chart = await zip.file('ppt/charts/chart1.xml').async('string');
  assert.ok(chart.includes('1.25') && chart.includes('12.5'));
  const table = await zip.file('ppt/slides/slide3.xml').async('string');
  assert.ok(table.includes('<a:tbl>') && table.includes('1.25') && table.includes('12.5'));
  const pptx = new URL('native.pptx', output); await writeFile(pptx, bytes);
  const rendered = await preview(pptx.pathname, { outDir: new URL('native/', output).pathname });
  assert.equal(rendered.pages.length, 3);
  await writeFile(new URL('native-inspection.json', output), JSON.stringify({ implementationSha: 'f79ae07d6ad1696da3106a2a1148ae0ce7f58f51', backend: 'PostgreSQL15.18 localhost5544', revision: 1, coverEqualsSavedFirstScene: true, coverReadLeavesHistoryUnchanged: true, sha256: createHash('sha256').update(bytes).digest('hex'), nativeChartAndTable: true, values: [1.25, 12.5], rasterizedPages: rendered.pages, visualInspection: 'Recorded separately by reviewer after opening rasters' }, null, 2) + '\n');
  console.log('Saved first-scene cover, unchanged history, native text/chart/table and three raster pages verified.');
} finally {
  await fixture?.stop();
  if (created) await pool.query(`DROP DATABASE "${database}"`);
  await pool.end();
}
