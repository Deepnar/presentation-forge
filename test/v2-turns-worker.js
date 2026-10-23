import { readFile, writeFile, access } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { projectStore } from '../src/projects/backend.js';
import { createTurnService } from '../packages/agent/turns.ts';
import { createRuntime } from '../packages/agent/runtime.ts';
import { reviewedEdit } from './v2-provider-contract.js';
import { caps } from './v2-provider-fixture.js';
const command=JSON.parse(await readFile(process.argv[2],'utf8')),store=await projectStore();
const {binding,input,action,fault,ready,go}=command;
async function barrier(){
  if(!ready)return;
  await writeFile(ready,'ready');
  for(let i=0;i<1000;i++) {try{await access(go);return;}catch{}await sleep(10);}
  throw new Error('barrier timeout');
}
const backend={withRuntimeTransaction:async(b,job)=>{
  let trip=false;
  const result=await store.withRuntimeTransaction(b,async tx=>{
    const value=await job({...tx,query:async(sql,args)=>{
      const rows=await tx.query(sql,args);
      if(sql.startsWith('INSERT INTO v2_agent_attempts')) {
        const a=JSON.parse(args[2]);
        if(fault==='reserve-after' && a.state==='reserved' || fault==='reserve-after-read' && a.step===1 && a.state==='reserved' ||
          fault==='dispatch-after' && a.state==='dispatched' || fault==='receipt-after' && a.state==='known')trip=true;
      }
      return rows;
    }});
    if((fault==='approve-before' && value?.turn?.state==='approved') ||
      (fault==='publication-before' && value?.turn?.state==='awaiting-decision'))process.exit(91);
    if((fault==='approve-after' && value?.turn?.state==='approved') ||
      (fault==='publication-after' && value?.turn?.state==='awaiting-decision'))trip=true;
    return value;
  });
  if(trip)process.exit(91);
  return result;
}};
try {
  const service=createTurnService(backend);
  let value;
  if(action==='prepare') {
    let n=0;
    const provider={profile:{id:'fixture-provider',family:'openai-compatible',model:'operator-model',capabilities:caps()},
      exchange:async()=>{
        await barrier();
        const read=fault==='reserve-after-read' && n++===0;
        return {ok:true,providerId:'fixture-provider',family:'openai-compatible',model:'operator-model',outcome:'tool-calls',text:'',
          calls:[{id:read?'read-1':'edit-1',request:read?{tool:'get_selected_elements',args:{}}:reviewedEdit()}],usage:{inputTokens:42,outputTokens:20}};
      }};
    value=await service.prepare(binding,input,provider);
  } else if(action==='work') {
    await barrier();const runtime=createRuntime(backend),claim=await runtime.claim(binding,input.runId,'child');
    value=claim.ok?await runtime.advance(binding,input.runId,claim.lease):claim;
  } else {await barrier();value=await service[action](binding,input);}
  console.log(JSON.stringify(value));
} finally {await store.closeProjectStore();}
