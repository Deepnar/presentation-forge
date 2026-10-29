import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importApiFixture } from './v2-import-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { citedFixture } from './v2-project-copy-fixture.js';
import { apiCopy, capturedProjectFetch } from '../app/web/src/lib/v2project.js';
const run=promisify(execFile);
let f;
before(async()=>{f=await importApiFixture();});
after(async()=>{await f?.stop();});
const post=(route,body,token=f.token,headers={})=>f.request(route,{token,method:'POST',body:JSON.stringify(body),headers});
test('copy HTTP and actual CLI share live-scene rebinding without source disclosure or raw-create bypass',async()=>{
  const project=await citedFixture(f),input={title:'Live transport copy',scenes:project.scenes};input.scenes[0].elements[0].paragraphs[0].runs[0].text='Unsaved through transport';
  const response=await post(`/api/v2/projects/${project.id}/copy`,input);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const copied=await response.json();assert.equal(copied.ok,true);assert.equal(copied.copiedSources,1);assert.notEqual(copied.project.id,project.id);
  assert.equal(copied.project.scenes[0].citations[0].source.projectId,copied.project.id);
  assert.equal(JSON.stringify(copied).includes('Measured evidence.'),false);
  const file=path.join(f.dir,'copy.json');await writeFile(file,JSON.stringify(input));
  const cli=await run(process.execPath,['src/projects/copy-cli.js',project.id,'--input',file],{env:{...f.env,FORGE_PROJECT_TOKEN:f.token},timeout:15000});
  const cliResult=JSON.parse(cli.stdout.trim());assert.equal(cliResult.ok,true);assert.equal(cliResult.copiedSources,1);assert.notEqual(cliResult.project.id,copied.project.id);
  assert.equal((await post('/api/v2/projects',{title:'Unsafe',scenes:project.scenes})).status,422);
  assert.equal((await f.request(`/api/v2/projects/${copied.project.id}/export.pptx`,{token:f.token})).status,422);
});
test('copy HTTP refuses foreign missing malformed and oversized requests with private errors',async()=>{
  const project=await citedFixture(f),input={title:'Copy',scenes:project.scenes},route=`/api/v2/projects/${project.id}/copy`;
  for(const token of [null,'invalid-token',f.otherToken]) {
    const response=await post(route,input,token);
    assert.equal(response.status,token===f.otherToken?404:401);
    const body=await response.json();assert.equal(JSON.stringify(body).includes(project.title),false);
  }
  const absent=structuredClone(input);absent.scenes[0].citations[0].source.projectId='missing';
  assert.equal((await post('/api/v2/projects/missing/copy',absent)).status,404);
  assert.equal((await post(route,{...input,admin:true})).status,422);
  assert.equal((await post(route,{title:'x'.repeat(6*1024*1024),scenes:[]})).status,413);
  const missing=structuredClone(input);missing.scenes[0].citations[0].source.id='src_'+'b'.repeat(64);
  assert.equal((await post(route,missing)).status,409);
});
test('copy CLI preserves byte validation and refuses invalid sessions without anonymous downgrade',async()=>{
  const project=await citedFixture(f),file=path.join(f.dir,'bad-copy.json');await writeFile(file,Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]));
  const invoke=async token=>{try{await run(process.execPath,['src/projects/copy-cli.js',project.id,'--input',file],{env:{...f.env,FORGE_PROJECT_TOKEN:token},timeout:10000});assert.fail('CLI must refuse');}catch(error){assert.equal(error.code,1);return JSON.parse(error.stdout.trim());}};
  assert.equal((await invoke('invalid')).code,'unauthorized');assert.equal((await invoke(f.token)).code,'invalid-request');
});
test('captured copy client makes one request and pins bearer or anonymous identity',async()=>{
  const previous=globalThis.localStorage;let token='old',calls=0;
  globalThis.localStorage={getItem:()=>token};
  try {
    const fetchFn=capturedProjectFetch('old',()=>true,async(_url,options)=>{calls++;assert.equal(options.headers.get('authorization'),'Bearer old');assert.equal(options.credentials,'omit');throw Error('lost response');});
    await assert.rejects(apiCopy('project',{title:'Copy',scenes:seed()},fetchFn),/lost response/);assert.equal(calls,1);
    token='new';await assert.rejects(apiCopy('project',{title:'Copy',scenes:seed()},fetchFn),{code:'session-changed'});assert.equal(calls,1);
    token=null;await capturedProjectFetch(null,()=>true,async(_url,options)=>{assert.equal(options.headers.has('authorization'),false);assert.equal(options.credentials,'omit');})('/',{headers:{Authorization:'Bearer new'}});
  } finally {if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('local HTTP invalid credentials cannot address an owner-null project',async t=>{
  const local=await importApiFixture({FORGE_HOSTED:'0'});t.after(()=>local.stop());
  const input={title:'Anonymous snapshot',scenes:seed()},created=await local.request('/api/v2/projects',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json());
  const route=`/api/v2/projects/${created.project.id}/copy`,options={method:'POST',body:JSON.stringify(input)};
  assert.equal((await local.request(route,{...options,headers:{Authorization:'broken'}})).status,401);
  assert.equal((await local.request(route,{...options,headers:{Cookie:'forge_session=bad'}})).status,401);
  assert.equal((await local.request(route,{...options,token:local.token})).status,404);
  assert.equal((await local.request(route,options)).status,200);
});
