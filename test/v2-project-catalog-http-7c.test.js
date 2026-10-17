import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import YAML from 'yaml';
import { Pool } from 'pg';
import { importApiFixture, IMPORT_DECK } from './v2-import-fixture.js';
import { catalogEntries, filterCatalog } from '../app/web/src/lib/projectCatalog.js';

let fixture, project, source, report, pool, database;
before(async () => {
  let env = {};
  if (process.env.FORGE_CATALOG_TEST_BACKEND === 'postgres') {
    assert.ok(process.env.TEST_PG_URL, 'owned PostgreSQL URL required');
    pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    database = `forge_catalog_http_${process.pid}_${Date.now().toString(36)}`;
    await pool.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
    env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env);
  source = await fixture.source();
  const response = await fixture.create(source.slug); assert.equal(response.status, 200);
  project = (await response.json()).project;
  report = await fixture.source({ deck: { ...IMPORT_DECK, title: 'Report only' } });
  await writeFile(path.join(report.folder, 'report.yaml'), YAML.stringify({ title: 'Report only', sections: {} }));
  await rm(path.join(report.folder, 'deck.yaml'));
  console.log(`catalog HTTP backend: ${fixture.env.FORGE_PROJECTS_BACKEND}`);
});
after(async () => {
  try { await fixture?.stop(); if (database) await pool.query(`DROP DATABASE "${database}"`); }
  finally { await pool?.end(); }
});
async function lists(token = fixture.token) {
  const [saved, generated] = await Promise.all(['/api/v2/projects', '/api/decks'].map(route => fixture.request(route, { token }).then(async response => { assert.equal(response.status, 200); return response.json(); })));
  return catalogEntries(saved.projects, generated.decks);
}

test('canonical metadata exposes generated originals, saved copies and report-only sources', async () => {
  const rows = await lists();
  assert.deepEqual(new Set(rows.map(row => row.key)), new Set([`saved:${project.id}`, `generated:${source.slug}`, `generated:${report.slug}`]));
  assert.equal(rows.find(row => row.id === report.slug).value.deck, false);
  assert.equal(rows.find(row => row.id === report.slug).value.report, true);
  assert.equal(rows.find(row => row.kind === 'saved').value.scenes, undefined);
  assert.equal(rows.filter(row => row.title === IMPORT_DECK.title).length, 2);
});
test('discovery and content search neither convert nor change scenes, revisions or history', async () => {
  const history = await fixture.request(`/api/v2/projects/${project.id}/revisions`, { token: fixture.token }).then(r => r.json());
  for (let n = 0; n < 2; n++) {
    const rows = await lists();
    const search = await fixture.request('/api/decks/search', { token: fixture.token, method: 'POST', body: JSON.stringify({ q: 'Conductivity' }) }).then(r => r.json());
    assert.deepEqual(search.hits, [source.slug]);
    assert.deepEqual(filterCatalog(rows, { query: 'Conductivity', hits: search.hits }).map(row => row.key), [`generated:${source.slug}`]);
    assert.equal(rows.filter(row => row.kind === 'saved').length, 1);
  }
  assert.deepEqual((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token }).then(r => r.json())).project, project);
  assert.deepEqual(await fixture.request(`/api/v2/projects/${project.id}/revisions`, { token: fixture.token }).then(r => r.json()), history);
});
test('both hosted catalogs and search refuse signed-out access', async () => {
  for (const route of ['/api/v2/projects', '/api/decks', '/api/decks/search']) {
    const options = route.endsWith('search') ? { method: 'POST', body: JSON.stringify({ q: 'Conductivity' }) } : {};
    assert.equal((await fixture.request(route, options)).status, 401, route);
  }
});
test('owner-scoped catalogs and content hits never disclose foreign or ownerless sources', async () => {
  const foreign = await fixture.source({ sourceOwner: 'import-other@example.test' });
  const ownerless = await fixture.source({ sourceOwner: null });
  const ownRows = await lists(); assert.ok(!ownRows.some(row => [foreign.slug, ownerless.slug].includes(row.id)));
  const otherRows = await lists(fixture.otherToken);
  assert.deepEqual(otherRows.map(row => row.key), [`generated:${foreign.slug}`]);
  const search = await fixture.request('/api/decks/search', { token: fixture.otherToken, method: 'POST', body: JSON.stringify({ q: 'Conductivity' }) }).then(r => r.json());
  assert.deepEqual(search.hits, [foreign.slug]);
  assert.deepEqual(filterCatalog(otherRows, { query: 'Conductivity', hits: [...search.hits, source.slug, project.id] }).map(row => row.id), [foreign.slug]);
});
test('deleting a saved copy retains the generated original and report', async () => {
  assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'DELETE' })).status, 200);
  const rows = await lists(); assert.ok(!rows.some(row => row.key === `saved:${project.id}`));
  assert.ok(rows.some(row => row.key === `generated:${source.slug}`));
  assert.ok(rows.some(row => row.key === `generated:${report.slug}`));
});
test('deleting a generated original retains its independent saved editable copy', async () => {
  const original = await fixture.source();
  const response = await fixture.create(original.slug, { requestId: 'second-copy' });
  assert.equal(response.status, 200); const saved = (await response.json()).project;
  assert.equal((await fixture.request(`/api/decks/${original.slug}`, { token: fixture.token, method: 'DELETE' })).status, 200);
  const rows = await lists(); assert.ok(!rows.some(row => row.key === `generated:${original.slug}`));
  assert.ok(rows.some(row => row.key === `saved:${saved.id}`));
  assert.deepEqual((await fixture.request(`/api/v2/projects/${saved.id}`, { token: fixture.token }).then(r => r.json())).project.scenes, saved.scenes);
});
test('admin discovery retains the existing cross-owner policy in both canonical reads', async () => {
  execFileSync(process.execPath, ['--input-type=module', '-e', "import {promoteToAdmin} from './src/auth.js';import {closeDb} from './src/db.js';await promoteToAdmin('import-other@example.test');closeDb();"], { env: fixture.env, timeout: 10000, stdio: 'pipe' });
  const rows = await lists(fixture.otherToken);
  assert.ok(rows.some(row => row.kind === 'saved'));
  assert.ok(rows.some(row => row.id === report.slug));
});
test('local anonymous saved projects retain their existing policy without exposing legacy ownerless data', async () => {
  const local = await importApiFixture({ FORGE_HOSTED: '0' });
  try {
    const created = await local.request('/api/v2/projects', { method: 'POST', body: JSON.stringify({ title: 'Local saved', scenes: project.scenes }) });
    assert.equal(created.status, 200);
    const saved = await local.request('/api/v2/projects').then(r => r.json()); assert.equal(saved.projects.length, 1);
    await local.source({ sourceOwner: null });
    assert.equal((await local.request('/api/decks')).status, 401);
    assert.deepEqual((await local.request('/api/decks', { token: local.token }).then(r => r.json())).decks, []);
  } finally { await local.stop(); }
});
