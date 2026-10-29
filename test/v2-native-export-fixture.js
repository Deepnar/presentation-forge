import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importApiFixture } from './v2-import-fixture.js';
import { seed } from './v2-tool-fixture.js';
const run=promisify(execFile);
export async function exportApiFixture(extra={}) {
  const f=await importApiFixture(extra);
  f.project=async(cited=true,{plain=false,title='Saved notes browser'}={})=>{
    const scenes=seed();if(plain)scenes[0].elements[0].paragraphs[0].runs=[scenes[0].elements[0].paragraphs[0].runs[0]];
    const response=await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title,scenes})});assert.equal(response.status,200);
    const {project}=await response.json();if(!cited)return project;
    const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {registerCited} from './test/v2-citation-export-fixture.js';
      const binding=JSON.parse(process.env.FORGE_EXPORT_BINDING);await registerCited({store,binding,registry:createSourceRegistry(store)});console.log(JSON.stringify((await store.getProject(binding)).doc));store.closeProjectStore();`;
    const result=await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_EXPORT_BINDING:JSON.stringify({id:project.id,owner:f.owner})},timeout:15000});return JSON.parse(result.stdout.trim());
  };
  f.sql=async(sql,params)=>{
    const code=`import {getDb,closeDb} from './src/db.js';const {sql,params}=JSON.parse(process.env.FORGE_EXPORT_SQL);getDb().prepare(sql).run(...params);closeDb();`;
    await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_EXPORT_SQL:JSON.stringify({sql,params})},timeout:10000});
  };
  return f;
}
