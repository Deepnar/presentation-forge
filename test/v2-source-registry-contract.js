import assert from 'node:assert/strict';
import { createSourceRegistry } from '../src/projects/sources.js';
import { createTurnService } from '../packages/agent/turns.ts';
import { source } from './v2-source-registry-fixture.js';
export function contracts(check, setup) {
  const stamp = c => ({ generation: c.generation, revision: c.revision });
  const snapshot = result => { assert.equal(result.ok,true,JSON.stringify(result)); return result.catalog; };
  const register = (e, sources, c={generation:0,revision:0}) => e.registry.register(e.binding,{ projectRevision:0,generation:c.generation,revision:c.revision,sources });
  check('immutable lifecycle, provenance, ordered resolution and snapshot paging',async t=>{
    const e=await setup(t), s=source(e.binding.id), s2=source(e.binding.id,1);
    assert.equal(snapshot(await e.registry.inspect(e.binding)).count,0);
    const added=await register(e,[s,s2]), c=snapshot(added); assert.equal(c.revision,1); assert.equal(c.count,2);
    const again=await register(e,[{...s,publishedAt:'',searchProvider:'later',retrievedAt:'2026-10-29'}],c);
    assert.equal(again.status,'noop'); assert.deepEqual(again.sources,[s]); assert.deepEqual(again.catalog,c);
    const resolved=await e.registry.resolve(e.binding,{generation:0,ids:[s2.id,source(e.binding.id,88).id,s.id,source('foreign').id]});
    assert.deepEqual(resolved.results.map(r=>r.status),['found','missing','found','missing']);
    assert.deepEqual(resolved.results[0].source,s2);
    const page=await e.registry.list(e.binding,{generation:0,revision:1,limit:1}); assert.ok(page.cursor);
    const next=await e.registry.list(e.binding,{generation:0,revision:1,limit:1,cursor:page.cursor});
    assert.equal(next.cursor,null); assert.deepEqual([...page.sources,...next.sources].map(s=>s.id),[s.id,s2.id].sort());
    const changed=await register(e,[source(e.binding.id,2)],c); snapshot(changed);
    assert.equal((await e.registry.list(e.binding,{generation:0,revision:1,limit:1,cursor:page.cursor})).code,'stale-catalog');
    assert.equal((await register(e,[s])).code,'stale-catalog');
  });
  check('exact owner and local-owner isolation with no admin override',async t=>{
    const e=await setup(t), s=source(e.binding.id); snapshot(await register(e,[s]));
    for(const b of [{...e.binding,owner:'foreign'},{...e.binding,owner:null}]) {
      for(const call of [()=>e.registry.inspect(b),()=>e.registry.resolve(b,{generation:0,ids:[s.id]}),()=>e.registry.clear(b,{generation:0,revision:1})]) assert.equal((await call()).code,'not-found');
    }
    const {doc}=await e.store.createProject({owner:null,title:'Local',scenes:e.doc.scenes}); t.after(()=>e.store.deleteProject({owner:null,id:doc.id}));
    const local={owner:null,id:doc.id}; assert.equal((await e.registry.inspect(local)).ok,true);
    assert.equal((await e.registry.inspect({...local,owner:'owner'})).code,'not-found');
  });
  check('clear fences absent and populated generations without changing deck history or chat',async t=>{
    const e=await setup(t), turns=createTurnService(e.store), chat=await turns.read(e.binding);
    const empty=snapshot(await e.registry.clear(e.binding,{generation:0,revision:0})); assert.equal(empty.generation,1); assert.equal(empty.revision,1);
    assert.equal((await register(e,[source(e.binding.id)])).code,'stale-catalog');
    const stored=snapshot(await register(e,[source(e.binding.id)],empty));
    const before=await e.store.getProject(e.binding), history=await e.store.listRevisions(e.binding);
    await turns.clear(e.binding,{generation:chat.generation,revision:chat.revision});
    assert.deepEqual(snapshot(await e.registry.inspect(e.binding)),stored);
    const cleared=snapshot(await e.registry.clear(e.binding,stamp(stored))); assert.equal(cleared.count,0); assert.equal(cleared.generation,2);
    assert.equal((await e.registry.clear(e.binding,stamp(stored))).code,'stale-catalog');
    assert.equal((await e.registry.resolve(e.binding,{generation:1,ids:[source(e.binding.id).id]})).code,'stale-catalog');
    assert.deepEqual(await e.store.getProject(e.binding),before); assert.deepEqual(await e.store.listRevisions(e.binding),history);
  });
  check('saved project revisions reject stale registration and history restore preserves sources',async t=>{
    const e=await setup(t), s=source(e.binding.id); const c=snapshot(await register(e,[s]));
    const scenes=structuredClone(e.doc.scenes); scenes[0].elements[0].paragraphs[0].runs[0].text='Human correction';
    await e.store.saveProject({...e.binding,baseRevision:0,scenes});
    assert.equal((await register(e,[source(e.binding.id,1)],c)).code,'stale-project');
    await e.store.restoreRevision({...e.binding,baseRevision:1,targetRevision:0});
    assert.deepEqual(snapshot(await e.registry.inspect(e.binding)),c);
  });
  check('orphan and corrupted metadata fail closed while valid-catalog clear recovers body drift',async t=>{
    const e=await setup(t), s=source(e.binding.id); const c=snapshot(await register(e,[s]));
    await e.query('UPDATE v2_project_sources SET payload=? WHERE project_id=?',['{broken',e.binding.id]);
    assert.equal((await e.registry.inspect(e.binding)).code,'invalid-state');
    const cleared=snapshot(await e.registry.clear(e.binding,stamp(c)));
    snapshot(await register(e,[s],cleared));
    await e.query('DELETE FROM v2_project_source_catalog WHERE project_id=?',[e.binding.id]);
    assert.equal((await e.registry.inspect(e.binding)).code,'invalid-state');
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:0})).code,'invalid-state');
  });
  check('unknown policy and counter overflow refuse without resetting authority',async t=>{
    const e=await setup(t); snapshot(await register(e,[source(e.binding.id)]));
    await e.query('UPDATE v2_project_source_catalog SET policy_version=2 WHERE project_id=?',[e.binding.id]);
    assert.equal((await e.registry.clear(e.binding,{generation:0,revision:1})).code,'invalid-state');
    await e.query('UPDATE v2_project_source_catalog SET policy_version=1,generation=?,revision=? WHERE project_id=?',[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,e.binding.id]);
    assert.equal((await e.registry.clear(e.binding,{generation:Number.MAX_SAFE_INTEGER,revision:Number.MAX_SAFE_INTEGER})).code,'invalid-state');
    assert.equal((await e.registry.resolve(e.binding,{generation:Number.MAX_SAFE_INTEGER,ids:[source(e.binding.id).id]})).ok,true);
  });
  check('failed second insert rolls back the entire batch and catalog',async t=>{
    const e=await setup(t), broken=createSourceRegistry({withSourceTransaction:(b,job)=>e.store.withSourceTransaction(b,tx=>{
      let inserts=0; return job({...tx,query:async(sql,params)=>{if(sql.startsWith('INSERT INTO v2_project_sources') && ++inserts===2)throw new Error('private fault');return tx.query(sql,params);}});
    })});
    const result=await broken.register(e.binding,{projectRevision:0,generation:0,revision:0,sources:[source(e.binding.id),source(e.binding.id,1)]});
    assert.equal(result.code,'storage-unavailable'); assert.equal(snapshot(await e.registry.inspect(e.binding)).count,0);
    assert.equal((await e.query('SELECT source_id FROM v2_project_sources WHERE project_id=?',[e.binding.id])).length,0);
  });
  check('count and actual byte ceilings refuse whole batches with unchanged counters',async t=>{
    const e=await setup(t);
    async function seed(count,big) {
      await e.store.withSourceTransaction(e.binding,async tx=>{
        await tx.query('DELETE FROM v2_project_sources WHERE project_id=?',[e.binding.id]); let bytes=0;
        for(let i=0;i<count;i++) {const s=source(e.binding.id,i,big?{title:'界'.repeat(500),excerpt:'界'.repeat(2000),url:`https://example.org/${i}/`+'p'.repeat(1900)}:{}), payload=JSON.stringify(s),n=Buffer.byteLength(payload); bytes+=n;
          await tx.query('INSERT INTO v2_project_sources(project_id,source_id,payload,payload_bytes) VALUES(?,?,?,?)',[e.binding.id,s.id,payload,n]);}
        await tx.query('INSERT INTO v2_project_source_catalog(project_id,generation,revision,count,bytes,policy_version) VALUES(?,0,1,?,?,1) ON CONFLICT(project_id) DO UPDATE SET count=excluded.count,bytes=excluded.bytes',[e.binding.id,count,bytes]);
      });
    }
    await seed(512,false); const count=snapshot(await e.registry.inspect(e.binding));
    assert.equal((await register(e,[source(e.binding.id,999)],count)).code,'capacity-exceeded');
    assert.deepEqual(snapshot(await e.registry.inspect(e.binding)),count);
    await seed(420,true); const bytes=snapshot(await e.registry.inspect(e.binding)); assert.ok(bytes.bytes<4194304);
    const batch=Array.from({length:24},(_,i)=>source(e.binding.id,1000+i,{title:'界'.repeat(500),excerpt:'界'.repeat(2000),url:`https://example.org/${1000+i}/`+'p'.repeat(1900)}));
    assert.equal((await register(e,batch,bytes)).code,'capacity-exceeded'); assert.deepEqual(snapshot(await e.registry.inspect(e.binding)),bytes);
  });
  check('parent locking serializes clear against a stale in-flight registration',async t=>{
    const e=await setup(t); snapshot(await register(e,[source(e.binding.id)]));
    let release, entered; const gate=new Promise(r=>{release=r;}), started=new Promise(r=>{entered=r;});
    const clearing=createSourceRegistry({withSourceTransaction:(b,job)=>e.store.withSourceTransaction(b,async tx=>{entered();await gate;return job(tx);})});
    const clear=clearing.clear(e.binding,{generation:0,revision:1}); await started;
    const stale=register(e,[source(e.binding.id,1)],{generation:0,revision:1});
    release(); assert.equal((await clear).ok,true); assert.equal((await stale).code,'stale-catalog');
    assert.equal(snapshot(await e.registry.inspect(e.binding)).count,0);
  });
  check('canonical project delete cascades sources even from a cold adapter process',async t=>{
    const e=await setup(t); snapshot(await register(e,[source(e.binding.id)]));
    await e.coldDelete();
    assert.equal((await e.registry.inspect(e.binding)).code,'not-found');
    for(const table of ['v2_project_sources','v2_project_source_catalog']) assert.equal((await e.raw(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`,[e.binding.id]))[0].n.toString(),'0');
  });
}
