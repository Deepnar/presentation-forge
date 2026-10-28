import assert from 'node:assert/strict';
import { setImmediate as checkpoint,setTimeout as delay } from 'node:timers/promises';
import { createCitationReferenceChecker } from '../src/projects/citation-references.js';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createTurnService } from '../packages/agent/turns.ts';
import { source } from './v2-source-registry-fixture.js';
import { seed } from './v2-tool-fixture.js';

export function citationScenes() {
  const scenes=seed(),el=scenes[0].elements[0];
  const child={...structuredClone(el),id:'child',hidden:true,locked:true};
  scenes[0].elements.push({id:'group',kind:'group',x:1,y:1,w:1,h:1,z:4,provenance:'human',group:{children:[child,{...child,id:'dup'},{...child,id:'dup'}]}});
  scenes[0].elements.push({id:'locked',kind:'shape',x:0,y:0,w:1,h:1,z:5,locked:true,provenance:'compiler'});
  return scenes;
}
export const locator=(startByte,endByte,quote)=>({kind:'snippet-utf8-v1',startByte,endByte,quote});
const target=elementId=>({kind:'element',slideId:'s1',elementId});
export const request=(sourceId,references=[{target:target('text'),sourceId}])=>({projectRevision:0,sourceGeneration:0,sourceRevision:1,references});
async function registered(e,extra={}) {
  const s=source(e.binding.id,0,extra),result=await e.registry.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[s]});
  assert.equal(result.ok,true,JSON.stringify(result));return s;
}
async function snapshot(e) {
  return {project:await e.store.getProject(e.binding),history:await e.store.listRevisions(e.binding),chat:await createTurnService(e.store).read(e.binding),
    catalog:await e.registry.inspect(e.binding),rows:await e.query('SELECT source_id,payload,payload_bytes FROM v2_project_sources WHERE project_id=? ORDER BY source_id',[e.binding.id])};
}
export function citationContracts(check,setup) {
  check('complete target/source/locator facts remain read-only and never claim support',async t=>{
    const e=await setup(t),s=source(e.binding.id,0,{excerpt:'\uFEFF界😀 e\u0301\r\n�'}),lone=source(e.binding.id,1,{excerpt:'x\ud800'}),missing=source('foreign').id;
    assert.equal((await e.registry.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[s,lone]})).ok,true);
    const refs=[{target:{kind:'slide',slideId:'s1'},sourceId:s.id},
      {target:target('child'),sourceId:s.id,locator:locator(3,6,'界')},{target:target('dup'),sourceId:s.id},
      {target:target('absent'),sourceId:s.id,locator:locator(3,6,'界')},
      {target:target('text'),sourceId:missing,locator:locator(0,1,'x')},{target:target('text'),sourceId:missing},
      {target:target('chart'),sourceId:s.id,locator:locator(3,6,'x')},
      {target:target('table'),sourceId:s.id,locator:locator(4,6,'界')},
      {target:target('group'),sourceId:lone.id,locator:locator(0,1,'x')},{target:target('locked'),sourceId:s.id}];
    const before=await snapshot(e),out=await e.checker.check(e.binding,request(s.id,refs));assert.equal(out.ok,true,JSON.stringify(out));
    assert.deepEqual(out.references.map(r=>[r.target,r.source,r.locator]),[
      ['present','retained','not-requested'],['present','retained','matched'],['ambiguous','retained','not-requested'],
      ['missing','retained','matched'],['present','missing','unavailable'],['present','missing','not-requested'],
      ['present','retained','mismatch'],['present','retained','invalid'],['present','retained','unsupported-excerpt'],['present','retained','not-requested']]);
    assert.ok(out.references.every(r=>r.claimSupport==='not-assessed'));
    for(const word of [s.url,s.excerpt,s.title,'quote','Unrelated private slide']) assert.equal(JSON.stringify(out).includes(word),false);
    assert.deepEqual(await snapshot(e),before);assert.ok(Object.isFrozen(out.snapshot));
  });
  check('owner isolation, stale tokens, reopen and history restoration keep exact authority',async t=>{
    const e=await setup(t),s=await registered(e),q=request(s.id);
    for(const owner of ['foreign',null]) assert.equal((await e.checker.check({...e.binding,owner},q)).code,'not-found');
    assert.equal((await e.checker.check({...e.binding,admin:true},q)).code,'invalid-request');
    const {doc}=await e.store.createProject({owner:null,title:'Local citation fixture',scenes:citationScenes()}),local={id:doc.id,owner:null};
    t.after(()=>e.store.deleteProject(local));
    assert.equal((await e.checker.check(local,{...q,sourceRevision:0})).references[0].source,'missing');
    assert.equal((await e.checker.check({...local,owner:'owner'},{...q,sourceRevision:0})).code,'not-found');
    assert.equal((await e.checker.check(e.binding,{...q,sourceRevision:0})).code,'stale-catalog');
    await e.store.closeProjectStore();assert.equal((await e.checker.check(e.binding,q)).references[0].source,'retained');
    await e.store.renameProject({...e.binding,baseRevision:0,title:'Renamed'});
    assert.equal((await e.checker.check(e.binding,q)).code,'stale-project');
    await e.store.restoreRevision({...e.binding,baseRevision:1,targetRevision:0});
    const current={...q,projectRevision:2};assert.equal((await e.checker.check(e.binding,current)).ok,true);
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
    assert.equal((await e.checker.check(e.binding,current)).code,'stale-catalog');
    assert.equal((await e.checker.check(e.binding,{...current,sourceGeneration:1,sourceRevision:2})).references[0].source,'missing');
  });
  check('mutable caller identity, source, quote and target cannot change an admitted read',async t=>{
    const e=await setup(t),s=await registered(e),b={...e.binding},q=request(s.id,[{target:target('text'),sourceId:s.id,locator:locator(0,8,'Measured')}]);
    let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
    const checker=createCitationReferenceChecker({withCitationReadTransaction:(binding,job)=>e.store.withCitationReadTransaction(binding,async tx=>{entered();await gate;return job(tx);})});
    const pending=checker.check(b,q);t.after(async()=>{release();await pending;});await started;
    b.id='other';b.owner='foreign';q.projectRevision=44;q.sourceGeneration=20;q.sourceRevision=30;
    q.references[0].sourceId=source('foreign').id;q.references[0].target.elementId='missing';q.references[0].locator.quote='changed';q.references.push({...q.references[0]});
    release();const out=await pending;assert.equal(out.ok,true);assert.deepEqual(out.references,[{index:0,target:'present',source:'retained',locator:'matched',claimSupport:'not-assessed'}]);
  });
  check('selected-body corruption and read faults publish nothing and release the parent lock',async t=>{
    const e=await setup(t),s=await registered(e),q=request(s.id),before=await snapshot(e);
    const broken=createCitationReferenceChecker({withCitationReadTransaction:(binding,job)=>e.store.withCitationReadTransaction(binding,tx=>job({...tx,query:async(sql,params)=>{
      const rows=await tx.query(sql,params);if(sql.includes('payload') && sql.includes('source_id IN')) throw new Error('private URL credential quote');return rows;
    }}))});
    const fault=await broken.check(e.binding,q);assert.equal(fault.code,'storage-unavailable');assert.deepEqual(Object.keys(fault),['ok','code','message']);
    assert.deepEqual(await snapshot(e),before);assert.equal((await e.checker.check(e.binding,q)).ok,true);
    const bytes=Buffer.byteLength(JSON.stringify(s));await e.query('UPDATE v2_project_sources SET payload=? WHERE project_id=?',['x'.repeat(bytes),e.binding.id]);
    const corrupt=await e.checker.check(e.binding,q);assert.equal(corrupt.code,'invalid-state');assert.equal(Object.hasOwn(corrupt,'references'),false);
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
    assert.equal((await e.checker.check(e.binding,{...q,sourceGeneration:1,sourceRevision:2})).ok,true);
    await e.store.renameProject({...e.binding,baseRevision:0,title:'Lock released'});
  });
  check('one parent lock excludes clear between document and source observations',async t=>{
    const e=await setup(t),s=await registered(e),q=request(s.id);let entered,release,held=false,cleared=false;
    const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
    const checker=createCitationReferenceChecker({withCitationReadTransaction:(binding,job)=>e.store.withCitationReadTransaction(binding,tx=>job({...tx,query:async(sql,params)=>{
      if(!held && sql.includes('FROM v2_project_source_catalog')) {held=true;entered();await gate;}return tx.query(sql,params);
    }}))});
    const pending=checker.check(e.binding,q);let clearing;
    t.after(async()=>{release();await Promise.allSettled([pending,clearing]);});await started;
    clearing=createSourceRegistry(e.store).clear(e.binding,{generation:0,revision:1}).then(result=>{cleared=true;return result;});
    if(e.waitForLock) await e.waitForLock();else await checkpoint();
    assert.equal(cleared,false);release();
    const observed=await pending;assert.equal(observed.ok,true);assert.equal(observed.references[0].source,'retained');assert.equal(observed.snapshot.sourceGeneration,0);
    assert.equal((await clearing).ok,true);assert.equal((await e.checker.check(e.binding,q)).code,'stale-catalog');
  });
}
export async function waitForPgLock(store) {
  const end=Date.now()+3000;
  while(Date.now()<end) {
    const rows=(await store.__testQuery("SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows;
    if(Number(rows[0].n)>0)return;
    await delay(15);
  }
  assert.fail('The owned fixture writer did not reach the parent lock.');
}
