import assert from 'node:assert/strict';
import { setImmediate as checkpoint } from 'node:timers/promises';
import { createProjectSourceAppendix } from '../src/projects/source-appendix.js';
import { registerCited } from './v2-citation-export-fixture.js';
import { applyRequest } from './v2-source-appendix-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { MAX_RECOVERABLE_REVISIONS as MAX_RECOVERABLE } from '../src/projects/history.js';
const configured=api=>({preview:b=>api.preview(b,{theme:'warm-humanist'}),apply:(b,p)=>api.apply(b,applyRequest(p,{theme:'warm-humanist'}))});
const current=async e=>(await e.store.getProject(e.binding)).doc;
const snapshot=async e=>({doc:await current(e),history:await e.store.listRevisions(e.binding),catalog:await e.registry.inspect(e.binding)});
export function appendixContracts(check,setup){
 check('one atomic materialization preserves originals and retained bodies; clear and restoration keep ordinary copied text',async t=>{
  const e=await setup(t);await registerCited(e,25);const api=configured(createProjectSourceAppendix(e.store)),before=await snapshot(e),p=await api.preview(e.binding);assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.referenceCount,25);assert.deepEqual(await snapshot(e),before);
  const out=await api.apply(e.binding,p);assert.equal(out.ok,true,JSON.stringify(out));const doc=await current(e);assert.equal(doc.revision,2);assert.deepEqual(doc.scenes.slice(0,2),before.doc.scenes);assert.deepEqual((await e.registry.inspect(e.binding)).catalog,before.catalog.catalog);assert.ok(doc.scenes.slice(2).every(s=>s.layoutState==='detached'));
  assert.equal((await e.store.listRevisions(e.binding)).revisions.length,before.history.revisions.length+1);assert.equal((await api.apply(e.binding,p)).code,'stale-project');
  const admin=(await e.store.getProject({id:e.binding.id,owner:'foreign',admin:true})).doc;assert.ok(JSON.stringify(admin.scenes.slice(2)).includes('https://example.org/0'));
  const catalog=(await e.registry.inspect(e.binding)).catalog;assert.equal((await e.registry.clear(e.binding,{generation:catalog.generation,revision:catalog.revision})).ok,true);assert.deepEqual((await current(e)).scenes,doc.scenes);
  const restored=await e.store.restoreRevision({...e.binding,targetRevision:1,baseRevision:2});assert.equal(restored.status,'restored');assert.deepEqual(restored.doc.scenes,before.doc.scenes);assert.equal((await e.registry.inspect(e.binding)).catalog.count,0);
  const back=await e.store.restoreRevision({...e.binding,targetRevision:2,baseRevision:3});assert.equal(back.status,'restored');assert.deepEqual(back.doc.scenes,doc.scenes);
 });
 check('exact owner/null/admin, no-work and stale counters/design refuse without partial save',async t=>{
  const e=await setup(t);await registerCited(e);const api=createProjectSourceAppendix(e.store),p=await api.preview(e.binding,{theme:'warm-humanist'}),before=await snapshot(e);assert.equal(p.ok,true);
  for(const owner of ['foreign',null])assert.equal((await api.preview({...e.binding,owner},{theme:'warm-humanist'})).code,'not-found');assert.equal((await api.preview({...e.binding,admin:true})).code,'invalid-request');
  for(const [extra,code] of [[{sourceGeneration:1},'stale-catalog'],[{projectRevision:0},'stale-project'],[{designFingerprint:'f'.repeat(64)},'stale-design'],[{disclosure:'source-title-url-v1'},'consent-required']])assert.equal((await api.apply(e.binding,applyRequest(p,{theme:'warm-humanist',...extra}))).code,code);
  assert.deepEqual(await snapshot(e),before);const local=(await e.store.createProject({owner:null,title:'Local',scenes:seed()})).doc;const empty=await api.preview({id:local.id,owner:null});assert.equal(empty.ok,true);assert.equal(empty.pageCount,0);assert.equal((await e.store.getProject({id:local.id,owner:null})).doc.revision,0);
 });
 check('history-write fault rolls back all scenes/history; post-commit acknowledgement has no automatic retry',async t=>{
  const e=await setup(t);await registerCited(e);const api=configured(createProjectSourceAppendix(e.store)),p=await api.preview(e.binding),before=await snapshot(e),id=e.binding.id;
  if(e.dialect==='sqlite')await e.query(`CREATE TRIGGER appendix_failure BEFORE INSERT ON v2_project_revisions WHEN NEW.project_id='${id}' BEGIN SELECT RAISE(ABORT,'private injected fault'); END`);
  else{await e.query(`CREATE FUNCTION appendix_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id='${id}' THEN RAISE EXCEPTION 'private injected fault'; END IF; RETURN NEW; END $$`);await e.query('CREATE TRIGGER appendix_failure BEFORE INSERT ON v2_project_revisions FOR EACH ROW EXECUTE FUNCTION appendix_failure()');}
  let result;try{result=await api.apply(e.binding,p);}finally{await e.query(e.dialect==='sqlite'?'DROP TRIGGER appendix_failure':'DROP TRIGGER appendix_failure ON v2_project_revisions');if(e.dialect==='postgres')await e.query('DROP FUNCTION appendix_failure()');}
  assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('private injected'),false);assert.deepEqual(await snapshot(e),before);
  let calls=0;const uncertain=configured(createProjectSourceAppendix({...e.store,async withCitationTransaction(b,job){calls++;await e.store.withCitationTransaction(b,job);throw Error('private acknowledgement lost');}}));const unknown=await uncertain.apply(e.binding,p);assert.equal(unknown.code,'appendix-outcome-unknown');assert.equal(calls,1);assert.equal((await current(e)).revision,2);
 });
 check('competing saved change or source clear/delete wins before qualification without a partial appendix',async t=>{
  for(const operation of ['save','clear','delete']){
   const e=await setup(t);await registerCited(e);const api=configured(createProjectSourceAppendix(e.store)),p=await api.preview(e.binding);let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
   const holder=e.store.withCitationReadTransaction(e.binding,async()=>{entered();await gate;});await ready;
   const mutation=operation==='save'?e.store.renameProject({...e.binding,baseRevision:1,title:'Changed first'}):operation==='clear'?e.registry.clear(e.binding,{generation:0,revision:1}):e.store.deleteProject(e.binding);
   if(e.waitForLock)await e.waitForLock();else await checkpoint();const pending=api.apply(e.binding,p);t.after(async()=>{release();await Promise.allSettled([holder,mutation,pending]);});release();await mutation;await holder;
   assert.equal((await pending).code,operation==='save'?'stale-project':operation==='clear'?'stale-catalog':'not-found');if(operation!=='delete')assert.equal((await current(e)).scenes.length,2);
  }
 });
 check('canonical retention pruning remains bounded at the insertion boundary',async t=>{
  const e=await setup(t);await registerCited(e);let revision=1;
  for(let i=0;i<MAX_RECOVERABLE;i++){await e.store.renameProject({...e.binding,baseRevision:revision,title:'Retention '+i});revision++;}
  const api=configured(createProjectSourceAppendix(e.store)),p=await api.preview(e.binding),before=await current(e),out=await api.apply(e.binding,p);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.snapshot.projectRevision,revision+1);assert.deepEqual((await current(e)).scenes.slice(0,2),before.scenes);
  const rows=await e.query('SELECT revision,payload FROM v2_project_revisions WHERE project_id=? ORDER BY revision',[e.binding.id]);assert.equal(rows.filter(r=>r.payload!==null).length,MAX_RECOVERABLE);assert.equal(rows.find(r=>Number(r.revision)===0).payload,null);
 });
}
