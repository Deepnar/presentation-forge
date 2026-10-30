import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {citationViewFixture} from '../../../test/v2-citation-view-fixture.js';
import {openViewer} from '../../../tools/chrome-shot.mjs';
import {literalSourceText} from '../../../packages/projects/citation-view-contract.js';
const run=promisify(execFile),OUT=await mkdtemp(path.resolve('docs/v2-8j-6-3-evidence/independent/long-selection-'));
const details={backend:'actual fresh owned temporary SQLite/API and CDP Chrome',sourceSha:'8d34c95faf7a5c4d9e04dec590b362895d4fd283',build:'root build-final-02, reused without build',phases:[],cleanup:{}};
async function wait(page,condition){const end=Date.now()+10000;while(Date.now()<end){if(await page.evaluate(`Boolean(${condition})`))return;await new Promise(r=>setTimeout(r,35));}throw Error('Condition '+condition+'; '+await page.evaluate('document.body.innerText.slice(-1200)'));}
async function settle(page){await wait(page,"document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)");await new Promise(r=>setTimeout(r,100));}
async function click(page,selector){await wait(page,`document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`);await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);const [x,y]=await page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await page.click(x,y);}
async function open(page){if(await page.evaluate("document.querySelector('[data-sources-toggle]').getAttribute('aria-expanded')==='false'"))await click(page,'[data-sources-toggle]');await wait(page,"document.querySelectorAll('[data-source-row]').length===24");}
async function sourceDrag(page){
 await page.evaluate("(()=>{const n=document.querySelector('[data-source-url]'),rail=document.querySelector('#right-panel-inspector');n.scrollIntoView({block:'start',behavior:'instant'});rail.scrollTop-=12;getSelection().removeAllRanges();})()");
 const p=await page.evaluate("(()=>{const n=document.querySelector('[data-source-url]').firstChild,r=new Range();r.setStart(n,0);r.setEnd(n,1);const a=r.getBoundingClientRect();r.setStart(n,18);r.setEnd(n,19);const b=r.getBoundingClientRect();return [a.left+1,a.top+a.height/2,b.right-1,b.top+b.height/2];})()");await page.drag(...p,{steps:8});
 const selected=await page.evaluate('getSelection().toString()');assert.ok(selected.length>=5,JSON.stringify({p,selected}));return {selected,points:p};
}
async function shot(page,name){await settle(page);await page.screenshot(path.join(OUT,name+'.png'));}
async function rangeEndpoint(page,selector,last){
 const result=await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),t=n.firstChild,r=new Range(),rail=document.querySelector('#right-panel-inspector');const i=${last?'t.length-1':'0'};r.setStart(t,i);r.setEnd(t,i+1);let a=r.getBoundingClientRect(),b=rail.getBoundingClientRect();rail.scrollTop+=a.top-(b.top+25);a=r.getBoundingClientRect();b=rail.getBoundingClientRect();return {text:n.textContent,character:t.textContent[i],rect:[a.left,a.top,a.right,a.bottom],rail:[b.left,b.top,b.right,b.bottom],fits:a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top&&a.bottom<=b.bottom};})()`);
 assert.equal(result.fits,true,JSON.stringify(result));return result;
}
test('Independent Sources: complete long literal metadata, native URL drag and short reachability preserve drafts',{timeout:60000},async t=>{
 let f,page;try{
 f=await citationViewFixture();const project=await f.project(false,{plain:true,title:'Long literal source inspection'});
 const child=String.raw`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {source} from './test/v2-source-registry-fixture.js';import {anchor} from './test/v2-citation-export-fixture.js';import {record,target} from './test/v2-citations-fixture.js';
 const b=JSON.parse(process.env.FORGE_INDEPENDENT_BINDING),doc=(await store.getProject(b)).doc,r=createSourceRegistry(store);
 const title=('Long source title <literal> 😀'+String.fromCharCode(10,0x202e)+' '+ 'Wide'.repeat(120)).slice(0,490)+' END';
 const sources=Array.from({length:25},(_,i)=>source(b.id,i,{title:title+' '+i,url:'https://example.org/long/'+i+'?private='+('q'.repeat(1830))+'&end=END',excerpt:'Retained snippet, not disclosed.'}));let revision=0;
 for(let i=0;i<25;i+=24){const v=await r.register(b,{projectRevision:0,generation:0,revision,sources:sources.slice(i,i+24)});if(!v.ok)throw Error(JSON.stringify(v));revision=v.catalog.revision;}
 doc.scenes[0].citations=await anchor(doc.scenes,sources.map((s,i)=>record(i+1,{source:{projectId:b.id,id:s.id,generation:0},target:target()})),b.id);
 const saved=await store.saveProject({...b,baseRevision:0,scenes:doc.scenes});if(saved.status!=='saved')throw Error('fixture save');console.log(JSON.stringify({title:sources[0].title,url:sources[0].url}));store.closeProjectStore();`;
 const fixture=JSON.parse((await run(process.execPath,['--input-type=module','-e',child],{env:{...f.env,FORGE_INDEPENDENT_BINDING:JSON.stringify({id:project.id,owner:f.owner})},timeout:15000})).stdout);
 page=await openViewer(f.base+'/scenes.html',{w:1360,h:900,timeoutMs:15000});
 await page.onNewDocument("window.__independentErrors=[];addEventListener('error',e=>__independentErrors.push(e.message));");
 await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(f.token)});localStorage.setItem('forge.leftNav','0');location.href=${JSON.stringify(f.base+'/#/project/'+project.id)}`);
 await wait(page,"document.querySelector('[data-save-state]')?.dataset.saveState==='saved'&&document.querySelector('[data-sources-toggle]')");await settle(page);await open(page);
 const expected={title:literalSourceText(fixture.title),url:literalSourceText(fixture.url)};
 const displayed=await page.evaluate("({title:document.querySelector('[data-source-title]').textContent,url:document.querySelector('[data-source-url]').textContent,links:document.querySelectorAll('#saved-sources-content a').length})");assert.equal(displayed.title,expected.title);assert.equal(displayed.url,expected.url);assert.equal(displayed.links,0);assert.ok(displayed.title.includes('\\u000a\\u202e'));assert.equal(/[\n\u202e]/.test(displayed.title),false);
 await click(page,'[data-project-title]');await page.evaluate("document.querySelector('[data-project-title]').select()");await page.insertText('Preserve independent title');
 const titleDrag=await sourceDrag(page);assert.equal(await page.evaluate("document.querySelector('[data-project-title]').value"),'Preserve independent title');assert.equal(await page.evaluate("document.querySelector('[data-save-state]').dataset.saveState"),'saved');details.phases.push({phase:'native-url-drag-title-draft',...titleDrag});
 await page.evaluate("document.querySelector('[data-project-title]').focus()");await page.key(27,'Escape');await click(page,'[data-sources-toggle]');
 await click(page,'[data-scroll-container] [data-el=text]');const p=await page.evaluate("(()=>{const r=document.querySelector('[data-scroll-container] [data-el=text]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");await page.dblclick(...p);await wait(page,"document.querySelector('[data-text-edit]')");await page.evaluate("document.querySelector('[data-text-edit]').select()");await page.insertText('Preserve independent inline');await open(page);
 const inlineDrag=await sourceDrag(page);assert.equal(await page.evaluate("document.querySelector('[data-text-edit]').value"),'Preserve independent inline');assert.equal(await page.evaluate("document.querySelector('[data-save-state]').dataset.saveState"),'saved');details.phases.push({phase:'native-url-drag-inline-draft',...inlineDrag});await shot(page,'desktop-native-selection');
 await page.evaluate("document.querySelector('[data-text-edit]').focus()");await page.key(27,'Escape');
 for(const [width,height,name] of [[320,320,'narrow-long'],[320,210,'short-logical-reflow']]){
  await page.viewport(width,height);await settle(page);if(!(await page.evaluate("document.querySelector('#editor-right-rail').getClientRects().length")))await click(page,'[aria-label="Show inspector rail"]');await open(page);
  const overflow=await page.evaluate("(()=>{const n=document.querySelector('#right-panel-inspector');return {clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,rows:[...document.querySelectorAll('[data-source-row]')].map(x=>[x.clientWidth,x.scrollWidth])}})()");assert.ok(overflow.scrollWidth<=overflow.clientWidth+1,JSON.stringify(overflow));assert.ok(overflow.rows.every(([a,b])=>b<=a+1),JSON.stringify(overflow));
  const firstTitle=await rangeEndpoint(page,'[data-source-title]',false),lastTitle=await rangeEndpoint(page,'[data-source-title]',true),firstUrl=await rangeEndpoint(page,'[data-source-url]',false),lastUrl=await rangeEndpoint(page,'[data-source-url]',true);await shot(page,name+'-url-end');
  await page.evaluate("document.querySelector('[data-sources-more]').scrollIntoView({block:'center',behavior:'instant'})");const action=await page.evaluate("(()=>{const n=document.querySelector('[data-sources-more]'),r=n.getBoundingClientRect();return {text:n.textContent,rect:[r.left,r.top,r.right,r.bottom],fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()");assert.equal(action.fits,true,JSON.stringify(action));await shot(page,name+'-more');details.phases.push({phase:name,viewport:[width,height],method:name==='short-logical-reflow'?'320x210 logical CSS reflow; not browser-menu zoom':'320px narrow',overflow,firstTitle,lastTitle,firstUrl,lastUrl,action});
 }
 await click(page,'[data-sources-more]');await wait(page,"document.querySelectorAll('[data-source-row]').length===25");details.phases.push({phase:'reachable-pagination-action',rows:25});assert.deepEqual(await page.evaluate('window.__independentErrors'),[]);
 }finally{if(page){await page.close();details.cleanup.browserClosed=true;}if(f){await f.stop();details.cleanup.fixtureStopped=true;}await writeFile(path.join(OUT,'observations.json'),JSON.stringify(details,null,2)+'\n');console.log('observations '+path.join(OUT,'observations.json'));}
});
