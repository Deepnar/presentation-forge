import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { importApiFixture } from './v2-import-fixture.js';

let fixture, project, pool, database;
before(async () => {
  let env = {};
  if (process.env.FORGE_COVERS_TEST_BACKEND === 'postgres') {
    assert.ok(process.env.TEST_PG_URL, 'owned PostgreSQL URL required');
    pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    database = `forge_covers_http_${process.pid}_${Date.now().toString(36)}`;
    await pool.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
    env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env);
  const source = await fixture.source();
  const response = await fixture.create(source.slug);
  assert.equal(response.status, 200); project = (await response.json()).project;
  console.log(`cover HTTP backend: ${fixture.env.FORGE_PROJECTS_BACKEND}`);
});
after(async () => {
  try { await fixture?.stop(); if (database) await pool.query(`DROP DATABASE "${database}"`); }
  finally { await pool?.end(); }
});
const cover = (options = {}, revision = '0', id = project.id) => fixture.request(`/api/v2/projects/${id}/cover?revision=${revision}`, { token: fixture.token, ...options });

test('cover returns only the first saved scene at the requested revision', async () => {
  const response = await cover(); assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, cover: { projectId: project.id, revision: 0, scene: project.scenes[0] } });
  assert.ok(JSON.stringify(body).length < JSON.stringify(project).length);
});
test('cover denies signed-out hosted access', async () => {
  const response = await cover({ token: null }); assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
test('cover hides another owner and nonexistent projects with the same status', async () => {
  const foreign = await cover({ token: fixture.otherToken });
  const missing = await cover({}, '0', 'p-000000000000000000000000');
  assert.equal(foreign.status, 404); assert.equal(missing.status, 404);
  assert.deepEqual(await foreign.json(), await missing.json());
});
test('cover rejects invalid identities and revision query shapes', async () => {
  assert.equal((await cover({}, '0', 'bad%20id')).status, 400);
  for (const revision of ['-1', '1.5', '01', '9007199254740992', '0&revision=1', '']) {
    assert.equal((await cover({}, revision)).status, 400, revision);
  }
});
test('cover reads do not advance the document or history', async () => {
  const before = await fixture.request(`/api/v2/projects/${project.id}/revisions`, { token: fixture.token }).then(r => r.json());
  await cover(); await cover();
  const actual = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token }).then(r => r.json());
  const history = await fixture.request(`/api/v2/projects/${project.id}/revisions`, { token: fixture.token }).then(r => r.json());
  assert.deepEqual(actual.project, project); assert.deepEqual(history, before);
});
test('saved first-slide edits invalidate an old revision instead of serving mismatched content', async () => {
  const scenes = structuredClone(project.scenes);
  const text = scenes[0].elements.find(el => el.kind === 'text'); text.paragraphs[0].runs[0].text = 'Saved cover edit';
  const response = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'PUT', body: JSON.stringify({ baseRevision: 0, scenes }) });
  assert.equal(response.status, 200);
  const stale = await cover(); assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'cover-stale');
  const fresh = await cover({}, '1').then(r => r.json());
  assert.deepEqual(fresh.cover.scene, scenes[0]); assert.equal(fresh.cover.revision, 1);
});
test('reordering changes the cover to the actual first saved slide', async () => {
  const scenes = [project.scenes[1], project.scenes[0], project.scenes[2]];
  assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'PUT', body: JSON.stringify({ baseRevision: 1, scenes }) })).status, 200);
  const fresh = await cover({}, '2').then(r => r.json()); assert.deepEqual(fresh.cover.scene, scenes[0]);
});
test('restoration changes the cover without reviving an older revision identity', async () => {
  const response = await fixture.request(`/api/v2/projects/${project.id}/restore`, { token: fixture.token, method: 'POST', body: JSON.stringify({ revision: 0, baseRevision: 2 }) });
  assert.equal(response.status, 200);
  const fresh = await cover({}, '3').then(r => r.json()); assert.deepEqual(fresh.cover.scene, project.scenes[0]);
  assert.equal((await cover({}, '2')).status, 409);
});
test('deleted projects do not remain accessible through their cover', async () => {
  assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'DELETE' })).status, 200);
  assert.equal((await cover({}, '3')).status, 404);
});
