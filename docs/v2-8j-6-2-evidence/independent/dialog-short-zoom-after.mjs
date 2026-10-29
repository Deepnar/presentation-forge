import assert from 'node:assert/strict';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {exportApiFixture} from '../../../test/v2-native-export-fixture.js';
import {openViewer} from '../../../tools/chrome-shot.mjs';
const out='docs/v2-8j-6-2-evidence/independent/dialog-short-zoom-after';await mkdir(out,{recursive:true});await mkdir(out+'/downloads',{recursive:true});
let fixture,page,dir,passed=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){const end=Date.now()+12000;while(Date.now()<end){if(await page.evaluate(`Boolean(${expression})`).catch(()=>false))return;await sleep(30);}throw Error('Bounded browser condition not reached: '+expression);}
async function click(selector){await wait(`document.querySelector(${JSON.stringify(selector)})?.getClientRects().length && !document.querySelector(${JSON.stringify(selector)}).disabled`);await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);const point=await page.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await page.click(...point);}
async function layout(name,zoom){
 await wait("document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)");
 const data=await page.evaluate(`(()=>{const d=document.querySelector('[data-source-export-dialog]'),p=document.querySelector('#source-export-disclosure'),rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {viewport:[innerWidth,innerHeight],cssZoom:getComputedStyle(document.documentElement).zoom,dialog:rect(d),actions:[...d.querySelectorAll('button')].map(n=>({label:n.textContent.trim(),...rect(n)})),disclosure:{...rect(p),clientHeight:p.clientHeight,scrollHeight:p.scrollHeight,overflowY:getComputedStyle(p).overflowY},errors:window.__reviewErrors};})()`);
 data.method=zoom?'CSS document zoom2 plus640x360 CDP viewport: effective320x180 layout; emulates200% sizing/reflow, not actual browser menu zoom.':'CDP device viewport320x320 at CSS zoom1.';
 await writeFile(out+'/'+name+'.json',JSON.stringify(data,null,2)+'\n');await page.screenshot(out+'/'+name+'.png');
 assert.deepEqual(data.errors,[]);assert.equal(data.actions.length,2);
 assert.ok(data.dialog.x>=0&&data.dialog.y>=0&&data.dialog.right<=data.viewport[0]+.5&&data.dialog.bottom<=data.viewport[1]+.5,'Dialog must fit viewport');
 assert.equal(data.disclosure.overflowY,'auto');assert.ok(data.disclosure.clientHeight>0,'Disclosure must have a positive readable area');
 const reachable=await page.evaluate(`(()=>{const d=document.querySelector('[data-source-export-dialog]'),p=document.querySelector('#source-export-disclosure'),rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};const actions=[...d.querySelectorAll('button')].map(n=>{n.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});return {label:n.textContent.trim(),bounds:rect(n),dialog:rect(d),viewport:[innerWidth,innerHeight]};});const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())if(walker.currentNode.textContent.trim())texts.push(walker.currentNode);const textBound=(node,index)=>{const r=document.createRange();r.setStart(node,index);r.setEnd(node,index+1);return rect({getBoundingClientRect:()=>r.getBoundingClientRect()});};p.scrollIntoView({block:'start',behavior:'instant'});p.scrollTop=0;const firstNode=texts[0],first=textBound(firstNode,firstNode.textContent.search(/\\S/));p.scrollIntoView({block:'end',behavior:'instant'});p.scrollTop=p.scrollHeight;const lastNode=texts.at(-1),last=textBound(lastNode,lastNode.textContent.trimEnd().length-1);return {actions,first,last,dialog:rect(d),disclosureHeight:p.clientHeight,dialogClientHeight:d.clientHeight,dialogScrollHeight:d.scrollHeight};})()`);
 for(const item of reachable.actions){const b=item.bounds,d=item.dialog;assert.ok(b.x>=d.x-.5&&b.y>=d.y-.5&&b.right<=d.right+.5&&b.bottom<=d.bottom+.5&&b.x>=0&&b.y>=0&&b.right<=item.viewport[0]+.5&&b.bottom<=item.viewport[1]+.5,'Action must be reachable within viewport and dialog: '+item.label);}
 for(const r of [reachable.first,reachable.last])assert.ok(r.y>=reachable.dialog.y-.5&&r.bottom<=reachable.dialog.bottom+.5,'Both ends of complete disclosure must be reachable by scrolling');
 data.reachability=reachable;data.method=zoom?'CSS document zoom2 at640x360 (effective320x180); emulated200% reflow, not browser menu zoom. Whole-dialog scrolling may reveal each action/disclosure endpoint.':'CDP viewport '+data.viewport.join('x')+' at CSS zoom1; whole-dialog scrolling allowed.';
 await writeFile(out+'/'+name+'.json',JSON.stringify(data,null,2)+'\n');
 await page.evaluate("(()=>{const d=document.querySelector('[data-source-export-dialog]');d.querySelector('button:last-child').scrollIntoView({block:'nearest',behavior:'instant'});})()");await page.screenshot(out+'/'+name+'.png');
 passed++;console.log(JSON.stringify({phase:name,result:'pass',viewport:data.viewport,cssZoom:data.cssZoom}));
}
try{
 fixture=await exportApiFixture();dir=fixture.dir;const project=await fixture.project(true,{title:'Independent short notes dialog'});
 page=await openViewer(fixture.base+'/scenes.html',{w:1360,h:900,timeoutMs:12000});await page.allowDownloads(out+'/downloads');
 await page.onNewDocument("window.__reviewErrors=[];addEventListener('error',e=>window.__reviewErrors.push(e.message));window.__reviewHold=false;const original=fetch.bind(window);window.fetch=async(url,options={})=>{const r=await original(url,options);if(window.__reviewHold&&String(url).endsWith('/native-export')&&(options.method??'GET')==='GET'){window.__reviewHeld=true;await new Promise(resolve=>window.__reviewRelease=resolve);}return r;};");
 await page.evaluate(`localStorage.setItem('forge.token',${JSON.stringify(fixture.token)});location.href=${JSON.stringify(fixture.base+'/#/project/'+project.id)}`);
 await wait("document.querySelector('[data-save-state]')?.dataset.saveState==='saved'&&document.querySelector('[data-topbar-export]')&&document.querySelector('[data-scroll-container] [data-el=text]')");await wait("document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity)");await sleep(150);
 await click('[data-topbar-export]');await wait("document.querySelector('[data-source-export-dialog]')");
 await page.viewport(320,320);await wait('innerWidth===320');await layout('normal320-short',false);
 await page.viewport(640,360);await page.evaluate("document.documentElement.style.zoom='2'");await sleep(100);await layout('zoom200-short',true);
 await page.evaluate("document.documentElement.style.zoom='1'");await page.viewport(1360,900);await sleep(150);await layout('corrected-desktop',false);
 await page.key(27,'Escape');await wait("!document.querySelector('[data-source-export-dialog]')");
 await page.evaluate("document.documentElement.style.zoom='1'");await page.viewport(1360,900);await page.evaluate('window.__reviewHold=true');await click('[data-topbar-export]');await wait('window.__reviewHeld');
 await click('[aria-label="Back to workspace"]');await wait("document.querySelector('[data-project-catalog]')");await page.evaluate('window.__reviewRelease()');await sleep(150);
 assert.equal(await page.evaluate("!!document.querySelector('[data-source-export-dialog]')"),false);assert.deepEqual(await readdir(out+'/downloads'),[]);passed++;console.log(JSON.stringify({phase:'held metadata after actual workspace navigation/unmount',result:'pass'}));
 console.log(JSON.stringify({cases:1,assertionPhases:passed,passed:1,failed:0,skipped:0,cancelled:0}));
}catch(error){console.log(JSON.stringify({cases:1,assertionPhases:passed,passed:0,failed:1,skipped:0,cancelled:0,error:error.stack}));process.exitCode=1;}
finally{await page?.close();await fixture?.stop();await writeFile(out+'/cleanup.json',JSON.stringify({fixtureDirectoryRemoved:dir?!existsSync(dir):null,pageClosed:!!page,fixtureStopped:!!fixture,externalServices:false},null,2)+'\n');}
