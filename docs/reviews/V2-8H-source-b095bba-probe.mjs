import assert from 'node:assert/strict';
import { createTurnService } from '../../packages/agent/turns.ts';
import { seed } from '../../test/v2-tool-fixture.js';
import { spec } from '../../test/v2-runtime-fixture.js';
import { caps } from '../../test/v2-provider-fixture.js';

async function probe(point) {
  const controller=new AbortController();
  const binding={id:'probe',owner:'owner'},doc={id:'probe',revision:0,scenes:seed()};
  let committed={conversations:[],turns:[],proposals:[],attempts:[]};
  let queue=Promise.resolve(),offset=0,trip=false,calls=0,service;
  let afterCommit=async()=>{};
  const backend={async withRuntimeTransaction(b,job) {
    assert.deepEqual(b,binding);
    const operation=queue.then(async()=>{
      const data=structuredClone(committed);let guard;
      const tx={doc,now:async()=>Date.now()+offset,beforeCommit:g=>{guard=g;},query:async(sql,args=[])=>{
        const table=/v2_agent_(conversations|turns|proposals|attempts)/.exec(sql)?.[1];
        if(!table)throw new Error(`Unsupported probe SQL: ${sql}`);
        const rows=data[table];
        if(sql.startsWith('SELECT'))return structuredClone(rows);
        if(sql.startsWith('DELETE')) {
          data[table]=rows.filter(r=>sql.includes('WHERE id=?') ? r.id!==args[0] : r.project_id!==args[0]);
          return [];
        }
        if(sql.startsWith('UPDATE v2_agent_conversations')){rows[0].payload=args[0];return [];}
        if(sql.startsWith('INSERT INTO v2_agent_conversations')){rows.push({project_id:args[0],payload:args[1]});return [];}
        if(sql.startsWith('INSERT INTO v2_agent_turns')) {
          const row={id:args[0],project_id:args[1],generation:args[2],request_key:args[3],payload:args[4],private_payload:args[5]};
          const i=rows.findIndex(r=>r.id===row.id);if(i<0)rows.push(row);else rows[i]=row;
          if(trip && point==='mid-publication' && JSON.parse(row.payload).state==='complete') {
            trip=false;controller.abort();
          }
          return [];
        }
        if(sql.startsWith('INSERT INTO v2_agent_attempts')) {
          const row={id:args[0],project_id:args[1],payload:args[2]};
          const i=rows.findIndex(r=>r.id===row.id);if(i<0)rows.push(row);else rows[i]=row;
          return [];
        }
        throw new Error(`Unsupported probe SQL: ${sql}`);
      }};
      const value=await job(tx);await guard?.();committed=data;return value;
    });
    queue=operation.then(()=>{},()=>{});
    const value=await operation;
    await afterCommit(value);
    return value;
  }};
  service=createTurnService(backend);
  const input=state=>({generation:state.generation,revision:state.revision,requestKey:crypto.randomUUID(),
    projectRevision:0,scope:spec().scope,request:'Review.',reads:[{tool:'get_slide',args:{slideId:'s1'}}],
    contextChars:100000,maxOutputTokens:2048,limits:{maxExchanges:8,maxToolCalls:32,maxOutputTokensTotal:16384}});
  const initial=await service.read(binding),sub=await service.submit(binding,input(initial));
  const request={generation:sub.generation,revision:sub.turn.revision,turnId:sub.turn.id,workerId:'first'};
  const provider={profile:{id:'fixture',family:'openai-compatible',model:'fixture',capabilities:caps()},async exchange(){
    calls++;if(point==='during-provider')controller.abort();
    return {ok:true,providerId:'fixture',family:'openai-compatible',model:'fixture',outcome:'text',
      text:'Done.',calls:[],usage:{inputTokens:42,outputTokens:20}};
  }};
  let replacement;
  if(['after-claim','generation-race','fence-race'].includes(point))afterCommit=async value=>{
    if(!trip || value?.meta?.state!=='preparing')return;
    trip=false;controller.abort();
    if(point==='generation-race') {
      const state=await service.read(binding);
      const cleared=await service.clear(binding,{generation:state.generation,revision:state.revision});
      replacement=await service.submit(binding,input(cleared));
    }
    if(point==='fence-race') {
      offset=31000;const recovered=await service.read(binding);
      replacement=await service.prepare(binding,{...request,revision:recovered.turns[0].revision,workerId:'second'},provider);
    }
  };
  trip=true;
  const result=await service.prepare(binding,request,provider,{signal:controller.signal});
  await new Promise(resolve=>setTimeout(resolve,0));
  const state=await service.read(binding);
  if(point==='generation-race') {
    assert.equal(result.code,'lease-lost');assert.equal(state.generation,replacement.generation);
    assert.equal(state.turns[0].id,replacement.turn.id);assert.equal(state.turns[0].state,'submitted');assert.equal(calls,0);
    return {point,ok:true,staleResult:result.code,replacementState:state.turns[0].state,providerCalls:calls};
  }
  if(point==='fence-race') {
    assert.equal(result.code,'lease-lost');assert.equal(state.turns[0].id,replacement.turn.id);
    assert.equal(state.turns[0].state,'complete');assert.equal(state.turns[0].reply,'Done.');assert.equal(calls,1);
    return {point,ok:true,staleResult:result.code,replacementState:state.turns[0].state,providerCalls:calls};
  }
  assert.equal(result.turn.state,'cancelled');assert.equal(state.turns[0].state,'cancelled');assert.equal(state.turns[0].reply,null);
  assert.equal(committed.proposals.length,0);assert.equal(calls,point==='after-claim'?0:1);
  assert.equal(state.accounting.reservedOutputTokens,point==='after-claim'?0:2048);
  assert.equal(state.accounting.knownAttempts,point==='after-claim'?0:1);
  offset=31000;const later=await service.read(binding);
  assert.equal(later.turns[0].state,'cancelled');
  const retry=await service.prepare(binding,{...request,revision:later.turns[0].revision,workerId:'retry'},provider);
  assert.equal(retry.code,'needs-user-action');assert.equal(calls,point==='after-claim'?0:1);
  return {point,ok:true,state:later.turns[0].state,retry:retry.code,providerCalls:calls,
    reservedOutputTokens:state.accounting.reservedOutputTokens,knownAttempts:state.accounting.knownAttempts};
}

const results=[];
for(const point of ['after-claim','during-provider','mid-publication','generation-race','fence-race'])results.push(await probe(point));
console.log(JSON.stringify({implementationSha:'b095bbac40ccbe0be7a38724f7854b9e8e15d313',backend:'transactional in-memory fixture',
  modelApiCalls:0,localInference:0,databaseOperations:0,services:0,total:results.length,pass:results.length,results},null,2));
