import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile,readFile,lstat,readdir,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { publishPrivateExport } from '../src/projects/export-file.js';
import { importApiFixture } from './v2-import-fixture.js';
import { seed } from './v2-tool-fixture.js';
const run=promisify(execFile);let f,project;
before(async()=>{
  f=await importApiFixture();
  const response=await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title:'Saved notes CLI',scenes:seed()})});assert.equal(response.status,200);project=(await response.json()).project;
  const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {registerCited} from './test/v2-citation-export-fixture.js';
    const binding=JSON.parse(process.env.FORGE_EXPORT_BINDING);await registerCited({store,binding,registry:createSourceRegistry(store)});store.closeProjectStore();`;
  await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_EXPORT_BINDING:JSON.stringify({id:project.id,owner:f.owner})},timeout:15000});
});
after(async()=>{await f?.stop();});
async function invoke(args,token=f.token,env={}) {
  try {const out=await run(process.execPath,['src/projects/export-cli.js',...args],{env:{...f.env,FORGE_PROJECT_TOKEN:token,...env},timeout:15000});return JSON.parse(out.stdout.trim());}
  catch(error){assert.equal(error.code,1);return JSON.parse(error.stdout.trim());}
}
test('notes CLI: consent is explicit each time; private complete output refuses replacement and cleans temporary links',async()=>{
  const filename=path.join(f.dir,'private.pptx'),args=[project.id,'--output',filename];
  assert.equal((await invoke(args)).code,'consent-required');assert.equal((await readdir(f.dir)).includes('private.pptx'),false);
  const out=await invoke([...args,'--include-source-notes']);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.citationCount,1);assert.equal(Object.hasOwn(out,'source'),false);
  const stat=await lstat(filename);assert.equal(stat.mode&0o777,0o600);assert.equal(stat.uid,process.getuid());
  const bytes=await readFile(filename),zip=await JSZip.loadAsync(bytes);assert.match(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'),/Evidence 0/);
  assert.equal((await invoke([...args,'--include-source-notes'])).code,'output-exists');assert.deepEqual(await readFile(filename),bytes);
  assert.equal((await readdir(f.dir)).some(n=>n.startsWith('.forge-export-')),false);
});
test('notes CLI: invalid supplied sessions never downgrade, foreign owners do not gain admin source rights',async()=>{
  const args=[project.id,'--output',path.join(f.dir,'refused.pptx'),'--include-source-notes'];
  for(const token of ['invalid',''])assert.equal((await invoke(args,token,{FORGE_HOSTED:'0'})).code,'unauthorized');
  assert.equal((await invoke(args,f.otherToken)).code,'not-found');
  const bad=await invoke([...args,'--owner',f.owner]);assert.equal(bad.code,'invalid-request');assert.equal(JSON.stringify(bad).includes(f.owner),false);
});
test('notes public containment: existing GET refuses cited query flags and uncited GET/CLI remain usable without consent',async()=>{
  for(const query of ['','?includeSourceNotes=true&disclosure=source-title-url-v1']) {
    const response=await f.request(`/api/v2/projects/${project.id}/export.pptx${query}`,{token:f.token});assert.equal(response.status,422);assert.equal((await response.text()).includes('Evidence 0'),false);
  }
  const created=await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title:'Uncited',scenes:seed()})}).then(r=>r.json());
  const response=await f.request(`/api/v2/projects/${created.project.id}/export.pptx`,{token:f.token});assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>1000);
  const out=await invoke([created.project.id,'--output',path.join(f.dir,'uncited.pptx')]);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.citationCount,0);
});
test('notes publication: competing files, symlinks, missing parents and simultaneous publishers preserve complete bytes',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-export-publish-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'result.pptx');
  const a=new Uint8Array(10000).fill(65),b=new Uint8Array(10000).fill(66),results=await Promise.allSettled([publishPrivateExport(file,a),publishPrivateExport(file,b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'output-exists');
  const bytes=await readFile(file);assert.ok(bytes.equals(a)||bytes.equals(b));assert.equal((await lstat(file)).mode&0o777,0o600);
  const {symlink}=await import('node:fs/promises'),symbol=path.join(dir,'symbol.pptx');await symlink(file,symbol);await assert.rejects(publishPrivateExport(symbol,b),{code:'output-exists'});assert.deepEqual(await readFile(symbol),bytes);
  await assert.rejects(publishPrivateExport(path.join(dir,'missing','deck.pptx'),a),{code:'publication-unsupported'});
  assert.deepEqual((await readdir(dir)).sort(),['result.pptx','symbol.pptx']);
});
