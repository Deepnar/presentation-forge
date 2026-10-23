import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createTurnService } from '../../packages/agent/turns.ts';
import { seed } from '../../test/v2-tool-fixture.js';
import { spec } from '../../test/v2-runtime-fixture.js';
import { caps } from '../../test/v2-provider-fixture.js';
import { reviewedEdit } from '../../test/v2-provider-contract.js';

const broken=process.argv.includes('--expect-broken');
const implementationSha=broken?'cc3ed185afda2058afa6f9b177f2d497fe30719c':'ac8749613bfbd927dab629f479d3d05f10a99195';
const source=await readFile(new URL('../../packages/agent/turns.ts',import.meta.url));
assert.deepEqual(source,execFileSync('git',['show',`${implementationSha}:packages/agent/turns.ts`]),'Probe requires its named frozen source.');

async function run(operation) {
  let committed=Object.fromEntries(['conversations','turns','proposals','attempts','runs','receipts'].map(table=>[table,[]]));
  let queue=Promise.resolve(),providerCalls=0;
  const projects=Object.fromEntries(['A','B'].map(id=>[id,{id,owner:'owner',revision:0,scenes:seed()}]));
  const backend={async withRuntimeTransaction(bound,job) {
    const authority={...bound};
    if(projects[authority.id]?.owner!==authority.owner)throw Object.assign(new Error('Project unavailable.'),{code:'not-found'});
    const pending=queue.then(async()=>{
      const data=structuredClone(committed);let guard;
      const tx={doc:structuredClone(projects[authority.id]),now:async()=>Date.now(),beforeCommit:g=>{guard=g;},query:async(sql,args=[])=>{
        const table=/v2_agent_(conversations|turns|proposals|attempts|runs|receipts)/.exec(sql)?.[1];
        if(!table)throw new Error(`Unsupported probe SQL: ${sql}`);
        const rows=data[table];
        if(sql.startsWith('SELECT')) {
          const selected=table==='receipts'?rows.filter(r=>r.run_id===args[0]):
            sql.includes('WHERE id=? AND project_id=?')?rows.filter(r=>r.id===args[0] && r.project_id===args[1]):
            sql.includes('AND request_key=?')?rows.filter(r=>r.project_id===args[0] && r.request_key===args[1]):rows.filter(r=>r.project_id===args[0]);
          return structuredClone(selected);
        }
        if(sql.startsWith('DELETE')) {
          data[table]=rows.filter(r=>sql.includes('WHERE id=?')?!(r.id===args[0] && r.project_id===args[1]):r.project_id!==args[0]);
          return [];
        }
        if(sql.startsWith('UPDATE')) {
          const row=table==='conversations'?rows.find(r=>r.project_id===args[1]):rows.find(r=>r.id===args[1] && r.project_id===args[2]);
          if(row)row.payload=args[0];return [];
        }
        let row;
        if(table==='conversations')row={project_id:args[0],payload:args[1]};
        if(table==='turns')row={id:args[0],project_id:args[1],generation:args[2],request_key:args[3],payload:args[4],private_payload:args[5]};
        if(table==='proposals')row={id:args[0],project_id:args[1],turn_id:args[2],payload:args[3],private_payload:args[4]};
        if(table==='attempts')row={id:args[0],project_id:args[1],payload:args[2]};
        if(table==='runs')row={id:args[0],project_id:args[1],request_key:args[2],payload:args[3]};
        if(!sql.startsWith('INSERT') || !row)throw new Error(`Unsupported probe SQL: ${sql}`);
        const i=rows.findIndex(r=>row.id?r.id===row.id:r.project_id===row.project_id);
        if(i<0)rows.push(row);else rows[i]=row;return [];
      }};
      const value=await job(tx);await guard?.();committed=data;return value;
    });
    queue=pending.then(()=>{},()=>{});return pending;
  }};
  const service=createTurnService(backend),a={id:'A',owner:'owner'},b={id:'B',owner:'owner'};
  const input=state=>({generation:state.generation,revision:state.revision,requestKey:crypto.randomUUID(),projectRevision:0,
    scope:spec().scope,request:'Review.',reads:[{tool:'get_slide',args:{slideId:'s1'}}],contextChars:100000,maxOutputTokens:2048,
    limits:{maxExchanges:8,maxToolCalls:32,maxOutputTokensTotal:16384}});
  const provider={profile:{id:'fixture',family:'openai-compatible',model:'fixture',capabilities:caps()},async exchange(){
    providerCalls++;return {ok:true,providerId:'fixture',family:'openai-compatible',model:'fixture',outcome:'tool-calls',text:'',
      calls:[{id:crypto.randomUUID(),request:reviewedEdit()}],usage:{inputTokens:42,outputTokens:20}};
  }};
  const prepare=state=>service.prepare(a,{generation:state.generation,revision:state.turn.revision,turnId:state.turn.id,workerId:'host'},provider);
  const decision=state=>({generation:state.generation,revision:state.revision,proposalId:state.turn.proposal.id,
    proposalRevision:state.turn.proposal.revision,projectRevision:0,decision:'approve',decisionKey:crypto.randomUUID()});
  const bTurn=await service.submit(b,input(await service.read(b)));
  const bRows=()=>Object.fromEntries(Object.entries(committed).map(([table,rows])=>[table,rows.filter(r=>r.project_id==='B')]));
  const bBefore=structuredClone(bRows());
  let state=await service.read(a);
  if(operation!=='submit')state=await service.submit(a,input(state));
  if(['read','export','cancel','decide'].includes(operation)) {
    state=await prepare(state);
    if(operation!=='decide')state=await service.decide(a,decision(state));
  }
  const shared={...a};
  const actions={read:()=>service.read(shared),export:()=>service.export(shared),submit:()=>service.submit(shared,input(state)),
    clear:()=>service.clear(shared,{generation:state.generation,revision:state.revision}),
    cancel:()=>service.cancel(shared,{generation:state.generation,revision:state.revision,turnId:state.turn.id}),
    decide:()=>service.decide(shared,decision(state)),
    prepare:()=>service.prepare(shared,{generation:state.generation,revision:state.turn.revision,turnId:state.turn.id,workerId:'reuse-host'},provider)};
  const pending=actions[operation]();shared.id='B';
  const value=await pending,bAfter=await service.read(b);
  let aAfter,aError;try{aAfter=await service.read(a);}catch(error){aError=error.code;}
  assert.equal(value.ok,true);
  if(broken) {
    assert.equal(bAfter.total,0);assert.equal(aError,'invalid-document');
    return {operation,authenticatedProject:'A',callerReusedFor:'B',clearResult:true,bVisibleTurns:bAfter.total,aReadError:aError};
  }
  assert.equal(aError,undefined);assert.equal(aAfter.total,operation==='clear'?0:1);
  assert.equal(bAfter.turns[0].id,bTurn.turn.id);assert.deepEqual(bRows(),bBefore);
  if(['read','export'].includes(operation))assert.equal(value.turns[0].run.id,state.turn.run.id);
  if(operation==='submit')assert.equal(value.turn.state,'submitted');
  if(operation==='clear')assert.equal(committed.turns.filter(r=>r.project_id==='A').length,0);
  if(operation==='cancel')assert.equal(value.turn.run.status,'cancelled');
  if(operation==='decide')assert.equal(value.turn.run.status,'queued');
  if(operation==='prepare')assert.equal(value.turn.state,'awaiting-decision');
  return {operation,ok:true,aVisibleTurns:aAfter.total,bVisibleTurns:bAfter.total,bRowsUnchanged:true,providerFixtureCalls:providerCalls};
}

const results=[];
for(const operation of broken?['clear']:['read','export','submit','clear','cancel','decide','prepare'])results.push(await run(operation));
console.log(JSON.stringify({implementationSha,sourceSha256:createHash('sha256').update(source).digest('hex'),
  backend:'serialized transactional in-memory fixture',mode:broken?'historical defect reproduction':'correction verification',
  modelApiCalls:0,localInference:0,databaseOperations:0,services:0,total:results.length,pass:results.length,results},null,2));
