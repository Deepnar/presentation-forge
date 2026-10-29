import assert from 'node:assert/strict';
import {createSavedExport,PPTX_MIME} from '../../../app/web/src/lib/nativeExport.js';
const metadata={ok:true,snapshot:{projectId:'review-project',projectRevision:2,sourceGeneration:3,sourceRevision:4},citationCount:1};
const input={id:'review-project',revision:2,title:'Body-boundary review'};
const cited=()=>new Response('refusal',{status:422,headers:{'X-Forge-Export-Refusal':'citation-preservation-required'}});
const json=()=>new Response(JSON.stringify(metadata),{headers:{'Content-Type':'application/json'}});
async function until(predicate){const end=performance.now()+1500;while(!predicate()){assert.ok(performance.now()<end,'bounded wait expired');await new Promise(r=>setImmediate(r));}}
async function cancelledMetadataCannotReplaceNewerTicket(){
  let streamController,cancelled=0;
  const body=new ReadableStream({start(c){streamController=c;},cancel(){cancelled++;}});
  const oldResponse=new Response(body,{headers:{'Content-Type':'application/json'}});
  const responses=[cited(),oldResponse,cited(),json()],states=[],calls=[];
  const c=createSavedExport({session:()=>({token:'review-token',epoch:1}),fetchFn:async(url,options)=>{calls.push({url,options});return responses.shift();},download:()=>{throw Error('No download was authorized');},onChange:s=>states.push(s)});
  const old=c.start(input);await until(()=>body.locked);
  c.cancel();await c.start(input);
  assert.equal(c.snapshot().phase,'confirm');const currentState=c.snapshot(),stateCount=states.length;
  streamController.enqueue(new TextEncoder().encode(JSON.stringify(metadata)));
  assert.equal(await old,false);
  assert.equal(cancelled,1,'obsolete body reader must cancel its uncompleted stream');
  assert.equal(body.locked,false,'obsolete reader must release its lock');
  assert.equal(c.snapshot(),currentState,'old body completion must not replace newer confirmation');
  assert.equal(states.length,stateCount,'obsolete ticket must not emit new UI state');
  assert.equal(calls.length,4);assert.equal(calls[0].options.signal.aborted,true);
  c.cancel();assert.equal(c.busy(),false);
}
async function uncitedBodyCompletionCannotCrossSameTokenSessionABA(){
  let streamController,auth={token:'review-token',epoch:1};
  const body=new ReadableStream({start(c){streamController=c;}});
  const response=new Response(body,{headers:{'Content-Type':PPTX_MIME,'X-Forge-Project-Revision':'2'}});
  const downloads=[],calls=[];
  const c=createSavedExport({session:()=>auth,fetchFn:async(url,options)=>{calls.push({url,options});return response;},download:value=>{downloads.push(value);return true;}});
  const pending=c.start(input);await until(()=>body.locked);
  auth={token:'other-session',epoch:2};auth={token:'review-token',epoch:3};
  streamController.enqueue(new TextEncoder().encode('completed private binary body'));streamController.close();
  assert.equal(await pending,false);assert.equal(downloads.length,0);
  assert.equal(c.snapshot().phase,'idle');assert.equal(c.busy(),false);
  assert.equal(calls.length,1,'no retry or notes metadata fallback');assert.equal(calls[0].options.signal.aborted,true);
}
let passed=0,failed=0;
for(const [name,run] of [['cancelled metadata body cannot replace a newer confirmation',cancelledMetadataCannotReplaceNewerTicket],['uncited body completion refuses a same-token session ABA',uncitedBodyCompletionCannotCrossSameTokenSessionABA]]){
  const start=performance.now();try{await run();passed++;console.log(JSON.stringify({name,result:'pass',durationMs:Math.round(performance.now()-start)}));}catch(error){failed++;console.log(JSON.stringify({name,result:'fail',error:error.stack}));}
}
console.log(JSON.stringify({passed,failed,skipped:0,cancelled:0}));if(failed)process.exitCode=1;
