import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import * as store from '../../../src/projects/store-postgres.js';
import { createSourceRegistry } from '../../../src/projects/sources.js';
import { createProjectCitations } from '../../../src/projects/citations.js';
import { source } from '../../../test/v2-source-registry-fixture.js';
import { seed } from '../../../test/v2-tool-fixture.js';
import { cid,target } from '../../../test/v2-citations-fixture.js';

const directory=new URL('./',import.meta.url);
const admission=JSON.parse(await readFile(new URL('storage-admission.json',directory),'utf8'));
assert.equal(admission.admitted,true);assert.ok(Date.now()-Date.parse(admission.samples.at(-1).atUtc)<60000);
const owned=JSON.parse(await readFile(new URL('../owned-postgres.json',directory),'utf8'));
const identity=execFileSync('docker',['inspect','--format','{{json .Id}}|{{json .Name}}|{{json .Image}}|{{json .State.Running}}|{{json .NetworkSettings.Ports}}|{{json .HostConfig.NanoCpus}}|{{json .HostConfig.Memory}}',owned.id],{encoding:'utf8',timeout:5000}).trim().split('|').map(v=>JSON.parse(v));
assert.equal(identity[0],owned.id);assert.equal(identity[1],'/'+owned.name);assert.equal(identity[2],owned.image);assert.equal(identity[3],true);
assert.ok(identity[4]['5432/tcp'].some(p=>p.HostIp===owned.host && Number(p.HostPort)===owned.port));
assert.equal(identity[5],owned.cpus*1e9);assert.equal(identity[6],owned.memoryBytes);
const privateState=JSON.parse(await readFile(new URL('../../../.codex/v2-8j-4-session/connection.json',directory),'utf8')),connection=new URL(privateState.url);
assert.equal(connection.hostname,owned.host);assert.equal(Number(connection.port),owned.port);
const maintenance=new Pool({connectionString:connection.href,connectionTimeoutMillis:3000});
const database='forge_citations_j4_review_'+process.pid+'_'+Date.now().toString(36);
const observation={frozenSourceSha:'665cd0459b0f267b32e808a59046e3d0b914e74f',containerId:owned.id,name:owned.name,image:owned.image,host:owned.host,port:owned.port,identityVerifiedBeforeConnectionUse:true,database,created:false,dropped:false};
let created=false;
before(async()=>{
  observation.initialUserDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  await maintenance.query(`CREATE DATABASE "${database}"`);created=true;observation.created=true;
  connection.pathname='/'+database;process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();
});
after(async()=>{
  try{await store.closeProjectStore();if(created){await maintenance.query(`DROP DATABASE "${database}"`);observation.dropped=true;}
    observation.finalUserDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  }finally{await maintenance.end();await writeFile(new URL('owned-review-database.json',directory),JSON.stringify(observation,null,2)+'\n');}
});
async function fixture(t,two=false){
  const {doc}=await store.createProject({owner:'review-owner',title:'Independent J4 fixture',scenes:seed()});
  const binding={id:doc.id,owner:'review-owner'},registry=createSourceRegistry(store),citations=createProjectCitations(store),s=source(binding.id);
  t.after(()=>store.deleteProject(binding));
  assert.equal((await registry.register(binding,{projectRevision:0,generation:0,revision:0,sources:[s]})).ok,true);
  const changes=[{mode:'add',id:cid(1),target:target(),sourceId:s.id,locator:{kind:'snippet-utf8-v1',startByte:0,endByte:8,quote:'Measured'}}];
  if(two)changes.push({mode:'add',id:cid(2),target:target('other','s2'),sourceId:s.id});
  assert.equal((await citations.attach(binding,{projectRevision:0,sourceGeneration:0,sourceRevision:1,changes})).ok,true);
  return {binding,registry,citations,s};
}
const inspect=(e,revision,ids,generation=0,sourceRevision=1)=>e.citations.inspect(e.binding,{projectRevision:revision,sourceGeneration:generation,sourceRevision,citationIds:ids});
test('orphan and protected metadata can be removed without reading or repairing an invalid source catalog',{timeout:12000},async t=>{
  const e=await fixture(t,true),scenes=(await store.getProject(e.binding)).doc.scenes;
  scenes[0].elements=scenes[0].elements.filter(el=>el.id!=='text');scenes[1].elements.find(el=>el.id==='other').locked=true;
  assert.equal((await store.saveProject({...e.binding,baseRevision:1,scenes})).status,'saved');
  await store.__testQuery('UPDATE v2_project_source_catalog SET policy_version=2 WHERE project_id=$1',[e.binding.id]);
  const catalog=(await store.__testQuery('SELECT * FROM v2_project_source_catalog WHERE project_id=$1',[e.binding.id])).rows;
  const sources=(await store.__testQuery('SELECT * FROM v2_project_sources WHERE project_id=$1',[e.binding.id])).rows;
  assert.equal((await inspect(e,2,[cid(1),cid(2)])).code,'invalid-state');
  const removed=await e.citations.remove(e.binding,{projectRevision:2,citationIds:[cid(1),cid(2)]});
  assert.equal(removed.ok,true);assert.equal(removed.changed,true);assert.equal(removed.snapshot.projectRevision,3);
  const after=(await store.getProject(e.binding)).doc;
  assert.equal(after.scenes[0].citations,undefined);assert.equal(after.scenes[1].citations,undefined);
  assert.equal(after.scenes[1].elements.find(el=>el.id==='other').locked,true);
  assert.deepEqual((await store.__testQuery('SELECT * FROM v2_project_source_catalog WHERE project_id=$1',[e.binding.id])).rows,catalog);
  assert.deepEqual((await store.__testQuery('SELECT * FROM v2_project_sources WHERE project_id=$1',[e.binding.id])).rows,sources);
  assert.equal((await e.registry.inspect(e.binding)).code,'invalid-state');
});
test('stale-generation observations skip an unselected corrupt re-registered body while current selection refuses wholly',{timeout:12000},async t=>{
  const e=await fixture(t),saved=(await store.getProject(e.binding)).doc;
  assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
  assert.equal((await e.registry.register(e.binding,{projectRevision:1,generation:1,revision:2,sources:[e.s]})).ok,true);
  const changed={...e.s,title:'Z'.repeat(e.s.title.length)},payload=JSON.stringify(changed);
  assert.equal(Buffer.byteLength(payload),Buffer.byteLength(JSON.stringify(e.s)));
  await store.__testQuery('UPDATE v2_project_sources SET payload=$1 WHERE project_id=$2 AND source_id=$3',[payload,e.binding.id,e.s.id]);
  assert.equal((await e.registry.inspect(e.binding)).ok,true);
  const stale=await inspect(e,1,[cid(1)],1,3);assert.equal(stale.ok,true);assert.equal(stale.citations[0].source,'stale-generation');assert.equal(stale.citations[0].locator,'unavailable');assert.equal(stale.citations[0].claimSupport,'not-assessed');
  const scenes=structuredClone(saved.scenes),prior=scenes[0].citations[0];
  scenes[0].citations.push({...structuredClone(prior),id:cid(2),source:{...prior.source,generation:1}});
  assert.equal((await store.saveProject({...e.binding,baseRevision:1,scenes})).status,'saved');
  assert.equal((await inspect(e,2,[cid(1)],1,3)).ok,true);
  const selected=await inspect(e,2,[cid(1),cid(2)],1,3);assert.equal(selected.code,'invalid-state');assert.deepEqual(Object.keys(selected),['ok','code','message']);
});
