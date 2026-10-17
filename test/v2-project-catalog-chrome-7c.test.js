import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { createServer } from 'node:net';
import { Pool } from 'pg';
import { importApiFixture, IMPORT_DECK } from './v2-import-fixture.js';
import { openViewer } from '../tools/chrome-shot.mjs';
const EVIDENCE = path.resolve('docs/v2-7c-2-evidence'), OUT = path.resolve('out/v2-7c-2-validation/browser');
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
  // Ending an ancestor transform changes the containing block of fixed dialogs.
  await wait(page, "document.getAnimations().filter(a=>['view-in','fade-in'].some(name=>a.effect?.target?.classList?.contains(name))).every(a=>a.playState!=='running')", 6000);
  await wait(page, `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  await page.evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'center',behavior:'instant'});window.__catalogPoint=null;window.__catalogPointTrace=[];let previous=null;const end=performance.now()+5000;function frame(){if(!n.isConnected)return;const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);window.__catalogPointTrace.push({rect:[r.x,r.y,r.width,r.height],hit:hit?.tagName});if(previous&&Math.abs(previous.x-r.x)<.1&&Math.abs(previous.y-r.y)<.1&&(hit===n||n.contains(hit))){window.__catalogPoint=[x,y];return}previous={x:r.x,y:r.y};if(performance.now()<end)requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  try { await wait(page, 'window.__catalogPoint', 6000); }
  catch (error) { throw new Error(`${error.message}; pointer trace:${JSON.stringify(await page.evaluate('window.__catalogPointTrace.slice(-4)'))}`); }
  const point = await page.evaluate('window.__catalogPoint'); await page.click(...point);
}
const trace = `window.__catalogRequests=[];window.__failSource='';window.__holdSearch=false;window.__searchRelease=[];window.__aborted=0;window.__policies=[];addEventListener('securitypolicyviolation',e=>window.__policies.push(e.violatedDirective));const realFetch=window.fetch;window.fetch=async function(url,options={}){const route=new URL(String(url),location.href).pathname;window.__catalogRequests.push({route,method:options.method||'GET',body:options.body});if((window.__failSource==='saved'&&route==='/api/v2/projects')||(window.__failSource==='generated'&&route==='/api/decks'))throw new TypeError('injected source outage');if(route==='/api/decks/search'&&window.__holdSearch){const response=await realFetch.apply(this,arguments);await new Promise(resolve=>{window.__searchRelease.push(()=>resolve());options.signal?.addEventListener('abort',()=>{window.__aborted++;resolve()},{once:true})});return response}return realFetch.apply(this,arguments)};`;
async function open({ mode = 'light', inject = '', token = fixture.token, base = fixture.base } = {}) {
  const page = await openViewer(`${base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    await page.onNewDocument(`${trace}${inject}`);
    await page.evaluate(`${token ? `localStorage.setItem('forge.token',${JSON.stringify(token)})` : "localStorage.removeItem('forge.token')"};localStorage.setItem('forge.leftNav','0');localStorage.setItem('forge.theme',${JSON.stringify(mode)});location.href=${JSON.stringify(`${base}/#/projects`)}`);
    await wait(page, "document.querySelector('[data-project-catalog]')"); return page;
  } catch (error) { await page.close(); throw error; }
}
const savedSelector = p => `[data-project-card="${p.id}"]`;
const generatedSelector = p => `[data-generated-card="${p.slug}"]`;
async function make() {
  const source = await fixture.source(); const response = await fixture.create(source.slug, { requestId: 'browser-editor-v1' });
  assert.equal(response.status, 200); return { source, project: (await response.json()).project };
}
async function reportOnly() {
  const source = await fixture.source();
  await writeFile(path.join(source.folder, 'report.yaml'), YAML.stringify({ title: 'Report only', content: { Introduction: { paragraphs: ['A report without a deck.'] } } }));
  await rm(path.join(source.folder, 'deck.yaml')); return source;
}
async function fill(page, text) { await click(page, '[data-catalog-search]'); await page.evaluate("document.querySelector('[data-catalog-search]').select()"); await page.insertText(text); }
async function type(page, value) { await page.evaluate(`(() => {const n=document.querySelector('[data-catalog-type]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}))})()`); }
async function button(page, text, root = 'document') {
  const selector = await page.evaluate(`(() => {const n=[...${root}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n)return null;n.dataset.catalogTarget='yes';return '[data-catalog-target="yes"]'})()`);
  assert.ok(selector, `button ${text}`); await click(page, selector); await page.evaluate("document.querySelectorAll('[data-catalog-target]').forEach(n=>delete n.dataset.catalogTarget)");
}
async function capture(page, name) { await wait(page, "!document.querySelector('[role=dialog]') || +getComputedStyle(document.querySelector('[role=dialog]').parentElement).opacity >= .999"); await page.screenshot(path.join(EVIDENCE, `${name}.png`)); }
async function data(name, value) { await writeFile(path.join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`); }
async function settledTargets(page, selectors) {
  await page.evaluate(`window.__settledTargets=null;(()=>{let last='',stable=0;const end=performance.now()+5000;function frame(){const nodes=${JSON.stringify(selectors)}.map(s=>document.querySelector(s));const boxes=nodes.map(n=>{if(!n)return null;const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {box:[r.x,r.y,r.width,r.height],hit:hit===n||n.contains(hit)}});const next=JSON.stringify(boxes);stable=next===last?stable+1:0;last=next;if(stable>=5&&boxes.every(b=>b&&b.hit)){window.__settledTargets=boxes;return}if(performance.now()<end)requestAnimationFrame(frame)}requestAnimationFrame(frame)})()`);
  await wait(page, 'window.__settledTargets', 6000); return page.evaluate('window.__settledTargets');
}
before(async () => {
  execFileSync('node_modules/.bin/vite', ['build', '--config', 'app/web/vite.config.js'], { timeout: 300000, stdio: 'pipe' });
  await mkdir(EVIDENCE, { recursive: true }); await mkdir(OUT, { recursive: true });
  let env = {};
  if (process.env.FORGE_CATALOG_TEST_BACKEND === 'postgres') {
    assert.ok(process.env.TEST_PG_URL, 'owned PostgreSQL URL required');
    pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    database = `forge_catalog_browser_${process.pid}_${Date.now().toString(36)}`; await pool.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
    env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env); console.log(`catalog browser backend: ${fixture.env.FORGE_PROJECTS_BACKEND}; actual production server/CSP`);
});
beforeEach(async () => {
  const list = await fixture.request('/api/v2/projects', { token: fixture.token }).then(r => r.json());
  for (const p of list.projects) assert.equal((await fixture.request(`/api/v2/projects/${p.id}`, { token: fixture.token, method: 'DELETE' })).status, 200);
  const legacy = await fixture.request('/api/decks', { token: fixture.token }).then(r => r.json());
  for (const p of legacy.decks) assert.equal((await fixture.request(`/api/decks/${p.slug}`, { token: fixture.token, method: 'DELETE' })).status, 200);
});
after(async () => {
  try { await fixture?.stop(); if (database) await pool.query(`DROP DATABASE "${database}"`); }
  finally { await pool?.end(); }
});

test('one Projects destination discovers both copies without automatic conversion and preserves explicit editor reopening', async () => {
  const { source, project } = await make(), page = await open(), start = Date.now();
  try {
    await wait(page, `document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')`);
    assert.equal(await page.evaluate("document.querySelectorAll('aside a[href=\"#/projects\"]').length"), 1);
    assert.equal(await page.evaluate("window.__catalogRequests.filter(r=>r.route.endsWith('/v2-project')).length"), 0);
    await wait(page, `document.querySelector('[data-project-cover="${project.id}"]')?.dataset.coverState==='ready'`);
    await settledTargets(page, [`[data-project-cover-open="${project.id}"]`, `[data-project-open="${project.id}"]`, `[data-generated-open="${source.slug}"]`]);
    await capture(page, 'catalog-desktop'); await data('discovery', { backend: fixture.env.FORGE_PROJECTS_BACKEND, msAfterRoot: Date.now() - start, requests: await page.evaluate('window.__catalogRequests') });
    await click(page, `[data-generated-open="${source.slug}"]`);
    await wait(page, "document.querySelector('[data-editor-handoff]')"); assert.equal(await page.evaluate('location.hash'), `#/deck/${source.slug}`);
    await button(page, 'Open in editor', "document.querySelector('[data-editor-handoff]')");
    await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'");
    assert.equal(await page.evaluate("JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id"), project.id);
    assert.equal((await fixture.request('/api/v2/projects', { token: fixture.token }).then(r => r.json())).projects.length, 1);
    assert.deepEqual(await page.evaluate('window.__policies'), []);
  } finally { await page.close(); }
});
test('report-only sources open the report, retain companion routes and return to Projects', async () => {
  const source = await reportOnly(), page = await open();
  try {
    await click(page, `[data-generated-open="${source.slug}"]`); await wait(page, "document.body.innerText.includes('A report without a deck.')");
    assert.equal(await page.evaluate('location.hash'), `#/report/${source.slug}`);
    for (const destination of ['Research', 'Script', 'Report']) { await button(page, destination, "document.querySelector('nav')"); await wait(page, `location.hash===${JSON.stringify(`#/${destination.toLowerCase()}/${source.slug}`)}`); await wait(page, `[...document.querySelectorAll('nav [aria-current=page]')].some(n=>n.textContent===${JSON.stringify(destination)}&&n.getBoundingClientRect().width>0)`); }
    await button(page, 'All projects'); await wait(page, "document.querySelector('[data-project-catalog]')");
    await wait(page, `document.querySelector('${generatedSelector(source)}')`);
  } finally { await page.close(); }
});
test('title, generated content and type filters give honest results and can clear an empty search', async () => {
  const { source, project } = await make(), report = await reportOnly(), page = await open();
  try {
    await wait(page, "document.querySelectorAll('[data-generated-card]').length===2");
    await type(page, 'saved'); assert.equal(await page.evaluate("document.querySelectorAll('[data-generated-card]').length"), 0); assert.equal(await page.evaluate("document.querySelectorAll('[data-project-card]').length"), 1);
    await type(page, 'reports'); await wait(page, `document.querySelector('${generatedSelector(report)}')`); assert.equal(await page.evaluate("document.querySelectorAll('[data-generated-card]').length"), 1);
    await type(page, 'all'); await fill(page, 'Conductivity');
    await wait(page, `document.querySelector('${generatedSelector(source)}')&&!document.querySelector('${savedSelector(project)}')&&!document.querySelector('${generatedSelector(report)}')`);
    await fill(page, 'no-such-search-zz'); await wait(page, "document.body.innerText.includes('No matching projects')");
    await capture(page, 'catalog-no-matches'); await button(page, 'Clear search and filters'); await wait(page, "document.querySelectorAll('[data-generated-card]').length===2&&document.querySelectorAll('[data-project-card]').length===1");
  } finally { await page.close(); }
});
test('partial source failures retain the healthy kind and retry only the failed catalog', async () => {
  const { source, project } = await make();
  for (const kind of ['saved', 'generated']) {
    const page = await open({ inject: `window.__failSource=${JSON.stringify(kind)};` });
    try {
      await wait(page, `document.querySelector('[data-catalog-error="${kind}"]')`);
      await wait(page, `document.querySelector('${kind === 'saved' ? generatedSelector(source) : savedSelector(project)}')`);
      assert.ok(!(await page.evaluate('document.body.innerText')).includes('No projects yet'));
      const route = kind === 'saved' ? '/api/decks' : '/api/v2/projects';
      const before = await page.evaluate(`window.__catalogRequests.filter(r=>r.route===${JSON.stringify(route)}).length`);
      await capture(page, `catalog-${kind}-error`); await page.evaluate("window.__failSource=''");
      await button(page, kind === 'saved' ? 'Retry saved presentations' : 'Retry generated projects');
      await wait(page, `document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')&&!document.querySelector('[data-catalog-error]')`);
      assert.equal(await page.evaluate(`window.__catalogRequests.filter(r=>r.route===${JSON.stringify(route)}).length`), before);
    } finally { await page.close(); }
  }
});
test('stale content responses cannot overwrite newer queries or survive query clearing', async () => {
  const { source } = await make(), page = await open({ inject: 'window.__holdSearch=true;' });
  try {
    await fill(page, 'Conductivity'); await wait(page, 'window.__searchRelease.length===1');
    await fill(page, 'nothing-zz'); await wait(page, 'window.__aborted===1&&window.__searchRelease.length===2');
    await page.evaluate('window.__searchRelease.shift()()'); await wait(page, "document.body.innerText.includes('No matching projects')");
    assert.equal(await page.evaluate(`document.querySelector('${generatedSelector(source)}')!==null`), false);
    await page.evaluate("window.__holdSearch=false"); await button(page, 'Clear search and filters'); await wait(page, `document.querySelector('${generatedSelector(source)}')`);
    await page.evaluate('window.__searchRelease.splice(0).forEach(fn=>fn())'); await wait(page, 'window.__aborted===2');
    assert.equal(await page.evaluate("document.querySelector('[data-catalog-search]').value"), '');
    assert.ok(await page.evaluate(`document.querySelector('${generatedSelector(source)}')!==null`));
  } finally { await page.close(); }
});
test('generated deletion names the selected copy, traps focus, cancels with Escape and retains saved edits', async () => {
  const { source, project } = await make(), page = await open();
  try {
    const remove = `[data-generated-delete="${source.slug}"]`; await click(page, remove);
    await wait(page, "document.querySelector('[role=dialog]')&&document.activeElement.textContent==='Cancel'");
    for (const key of ['k', 'n']) await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},ctrlKey:true,bubbles:true}))`);
    assert.equal(await page.evaluate('location.hash'), '#/projects');
    assert.equal(await page.evaluate('document.activeElement.textContent'), 'Cancel');
    assert.match(await page.evaluate("document.querySelector('[role=dialog]').innerText"), /Saved editable copies remain separate/);
    await page.key(9, 'Tab'); assert.equal(await page.evaluate('document.activeElement.textContent'), 'Delete generated project');
    await page.key(9, 'Tab'); assert.equal(await page.evaluate('document.activeElement.textContent'), 'Cancel');
    await capture(page, 'catalog-delete-generated'); await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[role=dialog]')");
    assert.equal(await page.evaluate(`document.activeElement===document.querySelector('${remove}')`), true);
    await click(page, remove); await button(page, 'Delete generated project', "document.querySelector('[role=dialog]')");
    await wait(page, `!document.querySelector('${generatedSelector(source)}')&&document.querySelector('${savedSelector(project)}')`);
    const saved = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token }).then(r => r.json()); assert.deepEqual(saved.project, project);
  } finally { await page.close(); }
});
test('saved deletion retains the generated original and its existing destination', async () => {
  const { source, project } = await make(), page = await open();
  try {
    await wait(page, `document.querySelector('${savedSelector(project)}')`);
    await button(page, 'Delete…', `document.querySelector('${savedSelector(project)}')`);
    assert.match(await page.evaluate("document.querySelector('[role=dialog]').innerText"), /Generated originals remain separate/);
    await button(page, 'Delete', "document.querySelector('[role=dialog]')"); await wait(page, `!document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')`);
    assert.equal((await fixture.request(`/api/decks/${source.slug}`, { token: fixture.token })).status, 200);
  } finally { await page.close(); }
});
test('account changes clear settled cards, cancel pending search and block a stale destructive action', async () => {
  const { source } = await make(), page = await open({ inject: 'window.__holdSearch=true;' });
  try {
    await fill(page, 'Conductivity'); await wait(page, 'window.__searchRelease.length===1');
    await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.otherToken)})`);
    await wait(page, "document.body.innerText.includes('Your sign-in changed.')");
    await page.evaluate('window.__searchRelease.splice(0).forEach(fn=>fn())');
    assert.equal(await page.evaluate("document.querySelectorAll('[data-project-card],[data-generated-card]').length"), 0);
    assert.equal(await page.evaluate('window.__catalogRequests.filter(r=>r.method===\'DELETE\').length'), 0);
    assert.equal((await fixture.request(`/api/decks/${source.slug}`, { token: fixture.token })).status, 200);
    assert.equal(await page.evaluate('document.activeElement.getAttribute("role")'), 'alert');
  } finally { await page.close(); }
});
test('keyboard project search respects pending text navigation guards and restores focus on entry', async () => {
  const { project } = await make(), page = await open();
  const shortcut = "window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))";
  try {
    await click(page, `[data-project-open="${project.id}"]`); await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'");
    const point = await page.evaluate("(()=>{const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.dblclick(...point); await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText('Pending catalog navigation');
    await page.evaluate(shortcut); await wait(page, "document.querySelector('[data-leave-guard]')"); await button(page, 'Cancel', "document.querySelector('[data-leave-guard]')");
    assert.equal(await page.evaluate('location.hash'), `#/project/${project.id}`);
    await page.evaluate(shortcut); await wait(page, "document.querySelector('[data-leave-save]')"); await click(page, '[data-leave-save]');
    await wait(page, "document.activeElement===document.querySelector('[data-catalog-search]')");
    const saved = await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token }).then(r => r.json()); assert.ok(JSON.stringify(saved.project.scenes).includes('Pending catalog navigation'));
  } finally { await page.close(); }
});
test('settled narrow dark cards, filter controls and deletion dialog remain unobscured', async () => {
  const { project, source } = await make(), page = await open({ mode: 'dark' });
  try {
    await page.viewport(480, 900); await wait(page, `document.querySelector('[data-project-cover="${project.id}"]')?.dataset.coverState==='ready'`);
    await page.evaluate("document.querySelector('[data-catalog-search]').scrollIntoView({block:'center',behavior:'instant'})");
    const controls = await settledTargets(page, ['[data-catalog-search]', '[data-catalog-type]']);
    for (const c of controls) assert.ok(c.box[0] >= 0 && c.box[0] + c.box[2] <= 480);
    await capture(page, 'catalog-narrow-dark');
    for (const selector of [`[data-project-cover-open="${project.id}"]`, `[data-project-open="${project.id}"]`, `[data-generated-open="${source.slug}"]`]) {
      await page.evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center',behavior:'instant'})`); await settledTargets(page, [selector]);
    }
    await click(page, `[data-generated-delete="${source.slug}"]`); await wait(page, "document.querySelector('[role=dialog]')");
    const box = await page.evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");
    assert.ok(box[0] >= 0 && box[0] + box[2] <= 480 && box[1] >= 0 && box[1] + box[3] <= 900);
    await capture(page, 'catalog-narrow-dialog'); await data('narrow', { backend: fixture.env.FORGE_PROJECTS_BACKEND, controls, dialog: box });
  } finally { await page.close(); }
});
test('empty and signed-out hosted catalogs show truthful recovery without false empty success', async () => {
  for (const token of [fixture.token, null]) {
    const page = await open({ token });
    try {
      const text = token ? 'No projects yet' : 'Sign in to see projects'; await wait(page, `document.body.innerText.includes(${JSON.stringify(text)})`);
      assert.equal(await page.evaluate("document.querySelectorAll('[data-project-card],[data-generated-card]').length"), 0);
      if (!token) assert.ok(!(await page.evaluate('document.body.innerText')).includes('No projects yet'));
      await capture(page, token ? 'catalog-empty' : 'catalog-signed-out');
    } finally { await page.close(); }
  }
});
test('content-search failure preserves title matches and has an independent retry', async () => {
  const { source } = await make(), page = await open({ inject: "window.__searchFailures=[];window.__failSearch=true;const previousFetch=window.fetch;window.fetch=function(url){if(String(url).endsWith('/api/decks/search')&&window.__failSearch){window.__searchFailures.push(JSON.parse(arguments[1].body).q);return Promise.reject(new TypeError('injected search outage'));}return previousFetch.apply(this,arguments)};" });
  try {
    await fill(page, 'Imported results'); await wait(page, "document.body.innerText.includes('content search is unavailable')");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-project-card],[data-generated-card]').length"), 2);
    await fill(page, 'Conductivity'); await wait(page, "window.__searchFailures.at(-1)==='conductivity'&&document.body.innerText.includes('content search is unavailable')&&document.querySelectorAll('[data-generated-card]').length===0");
    await page.evaluate('window.__failSearch=false'); await button(page, 'Retry content search'); await wait(page, `document.querySelector('${generatedSelector(source)}')`);
    assert.ok(!(await page.evaluate('document.body.innerText')).includes('content search is unavailable'));
  } finally { await page.close(); }
});
test('leaving discovery aborts pending search and remounting starts a fresh lifetime', async () => {
  const { source } = await make(), page = await open({ inject: 'window.__holdSearch=true;' });
  try {
    await fill(page, 'Conductivity'); await wait(page, 'window.__searchRelease.length===1');
    await page.evaluate("location.hash='#/chat'"); await wait(page, "!document.querySelector('[data-project-catalog]')&&window.__aborted===1");
    await page.evaluate("window.__holdSearch=false;window.__searchRelease.splice(0).forEach(fn=>fn());location.hash='#/projects'");
    await wait(page, `document.querySelector('${generatedSelector(source)}')`);
    assert.equal(await page.evaluate("document.querySelector('[data-catalog-search]').value"), '');
    assert.equal(await page.evaluate("document.querySelectorAll('[data-project-card],[data-generated-card]').length"), 2);
  } finally { await page.close(); }
});
test('pending deletion keeps focus inside the busy dialog and suppresses navigation shortcuts', async () => {
  const { source, project } = await make(), page = await open({ inject: "const beforeDeleteFetch=window.fetch;window.fetch=async function(url,options={}){const response=await beforeDeleteFetch.apply(this,arguments);if(options.method==='DELETE')await new Promise(resolve=>window.__deleteRelease=resolve);return response};" });
  try {
    await click(page, `[data-generated-delete="${source.slug}"]`); await button(page, 'Delete generated project', "document.querySelector('[role=dialog]')");
    await wait(page, "window.__deleteRelease&&document.querySelector('[role=dialog][aria-busy=true]')&&document.activeElement===document.querySelector('[role=dialog]')");
    for (const key of ['k', 'n']) await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},ctrlKey:true,bubbles:true}))`);
    await page.key(9, 'Tab'); await page.key(27, 'Escape');
    assert.equal(await page.evaluate('location.hash'), '#/projects');
    assert.equal(await page.evaluate("document.activeElement===document.querySelector('[role=dialog]')"), true);
    await capture(page, 'catalog-delete-pending'); await page.evaluate('window.__deleteRelease()');
    await wait(page, `!document.querySelector('[role=dialog]')&&!document.querySelector('${generatedSelector(source)}')&&document.querySelector('${savedSelector(project)}')`);
  } finally { await page.close(); }
});
test('failed deletions show a focused visible error within the selected-copy dialog and retry safely', async () => {
  const { source, project } = await make();
  for (const kind of ['generated', 'saved']) {
    const page = await open({ inject: "window.__deleteFailure=true;const beforeDeleteFetch=window.fetch;window.fetch=function(url,options={}){if(options.method==='DELETE'&&window.__deleteFailure)return Promise.resolve(new Response(JSON.stringify({ok:false,error:'Temporary fixture deletion failure'}),{status:503,headers:{'Content-Type':'application/json'}}));return beforeDeleteFetch.apply(this,arguments)};" });
    try {
      await wait(page, `document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')`);
      if (kind === 'generated') await click(page, `[data-generated-delete="${source.slug}"]`);
      else await button(page, 'Delete…', `document.querySelector('${savedSelector(project)}')`);
      const label = kind === 'generated' ? 'Delete generated project' : 'Delete';
      await button(page, label, "document.querySelector('[role=dialog]')");
      await wait(page, "document.querySelector('[role=dialog] [role=alert]')?.textContent.includes('Temporary fixture deletion failure')&&document.activeElement===document.querySelector('[role=dialog] [role=alert]')");
      await capture(page, `catalog-delete-${kind}-failure`);
      assert.equal((await fixture.request(`/api/decks/${source.slug}`, { token: fixture.token })).status, 200);
      assert.equal((await fixture.request(`/api/v2/projects/${project.id}`, { token: fixture.token })).status, 200);
      if (kind === 'generated') { await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[role=dialog]')"); }
      else {
        await page.evaluate('window.__deleteFailure=false'); await button(page, label, "document.querySelector('[role=dialog]')");
        await wait(page, `!document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')`);
      }
    } finally { await page.close(); }
  }
});
test('development StrictMode discovery and modal cancellation restore the real invoker', async () => {
  const { source, project } = await make();
  const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
  const config = path.join(fixture.dir, 'catalog-vite.config.mjs');
  await writeFile(config, `import config from ${JSON.stringify(new URL('../app/web/vite.config.js', import.meta.url).href)};export default {...config,server:{...config.server,port:${port},host:'127.0.0.1',strictPort:true,proxy:{'/api':{target:${JSON.stringify(fixture.base)},changeOrigin:true}}}};`);
  const dev = spawn('node_modules/.bin/vite', ['--config', config], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', page;
  dev.stdout.on('data', d => output += d); dev.stderr.on('data', d => output += d);
  try {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (dev.exitCode !== null) throw new Error(output); try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    page = await open({ base: `http://127.0.0.1:${port}` }); await wait(page, `document.querySelector('${savedSelector(project)}')&&document.querySelector('${generatedSelector(source)}')`);
    const remove = `[data-generated-delete="${source.slug}"]`;
    await click(page, remove); await wait(page, "document.querySelector('[role=dialog]')&&document.activeElement.textContent==='Cancel'");
    await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[role=dialog]')");
    assert.equal(await page.evaluate(`document.activeElement===document.querySelector('${remove}')`), true, 'StrictMode restores the external invoker');
    await capture(page, 'catalog-development'); assert.deepEqual(await page.evaluate('window.__policies'), []);
  } finally {
    await page?.close();
    if (dev.exitCode === null) { process.kill(-dev.pid, 'SIGTERM'); await new Promise(resolve => { dev.once('exit', resolve); setTimeout(() => { try { process.kill(-dev.pid, 'SIGKILL'); } catch {} resolve(); }, 3000).unref(); }); }
  }
});
