import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';import path from 'node:path';import JSZip from 'jszip';
import { exportApiFixture } from './v2-native-export-fixture.js';
import { seedAppendixProject,invokeAppendix,applyArgs,invokeExport } from './v2-source-appendix-native-fixture.js';
import { renderPptx } from '../packages/renderer-pptx/render.ts';
let f;before(async()=>f=await exportApiFixture());after(async()=>f?.stop());
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[c]));
test('Appendix CLI/native: explicit one-shot counters, complete native editable text and original-slide parity',async()=>{
 const project=await seedAppendixProject(f),before=await f.request('/api/v2/projects/'+project.id,{token:f.token}).then(r=>r.json()),p=await invokeAppendix(f,[project.id]);assert.equal(p.ok,true,JSON.stringify(p));assert.ok(p.pageCount>1);assert.equal(JSON.stringify(p).includes('https://example.org/'),false);assert.match(p.notice,/configured-AI/);
 const control=path.join(f.dir,'before.pptx');await invokeExport(f,project.id,control);
 assert.equal((await invokeAppendix(f,[project.id,'--revision','1'])).code,'invalid-request');assert.equal((await invokeAppendix(f,[project.id,'--include-source-text'])).code,'invalid-request');
 const out=await invokeAppendix(f,[project.id,...applyArgs(p)]);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.snapshot.projectRevision,2);assert.equal((await invokeAppendix(f,[project.id,...applyArgs(p)])).code,'stale-project');
 const {project:saved}=await f.request('/api/v2/projects/'+project.id,{token:f.token}).then(r=>r.json());assert.deepEqual(saved.scenes.slice(0,2),before.project.scenes);assert.equal(saved.scenes.length,2+p.pageCount);assert.equal(JSON.stringify(saved.scenes.slice(2)).includes('SECRET_EXCERPT'),false);
 await assert.rejects(renderPptx(saved.scenes),{code:'export-unsafe'});const file=path.join(f.dir,'after.pptx');await invokeExport(f,project.id,file);const [zip,old]=await Promise.all([JSZip.loadAsync(await readFile(file)),JSZip.loadAsync(await readFile(control))]);
 for(let i=1;i<=2;i++)assert.equal(await zip.file(`ppt/slides/slide${i}.xml`).async('string'),await old.file(`ppt/slides/slide${i}.xml`).async('string'));
 for(let i=2;i<saved.scenes.length;i++){
  const xml=await zip.file(`ppt/slides/slide${i+1}.xml`).async('string'),visible=[...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1]));
  assert.deepEqual(visible,saved.scenes[i].elements.flatMap(e=>e.paragraphs.flatMap(p=>p.runs.map(r=>r.text))));
  const ids=[...xml.matchAll(/<p:cNvPr[^>]* id="(\d+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(xml.includes('<a:blip'),false);
 }
 for(const name of Object.keys(zip.files).filter(n=>n.startsWith('ppt/slides/_rels/')&&n.endsWith('.rels')))assert.equal((await zip.file(name).async('string')).includes('TargetMode="External"'),false);
 if(process.env.FORGE_J64_ARTIFACT_DIR){const dir=process.env.FORGE_J64_ARTIFACT_DIR;await mkdir(dir,{recursive:true});await copyFile(file,path.join(dir,'qualified.pptx'));await copyFile(control,path.join(dir,'control.pptx'));await writeFile(path.join(dir,'scenes.json'),JSON.stringify(saved.scenes,null,2)+'\n');await writeFile(path.join(dir,'fixture.json'),JSON.stringify({sourceProject:saved.id,owner:f.owner,theme:saved.theme,appendixPages:p.pageCount,originalScenes:2,fullTitlesUrlsMaterialized:true},null,2)+'\n');}
});
test('Appendix CLI: supplied invalid/empty/foreign admin credentials and malformed arguments cannot downgrade',async()=>{
 const project=await seedAppendixProject(f);for(const token of ['invalid',''])assert.equal((await invokeAppendix(f,[project.id],token,{FORGE_HOSTED:'0'})).code,'unauthorized');assert.equal((await invokeAppendix(f,[project.id],f.otherToken)).code,'not-found');
 for(const extra of [['--owner',f.owner],['--theme','warm-humanist','--theme','warm-humanist'],['--include-source-text','--revision','1','--source-generation','0','--source-revision','1','--design-fingerprint','invalid']])assert.equal((await invokeAppendix(f,[project.id,...extra])).code,'invalid-request');
 assert.equal((await f.request('/api/v2/projects/'+project.id,{token:f.token}).then(r=>r.json())).project.revision,1);
});
