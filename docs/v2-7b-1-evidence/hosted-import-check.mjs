import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import JSZip from 'jszip';
import { importApiFixture } from '../../test/v2-import-fixture.js';

test('actual hosted PostgreSQL HTTP import and authenticated CLI replay retain human edits and native export', async () => {
  const maintenance = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
  const pool = new Pool({ connectionString: maintenance, connectionTimeoutMillis: 3000 });
  const name = `forge_7b_hosted_${process.pid}_${Date.now().toString(36)}`;
  const url = new URL(maintenance); url.pathname = `/${name}`;
  let fixture, created = false;
  try {
    await pool.query(`CREATE DATABASE "${name}"`); created = true;
    fixture = await importApiFixture({ FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href });
    const { slug } = await fixture.source();
    const start = performance.now();
    const response = await fixture.create(slug); assert.equal(response.status, 200);
    const { project, reused, timings } = await response.json(); assert.equal(reused, false);
    const httpMs = performance.now() - start;
    assert.equal(project.scenes[1].elements.find(e => e.kind === 'chart').chart.series[0].values[0], 1.25);
    assert.equal((await fixture.create(slug, { token: fixture.otherToken })).status, 404);
    const rename = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'PATCH', body: JSON.stringify({ baseRevision: 0, title: 'Human hosted title' }) });
    assert.equal(rename.status, 200);
    const execute = promisify(execFile);
    const cli = await execute(process.execPath, ['src/projects/import-cli.js', slug, '--request-id', 'request-one'], { env: { ...fixture.env, FORGE_IMPORT_TOKEN: fixture.token }, timeout: 20000 });
    const replay = JSON.parse(cli.stdout); assert.equal(replay.reused, true);
    assert.equal(replay.project.id, project.id); assert.equal(replay.project.title, 'Human hosted title');
    assert.equal(replay.project.revision, 1); assert.equal(replay.timings.compileMs, undefined);
    const exported = await fixture.request(`/api/v2/projects/${project.id}/export.pptx`, { token: fixture.token });
    assert.equal(exported.status, 200); const zip = await JSZip.loadAsync(await exported.arrayBuffer());
    const chart = Object.keys(zip.files).find(f => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    assert.ok(chart); const xml = await zip.file(chart).async('string');
    assert.ok(xml.includes('1.25') && xml.includes('12.5'));
    const history = await fixture.request(`/api/v2/projects/${project.id}/revisions`, { token: fixture.token }).then(r => r.json());
    assert.equal(history.revisions.length, 2);
    await writeFile('out/v2-7b-1-validation/hosted-import-measurements.json', `${JSON.stringify({ backend: 'PostgreSQL 15.18', slides: 3, timings, httpMs, replayTotalMs: replay.timings.totalMs, persistedRevision: replay.project.revision, nativeChartValues: [1.25, 12.5] }, null, 2)}\n`);
  } finally {
    await fixture?.stop();
    if (created) await pool.query(`DROP DATABASE "${name}"`);
    await pool.end();
  }
});
