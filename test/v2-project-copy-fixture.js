import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { seed } from './v2-tool-fixture.js';
const run=promisify(execFile);
export async function citedFixture(f,scenes=seed()) {
  const response=await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title:'Copy source',scenes})});
  assert.equal(response.status,200);const {project}=await response.json();
  const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {source} from './test/v2-source-registry-fixture.js';import {record} from './test/v2-citations-fixture.js';
    const b=JSON.parse(process.env.FORGE_COPY_BINDING),r=createSourceRegistry(store),s=source(b.id);
    const registered=await r.register(b,{projectRevision:0,generation:0,revision:0,sources:[s]});if(!registered.ok)throw Error(JSON.stringify(registered));
    const {doc}=await store.getProject(b);doc.scenes[0].citations=[record(1,{source:{projectId:b.id,id:s.id,generation:0}})];
    const saved=await store.saveProject({...b,baseRevision:0,scenes:doc.scenes});console.log(JSON.stringify(saved.doc));store.closeProjectStore();`;
  const out=await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_COPY_BINDING:JSON.stringify({id:project.id,owner:f.owner})},timeout:15000});
  return JSON.parse(out.stdout.trim());
}
