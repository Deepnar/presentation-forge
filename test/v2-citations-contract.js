import assert from 'node:assert/strict';
import { setImmediate as checkpoint } from 'node:timers/promises';
import { createDocument } from '../packages/model/engine.ts';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createProjectCitations } from '../src/projects/citations.js';
import { source } from './v2-source-registry-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { cid, target, record } from './v2-citations-fixture.js';

async function register(e,extra={}) {
  const s=source(e.binding.id,0,{excerpt:'\uFEFF界😀 measured.',...extra});
  const r=await e.registry.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[s]});assert.equal(r.ok,true,JSON.stringify(r));return s;
}
const request=(s,extra={})=>({projectRevision:0,sourceGeneration:0,sourceRevision:1,changes:[{mode:'add',id:cid(1),target:target(),sourceId:s.id,locator:{kind:'snippet-utf8-v1',startByte:3,endByte:6,quote:'界'}}],...extra});
const inspect=(e,revision,ids=[cid(1)],generation=0,sourceRevision=1)=>e.citations.inspect(e.binding,{projectRevision:revision,sourceGeneration:generation,sourceRevision,citationIds:ids});
const get=async e=>(await e.store.getProject(e.binding)).doc;
const snapshot=async e=>({doc:await get(e),catalog:await e.registry.inspect(e.binding),history:await e.store.listRevisions(e.binding)});

export function citationWriteContracts(check,setup) {
  check('fresh attach replace no-op and current content observations share canonical history',async t=>{
    const e=await setup(t),s=await register(e),catalog=await e.registry.inspect(e.binding),before=await get(e);
    const added=await e.citations.attach(e.binding,request(s));assert.equal(added.ok,true,JSON.stringify(added));assert.equal(added.changed,true);assert.equal(added.snapshot.projectRevision,1);
    const saved=await get(e),c=saved.scenes[0].citations[0];assert.equal(c.source.projectId,e.binding.id);assert.equal(c.locator.quote,undefined);assert.equal(JSON.stringify(c).includes('界'),false);
    const expected=structuredClone(before);expected.scenes[0].citations=[c];assert.deepEqual(saved.scenes,expected.scenes);assert.equal(saved.title,before.title);assert.deepEqual(await e.registry.inspect(e.binding),catalog);
    const observed=await inspect(e,1);assert.deepEqual(observed.citations,[{id:cid(1),target:'present',content:'current',source:'retained',locator:'range-valid',claimSupport:'not-assessed'}]);assert.ok(Object.isFrozen(observed.citations[0]));
    const hist=await e.store.listRevisions(e.binding);assert.equal(hist.revisions.length,2);
    const q=request(s,{projectRevision:1});q.changes[0].mode='replace';assert.equal((await e.citations.attach(e.binding,q)).changed,false);assert.deepEqual(await get(e),saved);assert.deepEqual(await e.store.listRevisions(e.binding),hist);
    const doc=await createDocument(saved.scenes);await doc.apply({id:'human',actor:'human',baseRevision:0,slideId:'s1',op:{type:'element.updateText',id:'text',paragraphs:[{runs:[{text:'Human correction'}]}]}});
    assert.equal((await e.store.saveProject({...e.binding,baseRevision:1,scenes:doc.snapshot().scenes})).status,'saved');assert.equal((await inspect(e,2)).citations[0].content,'changed');
    q.projectRevision=2;assert.equal((await e.citations.attach(e.binding,q)).changed,true);assert.equal((await inspect(e,3)).citations[0].content,'current');
    const moved=request(s,{projectRevision:3});moved.changes[0]={mode:'replace',id:cid(1),target:target('other','s2'),sourceId:s.id};assert.equal((await e.citations.attach(e.binding,moved)).ok,true);const movedDoc=await get(e);assert.equal(movedDoc.scenes[0].citations,undefined);assert.equal(movedDoc.scenes[1].citations[0].id,cid(1));
  });

  check('owner stale protected ambiguous and unmatched requests refuse without partial writes',async t=>{
    const e=await setup(t),s=await register(e),before=await snapshot(e),q=request(s);
    for(const owner of ['foreign',null])assert.equal((await e.citations.attach({...e.binding,owner},q)).code,'not-found');
    assert.equal((await e.citations.attach({...e.binding,admin:true},q)).code,'invalid-request');
    assert.equal((await e.citations.attach(e.binding,{...q,projectRevision:1})).code,'stale-project');assert.equal((await e.citations.attach(e.binding,{...q,sourceRevision:0})).code,'stale-catalog');
    for(const elementId of ['child','group','locked']) {const change={...q.changes[0],target:target(elementId)};assert.equal((await e.citations.attach(e.binding,{...q,changes:[change]})).code,'target-protected');}
    for(const elementId of ['dup','missing'])assert.equal((await e.citations.attach(e.binding,{...q,changes:[{...q.changes[0],target:target(elementId)}]})).code,'target-unavailable');
    assert.equal((await e.citations.attach(e.binding,{...q,changes:[{...q.changes[0],sourceId:source('foreign').id}]})).code,'source-unavailable');
    assert.equal((await e.citations.attach(e.binding,{...q,changes:[{...q.changes[0],locator:{...q.changes[0].locator,quote:'x'}}]})).code,'locator-unmatched');
    assert.equal((await e.citations.attach(e.binding,{...q,changes:[q.changes[0],{...q.changes[0],id:cid(2)}]})).ok,false);
    assert.deepEqual(await snapshot(e),before);
    const slide=request(s);slide.changes[0].target={kind:'slide',slideId:'s1'};assert.equal((await e.citations.attach(e.binding,slide)).ok,true);
  });

  check('clear re-registration history restore and unresolved removal never revive evidence',async t=>{
    const e=await setup(t),s=await register(e);assert.equal((await e.citations.attach(e.binding,request(s))).ok,true);const saved=await get(e);
    const clear=await e.registry.clear(e.binding,{generation:0,revision:1});assert.equal(clear.ok,true);assert.deepEqual(await get(e),saved);
    assert.equal((await inspect(e,1,[cid(1)],1,2)).citations[0].source,'stale-generation');
    assert.equal((await e.registry.register(e.binding,{projectRevision:1,generation:1,revision:2,sources:[s]})).ok,true);assert.equal((await inspect(e,1,[cid(1)],1,3)).citations[0].source,'stale-generation');
    const changed=structuredClone(saved.scenes);changed[0].elements[0].paragraphs[0].runs[0].text='Change';await e.store.saveProject({...e.binding,baseRevision:1,scenes:changed});
    const restored=await e.store.restoreRevision({...e.binding,targetRevision:1,baseRevision:2});assert.equal(restored.status,'restored');assert.deepEqual((await get(e)).scenes,saved.scenes);
    const observed=await inspect(e,3,[cid(1)],1,3);assert.equal(observed.citations[0].source,'stale-generation');assert.equal(observed.citations[0].locator,'unavailable');assert.equal(observed.citations[0].claimSupport,'not-assessed');
    const removed=await e.citations.remove(e.binding,{projectRevision:3,citationIds:[cid(1)]});assert.equal(removed.ok,true);assert.equal(removed.snapshot.projectRevision,4);assert.equal((await get(e)).scenes[0].citations,undefined);
  });

  check('generic saves accept unverified same-project metadata and reject foreign binding or cited creation',async t=>{
    const e=await setup(t),scenes=(await get(e)).scenes;scenes[0].citations=[record(1,{source:{projectId:e.binding.id,id:source('foreign').id,generation:0}})];
    assert.equal((await e.store.saveProject({...e.binding,baseRevision:0,scenes})).status,'saved');
    const result=await inspect(e,1,[cid(1)],0,0);assert.equal(result.citations[0].source,'missing');assert.equal(result.citations[0].claimSupport,'not-assessed');
    const before=await snapshot(e),foreign=structuredClone(scenes);foreign[0].citations[0].source.projectId='foreign';
    await assert.rejects(()=>e.store.saveProject({...e.binding,baseRevision:1,scenes:foreign}),{code:'invalid-document'});
    await assert.rejects(()=>e.store.withRuntimeTransaction(e.binding,tx=>tx.saveScenes(foreign,{saveOrigin:'manual'})),{code:'invalid-document'});
    await assert.rejects(()=>e.store.createProject({owner:'owner',title:'Unsafe copy',scenes}),{code:'invalid-document'});
    assert.deepEqual(await snapshot(e),before);
    const old=await e.store.restoreRevision({...e.binding,baseRevision:1,targetRevision:0});assert.equal(old.status,'restored');assert.equal((await get(e)).scenes[0].citations,undefined);
  });

  check('history failure rolls back scene writes and preserves private domain refusals',async t=>{
    const e=await setup(t),s=await register(e),before=await snapshot(e),id=e.binding.id;
    if(e.dialect==='sqlite')await e.query(`CREATE TRIGGER citation_history_failure BEFORE INSERT ON v2_project_revisions WHEN NEW.project_id='${id}' BEGIN SELECT RAISE(ABORT,'private fixture history failure'); END`);
    else {await e.query(`CREATE FUNCTION citation_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id='${id}' THEN RAISE EXCEPTION 'private fixture history failure'; END IF; RETURN NEW; END $$`);await e.query('CREATE TRIGGER citation_history_failure BEFORE INSERT ON v2_project_revisions FOR EACH ROW EXECUTE FUNCTION citation_history_failure()');}
    try {const out=await e.citations.attach(e.binding,request(s));assert.equal(out.code,'storage-unavailable');assert.equal(JSON.stringify(out).includes('private fixture'),false);}
    finally {await e.query(e.dialect==='sqlite'?'DROP TRIGGER citation_history_failure':'DROP TRIGGER citation_history_failure ON v2_project_revisions');if(e.dialect==='postgres')await e.query('DROP FUNCTION citation_history_failure()');}
    assert.deepEqual(await snapshot(e),before);
    assert.equal((await e.citations.attach(e.binding,request(s))).ok,true);
  });

  check('parent locking serializes a source clear before attachment qualification',async t=>{
    const e=await setup(t),s=await register(e);let entered,release,writerEntered=false;
    const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
    const registry=createSourceRegistry({...e.store,withSourceTransaction:(binding,job)=>e.store.withSourceTransaction(binding,async tx=>{entered();await gate;return job(tx);})});
    const writer=createProjectCitations({...e.store,withCitationTransaction:(binding,job)=>e.store.withCitationTransaction(binding,tx=>{writerEntered=true;return job(tx);})});
    const clearing=registry.clear(e.binding,{generation:0,revision:1});await started;
    const pending=writer.attach(e.binding,request(s));
    try {if(e.waitForLock)await e.waitForLock();else await checkpoint();assert.equal(writerEntered,false);}finally{release();}
    assert.equal((await clearing).ok,true);assert.equal((await pending).code,'stale-catalog');assert.equal((await get(e)).revision,0);
  });

  check('session undo survives source clear and pruning of its original durable metadata snapshot',async t=>{
    const e=await setup(t),s=await register(e);await e.citations.attach(e.binding,request(s));const original=await get(e),engine=await createDocument(original.scenes);
    await e.registry.clear(e.binding,{generation:0,revision:1});
    for(let i=0;i<22;i++) {assert.equal((await engine.apply({id:'edit-'+i,actor:'human',baseRevision:i,slideId:'s1',op:{type:'element.move',id:'text',x:2+i/100,y:1}})).ok,true);assert.equal((await e.store.saveProject({...e.binding,baseRevision:i+1,scenes:engine.snapshot().scenes})).status,'saved');}
    const history=await e.store.listRevisions(e.binding);assert.equal(history.revisions.find(r=>r.revision===1).recoverable,false);
    for(let i=0;i<22;i++)assert.equal((await engine.undo()).ok,true);assert.deepEqual(engine.snapshot().scenes,original.scenes);
    assert.equal((await e.store.saveProject({...e.binding,baseRevision:23,scenes:engine.snapshot().scenes})).status,'saved');assert.equal((await inspect(e,24,[cid(1)],1,2)).citations[0].source,'stale-generation');
    await e.store.closeProjectStore();assert.deepEqual((await get(e)).scenes,original.scenes);
  });
}

export function writeScenes() {
  const scenes=seed(),el=scenes[0].elements[0];
  scenes[0].elements.push({id:'group',kind:'group',x:0,y:0,w:1,h:1,z:4,provenance:'human',group:{children:[{...structuredClone(el),id:'child',locked:true},{...structuredClone(el),id:'dup'},{...structuredClone(el),id:'dup'}]}});
  scenes[0].elements.push({id:'locked',kind:'shape',x:0,y:0,w:1,h:1,z:5,locked:true,provenance:'compiler'});return scenes;
}
