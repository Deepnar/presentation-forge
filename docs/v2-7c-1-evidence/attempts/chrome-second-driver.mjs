import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import { importApiFixture } from './v2-import-fixture.js';
import { openViewer } from '../tools/chrome-shot.mjs';
import { sceneToSvg } from '../packages/editor/scene-svg.js';
import { buildBlankScenes } from '../app/web/src/lib/v2create.js';

const EVIDENCE = path.resolve('docs/v2-7c-1-evidence'), OUT = path.resolve('out/v2-7c-1-validation/browser');
let fixture, pool, database;
async function wait(page, expression, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await page.evaluate(`Boolean(${expression})`)) return; } catch { /* route replacement */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out: ${expression}; ${await page.evaluate('document.body.innerText.slice(-1400)').catch(() => 'closed context')}`);
}
async function click(page, selector) {
  await wait(page, `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  await page.evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});window.__coverPoint=null;window.__coverPointTrace=[];let previous=null;const end=performance.now()+5000;function frame(){if(!n.isConnected)return;const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);window.__coverPointTrace.push({rect:[r.x,r.y,r.width,r.height],hit:hit?.tagName});if(previous&&Math.abs(previous.x-r.x)<.1&&Math.abs(previous.y-r.y)<.1&&(hit===n||n.contains(hit))){window.__coverPoint=[x,y];return}previous={x:r.x,y:r.y};if(performance.now()<end)requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  try { await wait(page, 'window.__coverPoint', 6000); }
  catch (error) { throw new Error(`${error.message}; pointer trace:${JSON.stringify(await page.evaluate('window.__coverPointTrace.slice(-4)'))}`); }
  const point = await page.evaluate('window.__coverPoint'); await page.click(...point);
}
const selector = p => `[data-project-cover="${p.id}"]`;
const ready = (page, p, revision = p.revision) => wait(page, `document.querySelector(${JSON.stringify(selector(p))})?.dataset.coverState==='ready' && document.querySelector(${JSON.stringify(selector(p))})?.dataset.coverRevision===${JSON.stringify(String(revision))}`);
async function make({ scenes, title = 'Cover presentation' } = {}) {
  if (!scenes) {
    const source = await fixture.source(); const response = await fixture.create(source.slug);
    assert.equal(response.status, 200); return (await response.json()).project;
  }
  const response = await fixture.request('/api/v2/projects', { token: fixture.token, method: 'POST', body: JSON.stringify({ title, scenes }) });
  assert.equal(response.status, 200); return (await response.json()).project;
}
const trace = `window.__coverCalls=[];window.__coverActive=0;window.__coverMax=0;window.__coverBytes=[];window.__coverRelease=[];window.__holdCovers=false;window.__failCover=false;window.__neverCover=false;const realFetch=window.fetch;window.fetch=async function(url,options){if(!String(url).includes('/cover?revision='))return realFetch.apply(this,arguments);window.__coverCalls.push(String(url));window.__coverActive++;window.__coverMax=Math.max(window.__coverMax,window.__coverActive);try{if(window.__failCover){window.__failCover=false;throw new TypeError('injected preview network failure')}if(window.__holdCovers||window.__neverCover){await new Promise((resolve,reject)=>{const stop=()=>reject(new DOMException('Aborted','AbortError'));options.signal.addEventListener('abort',stop,{once:true});window.__coverRelease.push(()=>{options.signal.removeEventListener('abort',stop);resolve()})})}const response=await realFetch.apply(this,arguments);window.__coverBytes.push(new TextEncoder().encode(await response.clone().text()).byteLength);return response}finally{window.__coverActive--}};window.__releaseAllCovers=()=>{window.__holdCovers=false;window.__neverCover=false;window.__coverRelease.splice(0).forEach(release=>release())};window.__coverPolicy=[];addEventListener('securitypolicyviolation',e=>window.__coverPolicy.push(e.violatedDirective));`;
async function open({ mode = 'light', inject = '', base = fixture.base } = {}) {
  const page = await openViewer(`${base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    await page.onNewDocument(`${trace}${inject}`);
    await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.token)});localStorage.setItem('forge.leftNav','0');localStorage.setItem('forge.theme',${JSON.stringify(mode)});location.href=${JSON.stringify(`${base}/#/projects`)}`);
    await wait(page, "document.querySelector('[data-project-grid]')"); return page;
  } catch (error) { await page.close(); throw error; }
}
async function capture(page, name) { await page.screenshot(path.join(EVIDENCE, `${name}.png`)); }
async function data(name, value) { await writeFile(path.join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`); }
async function bounds(page, p) { return page.evaluate(`(() => {const r=document.querySelector('[data-project-card="${p.id}"]').getBoundingClientRect(),g=document.querySelector('[data-project-grid]').getBoundingClientRect();return [r.x-g.x,r.y-g.y,r.width,r.height]})()`); }

before(async () => {
  execFileSync('node_modules/.bin/vite', ['build', '--config', 'app/web/vite.config.js'], { timeout: 300000, stdio: 'pipe' });
  await mkdir(EVIDENCE, { recursive: true }); await mkdir(OUT, { recursive: true });
  let env = {};
  if (process.env.FORGE_COVERS_TEST_BACKEND === 'postgres') {
    assert.ok(process.env.TEST_PG_URL, 'owned PostgreSQL URL required');
    pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    database = `forge_covers_browser_${process.pid}_${Date.now().toString(36)}`; await pool.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
    env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env); console.log(`cover browser backend: ${fixture.env.FORGE_PROJECTS_BACKEND}; actual production server/CSP`);
});
beforeEach(async () => {
  const list = await fixture.request('/api/v2/projects', { token: fixture.token }).then(r => r.json());
  for (const project of list.projects) assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token, method: 'DELETE' })).status, 200);
});
after(async () => {
  try { await fixture?.stop(); if (database) await pool.query(`DROP DATABASE "${database}"`); }
  finally { await pool?.end(); }
});

test('saved first-slide cover matches the canonical SVG and opens by keyboard', async () => {
  const p = await make(), page = await open(); const start = Date.now();
  try {
    await ready(page, p); const expected = sceneToSvg(p.scenes[0], { wrapText: true });
    const svg = await page.evaluate(`document.querySelector('${selector(p)} svg').outerHTML`);
    const parsed = await page.evaluate(`new DOMParser().parseFromString(${JSON.stringify(expected)},'text/html').querySelector('svg').outerHTML`);
    assert.equal(svg, parsed); assert.deepEqual(await page.evaluate('window.__coverPolicy'), []);
    const rect = await page.evaluate(`(() => {const r=document.querySelector('[data-project-cover-open="${p.id}"]').getBoundingClientRect();return [r.width,r.height]})()`);
    assert.ok(Math.abs(rect[0] / rect[1] - 16 / 9) < .01);
    await capture(page, 'covers-desktop'); await data('first-visible', { backend: fixture.env.FORGE_PROJECTS_BACKEND, msAfterGrid: Date.now() - start, bounds: rect, bytes: await page.evaluate('window.__coverBytes') });
    await page.evaluate(`document.querySelector('[data-project-cover-open="${p.id}"]').focus()`); await page.key(32, ' ');
    await wait(page, `document.querySelector('[data-save-state]')?.dataset.saveState==='saved'&&JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id===${JSON.stringify(p.id)}`);
  } finally { await page.close(); }
});
test('human edits, first-slide reorder and history restoration refresh the saved cover', async () => {
  const p = await make(), page = await open();
  try {
    await ready(page, p); await click(page, `[data-project-cover-open="${p.id}"]`);
    await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'");
    const point = await page.evaluate("(() => {const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.dblclick(...point); await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText('Human cover title');
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-save]')"); await click(page, '[data-leave-save]'); await ready(page, p, 1);
    assert.ok(await page.evaluate(`document.querySelector('${selector(p)} svg').textContent.includes('Human cover title')`));
    const saved = await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token }).then(r => r.json());
    const scenes = [saved.project.scenes[1], saved.project.scenes[0], saved.project.scenes[2]];
    assert.equal((await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token, method: 'PUT', body: JSON.stringify({ baseRevision: saved.project.revision, scenes }) })).status, 200);
    await click(page, '[title="Reload the project list"]'); await ready(page, p, 2);
    assert.ok(await page.evaluate(`document.querySelector('${selector(p)} svg').textContent.includes('Conductivity')`));
    await click(page, `[data-project-history="${p.id}"]`); await wait(page, "document.querySelector('[data-history-select=\"0\"]')");
    await click(page, '[data-history-select="0"]'); await click(page, '[data-history-restore="0"]'); await wait(page, "document.querySelector('[data-restore-done]')");
    await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[data-history-panel]')"); await click(page, '[aria-label="Back to workspace"]'); await ready(page, p, 3);
    const actual = await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token }).then(r => r.json());
    assert.equal(actual.project.revision, 3); assert.deepEqual(actual.project.scenes[0], p.scenes[0]);
    assert.ok(await page.evaluate(`document.querySelector('${selector(p)} svg').textContent.includes('Imported results')`)); await capture(page, 'covers-restored');
  } finally { await page.close(); }
});
test('blank, detached, hidden, chart and table content remain honest read-only previews', async () => {
  const original = await make(), detached = structuredClone(original.scenes[0]); detached.layoutState = 'detached';
  const text = detached.elements.find(el => el.kind === 'text'); text.paragraphs[0].runs[0].text = 'Human <b>edit</b>';
  const hidden = structuredClone(text); hidden.id = 'hidden-cover-text'; hidden.hidden = true; hidden.paragraphs[0].runs[0].text = 'Never visible'; detached.elements.push(hidden);
  const projects = [await make({ title: 'Blank cover', scenes: await buildBlankScenes() }), await make({ title: 'Detached cover', scenes: [detached] }), await make({ title: 'Chart cover', scenes: [original.scenes[1]] }), await make({ title: 'Table cover', scenes: [original.scenes[2]] })];
  const page = await open();
  try {
    for (const p of projects) { await page.evaluate(`document.querySelector('${selector(p)}').scrollIntoView({behavior:'instant',block:'center'})`); await ready(page, p); }
    const human = await page.evaluate(`document.querySelector('${selector(projects[1])} svg').textContent`); assert.ok(human.includes('Human <b>edit</b>')); assert.ok(!human.includes('Never visible'));
    assert.equal(await page.evaluate(`document.querySelector('${selector(projects[1])} svg b')!==null`), false);
    assert.equal(await page.evaluate(`document.querySelector('${selector(projects[0])} svg').querySelectorAll('[data-el]').length`), 0);
    const before = await fixture.request(`/api/v2/projects/${projects[1].id}`, { token: fixture.token }).then(r => r.json()); assert.deepEqual(before.project.scenes, [detached]);
    await page.evaluate("document.querySelector('[data-project-grid]').scrollIntoView({behavior:'instant'})"); await capture(page, 'covers-content');
  } finally { await page.close(); }
});
test('dark narrow cards retain usable preview and action bounds', async () => {
  const p = await make(), page = await open({ mode: 'dark' });
  try {
    await page.viewport(480, 900); await ready(page, p);
    const box = await page.evaluate(`(() => {const r=document.querySelector('[data-project-cover-open="${p.id}"]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`);
    assert.ok(box[0] >= 0 && box[0] + box[2] <= 480); assert.ok(Math.abs(box[2] / box[3] - 16 / 9) < .01);
    assert.equal(await page.evaluate('document.documentElement.dataset.theme'), 'dark');
    await capture(page, 'covers-narrow-dark'); await data('narrow', { viewport: [480, 900], bounds: box });
    await click(page, `[data-project-open="${p.id}"]`); await wait(page, "document.querySelector('[data-topbar]')");
  } finally { await page.close(); }
});
test('near-viewport work stays bounded and loading never shifts the cards', async () => {
  const first = await make(); const all = [];
  for (let i = 0; i < 29; i++) all.push(await make({ title: `Preview load ${i}`, scenes: [first.scenes[0]] }));
  const page = await open({ inject: 'window.__holdCovers=true;' });
  try {
    await wait(page, 'window.__coverCalls.length===2'); assert.equal(await page.evaluate('window.__coverMax'), 2);
    assert.ok((await page.evaluate('window.__coverCalls.length')) < 30);
    const p = all.at(-1), before = await bounds(page, p); await capture(page, 'covers-loading');
    await page.evaluate('window.__releaseAllCovers()'); await ready(page, p); const after = await bounds(page, p);
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(before[i] - after[i]) < .2, `bounds coordinate${i}`);
    await page.evaluate(`document.querySelector('${selector(first)}').scrollIntoView({behavior:'instant',block:'center'})`); await ready(page, first);
    assert.ok((await page.evaluate('window.__coverMax')) <= 2);
    await data('many-projects', { projects: 30, before, after, maxActive: await page.evaluate('window.__coverMax'), requests: await page.evaluate('window.__coverCalls.length') });
  } finally { await page.close(); }
});
test('network and transient shipped-font failures have stable local recovery', async () => {
  const p = await make();
  for (const kind of ['network', 'font']) {
    const inject = kind === 'network' ? 'window.__failCover=true;' : "const fontLoad=document.fonts.load.bind(document.fonts);window.__failFont=true;document.fonts.load=function(){if(window.__failFont){window.__failFont=false;return Promise.reject(new Error('injected temporary font failure'))}return fontLoad(...arguments)};";
    const page = await open({ inject });
    try {
      await wait(page, `document.querySelector('${selector(p)}')?.dataset.coverState==='error'`); const before = await bounds(page, p); await capture(page, `covers-${kind}-failure`);
      await click(page, `${selector(p)} button:not([data-project-cover-open])`); await ready(page, p); const after = await bounds(page, p);
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(before[i] - after[i]) < .2);
      assert.equal(await page.evaluate('window.__coverCalls.length'), 2); await data(`retry-${kind}`, { before, after });
    } finally { await page.close(); }
  }
});
test('refresh rejects old revision work and deletion cannot resurrect a card', async () => {
  const p = await make(), page = await open({ inject: 'window.__holdCovers=true;' });
  try {
    await wait(page, 'window.__coverCalls.length===1');
    const scenes = structuredClone(p.scenes); scenes[0].elements.find(el => el.kind === 'text').paragraphs[0].runs[0].text = 'New saved cover';
    assert.equal((await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token, method: 'PUT', body: JSON.stringify({ baseRevision: 0, scenes }) })).status, 200);
    await click(page, '[title="Reload the project list"]'); await wait(page, "window.__coverCalls.some(url=>url.endsWith('revision=1'))");
    await page.evaluate('window.__releaseAllCovers()'); await ready(page, p, 1);
    assert.ok(await page.evaluate(`document.querySelector('${selector(p)} svg').textContent.includes('New saved cover')`));
    await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token, method: 'DELETE' }); await click(page, '[title="Reload the project list"]');
    await wait(page, "!document.querySelector('[data-project-card]')"); assert.equal(await page.evaluate("document.querySelectorAll('[data-project-cover] svg').length"), 0);
  } finally { await page.close(); }
});
test('pending and settled account changes clear previews and guard navigation', async () => {
  const p = await make();
  for (const kind of ['pending', 'settled', 'cross-tab']) {
    const page = await open({ inject: kind === 'pending' ? 'window.__holdCovers=true;' : '' });
    try {
      if (kind === 'pending') await wait(page, 'window.__coverCalls.length===1'); else await ready(page, p);
      const hash = await page.evaluate('location.hash');
      if (kind === 'cross-tab') {
        await page.evaluate('window.__coverPeer=window.open(location.href,"cover-peer")'); await wait(page, 'window.__coverPeer && window.__coverPeer.document.readyState===\'complete\'');
        await page.evaluate(`window.__coverPeer.localStorage.setItem('forge.token',${JSON.stringify(fixture.otherToken)});window.__coverPeer.close()`);
      } else {
        await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.otherToken)});${kind === 'pending' ? 'window.__releaseAllCovers()' : ''}`);
        if (kind === 'settled') await click(page, `[data-project-cover-open="${p.id}"]`);
      }
      await wait(page, "document.body.textContent.includes('Your sign-in changed')"); assert.equal(await page.evaluate('location.hash'), hash);
      assert.equal(await page.evaluate("document.querySelectorAll('[data-project-cover] svg').length"), 0);
      assert.equal(await page.evaluate("document.activeElement?.getAttribute('role')"), 'alert'); await capture(page, `covers-session-${kind}`);
    } finally { await page.close(); }
  }
});
test('departure cancels preview work and timeout leaves Open usable', async () => {
  const p = await make();
  for (const kind of ['departure', 'timeout']) {
    const page = await open({ inject: 'window.__holdCovers=true;' });
    try {
      await wait(page, 'window.__coverCalls.length===1');
      if (kind === 'timeout') { await wait(page, `document.querySelector('${selector(p)}')?.dataset.coverState==='error'`, 20000); await capture(page, 'covers-timeout'); }
      await click(page, `[data-project-open="${p.id}"]`); await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'");
      await wait(page, 'window.__coverActive===0'); await page.evaluate('window.__releaseAllCovers()');
      assert.equal(await page.evaluate("document.querySelectorAll('[data-project-cover]').length"), 0);
    } finally { await page.close(); }
  }
});
test('development StrictMode effect replay creates a fresh live cover loader', async () => {
  const p = await make();
  const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
  const config = path.join(fixture.dir, 'cover-vite.config.mjs');
  await writeFile(config, `import config from ${JSON.stringify(new URL('../app/web/vite.config.js', import.meta.url).href)};export default {...config,server:{...config.server,port:${port},host:'127.0.0.1',strictPort:true,proxy:{'/api':{target:${JSON.stringify(fixture.base)},changeOrigin:true}}}};`);
  const dev = spawn('node_modules/.bin/vite', ['--config', config], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', page;
  dev.stdout.on('data', d => output += d); dev.stderr.on('data', d => output += d);
  try {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (dev.exitCode !== null) throw new Error(output); try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    page = await open({ base: `http://127.0.0.1:${port}` }); await ready(page, p); await capture(page, 'covers-development');
    assert.ok((await page.evaluate('window.__coverCalls.length')) > 0); assert.deepEqual(await page.evaluate('window.__coverPolicy'), []);
  } finally {
    await page?.close();
    if (dev.exitCode === null) { process.kill(-dev.pid, 'SIGTERM'); await new Promise(resolve => { dev.once('exit', resolve); setTimeout(() => { try { process.kill(-dev.pid, 'SIGKILL'); } catch {} resolve(); }, 3000).unref(); }); }
  }
});
