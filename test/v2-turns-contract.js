import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnService } from '../packages/agent/turns.ts';
import { endpoint, wire } from './v2-provider-fixture.js';
import { reviewedEdit, expectedReview } from './v2-provider-contract.js';
export const submission = (env,state,extra={}) => ({generation:state.generation,revision:state.revision,
  requestKey:crypto.randomUUID(), projectRevision:env.doc.revision, scope:structuredClone(env.plan.scope),
  request:'Review this wording.',reads:[{tool:'get_slide',args:{slideId:'s1'}}],contextChars:100000,
  maxOutputTokens:2048,limits:{maxExchanges:8,maxToolCalls:32,maxOutputTokensTotal:16384},...extra});
export const decision = (state,turn,extra={}) => ({generation:state.generation,revision:state.revision,
  proposalId:turn.proposal.id,proposalRevision:turn.proposal.revision,projectRevision:turn.projectRevision,
  decision:'approve',decisionKey:crypto.randomUUID(),...extra});
export async function fixture(t,setup,{backend,handler}={}) {
  const env=await setup(t),store=backend?.(env.store)??env.store,service=createTurnService(store);
  const http=await endpoint(t,'openai-compatible',handler??((_req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(wire('openai-compatible',[reviewedEdit()])));
  }));
  const state=await service.read(env.binding);
  return {...env,...http,service,state};
}
export async function proposed(env) {
  const submitted=await env.service.submit(env.binding,submission(env,await env.service.read(env.binding)));
  assert.equal(submitted.ok,true,JSON.stringify(submitted));
  const prepared=await env.service.prepare(env.binding,{generation:submitted.generation,revision:submitted.turn.revision,
    turnId:submitted.turn.id,workerId:'host-1'},env.provider);
  assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.turn.state,'awaiting-decision',JSON.stringify(prepared));
  return prepared;
}
export async function rows(env) {
  return env.store.withRuntimeTransaction(env.binding,async tx=>{
    const result={};for(const table of ['conversations','turns','proposals','attempts','runs'])result[table]=await tx.query(`SELECT * FROM v2_agent_${table} WHERE project_id=?`,[env.binding.id]);return result;
  });
}
export function turnContract(label,setup) {
  const check=(name,body)=>test(`${label}: ${name}`,{timeout:30000},t=>body(t));
  check('submit replay, conflicting identity and explicit generation cannot enqueue or duplicate',async t=>{
    const e=await fixture(t,setup),input=submission(e,e.state);
    const a=await e.service.submit(e.binding,input),b=await e.service.submit(e.binding,input);
    assert.equal(a.ok,true);assert.equal(a.turn.id,b.turn.id);
    assert.equal((await e.service.submit(e.binding,{...input,request:'different'})).code,'conflicting-request');
    assert.equal((await e.service.submit(e.binding,submission(e,{...e.state,revision:a.revision}))).code,'busy');
    assert.equal((await rows(e)).runs.length,1);assert.equal(e.seen.length,0);
    const cleared=await e.service.clear(e.binding,{generation:a.generation,revision:a.revision});assert.equal(cleared.ok,true);
    assert.equal((await e.service.submit(e.binding,input)).code,'stale-generation');
    assert.equal((await e.service.export(e.binding)).turns.length,0);
    assert.notEqual(cleared.generation,a.generation);
  });
  check('host reload approves stored canonical plan once, then replay survives own saved revision',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),reloaded=createTurnService(e.store),d=decision(p,p.turn);
    const queued=await reloaded.decide(e.binding,d);assert.equal(queued.ok,true);assert.equal(queued.turn.run.status,'queued');
    const run=queued.turn.run;
    const claim=await e.runtime.claim(e.binding,run.id,'run-host');const step=await e.runtime.advance(e.binding,run.id,claim.lease);
    assert.equal(step.run.status,'succeeded');assert.deepEqual((await e.store.getProject(e.binding)).doc.scenes,expectedReview(e.doc));
    const replay=await reloaded.decide(e.binding,d);assert.equal(replay.turn.run.id,run.id);assert.equal(replay.turn.run.status,'succeeded');
    assert.equal((await rows(e)).runs.length,2);assert.equal((await rows(e)).proposals[0].private_payload,'null');
    assert.equal((await reloaded.decide(e.binding,{...d,decision:'reject'})).code,'conflicting-decision');
    const state=await reloaded.read(e.binding);assert.equal(state.accounting.knownAttempts,1);
    assert.equal(state.accounting.knownInputTokens,42);assert.equal(state.accounting.reservedOutputTokens,2048);
  });
  check('all read/export/mutation operations recheck owner; copied export confers no authority',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),foreign={...e.binding,owner:'foreign'};
    for(const job of [()=>e.service.read(foreign),()=>e.service.export(foreign),()=>e.service.clear(foreign,{generation:p.generation,revision:p.revision}),
      ()=>e.service.decide(foreign,decision(p,p.turn))])await assert.rejects(job,{code:'not-found'});
    const dump=await e.service.export(e.binding);
    await assert.rejects(()=>e.service.decide(e.binding,dump));
    const text=JSON.stringify(await rows(e));
    for(const secret of ['fixture-private-key','Unrelated private slide','wireChars','"history"','"instructions"','"results"'])
      assert.equal(text.includes(secret),false,secret);
  });
  check('clear invalidates decisions, cancels linked runs, removes bodies and preserves deck/history/accounting',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),d=decision(p,p.turn),q=await e.service.decide(e.binding,d);
    const claim=await e.runtime.claim(e.binding,q.turn.run.id,'queued-worker');
    const before=(await e.service.read(e.binding)),cleared=await e.service.clear(e.binding,{generation:before.generation,revision:before.revision});
    assert.equal(cleared.ok,true);assert.equal(cleared.runs[0].status,'cancelled');
    assert.equal((await e.runtime.advance(e.binding,q.turn.run.id,claim.lease)).code,'terminal');
    const after=await e.service.read(e.binding);assert.deepEqual(after.accounting,before.accounting);assert.equal(after.turns.length,0);
    assert.equal((await e.service.decide(e.binding,d)).code,'stale-generation');
    const stored=await rows(e);assert.equal(stored.turns.length,0);assert.equal(stored.proposals.length,0);assert.equal(stored.attempts.length,0);
    assert.deepEqual((await e.store.getProject(e.binding)).doc,e.doc);
  });
  check('human save refuses new approval and preserves the pending visible proposal',async t=>{
    const e=await fixture(t,setup),p=await proposed(e);
    const scenes=structuredClone(e.doc.scenes);scenes[0].elements[0].paragraphs[0].runs[0].text='Human won';
    const saved=await e.store.saveProject({...e.binding,baseRevision:0,scenes});
    assert.equal((await e.service.decide(e.binding,decision(p,p.turn))).code,'stale-project');
    assert.deepEqual((await e.store.getProject(e.binding)).doc,saved.doc);assert.equal((await rows(e)).runs.length,1);
  });
  check('reject is durable/idempotent, removes private plan and permits an explicit fresh turn',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),d=decision(p,p.turn,{decision:'reject'});
    const rejected=await e.service.decide(e.binding,d);assert.equal(rejected.turn.state,'rejected');
    assert.equal((await e.service.decide(e.binding,d)).turn.state,'rejected');
    assert.equal((await rows(e)).proposals[0].private_payload,'null');
    assert.equal((await e.service.submit(e.binding,submission(e,await e.service.read(e.binding)))).ok,true);
  });
  check('visible reply overflow settles usage, refuses without truncation and never retries',async t=>{
    const e=await fixture(t,setup,{handler:(_req,res)=>{
      const w=wire('openai-compatible',[]);w.choices[0].finish_reason='stop';w.choices[0].message={role:'assistant',content:'x'.repeat(16001)};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(w));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state));
    const done=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(done.turn.state,'refused');assert.equal(done.turn.code,'result-too-large');assert.equal(done.turn.reply,null);
    const state=await e.service.read(e.binding);assert.equal(state.accounting.knownAttempts,1);assert.equal(state.accounting.knownOutputTokens,20);
    assert.equal(e.seen.length,1);assert.equal((await rows(e)).proposals.length,0);
  });
  check('publication loses to clear, but valid late usage settles once across generations',async t=>{
    let e;
    e=await fixture(t,setup,{handler:async(_req,res)=>{
      const s=await e.service.read(e.binding);await e.service.clear(e.binding,{generation:s.generation,revision:s.revision});
      const w=wire('openai-compatible',[reviewedEdit()]);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(w));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state));
    const done=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(done.ok,false);assert.equal(done.code,'lease-lost');
    const state=await e.service.read(e.binding);assert.equal(state.turns.length,0);assert.equal(state.accounting.knownAttempts,1);
    assert.equal(state.accounting.reservedOutputTokens,2048);assert.equal(state.accounting.unknownAttempts,0);
    assert.equal((await rows(e)).attempts.length,0);assert.equal(e.seen.length,1);
  });
}

export function clockBackend(store) {
  const clock={offset:0};
  return {clock,backend:{withRuntimeTransaction:(binding,job)=>store.withRuntimeTransaction(binding,tx=>job({...tx,now:async()=>await tx.now()+clock.offset}))}};
}
export function recoveryContract(label,setup) {
  const check=(name,body)=>test(`${label}: ${name}`,{timeout:30000},body);
  check('database-time expiry removes unapproved body and blocks approval at the boundary',async t=>{
    let clock;
    const e=await fixture(t,setup,{backend:store=>{const c=clockBackend(store);clock=c.clock;return c.backend;}});
    const p=await proposed(e);clock.offset=900001;
    const current=await e.service.read(e.binding);assert.equal(current.turns[0].state,'expired');
    assert.equal(current.turns[0].proposal.edits.length,0);
    assert.equal((await e.service.decide(e.binding,decision(current,p.turn))).code,'proposal-unavailable');
    assert.equal((await rows(e)).proposals[0].private_payload,'null');
  });
  check('precommit approval expiry rolls back both decision and canonical queue',async t=>{
    let fail=false;
    const e=await fixture(t,setup,{backend:store=>({withRuntimeTransaction:(binding,job)=>store.withRuntimeTransaction(binding,async tx=>{
      let guard;
      const value=await job({...tx,beforeCommit:g=>{guard=g;}});
      if(guard)tx.beforeCommit(async()=>{if(fail)throw Object.assign(new Error('fault'),{code:'runtime-fenced'});await guard();});
      return value;
    })})});
    const p=await proposed(e);fail=true;
    await assert.rejects(()=>e.service.decide(e.binding,decision(p,p.turn)),{code:'runtime-fenced'});
    fail=false;const stored=await rows(e);assert.equal(stored.runs.length,1);
    assert.equal(JSON.parse(stored.proposals[0].payload).decision,null);
    assert.equal((await e.service.read(e.binding)).turns[0].state,'awaiting-decision');
  });
  check('dispatched worker loss refuses automatic continuation and deadline-unknown usage survives clear once',async t=>{
    let clock,release,arrived;
    const waiting=new Promise(r=>{arrived=r;});
    const e=await fixture(t,setup,{backend:store=>{const c=clockBackend(store);clock=c.clock;return c.backend;},handler:async(_req,res)=>{
      arrived();await new Promise(r=>{release=r;});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(wire('openai-compatible',[reviewedEdit()])));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state));
    const prep=e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'lost-host'},e.provider);
    await waiting;clock.offset=31000;
    const lost=await e.service.read(e.binding);assert.equal(lost.turns[0].state,'needs-user-action');
    assert.equal((await e.service.prepare(e.binding,{generation:lost.generation,revision:lost.turns[0].revision,turnId:sub.turn.id,workerId:'new-host'},e.provider)).code,'needs-user-action');
    const cleared=await e.service.clear(e.binding,{generation:lost.generation,revision:lost.revision});assert.equal(cleared.ok,true);
    clock.offset=121000;const expired=await e.service.read(e.binding);
    assert.equal(expired.accounting.unknownAttempts,1);assert.equal(expired.accounting.knownAttempts,0);
    assert.equal((await rows(e)).attempts.length,0);
    release();assert.equal((await prep).code,'lease-lost');
    const after=await e.service.read(e.binding);assert.deepEqual(after.accounting,expired.accounting);assert.equal(e.seen.length,1);
  });
  check('project deletion cascades all new private and metadata child records',async t=>{
    const e=await fixture(t,setup);await proposed(e);
    await e.store.deleteProject(e.binding);
    await assert.rejects(()=>e.service.read(e.binding),{code:'not-found'});
    // A new project permits a trusted transaction to inspect cascade integrity.
    const fresh=await e.store.createProject({owner:'owner',title:'Cascade probe',scenes:e.doc.scenes});
    await e.store.withRuntimeTransaction({owner:'owner',id:fresh.doc.id},async tx=>{
      for(const table of ['conversations','turns','proposals','attempts'])assert.equal((await tx.query(`SELECT project_id FROM v2_agent_${table} WHERE project_id=?`,[e.binding.id])).length,0);
    });
  });
}

export function boundsContract(label,setup) {
  const check=(name,body)=>test(`${label}: ${name}`,{timeout:30000},body);
  check('escaped controls and multibyte text remain readable/exportable/clearable after publication',async t=>{
    const reply='\0'.repeat(9800)+'漢'.repeat(6200);
    const e=await fixture(t,setup,{handler:(_req,res)=>{
      const w=wire('openai-compatible',[]);w.choices[0].finish_reason='stop';w.choices[0].message={role:'assistant',content:reply};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(w));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state,{request:'\0'.repeat(8000)+'漢'.repeat(5000)}));
    const prepared=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(prepared.turn.state,'complete');
    const state=await e.service.read(e.binding);assert.equal(state.turns[0].reply,reply);
    assert.equal((await e.service.export(e.binding)).turns[0].reply,reply);
    assert.equal((await e.service.clear(e.binding,{generation:state.generation,revision:state.revision})).ok,true);
  });
  check('final publication rechecks preparation lease after row writes; settled usage is preserved',async t=>{
    let offset=0,trip=false;
    const e=await fixture(t,setup,{backend:store=>({withRuntimeTransaction:(binding,job)=>store.withRuntimeTransaction(binding,tx=>job({...tx,
      now:async()=>await tx.now()+offset,
      query:async(sql,params)=>{const r=await tx.query(sql,params);if(trip && sql.startsWith('INSERT INTO v2_agent_proposals'))offset=31000;return r;},
    }))})});
    const sub=await e.service.submit(e.binding,submission(e,e.state));trip=true;
    await assert.rejects(()=>e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider),{code:'invalid-document'});
    trip=false;const state=await e.service.read(e.binding);
    assert.equal(state.turns[0].state,'needs-user-action');assert.equal(state.accounting.knownAttempts,1);
    assert.equal((await rows(e)).proposals.length,0);assert.equal(e.seen.length,1);
  });
}

export function admissionContract(label,setup) {
  const check=(name,body)=>test(`${label}: ${name}`,{timeout:30000},body);
  for(const bound of ['turn-count','private-bytes'])check(`${bound} admission refuses before dispatch while read/export/clear remain available`,async t=>{
    const e=await fixture(t,setup,{handler:(_req,res)=>{
      const w=wire('openai-compatible',[]);w.choices[0].finish_reason='stop';w.choices[0].message={role:'assistant',content:'Done.'};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(w));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state));
    const done=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(done.turn.state,'complete');
    const data=await rows(e),template=data.turns[0];
    const {identityDigest,bytes,TURN_LIMITS}=await import('../packages/agent/turn-state.ts');
    await e.store.withRuntimeTransaction(e.binding,async tx=>{
      let privateBytes=bytes(JSON.parse(template.private_payload));
      for(let i=1;i<128;i++) {
        const meta=JSON.parse(template.payload),body=JSON.parse(template.private_payload);
        meta.id=crypto.randomUUID();meta.requestKey=`seed-${i}`;body.input.requestKey=meta.requestKey;
        if(bound==='private-bytes') {body.input.request='漢'.repeat(16000);body.reply='漢'.repeat(16000);}
        const {generation:_g,revision:_r,...identity}=body.input;meta.identity=await identityDigest(identity);
        if(privateBytes+bytes(body)>TURN_LIMITS.privateBytes)break;
        privateBytes+=bytes(body);
        await tx.query('INSERT INTO v2_agent_turns (id,project_id,generation,request_key,payload,private_payload) VALUES (?,?,?,?,?,?)',
          [meta.id,e.binding.id,meta.generation,meta.requestKey,JSON.stringify(meta),JSON.stringify(body)]);
      }
    });
    const full=await e.service.read(e.binding);
    if(bound==='turn-count')assert.equal(full.total,128);else assert.ok(full.storage.privateBytes>4*1024*1024-262144);
    assert.equal((await e.service.submit(e.binding,submission(e,full))).code,'storage-limit');
    assert.equal(e.seen.length,1);assert.equal((await e.service.export(e.binding)).turns.length,full.total);
    assert.equal((await e.service.clear(e.binding,{generation:full.generation,revision:full.revision})).ok,true);
    assert.equal((await e.service.read(e.binding)).total,0);
  });
  check('corrupt canonical digest refuses read/approve rather than executing a replacement plan',async t=>{
    const e=await fixture(t,setup),p=await proposed(e);
    await e.store.withRuntimeTransaction(e.binding,async tx=>{
      const meta=JSON.parse((await tx.query('SELECT payload FROM v2_agent_proposals WHERE id=?',[p.turn.proposal.id]))[0].payload);
      meta.digest='0'.repeat(64);await tx.query('UPDATE v2_agent_proposals SET payload=? WHERE id=?',[JSON.stringify(meta),meta.id]);
    });
    await assert.rejects(()=>e.service.read(e.binding),{code:'invalid-document'});
    await assert.rejects(()=>e.service.decide(e.binding,decision(p,p.turn)),{code:'invalid-document'});
    assert.equal((await rows(e)).runs.length,1);assert.deepEqual((await e.store.getProject(e.binding)).doc,e.doc);
  });
  check('reusing a committed decision key with different expected revisions is a conflict',async t=>{
    const e=await fixture(t,setup),p=await proposed(e),d=decision(p,p.turn);
    assert.equal((await e.service.decide(e.binding,d)).ok,true);
    assert.equal((await e.service.decide(e.binding,{...d,projectRevision:123})).code,'conflicting-decision');
    assert.equal((await e.service.decide(e.binding,d)).ok,true);
  });
}

export function settlementContract(label,setup) {
  test(`${label}: bounded cross-generation settlement slots refuse new dispatch and expire without blocking clear`,{timeout:30000},async t=>{
    let clock;
    const e=await fixture(t,setup,{backend:store=>{const c=clockBackend(store);clock=c.clock;return c.backend;}});
    const p=await proposed(e);await e.service.decide(e.binding,decision(p,p.turn,{decision:'reject'}));
    await e.store.withRuntimeTransaction(e.binding,async tx=>{
      const template=JSON.parse((await tx.query('SELECT payload FROM v2_agent_attempts WHERE project_id=?',[e.binding.id]))[0].payload);
      const head=JSON.parse((await tx.query('SELECT payload FROM v2_agent_conversations WHERE project_id=?',[e.binding.id]))[0].payload);
      const now=await tx.now();
      for(let i=0;i<128;i++) {
        const a={...template,id:crypto.randomUUID(),turnId:crypto.randomUUID(),generation:crypto.randomUUID(),state:'dispatched',usage:null,createdAt:now,settleBy:now+120000};
        await tx.query('INSERT INTO v2_agent_attempts (id,project_id,payload) VALUES (?,?,?)',[a.id,e.binding.id,JSON.stringify(a)]);
        head.accounting.reservedOutputTokens+=a.reservedOutputTokens;
      }
      await tx.query('UPDATE v2_agent_conversations SET payload=? WHERE project_id=?',[JSON.stringify(head),e.binding.id]);
    });
    const sub=await e.service.submit(e.binding,submission(e,await e.service.read(e.binding)));
    const denied=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(denied.turn.code,'settlement-limit');assert.equal(e.seen.length,1);
    const state=await e.service.read(e.binding);await e.service.clear(e.binding,{generation:state.generation,revision:state.revision});
    assert.equal((await rows(e)).attempts.length,128);
    clock.offset=121000;const expired=await e.service.read(e.binding);
    assert.equal(expired.accounting.unknownAttempts,128);assert.equal((await rows(e)).attempts.length,0);
    assert.equal((await e.service.submit(e.binding,submission(e,expired))).ok,true);
    assert.deepEqual(Object.keys(expired.accounting).sort(),['reservedOutputTokens','knownInputTokens','knownOutputTokens','knownCacheReadTokens','knownCacheWriteTokens','knownAttempts','unknownAttempts'].sort());
  });
}

export function unicodeContract(label,setup) {
  test(`${label}: 16000 supplementary Unicode characters fit visible chat without weakening provider wire limits`,{timeout:30000},async t=>{
    const text='😀'.repeat(16000);
    const e=await fixture(t,setup,{handler:(_req,res)=>{
      const w=wire('openai-compatible',[]);w.choices[0].finish_reason='stop';w.choices[0].message={role:'assistant',content:text};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(w));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state,{request:text}));
    const prepared=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider);
    assert.equal(prepared.turn.state,'complete');assert.equal(prepared.turn.reply,text);
    assert.equal((await e.service.read(e.binding)).turns[0].reply,text);
  });
}

export function cancellationContract(label,setup) {
  test(`${label}: caller abort during publication row writes cannot commit a visible result`,{timeout:30000},async t=>{
    const controller=new AbortController();let trip=false;
    const e=await fixture(t,setup,{backend:store=>({withRuntimeTransaction:(binding,job)=>store.withRuntimeTransaction(binding,tx=>job({...tx,
      query:async(sql,args)=>{const rows=await tx.query(sql,args);if(trip && sql.startsWith('INSERT INTO v2_agent_proposals'))controller.abort();return rows;},
    }))})});
    const sub=await e.service.submit(e.binding,submission(e,e.state));trip=true;
    const cancelled=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider,{signal:controller.signal});
    assert.equal(cancelled.turn.state,'cancelled');
    trip=false;const stored=await rows(e);assert.equal(stored.proposals.length,0);assert.equal(stored.runs.length,1);
    const state=await e.service.read(e.binding);assert.equal(state.accounting.knownAttempts,1);assert.equal(state.turns[0].reply,null);
    assert.equal((await e.service.cancel(e.binding,{generation:state.generation,revision:state.revision,turnId:sub.turn.id})).turn.state,'cancelled');
  });
}

export function abortRecoveryContract(label,setup) {
  for(const point of ['after-claim','during-provider'])test(`${label}: abort ${point} is durable and cannot recover into an automatic retry`,{timeout:30000},async t=>{
    const controller=new AbortController();let trip=false,clock;
    const e=await fixture(t,setup,{backend:store=>{
      const c=clockBackend(store);clock=c.clock;
      return {withRuntimeTransaction:(binding,job)=>c.backend.withRuntimeTransaction(binding,tx=>job({...tx,
        query:async(sql,args)=>{const rows=await tx.query(sql,args);if(trip && point==='after-claim' && sql.startsWith('INSERT INTO v2_agent_turns') && JSON.parse(args[4]).state==='preparing')controller.abort();return rows;},
      }))};
    },handler:(_req,res)=>{
      controller.abort();res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(wire('openai-compatible',[reviewedEdit()])));
    }});
    const sub=await e.service.submit(e.binding,submission(e,e.state));trip=true;
    const done=await e.service.prepare(e.binding,{generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'host'},e.provider,{signal:controller.signal});
    assert.equal(done.turn.state,'cancelled');clock.offset=31000;
    const state=await e.service.read(e.binding);assert.equal(state.turns[0].state,'cancelled');
    assert.equal((await e.service.prepare(e.binding,{generation:state.generation,revision:state.turns[0].revision,turnId:sub.turn.id,workerId:'retry'},e.provider)).code,'needs-user-action');
    assert.equal(e.seen.length,point==='after-claim'?0:1);
  });
}
