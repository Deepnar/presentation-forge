import assert from 'node:assert/strict';
import { setImmediate as checkpoint } from 'node:timers/promises';
import { createProjectCitationExporter } from '../src/projects/citation-export.js';
import { registerCited,request } from './v2-citation-export-fixture.js';
import { seed } from './v2-tool-fixture.js';
const state=async e=>({project:await e.store.getProject(e.binding),history:await e.store.listRevisions(e.binding),catalog:await e.registry.inspect(e.binding),
  rows:await e.query('SELECT source_id,payload,payload_bytes FROM v2_project_sources WHERE project_id=? ORDER BY source_id',[e.binding.id])});
export function exportContracts(check,setup) {
  check('read-only saved export checks every source page under one exact-owner snapshot',async t=>{
    const e=await setup(t),{q}=await registerCited(e,25),before=await state(e),batches=[];let held=false;
    const backend={withCitationReadTransaction:(b,job)=>e.store.withCitationReadTransaction(b,async tx=>{
      held=true;try{return await job({...tx,query:(sql,params)=>{if(sql.includes('source_id IN'))batches.push(params.length-1);return tx.query(sql,params);}});}finally{held=false;}
    })};
    const start=performance.now(),out=await createProjectCitationExporter(backend).render(e.binding,q);
    assert.equal(out.ok,true,JSON.stringify(out));assert.equal(held,false);assert.equal(out.citationCount,25);assert.deepEqual(batches,[24,1]);assert.deepEqual(await state(e),before);
    t.diagnostic(JSON.stringify({backend:e.dialect,citations:25,renderMs:performance.now()-start,bodyBatches:batches}));
  });
  check('owner foreign null admin and stale catalog/project boundaries cannot grant disclosure',async t=>{
    const e=await setup(t),{q}=await registerCited(e),exporter=createProjectCitationExporter(e.store);
    for(const owner of ['foreign',null])assert.equal((await exporter.render({...e.binding,owner},q)).code,'not-found');
    assert.equal((await exporter.render({...e.binding,owner:'foreign',admin:true},q)).code,'invalid-request');
    const {doc}=await e.store.createProject({owner:null,title:'Local',scenes:seed()}),b={id:doc.id,owner:null};
    assert.equal((await exporter.renderUncited(b,{projectRevision:0,sourceGeneration:0,sourceRevision:0})).ok,true);
    assert.equal((await exporter.inspect({...b,owner:'owner'})).code,'not-found');
    await e.store.renameProject({...e.binding,baseRevision:1,title:'New title'});
    assert.equal((await exporter.render(e.binding,q)).code,'stale-project');
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).ok,true);
    assert.equal((await exporter.render(e.binding,{...q,projectRevision:2})).code,'stale-catalog');
    assert.equal((await exporter.render(e.binding,{...q,projectRevision:2,sourceGeneration:1,sourceRevision:2})).code,'stale-catalog');
  });
  check('corrupt bodies and storage faults refuse without changing scene history or leaking errors',async t=>{
    const e=await setup(t),{q}=await registerCited(e),before=await state(e),broken=createProjectCitationExporter({withCitationReadTransaction:(b,job)=>e.store.withCitationReadTransaction(b,tx=>job({...tx,query:async(sql,params)=>{
      if(sql.includes('source_id IN'))throw Error('private source credential');return tx.query(sql,params);
    }}))});
    const out=await broken.render(e.binding,q);assert.equal(out.code,'storage-unavailable');assert.equal(JSON.stringify(out).includes('private source'),false);assert.deepEqual(await state(e),before);
    await e.query('UPDATE v2_project_sources SET payload_bytes=payload_bytes+1 WHERE project_id=?',[e.binding.id]);
    assert.equal((await createProjectCitationExporter(e.store).render(e.binding,q)).code,'invalid-state');
    await e.query('UPDATE v2_project_sources SET payload_bytes=payload_bytes-1 WHERE project_id=?',[e.binding.id]);
    assert.equal((await createProjectCitationExporter(e.store).render(e.binding,q)).ok,true);
  });
  check('clear waits for qualification; portable snapshot remains valid after the lock is released',async t=>{
    const e=await setup(t),{q}=await registerCited(e);let entered,release,cleared=false;
    const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
    const exporter=createProjectCitationExporter({withCitationReadTransaction:(b,job)=>e.store.withCitationReadTransaction(b,async tx=>{const result=await job(tx);entered();await gate;return result;})});
    const pending=exporter.render(e.binding,q);let clearing;t.after(async()=>{release();await Promise.allSettled([pending,clearing]);});await ready;
    clearing=e.registry.clear(e.binding,{generation:0,revision:1}).then(r=>{cleared=true;return r;});
    if(e.waitForLock)await e.waitForLock();else await checkpoint();assert.equal(cleared,false);release();
    const [out,c]=await Promise.all([pending,clearing]);assert.equal(out.ok,true);assert.equal(c.ok,true);
    assert.equal((await exporter.render(e.binding,q)).code,'stale-catalog');
  });
  check('save clear and delete winning the parent lock invalidate already inspected counters',async t=>{
    for(const operation of ['save','clear','delete']) {
      const e=await setup(t),{q}=await registerCited(e);let release,entered;
      const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
      const holder=e.store.withCitationReadTransaction(e.binding,async()=>{entered();await gate;});await ready;
      let mutation;
      if(operation==='save')mutation=e.store.renameProject({...e.binding,baseRevision:1,title:'Saved first'});
      else if(operation==='clear')mutation=e.registry.clear(e.binding,{generation:0,revision:1});else mutation=e.store.deleteProject(e.binding);
      if(e.waitForLock)await e.waitForLock();else await checkpoint();
      const pending=createProjectCitationExporter(e.store).render(e.binding,q);
      t.after(async()=>{release();await Promise.allSettled([holder,mutation,pending]);});release();await mutation;await holder;
      assert.equal((await pending).code,operation==='save'?'stale-project':operation==='clear'?'stale-catalog':'not-found');
    }
  });
}
