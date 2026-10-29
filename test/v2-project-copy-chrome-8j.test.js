import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importApiFixture } from './v2-import-fixture.js';
import { citedFixture } from './v2-project-copy-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { openViewer } from '../tools/chrome-shot.mjs';
const OUT=path.resolve('docs/v2-8j-5-evidence/browser');let f;
before(async()=>{
  await mkdir(OUT,{recursive:true});const start=performance.now();
  const output=execFileSync('node_modules/.bin/vite',['build','--config','app/web/vite.config.js'],{timeout:180000,encoding:'utf8'});
  await writeFile(path.join(OUT,'build.log'),output);console.log(JSON.stringify({buildMs:performance.now()-start,backend:'sqlite',server:'production'}));
  f=await importApiFixture();
});
after(async()=>{await f?.stop();});
const check=(name,body)=>test('Project copy Chrome: '+name,{timeout:35000},body);
async function wait(page,condition,ms=10000){const until=performance.now()+ms;while(performance.now()<until){if(await page.evaluate(`Boolean(${condition})`).catch(()=>false))return;await new Promise(r=>setTimeout(r,30));}throw Error('Browser condition: '+condition+'; '+await page.evaluate('document.body.innerText.slice(-1600)'));}
async function click(page,selector){await wait(page,`document.querySelector(${JSON.stringify(selector)})?.getClientRects().length && !document.querySelector(${JSON.stringify(selector)}).disabled`);await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);const p=await page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await page.click(...p);}
async function button(page,text,root='document'){const selector=await page.evaluate(`(()=>{const n=[...${root}.querySelectorAll('button')].find(n=>n.getClientRects().length&&n.textContent.trim()===${JSON.stringify(text)});if(!n)return null;n.dataset.copyTestButton='yes';return '[data-copy-test-button="yes"]'})()`);assert.ok(selector,text);await click(page,selector);await page.evaluate("document.querySelectorAll('[data-copy-test-button]').forEach(n=>delete n.dataset.copyTestButton)");}
async function fill(page,selector,text){await click(page,selector);await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);if(text)await page.insertText(text);else await page.key(8,'Backspace');}
async function setup(t,{standalone=false,cited=true}={}){
  const project=cited?await citedFixture(f):(await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title:'Uncited copy source',scenes:seed()})}).then(r=>r.json())).project;
  const page=await openViewer(f.base+'/scenes.html',{w:1360,h:900,timeoutMs:15000});t.after(()=>page.close());
  await page.onNewDocument("window.__copyErrors=[];addEventListener('error',e=>window.__copyErrors.push(e.message));");
  await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(f.token)});localStorage.setItem('forge.leftNav','0');location.href=${JSON.stringify(f.base+(standalone?'/scenes.html?project=': '/#/project/')+project.id)}`);
  await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState==='saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState)?.id===${JSON.stringify(project.id)} && document.querySelector('[data-scroll-container] [data-el=text]')`);
  return {page,project};
}
async function editText(page,text){const selector='[data-scroll-container] [data-el="text"]';await click(page,selector);const point=await page.evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await page.dblclick(...point);await wait(page,"document.querySelector('[data-text-edit]')");await page.evaluate("document.querySelector('[data-text-edit]').select()");await page.insertText(text);}
async function stale(page,project,text='First copied wording'){
  const response=await f.request(`/api/v2/projects/${project.id}`,{token:f.token,method:'PATCH',body:JSON.stringify({baseRevision:project.revision,title:project.title+' newer'})});assert.equal(response.status,200);
  await editText(page,text);await click(page,'[aria-label="Save project"]');await wait(page,"document.querySelector('[data-save-state]')?.dataset.saveState==='stale'");
}
const copyButton=page=>button(page,'Save as new project');
const binding=page=>page.evaluate("JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id");
const text=page=>page.evaluate("document.querySelector('[data-scroll-container] [data-el=text]').textContent");
const bounds=page=>page.evaluate("(()=>{const n=document.querySelector('[data-scroll-container] [data-stage]'),r=n.getBoundingClientRect(),s=document.querySelector('[data-scroll-container]');return {canvas:[r.x,r.y,r.width,r.height],scroll:[s.scrollLeft,s.scrollTop],viewport:[innerWidth,innerHeight],topbarHeight:document.querySelector('[data-topbar]').getBoundingClientRect().height}})()");
async function capture(page,name,data){await page.screenshot(path.join(OUT,name+'.png'));await writeFile(path.join(OUT,name+'.json'),JSON.stringify({...data,after:await bounds(page),errors:await page.evaluate('window.__copyErrors')},null,2)+'\n');assert.deepEqual(await page.evaluate('window.__copyErrors'),[]);}
async function gate(page){await page.evaluate(`(()=>{const raw=window.__rawCopyFetch??fetch.bind(window);window.__rawCopyFetch=raw;window.__copyRequests=0;window.__copyGatePending=false;
  window.fetch=async(url,options={})=>{if(options.method==='POST'&&(/\\/api\\/v2\\/projects\\/[^/]+\\/copy$/.test(String(url))||String(url)==='/api/v2/projects')){window.__copyRequests++;window.__copySubmitted=JSON.parse(options.body);const response=await raw(url,options);window.__copyResult=await response.clone().json();window.__copyGatePending=true;await new Promise(r=>window.__releaseCopy=r);return response;}return raw(url,options);};})()`);}
async function pending(page){await copyButton(page);await wait(page,'window.__copyGatePending');assert.equal(await page.evaluate('window.__copyRequests'),1);}
async function release(page){await page.evaluate('window.__releaseCopy()');await wait(page,"document.querySelector('[data-copy-notice]')?.dataset.copyNotice.includes('Copy saved')");}

check('dirty cited copy adopts a fresh engine and routed identity, preserves content and reopens',async t=>{
  const {page,project}=await setup(t);await stale(page,project);const before=await bounds(page),oldText=await text(page);
  await copyButton(page);await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState==='saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id!==${JSON.stringify(project.id)}`);
  const id=await binding(page);assert.equal(await page.evaluate('location.hash'),'#/project/'+id);assert.equal(await text(page),oldText);
  const saved=await f.request(`/api/v2/projects/${id}`,{token:f.token}).then(r=>r.json());assert.equal(saved.project.scenes[0].citations[0].source.projectId,id);
  assert.equal(saved.project.scenes[0].elements[0].paragraphs[0].runs[0].text,'First copied wording');
  await click(page,'[aria-label=Undo]');assert.equal(await text(page),oldText);assert.equal(await page.evaluate("document.querySelector('[data-save-state]').dataset.saveState"),'saved');
  await capture(page,'copy-desktop',{before,id,selected:await page.evaluate("[...document.querySelectorAll('[data-selected=true]')].map(n=>n.dataset.el??n.dataset.overlay)")});
  await page.viewport(420,840);await wait(page,'innerWidth===420');await capture(page,'copy-narrow',{id});
  await page.evaluate('location.reload()');await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState==='saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id===${JSON.stringify(id)}`);assert.equal(await text(page),oldText);
});
check('late response preserves later human edits and the original binding',async t=>{
  const {page,project}=await setup(t);await stale(page,project);await gate(page);await pending(page);
  await editText(page,'Later human wording');
  const blank=await page.evaluate("(()=>{const r=document.querySelector('[data-scroll-container] [data-stage]').getBoundingClientRect();return [r.right-6,r.bottom-6]})()");
  await page.click(...blank);await wait(page,"!document.querySelector('[data-text-edit]')");
  await release(page);assert.equal(await binding(page),project.id);assert.match(await text(page),/Later human wording/);
  assert.notEqual(await page.evaluate("document.querySelector('[data-save-state]').dataset.saveState"),'saved');
  const id=await page.evaluate('window.__copyResult.project.id'),saved=await f.request(`/api/v2/projects/${id}`,{token:f.token}).then(r=>r.json());
  assert.equal(saved.project.scenes[0].elements[0].paragraphs[0].runs[0].text,'First copied wording');await capture(page,'copy-edit-deferred',{source:project.id,id});
});
check('title grid and Assistant drafts block entry, and a new Assistant draft defers adoption',async t=>{
  const {page,project}=await setup(t);await stale(page,project);await gate(page);
  await fill(page,'[data-project-title]','Unapplied title');await page.evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Save as new project').click()");
  await wait(page,"document.querySelector('[data-copy-notice]')?.dataset.copyNotice.includes('drafts')");assert.equal(await page.evaluate('window.__copyRequests'),0);await page.key(27,'Escape');
  await click(page,'[data-scroll-container] [data-el=table]');await wait(page,"document.querySelector('[data-table-editor] input')");await fill(page,'[data-table-editor] input','Unapplied cell');await copyButton(page);assert.equal(await page.evaluate('window.__copyRequests'),0);assert.equal(await page.evaluate("document.querySelector('[data-table-editor] input').value"),'Unapplied cell');await button(page,'Cancel',"document.querySelector('[data-table-editor]')");
  await click(page,'[aria-label=Assistant]');await wait(page,"document.querySelector('[data-assistant-panel] textarea')");await fill(page,'[data-assistant-panel] textarea','Unsent message');await copyButton(page);assert.equal(await page.evaluate('window.__copyRequests'),0);
  await fill(page,'[data-assistant-panel] textarea','');await pending(page);await fill(page,'[data-assistant-panel] textarea','New draft while copying');await release(page);
  assert.equal(await binding(page),project.id);assert.equal(await page.evaluate("document.querySelector('[data-assistant-panel] textarea').value"),'New draft while copying');
});
check('ordinary navigation cancellation invalidates adoption and changed accounts suppress late publication',async t=>{
  const {page,project}=await setup(t);await stale(page,project);await gate(page);await pending(page);
  await click(page,'[aria-label="Back to workspace"]');await wait(page,"document.querySelector('[data-leave-guard]')");await button(page,'Cancel',"document.querySelector('[data-leave-guard]')");await release(page);assert.equal(await binding(page),project.id);
  await gate(page);await pending(page);const last=await page.evaluate("localStorage.getItem('forge.v2.lastProject')");
  await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(f.otherToken)});window.__releaseCopy()`);await new Promise(r=>setTimeout(r,250));
  assert.equal(await binding(page),project.id);assert.equal(await page.evaluate('location.hash'),'#/project/'+project.id);assert.equal(await page.evaluate("localStorage.getItem('forge.v2.lastProject')"),last);assert.equal(await page.evaluate("document.querySelector('[data-copy-notice]').dataset.copyNotice"),'Copying…');
});
check('standalone uncited creation installs a fresh document and updates its query identity',async t=>{
  const {page,project}=await setup(t,{standalone:true,cited:false});await editText(page,'Standalone live copy');await button(page,'Projects');await click(page,'[data-project-save-current]');
  await wait(page,`document.querySelector('[data-save-state]')?.dataset.saveState==='saved' && JSON.parse(document.querySelector('[data-save-state]').dataset.projectState).id!==${JSON.stringify(project.id)}`);
  const id=await binding(page);assert.equal(await page.evaluate("new URLSearchParams(location.search).get('project')"),id);assert.match(await text(page),/Standalone live copy/);assert.equal(await page.evaluate("Boolean(document.querySelector('[data-projects-panel]'))"),false);
  await click(page,'[aria-label=Undo]');assert.match(await text(page),/Standalone live copy/);
});
