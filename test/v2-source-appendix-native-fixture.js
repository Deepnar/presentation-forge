import { execFile } from 'node:child_process';import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { seed } from './v2-tool-fixture.js';
const run=promisify(execFile);
export async function seedAppendixProject(f){
 const response=await f.request('/api/v2/projects',{token:f.token,method:'POST',body:JSON.stringify({title:'Reference appendix evidence',theme:{name:'warm-humanist',variant:'light'},scenes:seed()})});assert.equal(response.status,200);const {project}=await response.json();
 const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {source} from './test/v2-source-registry-fixture.js';import {anchor} from './test/v2-citation-export-fixture.js';import {record} from './test/v2-citations-fixture.js';
 const binding=JSON.parse(process.env.FORGE_APPENDIX_BINDING),doc=(await store.getProject(binding)).doc;
 const s=source(binding.id,0,{title:'A long retained reference <literal> 界 é\\n\\u202e '+ 'Complete title '.repeat(27),url:'https://example.org/reference?private='+'q'.repeat(1760)+'&end=END',excerpt:'SECRET_EXCERPT_NOT_COPIED'});
 const registered=await createSourceRegistry(store).register(binding,{projectRevision:0,generation:0,revision:0,sources:[s]});if(!registered.ok)throw Error('Fixture source register failed');
 doc.scenes[0].citations=await anchor(doc.scenes,[record(1,{source:{projectId:binding.id,id:s.id,generation:0}})],binding.id);await store.saveProject({...binding,baseRevision:0,scenes:doc.scenes});store.closeProjectStore();`;
 await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_APPENDIX_BINDING:JSON.stringify({id:project.id,owner:f.owner})},timeout:15000});return project;
}
export async function invokeAppendix(f,args,token=f.token,extra={}){
 try{const r=await run(process.execPath,['src/projects/source-appendix-cli.js',...args],{env:{...f.env,FORGE_PROJECT_TOKEN:token,...extra},timeout:15000});return JSON.parse(r.stdout.trim());}
 catch(e){assert.equal(e.code,1);return JSON.parse(e.stdout.trim());}
}
export const applyArgs=p=>['--include-source-text','--revision',String(p.snapshot.projectRevision),'--source-generation',String(p.snapshot.sourceGeneration),'--source-revision',String(p.snapshot.sourceRevision),'--design-fingerprint',p.designFingerprint];
export async function invokeExport(f,id,file){const r=await run(process.execPath,['src/projects/export-cli.js',id,'--output',file,'--include-source-notes'],{env:{...f.env,FORGE_PROJECT_TOKEN:f.token},timeout:15000});assert.equal(JSON.parse(r.stdout.trim()).ok,true);}
