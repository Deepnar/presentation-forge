import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {exportApiFixture} from './v2-native-export-fixture.js';
const run=promisify(execFile);
export async function citationViewFixture(extra={}){
 const f=await exportApiFixture(extra);
 f.viewProject=async({count=1,orphan=false}={})=>{
  const doc=await f.project(false,{plain:true,title:'Saved references'});
  const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';import {registerCited} from './test/v2-citation-export-fixture.js';
   const {binding,count,orphan}=JSON.parse(process.env.FORGE_VIEW_FIXTURE);const loaded=(await store.getProject(binding)).doc;await registerCited({store,binding,registry:createSourceRegistry(store)},count,loaded.scenes);let project=(await store.getProject(binding)).doc;
   if(orphan){project.scenes[0].citations[0].target.elementId='removed';await store.saveProject({...binding,baseRevision:project.revision,scenes:project.scenes});project=(await store.getProject(binding)).doc;}console.log(JSON.stringify(project));store.closeProjectStore();`;
  const r=await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_VIEW_FIXTURE:JSON.stringify({binding:{id:doc.id,owner:f.owner},count,orphan})},timeout:15000});return JSON.parse(r.stdout.trim());
 };
 f.clearSources=async id=>{
  const code=`import * as store from './src/projects/store.js';import {createSourceRegistry} from './src/projects/sources.js';const b=JSON.parse(process.env.FORGE_VIEW_FIXTURE),r=createSourceRegistry(store),c=(await r.inspect(b)).catalog;const out=await r.clear(b,{generation:c.generation,revision:c.revision});if(!out.ok)throw Error('Fixture clear failed');store.closeProjectStore();`;
  await run(process.execPath,['--input-type=module','-e',code],{env:{...f.env,FORGE_VIEW_FIXTURE:JSON.stringify({id,owner:f.owner})},timeout:15000});
 };
 return f;
}
