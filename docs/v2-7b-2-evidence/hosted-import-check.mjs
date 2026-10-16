import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import JSZip from 'jszip';
import { importApiFixture } from '../../test/v2-import-fixture.js';
import { openViewer } from '../../tools/chrome-shot.mjs';

async function wait(page, expression) {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try { if (await page.evaluate(`Boolean(${expression})`)) return; } catch { /* document is navigating */ }
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(`browser condition timed out: ${expression}`);
}

test('actual hosted PostgreSQL double-click creates once; CLI replay retains human edits and native export', async () => {
  const maintenance = process.env.TEST_PG_URL ?? 'postgres://postgres:probe@127.0.0.1:5544/postgres';
  const pool = new Pool({ connectionString: maintenance, connectionTimeoutMillis: 3000 });
  const name = `forge_7b2_hosted_${process.pid}_${Date.now().toString(36)}`;
  const url = new URL(maintenance); url.pathname = `/${name}`;
  let fixture, page, created = false;
  try {
    await pool.query(`CREATE DATABASE "${name}"`); created = true;
    fixture = await importApiFixture({ FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href });
    const { slug } = await fixture.source();
    const start = performance.now();
    page = await openViewer(`${fixture.base}/scenes.html?deck=mech-warm-humanist-plain`);
    await page.onNewDocument(`window.__doublePosts=0;const sourceFetch=window.fetch;window.fetch=async function(url){if(!String(url).endsWith('/v2-project'))return sourceFetch.apply(this,arguments);window.__doublePosts++;const response=await sourceFetch.apply(this,arguments);window.__doubleResponse={status:response.status,body:await response.clone().json()};await new Promise(resolve=>window.__releaseDouble=resolve);return response}`);
    await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.token)});location.href=${JSON.stringify(`${fixture.base}/#/deck/${slug}`)}`);
    await wait(page, "document.querySelector('[data-editor-handoff] button') && !document.querySelector('[data-editor-handoff] button').disabled");
    const point = await page.evaluate("(() => {const b=document.querySelector('[data-editor-handoff] button');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.dblclick(...point); await wait(page, 'window.__releaseDouble');
    assert.equal(await page.evaluate('window.__doublePosts'), 1, 'two trusted clicks issue one POST');
    assert.equal(await page.evaluate("document.querySelector('[data-editor-handoff] button').disabled"), true);
    const response = await page.evaluate('window.__doubleResponse'); assert.equal(response.status, 200);
    const { project, reused, timings } = response.body; assert.equal(reused, false);
    await page.evaluate('window.__releaseDouble()');
    await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'");
    assert.equal(await page.evaluate("JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id"), project.id);
    await page.screenshot('docs/v2-7b-2-evidence/postgres-double-click.png');
    const chat = { id: 'hosted-handoff-proof', kind: 'deck', topic: 'Measured results', title: 'Imported results', produced: true, deckSlug: slug,
      turns: [{ role: 'user', text: 'Keep the measured values' }, { role: 'assistant', text: 'The measured values are retained.' }], briefStep: 99, briefing: {} };
    const chatKey = `forge.chats.${fixture.owner}`;
    await page.evaluate(`localStorage.setItem(${JSON.stringify(chatKey)},${JSON.stringify(JSON.stringify([chat]))});dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(chatKey)}}));location.hash='#/chat/hosted-handoff-proof'`);
    await wait(page, "document.querySelector('[data-editor-handoff] button') && !document.querySelector('[data-editor-handoff] button').disabled");
    await page.evaluate("document.querySelector('[data-editor-handoff]').scrollIntoView({block:'center'})");
    await page.screenshot('docs/v2-7b-2-evidence/completed-chat.png');
    await page.close(); page = null;
    const httpMs = performance.now() - start;
    assert.equal(project.scenes[1].elements.find(e => e.kind === 'chart').chart.series[0].values[0], 1.25);
    assert.equal((await fixture.create(slug, { token: fixture.otherToken })).status, 404);
    const rename = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'PATCH', body: JSON.stringify({ baseRevision: 0, title: 'Human hosted title' }) });
    assert.equal(rename.status, 200);
    const execute = promisify(execFile);
    const cli = await execute(process.execPath, ['src/projects/import-cli.js', slug, '--request-id', 'browser-editor-v1'], { env: { ...fixture.env, FORGE_IMPORT_TOKEN: fixture.token }, timeout: 20000 });
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
    await writeFile('out/v2-7b-2-validation/hosted-import-measurements.json', `${JSON.stringify({ backend: 'PostgreSQL 15.18', slides: 3, trustedClicks: 2, importPosts: 1, timings, browserBootAndHandoffMs: httpMs, replayTotalMs: replay.timings.totalMs, persistedRevision: replay.project.revision, nativeChartValues: [1.25, 12.5] }, null, 2)}\n`);
  } finally {
    await page?.close();
    await fixture?.stop();
    if (created) await pool.query(`DROP DATABASE "${name}"`);
    await pool.end();
  }
});
