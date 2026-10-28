import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import * as store from '../../../src/projects/store-postgres.js';
import { createCitationReferenceChecker } from '../../../src/projects/citation-references.js';
import { createSourceRegistry } from '../../../src/projects/sources.js';
import { source } from '../../../test/v2-source-registry-fixture.js';
import { seed } from '../../../test/v2-tool-fixture.js';

const directory=new URL('./',import.meta.url);
const admission=JSON.parse(await readFile(new URL('sqlite-admission.json',directory),'utf8'));
assert.equal(admission.admitted,true);
assert.ok(Date.now()-Date.parse(admission.samples.at(-1).atUtc)<60000,'Fresh resource admission is required.');
const owned=JSON.parse(await readFile(new URL('../owned-postgres.json',directory),'utf8'));
const identity=execFileSync('docker',['inspect','--format','{{json .Id}}|{{json .Name}}|{{json .Image}}|{{json .State.Running}}|{{json .NetworkSettings.Ports}}',owned.id],{encoding:'utf8',timeout:5000}).trim().split('|').map(v=>JSON.parse(v));
assert.equal(identity[0],owned.id);assert.equal(identity[1],'/'+owned.name);assert.equal(identity[2],owned.imageId);assert.equal(identity[3],true);
assert.ok(identity[4]['5432/tcp'].some(p=>p.HostIp===owned.host && Number(p.HostPort)===owned.port));
const privateState=JSON.parse(await readFile(owned.privateStatePath,'utf8')),connection=new URL(privateState.url);
assert.equal(connection.hostname,owned.host);assert.equal(Number(connection.port),owned.port);
const maintenance=new Pool({connectionString:connection.href,connectionTimeoutMillis:3000});
const database='forge_citation_j3_review_'+process.pid+'_'+Date.now().toString(36);
const observation={implementationSha:'edda5ec7c2105bebff4a429a04b3fbe5b09048b4',containerId:owned.id,name:owned.name,imageId:owned.imageId,host:owned.host,port:owned.port,identityVerified:true,database,created:false,dropped:false};
let created=false;
before(async()=>{
  observation.initialDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  await maintenance.query(`CREATE DATABASE "${database}"`);created=true;observation.created=true;
  connection.pathname='/'+database;process.env.FORGE_PROJECTS_DATABASE_URL=connection.href;await store.__testReset();
});
after(async()=>{
  try {await store.closeProjectStore();if(created){await maintenance.query(`DROP DATABASE "${database}"`);observation.dropped=true;}
    observation.finalDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  }finally{await maintenance.end();await writeFile(new URL('owned-review-database.json',directory),JSON.stringify(observation,null,2)+'\n');}
});
async function fixture(t,scenes=seed()) {
  const {doc}=await store.createProject({owner:'review-owner',title:'Independent citation fixture',scenes});
  const binding={id:doc.id,owner:'review-owner'},registry=createSourceRegistry(store),s=source(binding.id);
  t.after(()=>store.deleteProject(binding));
  assert.equal((await registry.register(binding,{projectRevision:0,generation:0,revision:0,sources:[s]})).ok,true);
  return {binding,registry,s,checker:createCitationReferenceChecker(store)};
}
const reference=(sourceId,slideId='s1',elementId='text')=>({target:{kind:'element',slideId,elementId},sourceId});
const request=references=>({projectRevision:0,sourceGeneration:0,sourceRevision:1,references});
async function writerReachedLock() {
  const until=Date.now()+3000;
  while(Date.now()<until){
    const rows=(await store.__testQuery("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows;
    if(Number(rows[0].n)>0)return;await delay(15);
  }
  assert.fail('The owned save did not reach the parent lock.');
}
test('one parent snapshot excludes a concurrent save that removes the requested target',{timeout:12000},async t=>{
  const e=await fixture(t),q=request([reference(e.s.id)]),catalog=await e.registry.inspect(e.binding);
  let entered,release,held=false,saveDone=false;
  const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  const paused=createCitationReferenceChecker({withCitationReadTransaction:(binding,job)=>store.withCitationReadTransaction(binding,tx=>job({...tx,query:async(sql,params)=>{
    if(!held && sql.includes('FROM v2_project_source_catalog')){held=true;entered();await gate;}return tx.query(sql,params);
  }}))});
  const pending=paused.check(e.binding,q);let saving;t.after(async()=>{release();await Promise.allSettled([pending,saving]);});await started;
  const scenes=seed();scenes[0].elements=scenes[0].elements.filter(el=>el.id!=='text');
  saving=store.saveProject({...e.binding,baseRevision:0,scenes}).then(value=>{saveDone=true;return value;});
  await writerReachedLock();assert.equal(saveDone,false);release();
  const observed=await pending;assert.equal(observed.ok,true);assert.equal(observed.snapshot.projectRevision,0);
  assert.deepEqual(observed.references,[{index:0,target:'present',source:'retained',locator:'not-requested',claimSupport:'not-assessed'}]);
  await saving;assert.equal((await e.checker.check(e.binding,q)).code,'stale-project');
  const current=await e.checker.check(e.binding,{...q,projectRevision:1});assert.equal(current.ok,true);assert.equal(current.references[0].target,'missing');assert.equal(current.references[0].source,'retained');
  assert.deepEqual(await e.registry.inspect(e.binding),catalog);
});
test('traversal budget is shared across requested slides and the exact10000 boundary succeeds',{timeout:12000},async t=>{
  const base=seed()[0],shape=i=>({id:'node-'+i,kind:'shape',x:0,y:0,w:1,h:1,z:0,provenance:'human'});
  const scenes=[{...structuredClone(base),id:'budget-a',elements:Array.from({length:5000},(_,i)=>shape(i))},{...structuredClone(base),id:'budget-b',elements:Array.from({length:5001},(_,i)=>shape(i))}];
  const e=await fixture(t,scenes),q=request([reference(e.s.id,'budget-a','node-0'),reference(e.s.id,'budget-b','node-0')]),catalog=await e.registry.inspect(e.binding);
  const over=await e.checker.check(e.binding,q);assert.deepEqual(Object.keys(over),['ok','code','message']);assert.equal(over.code,'target-budget-exceeded');
  assert.deepEqual(await e.registry.inspect(e.binding),catalog);
  scenes[1].elements.pop();await store.saveProject({...e.binding,baseRevision:0,scenes});
  const exact=await e.checker.check(e.binding,{...q,projectRevision:1});assert.equal(exact.ok,true);assert.deepEqual(exact.references.map(r=>r.target),['present','present']);
  assert.ok(exact.references.every(r=>r.source==='retained' && r.claimSupport==='not-assessed'));assert.ok(Object.isFrozen(exact.references));
});
