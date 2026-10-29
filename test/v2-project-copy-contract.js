import assert from 'node:assert/strict';
import { setImmediate as checkpoint } from 'node:timers/promises';
import { createProjectCopier } from '../src/projects/copy.js';
import { source } from './v2-source-registry-fixture.js';
import { seed } from './v2-tool-fixture.js';
import { record, target } from './v2-citations-fixture.js';

export const copyRequest = (binding,sources) => {
  const scenes=seed();scenes[0].elements[0].paragraphs[0].runs[0].text='Unsaved human wording';
  scenes[0].citations=sources.map((s,i)=>record(i+1,{source:{projectId:binding.id,id:s.id,generation:0},target:i===0?target():target('orphan-'+i)}));
  return {title:'Live copy',scenes};
};
async function register(e,count=1) {
  const sources=Array.from({length:count},(_,i)=>source(e.binding.id,i,{excerpt:'界😀 original evidence.'}));
  let revision=0;
  for(let i=0;i<count;i+=24){const out=await e.registry.register(e.binding,{projectRevision:0,generation:0,revision,sources:sources.slice(i,i+24)});assert.equal(out.ok,true,JSON.stringify(out));revision=out.catalog.revision;}
  return sources;
}
async function counts(e) {return e.query('SELECT (SELECT count(*) FROM v2_projects) AS projects,(SELECT count(*) FROM v2_project_revisions) AS history,(SELECT count(*) FROM v2_project_sources) AS sources,(SELECT count(*) FROM v2_project_source_catalog) AS catalogs');}
export function projectCopyContracts(check,setup) {
  check('live copy preserves scenes and provenance, copies referenced sources only and retains independently',async t=>{
    const e=await setup(t),sources=await register(e,2),request=copyRequest(e.binding,[sources[0]]);
    request.scenes[0].citations.push(record(2,{source:{projectId:e.binding.id,id:sources[0].id,generation:0},target:target('missing'),locator:{kind:'snippet-utf8-v1',startByte:1,endByte:2}}));
    const before=(await e.store.getProject(e.binding)).doc;
    const newer=structuredClone(before.scenes);newer[1].elements[0].paragraphs[0].runs[0].text='Saved elsewhere';
    assert.equal((await e.store.saveProject({...e.binding,baseRevision:0,scenes:newer})).status,'saved');
    const original=(await e.store.getProject(e.binding)).doc,out=await createProjectCopier(e.store).copy(e.binding,request);
    assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.copiedSources,1);assert.equal(out.sourceSnapshot.projectRevision,1);assert.equal(out.project.revision,0);
    const expected=structuredClone(request.scenes),ref=out.project.scenes[0].citations[0].source;
    for(const c of expected[0].citations)c.source={...ref};assert.deepEqual(out.project.scenes,expected);
    assert.notEqual(ref.id,sources[0].id);assert.equal(ref.projectId,out.project.id);assert.equal(ref.generation,0);
    const binding={id:out.project.id,owner:e.binding.owner};
    const resolved=await e.registry.resolve(binding,{generation:0,ids:[ref.id]});assert.equal(resolved.ok,true);assert.equal(resolved.catalog.count,1);assert.equal(resolved.catalog.revision,1);
    assert.deepEqual(resolved.results[0].source,{...sources[0],id:ref.id,projectId:out.project.id});
    assert.equal((await e.store.listRevisions(binding)).revisions.length,1);
    assert.deepEqual((await e.store.getProject(e.binding)).doc,original);
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
    assert.equal((await e.store.deleteProject(e.binding)).removed,true);
    assert.equal((await e.registry.resolve(binding,{generation:0,ids:[ref.id]})).results[0].status,'found');
    assert.equal((await e.registry.clear(binding,{generation:0,revision:1})).ok,true);
    assert.deepEqual((await e.store.getProject(binding)).doc.scenes,out.project.scenes);
  });
  check('stale missing foreign and corrupt source copies refuse without destination effects',async t=>{
    const e=await setup(t),[s]=await register(e),request=copyRequest(e.binding,[s]),copy=createProjectCopier(e.store).copy,before=await counts(e);
    const missing=structuredClone(request);missing.scenes[0].citations[0].source.id='src_'+'a'.repeat(64);
    assert.equal((await copy(e.binding,missing)).code,'source-unavailable');assert.deepEqual(await counts(e),before);
    const foreign=structuredClone(request);foreign.scenes[0].citations[0].source.projectId='foreign';assert.equal((await copy(e.binding,foreign)).code,'invalid-request');
    await e.query('UPDATE v2_project_sources SET payload_bytes=payload_bytes+1 WHERE project_id=?',[e.binding.id]);
    const corrupt=await counts(e);assert.equal((await copy(e.binding,request)).code,'invalid-state');assert.deepEqual(await counts(e),corrupt);
    await e.query('UPDATE v2_project_sources SET payload_bytes=payload_bytes-1 WHERE project_id=?',[e.binding.id]);
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
    const cleared=await counts(e);assert.equal((await copy(e.binding,request)).code,'stale-catalog');assert.deepEqual(await counts(e),cleared);
  });
  check('exact owner and local-null binding confer no admin override or runtime destination capability',async t=>{
    const e=await setup(t),copy=createProjectCopier(e.store).copy,request={title:'Uncited',scenes:seed()};
    for(const owner of ['other',null])assert.equal((await copy({...e.binding,owner},request)).code,'not-found');
    assert.equal((await copy({...e.binding,owner:'other',admin:true},request)).code,'invalid-request');
    const {doc}=await e.store.createProject({owner:null,title:'Local',scenes:seed()});
    assert.equal((await copy({id:doc.id,owner:null},request)).ok,true);
    await e.store.withRuntimeTransaction(e.binding,tx=>assert.equal(tx.insertCopy,undefined));
    await e.store.withSourceTransaction(e.binding,tx=>assert.equal(tx.insertCopy,undefined));
    await e.store.withCitationTransaction(e.binding,tx=>assert.equal(tx.insertCopy,undefined));
  });
  check('more than one source page copies under one snapshot with bounded body reads',async t=>{
    const e=await setup(t),sources=await register(e,25),batches=[];
    const backend={withCopyTransaction:(binding,job)=>e.store.withCopyTransaction(binding,tx=>job({...tx,query:(sql,params)=>{
      if(sql.includes('source_id IN'))batches.push(params.length-1);return tx.query(sql,params);
    }}))};
    const start=performance.now(),out=await createProjectCopier(backend).copy(e.binding,copyRequest(e.binding,sources));
    assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.copiedSources,25);assert.deepEqual(batches,[24,1]);
    t.diagnostic(JSON.stringify({backend:e.dialect,sourceCount:25,copyMs:performance.now()-start,bodyBatches:batches}));
  });
  check('destination source insertion fault rolls back project catalog and create history',async t=>{
    const e=await setup(t),[s]=await register(e),before=await counts(e),id=e.binding.id;
    if(e.dialect==='sqlite')await e.query(`CREATE TRIGGER copy_fault BEFORE INSERT ON v2_project_sources WHEN NEW.project_id!='${id}' BEGIN SELECT RAISE(ABORT,'private copy fault'); END`);
    else {await e.query(`CREATE FUNCTION copy_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id!='${id}' THEN RAISE EXCEPTION 'private copy fault'; END IF; RETURN NEW; END $$`);await e.query('CREATE TRIGGER copy_fault BEFORE INSERT ON v2_project_sources FOR EACH ROW EXECUTE FUNCTION copy_fault()');}
    try {const out=await createProjectCopier(e.store).copy(e.binding,copyRequest(e.binding,[s]));assert.equal(out.code,'storage-unavailable');assert.equal(JSON.stringify(out).includes('private copy fault'),false);}
    finally {await e.query(e.dialect==='sqlite'?'DROP TRIGGER copy_fault':'DROP TRIGGER copy_fault ON v2_project_sources');if(e.dialect==='postgres')await e.query('DROP FUNCTION copy_fault()');}
    assert.deepEqual(await counts(e),before);
  });
  check('parent lock serializes clear after copy without revoking copied sources',async t=>{
    const e=await setup(t),[s]=await register(e);let release,entered;
    const ready=new Promise(r=>entered=r),held=new Promise(r=>release=r);t.after(()=>release());
    const backend={withCopyTransaction:(binding,job)=>e.store.withCopyTransaction(binding,async tx=>{entered();await held;return job(tx);})};
    const pending=createProjectCopier(backend).copy(e.binding,copyRequest(e.binding,[s]));await ready;
    let settled=false;const clearing=e.registry.clear(e.binding,{generation:0,revision:1}).then(r=>{settled=true;return r;});
    if(e.waitForLock)await e.waitForLock();else await checkpoint();
    assert.equal(settled,false);release();const out=await pending;assert.equal(out.ok,true);assert.equal((await clearing).ok,true);
    const ref=out.project.scenes[0].citations[0].source;
    assert.equal((await e.registry.resolve({id:out.project.id,owner:e.binding.owner},{generation:0,ids:[ref.id]})).results[0].status,'found');
  });
}
