import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import * as store from '../../../src/projects/store-postgres.js';
import { createSourceRegistry } from '../../../src/projects/sources.js';
import { source } from '../../../test/v2-source-registry-fixture.js';
import { seed } from '../../../test/v2-tool-fixture.js';

const directory = new URL('./', import.meta.url);
const owned = JSON.parse(await readFile(new URL('../owned-postgres.json', directory), 'utf8'));
const details = execFileSync('docker', ['inspect', '--format', '{{json .Id}}|{{json .Name}}|{{json .Image}}|{{json .State.Running}}|{{json .NetworkSettings.Ports}}', owned.id], { encoding: 'utf8', timeout: 5000 }).trim().split('|').map(value=>JSON.parse(value));
assert.equal(details[0],owned.id); assert.equal(details[1],'/'+owned.name); assert.equal(details[2],owned.imageId); assert.equal(details[3],true);
assert.ok(details[4]['5432/tcp'].some(p=>p.HostIp===owned.host && Number(p.HostPort)===owned.port));
const privateState=JSON.parse(await readFile(owned.privateStatePath,'utf8'));
const configured=new URL(privateState.url);
assert.equal(configured.hostname,owned.host); assert.equal(Number(configured.port),owned.port);
const maintenance=new Pool({connectionString:configured.href,connectionTimeoutMillis:3000});
const database='forge_source_j2_review_'+process.pid+'_'+Date.now().toString(36);
const observation={implementationSha:'0549daf6c61b6995698d01784ea4d75c73aedba6',containerId:owned.id,name:owned.name,imageId:owned.imageId,host:owned.host,port:owned.port,database,identityVerified:true,created:false,dropped:false};
let created=false;
before(async()=>{
  observation.initialDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  await maintenance.query(`CREATE DATABASE "${database}"`); created=true; observation.created=true;
  configured.pathname='/'+database; process.env.FORGE_PROJECTS_DATABASE_URL=configured.href;
  await store.__testReset();
});
after(async()=>{
  try { await store.closeProjectStore(); if(created) { await maintenance.query(`DROP DATABASE "${database}"`); observation.dropped=true; }
    observation.finalDatabaseCatalog=(await maintenance.query("SELECT datname FROM pg_database WHERE datistemplate=false AND datname<>'postgres' ORDER BY datname")).rows.map(r=>r.datname);
  } finally { await maintenance.end(); await writeFile(new URL('owned-review-database.json',directory),JSON.stringify(observation,null,2)+'\n'); }
});
async function fixture(t) {
  const {doc}=await store.createProject({owner:'review-owner',title:'Independent J2 fixture',scenes:seed()});
  const binding={owner:'review-owner',id:doc.id}; t.after(()=>store.deleteProject(binding));
  return {binding,registry:createSourceRegistry(store)};
}
test('private callback refusal after a real insert preserves object identity and rolls back', {timeout:10000}, async t=>{
  const {binding,registry}=await fixture(t),s=source(binding.id),payload=JSON.stringify(s);
  const refusal=Object.freeze({[Symbol('private review refusal')]:true,code:'result-too-large'});
  await assert.rejects(store.withSourceTransaction(binding,async tx=>{
    await tx.query('INSERT INTO v2_project_sources(project_id,source_id,payload,payload_bytes) VALUES(?,?,?,?)',[binding.id,s.id,payload,Buffer.byteLength(payload)]);
    throw refusal;
  }),error=>error===refusal);
  const inspected=await registry.inspect(binding); assert.equal(inspected.ok,true); assert.equal(inspected.catalog.count,0); assert.equal(inspected.catalog.revision,0);
  const resolved=await registry.resolve(binding,{generation:0,ids:[s.id]}); assert.equal(resolved.ok,true); assert.equal(resolved.results[0].status,'missing');
  assert.equal((await store.__testQuery('SELECT count(*)::text AS n FROM v2_project_sources WHERE project_id=$1',[binding.id])).rows[0].n,'0');
});
test('registration captures owner, project, complete source and catalog request before awaiting storage', {timeout:10000}, async t=>{
  const {binding,registry}=await fixture(t),original={...binding},s=source(binding.id),expected=structuredClone(s);
  let release,entered; const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  const delayed=createSourceRegistry({async withSourceTransaction(b,job){entered();await gate;return store.withSourceTransaction(b,job);}});
  const request={projectRevision:0,generation:0,revision:0,sources:[s]};
  const pending=delayed.register(binding,request); await started;
  binding.owner='foreign';binding.id='foreign-project';request.projectRevision=9;request.generation=9;request.revision=9;s.title='mutated';request.sources.push(source(original.id,99));
  release(); const result=await pending;
  Object.assign(binding,original);
  assert.equal(result.ok,true);assert.equal(result.catalog.count,1);assert.equal(result.catalog.revision,1);assert.deepEqual(result.sources,[expected]);
  const resolved=await registry.resolve(original,{generation:0,ids:[expected.id]});assert.deepEqual(resolved.results[0].source,expected);
  assert.equal((await registry.inspect({...original,owner:'foreign'})).code,'not-found');
});
