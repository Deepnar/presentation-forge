import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import JSZip from 'jszip';
import { importApiFixture, IMPORT_DECK } from './v2-import-fixture.js';
import { openViewer } from '../tools/chrome-shot.mjs';
const EVIDENCE = path.resolve('docs/v2-7c-3-evidence'), OUT = path.resolve('out/v2-7c-3-validation/browser');
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
async function open({ mode = 'light', inject = '', token = fixture.token, base = fixture.base, route = '#/projects' } = {}) {
  const page = await openViewer(`${base}/scenes.html?deck=mech-warm-humanist-plain`);
  try {
    if (inject) await page.onNewDocument(inject);
    await page.evaluate(`${token ? `localStorage.setItem('forge.token',${JSON.stringify(token)})` : "localStorage.removeItem('forge.token')"};localStorage.setItem('forge.leftNav','0');localStorage.setItem('forge.theme',${JSON.stringify(mode)});location.href=${JSON.stringify(`${base}/${route}`)}`);
    await wait(page, `location.href===${JSON.stringify(`${base}/${route}`)} && document.querySelector('[data-topbar]')`); return page;
  } catch (error) { await page.close(); throw error; }
}
async function make() {
  const source = await fixture.source(); const response = await fixture.create(source.slug, { requestId: 'browser-editor-v1' });
  assert.equal(response.status, 200); return { source, project: (await response.json()).project };
}
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
  if (process.env.FORGE_TOOLBAR_TEST_BACKEND === 'postgres') {
    assert.ok(process.env.TEST_PG_URL, 'owned PostgreSQL URL required');
    pool = new Pool({ connectionString: process.env.TEST_PG_URL, connectionTimeoutMillis: 3000 });
    database = `forge_catalog_browser_${process.pid}_${Date.now().toString(36)}`; await pool.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_PG_URL); url.pathname = `/${database}`;
    env = { FORGE_PROJECTS_BACKEND: 'postgres', FORGE_PROJECTS_DATABASE_URL: url.href };
  }
  fixture = await importApiFixture(env); console.log(`toolbar browser backend: ${fixture.env.FORGE_PROJECTS_BACKEND}; actual production server/CSP`);
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

const PROJECT = "JSON.parse(document.querySelector('[data-save-state]').dataset.projectState)";
const SAVED = "document.querySelector('[data-save-state]')?.dataset.saveState==='saved'";
async function ready(page, id) { await wait(page, `${SAVED} && ${PROJECT}?.id===${JSON.stringify(id)}`); }
async function editor(project, options = {}) { const page = await open({ ...options, route: `#/project/${project.id}` }); await ready(page, project.id); return page; }
async function stored(id) { return (await fixture.request(`/api/v2/projects/${id}`, { token: fixture.token }).then(r => r.json())).project; }
async function stageBox(page) { return page.evaluate("(()=>{const r=document.querySelector('[data-stage] > svg').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()"); }

test('saved-project editor excludes fixture/compiler/discovery diagnostics while preserving normal controls', async () => {
  const { project } = await make(), page = await editor(project);
  try {
    assert.equal(await page.evaluate("!!document.querySelector('select[aria-label=Deck]')"), false);
    assert.equal(await page.evaluate("[...document.querySelectorAll('[data-toolbar] button')].some(n=>['Live','Projects'].includes(n.textContent.trim()))"), false);
    assert.equal(await page.evaluate("!!document.querySelector('[data-developer-controls],[data-developer-diagnostics],[data-live-panel],[data-projects-panel]')"), false);
    for (const label of ['Back to workspace', 'Project title', 'Save project', 'Undo', 'Redo', 'Version history', 'Present']) assert.equal(await page.evaluate(`!!document.querySelector('[aria-label="${label}"]')`), true, label);
    assert.ok(await page.evaluate("document.querySelector('[data-toolbar]').textContent.includes('Slide 1 of 3')"));
    for (const id of project.scenes.map(s => s.id)) assert.equal(await page.evaluate(`document.querySelector('[data-toolbar]').innerText.includes(${JSON.stringify(id)})`), false);
    assert.equal((await stored(project.id)).revision, 0);
    await capture(page, 'editor-desktop');
  } finally { await page.close(); }
});

test('standalone viewer retains fixture selection, Live panel and Projects dialog with Escape focus return', async () => {
  const local = await importApiFixture({ FORGE_HOSTED: '0' });
  const page = await open({ base: local.base, token: local.token, route: 'scenes.html?deck=mech-warm-humanist-plain' });
  try {
    assert.ok(await page.evaluate("document.querySelector('select[aria-label=Deck]')?.options.length>1"));
    await page.evaluate("(()=>{const n=document.querySelector('select[aria-label=Deck]');n.value='source-of-truth-warm-humanist-plain';n.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await wait(page, "JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).slideId==='st-open'&&document.querySelector('[data-stage]')?.dataset.stage==='st-open'");
    await button(page, 'Live'); await wait(page, "document.querySelector('[data-live-panel]')"); await button(page, 'Compile live'); await wait(page, "document.querySelector('[aria-label=Deck] option:checked')?.textContent.includes('(live)')"); await capture(page, 'standalone-live');
    await button(page, 'Live'); await button(page, 'Projects'); await wait(page, "document.querySelector('[data-projects-panel] [role=dialog]')");
    await capture(page, 'standalone-projects'); await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[data-projects-panel]')");
    assert.equal(await page.evaluate("document.activeElement.textContent.trim()"), 'Projects');
  } finally { await page.close(); await local.stop(); }
});

test('text and all existing shape insertions persist with exact undo/redo and reopen behavior', async () => {
  const { project } = await make(), page = await editor(project), count = project.scenes[0].elements.length;
  try {
    let revision = 0;
    for (const label of ['+ Text', '+ Rect', '+ Round', '+ Ellipse']) { await button(page, label); await wait(page, `${SAVED} && ${PROJECT}.revision>${revision}`); revision = await page.evaluate(`${PROJECT}.revision`); }
    assert.equal((await stored(project.id)).scenes[0].elements.length, count + 4);
    const exported = await fixture.request(`/api/v2/projects/${project.id}/export.pptx`, { token: fixture.token }); assert.equal(exported.status, 200);
    const bytes = Buffer.from(await exported.arrayBuffer()), zip = await JSZip.loadAsync(bytes), slide = await zip.file('ppt/slides/slide1.xml').async('string');
    for (const form of ['rect', 'roundRect', 'ellipse']) assert.ok(slide.includes(`prst="${form}"`), `${form} remains native`);
    await writeFile(path.join(OUT, 'toolbar-shapes.pptx'), bytes);
    await click(page, '[aria-label=Undo]'); await wait(page, `${SAVED} && ${PROJECT}.revision>${revision}`); revision = await page.evaluate(`${PROJECT}.revision`);
    assert.equal((await stored(project.id)).scenes[0].elements.length, count + 3);
    await click(page, '[aria-label=Redo]'); await wait(page, `${SAVED} && ${PROJECT}.revision>${revision}`);
    assert.equal((await stored(project.id)).scenes[0].elements.length, count + 4);
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-project-grid]')");
    await click(page, `[data-project-open="${project.id}"]`); await ready(page, project.id);
    assert.equal((await stored(project.id)).scenes[0].elements.length, count + 4);
  } finally { await page.close(); }
});

test('pending text uses guarded workspace navigation with Cancel and Save-and-leave preserving the draft', async () => {
  const { project } = await make(), page = await editor(project);
  try {
    const point = await page.evaluate("(()=>{const r=document.querySelector('[data-stage] [data-el]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");
    await page.dblclick(...point); await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText('Toolbar preserved draft');
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-guard]')"); await button(page, 'Cancel', "document.querySelector('[data-leave-guard]')");
    assert.equal(await page.evaluate('location.hash'), `#/project/${project.id}`);
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-save]')"); await click(page, '[data-leave-save]');
    await wait(page, "document.querySelector('[data-project-grid]')");
    assert.ok(JSON.stringify((await stored(project.id)).scenes).includes('Toolbar preserved draft'));
    await click(page, `[data-project-open="${project.id}"]`); await ready(page, project.id);
    assert.ok(await page.evaluate("document.querySelector('[data-stage]').textContent.includes('Toolbar preserved draft')"));
  } finally { await page.close(); }
});

test('Cancel during an in-flight Save-and-leave cannot later navigate away', async () => {
  const { project } = await make(), page = await editor(project);
  try {
    await page.evaluate("(()=>{const real=window.fetch;window.fetch=async function(url,opts){if(opts?.method==='PUT')await new Promise(resolve=>window.__releaseSave=resolve);return real.apply(this,arguments)}})()");
    await button(page, '+ Text'); await wait(page, "typeof window.__releaseSave==='function'");
    await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-save]')"); await click(page, '[data-leave-save]');
    await button(page, 'Cancel', "document.querySelector('[data-leave-guard]')"); await page.evaluate('window.__releaseSave();true'); await ready(page, project.id);
    assert.equal(await page.evaluate('location.hash'), `#/project/${project.id}`);
    assert.equal(await page.evaluate("!!document.querySelector('[data-leave-guard]')"), false);
  } finally { await page.close(); }
});

test('chart/table selection keeps the canvas stable and production inspector labels descriptive', async () => {
  const { project } = await make(), page = await editor(project), measurements = [];
  try {
    for (const [index, kind] of [[1, 'chart'], [2, 'table']]) {
      await button(page, 'Slides', "document.querySelector('aside[aria-label=Slides]')");
      await click(page, `[data-thumb="${project.scenes[index].id}"]`);
      await wait(page, `JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).slideIndex===${index}`);
      const element = project.scenes[index].elements.find(e => e.kind === kind); await button(page, 'Layers');
      await wait(page, `document.querySelector('[data-layer="${element.id}"]')`);
      const before = await stageBox(page); await click(page, `[data-layer="${element.id}"] button[title^="Select "]`);
      await wait(page, `document.querySelector('[data-${kind}-editor]')`);
      const after = await stageBox(page); assert.ok(before.every((n, i) => Math.abs(n - after[i]) < 1));
      assert.equal(await page.evaluate(`document.querySelector('aside[aria-label=Inspector]').innerText.includes(${JSON.stringify(element.id)})`), false);
      assert.equal(await page.evaluate("!!document.querySelector('[data-developer-diagnostics]')"), false);
      assert.equal(await page.evaluate(`(()=>{const n=document.querySelector('[data-layer="${element.id}"]');return [...n.querySelectorAll('button')].some(b=>[b.title,b.getAttribute('aria-label')].some(v=>v?.includes(${JSON.stringify(element.id)})))})()`), false);
      await capture(page, `editor-${kind}`); measurements.push({ kind, before, after });
    }
    await data('canvas', { backend: fixture.env.FORGE_PROJECTS_BACKEND, measurements });
  } finally { await page.close(); }
});

test('read-only mode keeps navigation and inspection usable without insertion or mutation', async () => {
  const { project } = await make(), page = await editor(project);
  try {
    await button(page, 'Done'); await wait(page, "!document.querySelector('[data-editing=true]')");
    assert.equal(await page.evaluate("document.querySelector('[data-toolbar]').innerText.includes('unsaved edits')"), false, 'an untouched saved project is not unsaved');
    assert.equal(await page.evaluate("[...document.querySelectorAll('[data-toolbar] button')].some(n=>n.textContent.trim()==='+ Text')"), false);
    await button(page, 'Next →'); await wait(page, "JSON.parse(document.querySelector('[data-viewer-state]').dataset.viewerState).slideIndex===1");
    await capture(page, 'editor-readonly'); assert.equal((await stored(project.id)).revision, 0);
    await button(page, 'Edit'); await ready(page, project.id);
  } finally { await page.close(); }
});

test('narrow light/dark controls remain reachable without toolbar height changes and History returns focus', async () => {
  const { project } = await make();
  for (const mode of ['light', 'dark']) {
    const page = await editor(project, { mode });
    try {
      await page.viewport(480, 900);
      await wait(page, "document.getAnimations().every(a=>a.playState!=='running')");
      const height = await page.evaluate("document.querySelector('[data-toolbar]').getBoundingClientRect().height");
      for (const label of ['+ Text', '+ Rect', '+ Round', '+ Ellipse', 'Fit']) {
        const selector = await page.evaluate(`(()=>{const n=[...document.querySelectorAll('[data-toolbar] button')].find(n=>n.textContent.trim()===${JSON.stringify(label)});n.dataset.controlTarget='yes';n.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});return '[data-control-target=yes]'})()`);
        const targets = await settledTargets(page, [selector]); assert.ok(targets[0].hit); assert.equal(await page.evaluate("document.querySelector('[data-toolbar]').getBoundingClientRect().height"), height);
        await page.evaluate("document.querySelector('[data-control-target]').removeAttribute('data-control-target')");
      }
      await click(page, '[aria-label="Version history"]'); await wait(page, "document.querySelector('[data-history-panel]')");
      await page.key(27, 'Escape'); await wait(page, "!document.querySelector('[data-history-panel]')");
      assert.equal(await page.evaluate("document.activeElement.textContent.trim()"), 'History');
      await page.evaluate("document.querySelector('[data-toolbar]').scrollLeft=0;document.querySelector('[data-topbar]').scrollLeft=0");
      await capture(page, `editor-narrow-${mode}`); await data(`narrow-${mode}`, { backend: fixture.env.FORGE_PROJECTS_BACKEND, height });
    } finally { await page.close(); }
  }
});


test('blank-slide history uses a human slide label rather than an internal scene identity', async () => {
  const { blankSlide } = await import('../packages/editor/scene-text.js');
  const scene = blankSlide(), response = await fixture.request('/api/v2/projects', { token: fixture.token, method: 'POST', body: JSON.stringify({ title: 'Blank history', scenes: [scene] }) });
  assert.equal(response.status, 200); const project = (await response.json()).project, page = await editor(project);
  try {
    await click(page, '[aria-label="Version history"]'); await wait(page, "document.querySelector('[data-history-select=\"0\"]')");
    await click(page, '[data-history-select="0"]'); await wait(page, "document.querySelector('[data-history-panel] li')");
    const text = await page.evaluate("document.querySelector('[data-history-panel] li').innerText");
    assert.ok(text.includes('Slide 1')); assert.equal(text.includes(scene.id), false);
    await capture(page, 'editor-blank-history');
  } finally { await page.close(); }
});
