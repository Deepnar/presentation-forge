import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as store from '../src/projects/store.js';
import { setDbPathForTest,getDb } from '../src/db.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { seed } from './v2-tool-fixture.js';
import { source,child } from './v2-source-registry-fixture.js';
import { contracts } from './v2-source-registry-contract.js';
const check=(name,body)=>test('Registry SQLite: '+name,{timeout:15000},body);
async function setup(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'forge-source-j2-')),file=path.join(dir,'forge.db');setDbPathForTest(file);
  t.after(async()=>{store.closeProjectStore();await rm(dir,{recursive:true,force:true});});
  const {doc}=await store.createProject({owner:'owner',title:'Source fixture',scenes:seed()}),binding={owner:'owner',id:doc.id};
  const env={FORGE_DB_PATH:file,FORGE_PROJECTS_BACKEND:'sqlite'};
  return {store,doc,binding,env,registry:createSourceRegistry(store),query:(sql,params)=>store.withRuntimeTransaction(binding,tx=>tx.query(sql,params)),
    raw:async(sql,params=[])=>getDb().prepare(sql).all(...params),coldDelete:()=>child('store',binding,env,'delete')};
}
contracts(check,setup);
check('process reopen retains immutable source content',async t=>{
  const e=await setup(t),s=source(e.binding.id);assert.equal((await e.registry.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[s]})).ok,true);
  const reopened=await child('store',e.binding,e.env,'resolve',[s.id]);assert.deepEqual(reopened.results[0].source,s);
});
check('actual invalid UTF-8 cannot masquerade as a literal replacement character',async t=>{
  const e=await setup(t),s=source(e.binding.id,0,{title:'Valid � literal'});
  const added=await e.registry.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[s]});assert.equal(added.ok,true);
  assert.equal((await e.registry.resolve(e.binding,{generation:0,ids:[s.id]})).ok,true);
  const canonical=Buffer.from(JSON.stringify(s)),at=canonical.indexOf(Buffer.from('�'));
  const bytes=Buffer.concat([canonical.subarray(0,at),Buffer.from([0x80]),canonical.subarray(at+3)]);
  getDb().prepare('UPDATE v2_project_sources SET payload=CAST(? AS TEXT),payload_bytes=? WHERE project_id=?').run(bytes,bytes.length,e.binding.id);
  getDb().prepare('UPDATE v2_project_source_catalog SET bytes=? WHERE project_id=?').run(bytes.length,e.binding.id);
  assert.equal((await e.registry.resolve(e.binding,{generation:0,ids:[s.id]})).code,'invalid-state');
  assert.equal((await e.registry.clear(e.binding,{generation:added.catalog.generation,revision:added.catalog.revision})).ok,true);
});
check('oversized stored TEXT and a leading BOM refuse without repairing bytes',async t=>{
  const e=await setup(t),s=source(e.binding.id);
  for(const bytes of [Buffer.alloc(20000,120),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(s))])]) {
    const c=(await e.registry.inspect(e.binding)).catalog;
    const added=await e.registry.register(e.binding,{projectRevision:0,generation:c.generation,revision:c.revision,sources:[s]});
    getDb().prepare('UPDATE v2_project_sources SET payload=CAST(? AS TEXT),payload_bytes=? WHERE project_id=?').run(bytes,bytes.length,e.binding.id);
    getDb().prepare('UPDATE v2_project_source_catalog SET bytes=? WHERE project_id=?').run(bytes.length,e.binding.id);
    assert.equal((await e.registry.resolve(e.binding,{generation:c.generation,ids:[s.id]})).code,'invalid-state');
    assert.equal((await e.registry.clear(e.binding,{generation:added.catalog.generation,revision:added.catalog.revision})).ok,true);
  }
});
