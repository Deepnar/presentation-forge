import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir, open as openFile } from 'node:fs/promises';
import path from 'node:path';
import { wakeScenario, productionApi } from './v2-host-wake-fixture.js';
import { openViewer } from '../tools/chrome-shot.mjs';
import { expectedReview } from './v2-provider-contract.js';
import { wire } from './v2-provider-fixture.js';
import { edit, textEdit } from './v2-tool-fixture.js';
const OUT = path.resolve('docs/v2-8i-8-evidence');
const check = (name, body) => test('Assistant Chrome: ' + name, { timeout: 35000 }, body);
async function wait(page, expression, timeout = 10000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (await page.evaluate(`Boolean(${expression})`).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Browser condition: ${expression}; ${await page.evaluate('document.body.innerText.slice(-1800)').catch(() => 'closed')}`);
}
async function click(page, selector) {
  await wait(page, `document.querySelector(${JSON.stringify(selector)})?.getClientRects().length && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
  const point = await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  await page.click(...point);
}
async function button(page, text, root = 'document') {
  const selector = await page.evaluate(`(()=>{const n=[...${root}.querySelectorAll('button')].find(n=>n.getClientRects().length&&n.textContent.trim()===${JSON.stringify(text)});if(!n)return null;n.dataset.assistantTestButton='yes';return '[data-assistant-test-button="yes"]'})()`);
  assert.ok(selector, 'visible button: ' + text); await click(page, selector);
  await page.evaluate("document.querySelectorAll('[data-assistant-test-button]').forEach(n=>delete n.dataset.assistantTestButton)");
}
async function fill(page, selector, value) { await click(page, selector); await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`); await page.insertText(value); }
async function setup(t, options = {}) {
  const e = await wakeScenario(t, options), api = await productionApi(t, e, options.env ?? {});
  const page = await openViewer(api.base + '/scenes.html?deck=mech-warm-humanist-plain', { w: 1360, h: 900, timeoutMs: 15000 });
  t.after(() => page.close());
  await page.onNewDocument("window.__assistantErrors=[];addEventListener('error',e=>window.__assistantErrors.push(e.message));");
  await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(e.token)});localStorage.setItem('forge.leftNav','0');location.href=${JSON.stringify(api.base + '/#/project/' + e.doc.id)}`);
  await wait(page, "document.querySelector('[data-save-state]')?.dataset.saveState==='saved' && document.querySelector('[data-scroll-container] [data-el=text]')");
  return { e, api, page };
}
async function assistant(page) { await click(page, '[aria-label=Assistant]'); await wait(page, "document.querySelector('[data-assistant-status]') && !document.querySelector('[data-assistant-status]').textContent.includes('Loading')"); }
async function send(page, text = 'Review this slide wording and data.') {
  await fill(page, '[data-assistant-panel] textarea', text); await button(page, 'Send', "document.querySelector('[data-assistant-panel]')");
}
const rect = page => page.evaluate("(()=>{const r=document.querySelector('[data-scroll-container] [data-el=text]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");
async function capture(page, name) {
  await wait(page, "[...document.getAnimations()].every(a=>a.playState!=='running'||a.effect?.getTiming().iterations===Infinity)");
  await page.screenshot(path.join(OUT, name + '.png'));
  const visual = await page.evaluate("({theme:document.documentElement.dataset.theme??'light',viewport:[innerWidth,innerHeight],panelBackground:getComputedStyle(document.querySelector('#editor-right-rail')).backgroundColor})");
  await writeFile(path.join(OUT, name + '.json'), JSON.stringify(visual, null, 2));
}
before(async () => {
  await mkdir(OUT, { recursive: true });
  const attempt = (await readdir(OUT)).filter(name => /^browser-build-attempt-\d+\.json$/.test(name)).length + 1;
  const logName = `browser-build-attempt-${attempt}.log`;
  const log = await openFile(path.join(OUT, logName), 'w'); const started = performance.now();
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'app/web/vite.config.js'], { stdio: ['ignore', log.fd, log.fd] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
  const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
  await log.close(); const record = JSON.stringify({ command: 'node node_modules/vite/bin/vite.js build --config app/web/vite.config.js', ...result, durationMs: Math.round(performance.now() - started), log: `docs/v2-8i-8-evidence/${logName}` }, null, 2);
  await writeFile(path.join(OUT, `browser-build-attempt-${attempt}.json`), record); await writeFile(path.join(OUT, 'browser-build.json'), record);
  assert.equal(result.code, 0, 'production build must succeed'); assert.equal(result.signal, null);
});
check('normal chat proposes text/chart/table, approves once, loads canonical history and restores', async t => {
  const { e, page } = await setup(t); await assistant(page); const before = await rect(page);
  await send(page); await wait(page, "document.querySelector('[data-turn-status=awaiting-decision]')");
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0); assert.equal(e.seen.length, 1);
  assert.equal(JSON.stringify(e.seen[0].body).includes('Unrelated private slide'), false);
  await capture(page, 'desktop-proposal-light');
  const proposal = await rect(page); assert.ok(before.every((v, i) => Math.abs(v - proposal[i]) < .5), 'message/proposal does not shift canvas');
  await button(page, 'Approve'); await wait(page, "document.querySelector('[data-scroll-container] [data-el=text]')?.textContent.includes('Reviewed')");
  const final = (await e.store.getProject(e.binding)).doc; assert.equal(final.revision, 1); assert.deepEqual(final.scenes, expectedReview(e.doc));
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 2); assert.equal(e.events().length, 1); assert.equal(e.seen.length, 1);
  await capture(page, 'desktop-applied-light');
  await click(page, '[aria-label="Version history"]'); await click(page, '[data-history-select="0"]'); await click(page, '[data-history-restore="0"]');
  await wait(page, "document.querySelector('[data-restore-done]')"); assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes, e.doc.scenes);
  await page.key(27, 'Escape');
  await page.evaluate('location.reload()'); await wait(page, "document.querySelector('[data-scroll-container] [data-el=text]')?.textContent.includes('Measured')");
  await assistant(page); assert.ok(await page.evaluate("document.querySelector('[data-assistant-timeline]').innerText.includes('Review this slide')"));
  await writeFile(path.join(OUT, 'canvas-stability.json'), JSON.stringify({ before, proposal, maxDelta: Math.max(...before.map((v, i) => Math.abs(v - proposal[i]))) }, null, 2));
  assert.deepEqual(await page.evaluate('window.__assistantErrors'), []);
});
check('chart/table Apply-only drafts survive rail switching and block Send', async t => {
  const { e, page } = await setup(t); await assistant(page);
  await fill(page, '[data-project-title]', 'Unconfirmed title');
  assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] button[type=submit]').disabled"), true);
  assert.match(await page.evaluate("document.querySelector('[data-assistant-panel]').innerText"), /project title edit/);
  await page.key(27, 'Escape'); await click(page, '#right-tab-inspector');
  await button(page, 'Layers'); await click(page, '[data-layer=chart] button[title^=Select]'); await wait(page, "document.querySelector('[data-chart-editor]')");
  await fill(page, 'input[aria-label="Value Score A"]', '99'); await assistant(page);
  assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] button[type=submit]').disabled"), true);
  await click(page, '#right-tab-inspector'); assert.equal(await page.evaluate("document.querySelector('input[aria-label=\"Value Score A\"]').value"), '99');
  await button(page, 'Cancel', "document.querySelector('[data-chart-editor]')");
  await click(page, '[data-layer=table] button[title^=Select]'); await wait(page, "document.querySelector('[data-table-editor]')");
  await fill(page, 'input[aria-label="Row 2 column 2"]', '00123'); await assistant(page);
  assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] button[type=submit]').disabled"), true);
  await click(page, '#right-tab-inspector'); assert.equal(await page.evaluate("document.querySelector('input[aria-label=\"Row 2 column 2\"]').value"), '00123');
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0); assert.equal(e.seen.length, 0); await capture(page, 'inspector-grid-draft');
});
check('selection scope limits edits, rejection and confirmed clear preserve deck/history', async t => {
  const { e, page } = await setup(t, { handler: (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wire('openai-compatible', [edit([textEdit('Scoped ')])]))); } });
  await click(page, '[data-scroll-container] [data-el=text]'); await assistant(page);
  await page.evaluate("(()=>{const n=document.querySelector('[aria-label=\"Assistant scope\"]');n.value='selection';n.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await send(page, 'Shorten this selected object.'); await wait(page, "document.querySelector('[data-turn-status=awaiting-decision]')");
  await button(page, 'Reject'); await wait(page, "document.querySelector('[data-turn-status=rejected]')");
  await page.evaluate("(()=>{const real=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>window.assistantExport=JSON.parse(text));return real.call(this,blob)}})()");
  await button(page, 'Export chat'); await wait(page, 'window.assistantExport?.ok===true');
  assert.ok(JSON.stringify(await page.evaluate('window.assistantExport')).includes('Shorten this selected object.'));
  await button(page, 'Clear chat'); await wait(page, "[...document.querySelectorAll('[role=dialog]')].some(n=>n.textContent.includes('Clear saved chat'))");
  await capture(page, 'clear-confirmation'); await button(page, 'Clear chat', "document.querySelector('[role=dialog]')");
  await wait(page, "document.querySelector('[data-assistant-timeline]')&&!document.querySelector('[data-assistant-turn]')");
  await button(page, 'Clear chat'); await wait(page, "document.querySelector('[role=dialog]')");
  const otherTab = await e.service.read(e.binding); await e.service.clear(e.binding, { generation: otherTab.generation, revision: otherTab.revision });
  const newer = await e.submit({ request: 'Keep the other tab message.' }); assert.equal(newer.ok, true);
  await button(page, 'Clear chat', "document.querySelector('[role=dialog]')");
  await wait(page, "document.querySelector('[data-assistant-error]')?.textContent.includes('cleared or replaced')");
  assert.equal((await e.service.read(e.binding)).turns[0].request, 'Keep the other tab message.');
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0); assert.equal((await e.store.listRevisions(e.binding)).revisions.length, 1); assert.equal(e.seen.length, 1);
});
check('in-flight processing can be cancelled without clearing the saved message or changing the scene', async t => {
  const { e, page } = await setup(t, { handler: () => {} });
  await assistant(page); await send(page); await wait(page, "document.querySelector('[data-turn-status=preparing]')");
  await button(page, 'Cancel processing'); await wait(page, "document.querySelector('[data-turn-status=cancelled]')");
  assert.ok(await page.evaluate("document.querySelector('[data-assistant-timeline]').textContent.includes('Review this slide')"));
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 0); assert.equal(e.seen.length, 1);
});
check('composer navigation warns, default-off/read-only state cannot send and account change clears private chat', async t => {
  const { e, page } = await setup(t, { env: { FORGE_AGENT_WAKE_ENABLED: '0' } });
  await assistant(page); assert.match(await page.evaluate("document.querySelector('[data-assistant-status]').textContent"), /disabled on this host/);
  await fill(page, '[data-assistant-panel] textarea', 'Unsaved private message');
  await click(page, '[aria-label="Back to workspace"]'); await wait(page, "document.querySelector('[data-leave-save]')");
  assert.match(await page.evaluate("document.querySelector('[data-leave-save]').parentElement.textContent"), /unsent Assistant message/);
  await button(page, 'Cancel', "document.querySelector('[data-leave-guard]')"); assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] textarea').value"), 'Unsaved private message');
  await button(page, 'Done', "document.querySelector('[data-toolbar]')");
  assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] button[type=submit]').disabled"), true); await capture(page, 'disabled-readonly');
  await page.evaluate("localStorage.setItem('forge.token','replacement-session')");
  await wait(page, "document.querySelector('[data-assistant-panel] textarea').value===''"); assert.equal(e.seen.length, 0);
});
check('narrow dark rail traps focus, Escape dismisses topmost confirmation and typing does not move canvas', async t => {
  const { e, page } = await setup(t); await page.viewport(375, 812);
  await page.evaluate("localStorage.setItem('forge.theme','dark');document.documentElement.dataset.theme='dark'"); await assistant(page);
  await wait(page, "document.querySelector('#editor-right-rail').getAttribute('role')==='dialog'");
  const before = await rect(page); await fill(page, '[data-assistant-panel] textarea', 'Line one'); await page.key(13, 'Enter', { text: '\r' }); await page.insertText('Line two');
  assert.match(await page.evaluate("document.querySelector('[data-assistant-panel] textarea').value"), /Line one\nLine two/);
  await page.evaluate("document.querySelector('[data-assistant-panel] textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true}))"); assert.equal(e.seen.length, 0);
  const after = await rect(page); assert.ok(before.every((v, i) => Math.abs(v - after[i]) < .5));
  await button(page, 'Clear chat'); await wait(page, "document.querySelector('[role=dialog] [role=dialog]')"); await page.key(27, 'Escape');
  assert.equal(await page.evaluate("document.querySelector('#editor-right-rail').getAttribute('role')"), 'dialog');
  assert.equal(await page.evaluate("document.documentElement.dataset.theme"), 'dark');
  await capture(page, 'narrow-assistant-dark');
  await writeFile(path.join(OUT, 'narrow-canvas-stability.json'), JSON.stringify({ before, after, maxDelta: Math.max(...before.map((v,i)=>Math.abs(v-after[i]))) }, null, 2));
  const bounds = await page.evaluate("(()=>{const n=document.querySelector('#editor-right-rail'),r=n.getBoundingClientRect(),a=document.activeElement;return {rect:[r.x,r.y,r.right,r.bottom],viewport:[innerWidth,innerHeight],focusInside:n.contains(a)}})()");
  assert.ok(bounds.rect[0] >= 0 && bounds.rect[2] <= bounds.viewport[0] + 1); assert.equal(bounds.focusInside, true);
  await page.key(27, 'Escape'); await wait(page, "document.querySelector('#editor-right-rail').style.display==='none'||!document.querySelector('#editor-right-rail').getClientRects().length");
  assert.equal(await page.evaluate("document.activeElement.getAttribute('aria-label')"), 'Assistant');
});

check('Send settles pending inline text and waits for its save; a later human save makes approval stale', async t => {
  const { e, page } = await setup(t); await assistant(page);
  await fill(page, '[data-assistant-panel] textarea', 'Review after my text edit.');
  await button(page, '+ Text'); await wait(page, "document.querySelector('[data-save-state]').dataset.saveState==='saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).revision===1");
  const addedId = (await e.store.getProject(e.binding)).doc.scenes[0].elements.find(el=>el.kind==='text'&&el.id!=='text').id;
  await page.evaluate(`(()=>{const real=window.fetch.bind(window);window.assistantSubmissions=0;window.fetch=(url,options)=>{if(String(url).endsWith('/conversation/turns'))window.assistantSubmissions++;if(options?.method==='PUT'&&String(url).includes('/api/v2/projects/')&&!window.assistantSaveHeld){window.assistantSaveHeld=true;return new Promise(resolve=>{window.releaseAssistantSave=()=>real(url,options).then(resolve)})}return real(url,options)}})()`);
  const box = await page.evaluate(`(()=>{const r=document.querySelector('[data-scroll-container] [data-el="${addedId}"]').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()`);
  await page.dblclick(box[0]+box[2]/2, box[1]+box[3]/2);
  await wait(page, "document.querySelector('[data-text-edit]')"); await page.insertText('Human pending input ');
  await button(page, 'Send', "document.querySelector('[data-assistant-panel]')");
  await wait(page, "typeof window.releaseAssistantSave==='function'");
  assert.equal(await page.evaluate('window.assistantSubmissions'), 0); assert.equal(e.seen.length, 0);
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 1);
  await page.evaluate('window.releaseAssistantSave()');
  await wait(page, "document.querySelector('[data-turn-status=awaiting-decision]')");
  const saved = (await e.store.getProject(e.binding)).doc;
  assert.equal(saved.revision, 2); assert.ok(JSON.stringify(saved.scenes).includes('Human pending input'));
  const settledEvents = e.events().length;
  assert.equal(await page.evaluate('window.assistantSubmissions'), 1);
  await button(page, '+ Text'); await wait(page, "JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).revision===3 && document.querySelector('[data-save-state]').dataset.saveState==='saved'");
  await button(page, 'Approve'); await wait(page, "document.querySelector('[data-assistant-error]')?.textContent.includes('Reject this outdated proposal')");
  assert.equal((await e.store.getProject(e.binding)).doc.revision, 3); assert.equal(e.events().length, settledEvents);
  assert.equal((await e.service.read(e.binding)).turns[0].state, 'awaiting-decision');
  assert.equal(await page.evaluate('window.assistantSubmissions'), 1);
  await page.evaluate("document.documentElement.dataset.theme='dark'"); await capture(page, 'stale-proposal-human-save-dark');
});
